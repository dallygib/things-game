const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function publicState(room, viewerId) {
  return {
    code: room.code,
    phase: room.phase,
    topic: room.topic,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isEliminated: p.isEliminated,
    })),
    answers: (room.phase === 'guessing' || room.phase === 'results')
      ? room.answers.map(a => ({
          id: a.id,
          text: a.text,
          isGuessed: a.isGuessed,
          authorId: (a.isGuessed || room.phase === 'results') ? a.authorId : null,
        }))
      : null,
    submittedCount: room.answers.length,
    totalPlayers: room.players.length,
    currentGuesserId: room.currentGuesserId,
    winner: room.winner,
    myId: viewerId,
    hasSubmitted: room.answers.some(a => a.authorId === viewerId),
  };
}

function eligibleGuessers(room) {
  return room.players.filter(p => !p.isHost && !p.isEliminated);
}

function advanceGuesser(room) {
  const eligible = eligibleGuessers(room);
  if (eligible.length === 0) {
    endRound(room);
    return;
  }
  const idx = eligible.findIndex(p => p.id === room.currentGuesserId);
  room.currentGuesserId = eligible[(idx + 1) % eligible.length].id;
}

function endRound(room) {
  const unguessed = room.answers.filter(a => !a.isGuessed);
  room.winner = unguessed.length === 1
    ? (room.players.find(p => p.id === unguessed[0].authorId) || null)
    : null;
  room.phase = 'results';
  room.currentGuesserId = null;
}

function broadcastTo(io, room) {
  for (const p of room.players) {
    const s = io.sockets.sockets.get(p.id);
    if (s) s.emit('game-state', publicState(room, p.id));
  }
}

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer);

  io.on('connection', (socket) => {

    socket.on('create-room', ({ name }, cb) => {
      const code = generateRoomCode();
      rooms[code] = {
        code,
        phase: 'lobby',
        topic: null,
        players: [{ id: socket.id, name: name.trim(), isHost: true, isEliminated: false }],
        answers: [],
        currentGuesserId: null,
        winner: null,
      };
      socket.join(code);
      socket.data.room = code;
      cb({ success: true, code });
      broadcastTo(io, rooms[code]);
    });

    socket.on('join-room', ({ name, code }, cb) => {
      const room = rooms[code?.toUpperCase()];
      if (!room) return cb({ success: false, error: 'Room not found' });
      if (room.phase !== 'lobby') return cb({ success: false, error: 'Game already started' });
      room.players.push({ id: socket.id, name: name.trim(), isHost: false, isEliminated: false });
      socket.join(room.code);
      socket.data.room = room.code;
      cb({ success: true, code: room.code });
      broadcastTo(io, room);
    });

    socket.on('start-writing', ({ topic }, cb) => {
      const room = rooms[socket.data.room];
      if (!room) return;
      const me = room.players.find(p => p.id === socket.id);
      if (!me?.isHost || !topic?.trim()) return cb?.({ success: false });
      room.topic = topic.trim();
      room.phase = 'writing';
      room.answers = [];
      room.winner = null;
      room.currentGuesserId = null;
      room.players.forEach(p => { p.isEliminated = false; });
      cb?.({ success: true });
      broadcastTo(io, room);
    });

    socket.on('submit-answer', ({ text }, cb) => {
      const room = rooms[socket.data.room];
      if (!room || room.phase !== 'writing' || !text?.trim()) return cb?.({ success: false });
      if (room.answers.find(a => a.authorId === socket.id)) return cb?.({ success: false, error: 'Already submitted' });
      room.answers.push({ id: `${Date.now()}-${Math.random()}`, text: text.trim(), authorId: socket.id, isGuessed: false });
      cb?.({ success: true });
      if (room.answers.length === room.players.length) {
        room.answers = shuffle(room.answers);
        room.phase = 'guessing';
        const first = eligibleGuessers(room)[0];
        room.currentGuesserId = first?.id || null;
        if (!room.currentGuesserId) endRound(room);
      }
      broadcastTo(io, room);
    });

    socket.on('make-guess', ({ answerId, targetPlayerId }, cb) => {
      const room = rooms[socket.data.room];
      if (!room || room.phase !== 'guessing' || room.currentGuesserId !== socket.id) return;
      const answer = room.answers.find(a => a.id === answerId && !a.isGuessed);
      const target = room.players.find(p => p.id === targetPlayerId);
      if (!answer || !target) return;

      const correct = answer.authorId === targetPlayerId;
      if (correct) {
        answer.isGuessed = true;
        target.isEliminated = true;
        const unguessed = room.answers.filter(a => !a.isGuessed);
        if (unguessed.length <= 1) {
          endRound(room);
        } else if (room.players.find(p => p.id === socket.id)?.isEliminated) {
          advanceGuesser(room);
        }
        // else: guesser keeps their turn
      } else {
        advanceGuesser(room);
      }

      cb?.({ correct, authorName: target.name });
      broadcastTo(io, room);
    });

    socket.on('new-round', () => {
      const room = rooms[socket.data.room];
      if (!room) return;
      if (!room.players.find(p => p.id === socket.id)?.isHost) return;
      room.phase = 'lobby';
      room.topic = null;
      room.answers = [];
      room.winner = null;
      room.currentGuesserId = null;
      room.players.forEach(p => { p.isEliminated = false; });
      broadcastTo(io, room);
    });

    socket.on('disconnect', () => {
      const room = rooms[socket.data.room];
      if (!room) return;
      room.players = room.players.filter(p => p.id !== socket.id);
      room.answers = room.answers.filter(a => a.authorId !== socket.id);
      if (room.players.length === 0) { delete rooms[socket.data.room]; return; }
      if (!room.players.find(p => p.isHost)) room.players[0].isHost = true;
      if (room.phase === 'guessing') {
        if (room.currentGuesserId === socket.id) advanceGuesser(room);
        const unguessed = room.answers.filter(a => !a.isGuessed);
        if (unguessed.length <= 1) endRound(room);
      }
      broadcastTo(io, room);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});

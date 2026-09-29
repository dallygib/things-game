"use client";

import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isEliminated: boolean;
  isSpectator: boolean;
}

interface Answer {
  id: string;
  text: string;
  isGuessed: boolean;
  authorId: string | null;
}

interface GameState {
  code: string;
  phase: "lobby" | "writing" | "guessing" | "results";
  topic: string | null;
  players: Player[];
  answers: Answer[] | null;
  submittedCount: number;
  totalPlayers: number;
  currentGuesserId: string | null;
  winner: Player | null;
  myId: string;
  hasSubmitted: boolean;
}

function cn(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(" ");
}

// ── Pass & Play ───────────────────────────────────────────────────────────────

interface PPAnswer {
  id: string;
  text: string;
  authorIdx: number;
  isGuessed: boolean;
}

type PPPhase = "setup" | "topic" | "write-gate" | "write" | "guess-gate" | "guess" | "results";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextGuesserIdx(total: number, eliminated: number[], current: number): number {
  for (let i = 1; i <= total; i++) {
    const next = (current + i) % total;
    if (!eliminated.includes(next)) return next;
  }
  return -1;
}

function PassAndPlay({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<PPPhase>("setup");
  const [players, setPlayers] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [topic, setTopic] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [writingIdx, setWritingIdx] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [hideAnswer, setHideAnswer] = useState(true);
  const [answers, setAnswers] = useState<PPAnswer[]>([]);
  const [eliminated, setEliminated] = useState<number[]>([]);
  const [guesserIdx, setGuesserIdx] = useState(0);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [selectedTargetIdx, setSelectedTargetIdx] = useState<number | null>(null);
  const [guessStep, setGuessStep] = useState<"pick-answer" | "pick-player">("pick-answer");
  const [lastResult, setLastResult] = useState<{ correct: boolean; name: string } | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

  const addPlayer = () => {
    const name = nameInput.trim();
    if (!name || players.includes(name)) return;
    setPlayers(p => [...p, name]);
    setNameInput("");
  };

  const removePlayer = (i: number) => setPlayers(p => p.filter((_, idx) => idx !== i));

  const startTopic = () => {
    setTopicInput("");
    setPhase("topic");
  };

  const startWriting = () => {
    if (!topicInput.trim()) return;
    setTopic(topicInput.trim());
    setWritingIdx(0);
    setAnswerInput("");
    setHideAnswer(true);
    setPhase("write-gate");
  };

  const submitAnswer = () => {
    if (!answerInput.trim()) return;
    const newAnswer: PPAnswer = {
      id: `${Date.now()}-${writingIdx}`,
      text: answerInput.trim(),
      authorIdx: writingIdx,
      isGuessed: false,
    };
    const nextIdx = writingIdx + 1;
    if (nextIdx >= players.length) {
      // All have written — shuffle and start guessing
      setAnswers(shuffle([...answers, newAnswer]));
      setEliminated([]);
      setGuesserIdx(0);
      setSelectedAnswerId(null);
      setSelectedTargetIdx(null);
      setGuessStep("pick-answer");
      setPhase("guess-gate");
    } else {
      setAnswers(prev => [...prev, newAnswer]);
      setWritingIdx(nextIdx);
      setAnswerInput("");
      setHideAnswer(true);
      setPhase("write-gate");
    }
  };

  const handleGuess = () => {
    if (selectedAnswerId === null || selectedTargetIdx === null) return;
    const answer = answers.find(a => a.id === selectedAnswerId);
    if (!answer) return;

    const correct = answer.authorIdx === selectedTargetIdx;
    const authorName = players[answer.authorIdx];

    if (correct) {
      const newEliminated = [...eliminated, selectedTargetIdx];
      const updatedAnswers = answers.map(a =>
        a.id === selectedAnswerId ? { ...a, isGuessed: true } : a
      );
      setAnswers(updatedAnswers);
      setEliminated(newEliminated);
      setLastResult({ correct: true, name: authorName });
      setSelectedAnswerId(null);
      setSelectedTargetIdx(null);
      setGuessStep("pick-answer");

      const unguessed = updatedAnswers.filter(a => !a.isGuessed);
      setTimeout(() => {
        setLastResult(null);
        if (unguessed.length <= 1) {
          setWinner(unguessed.length === 1 ? players[unguessed[0].authorIdx] : null);
          setPhase("results");
        }
        // else guesser keeps their turn — stay in guess phase
      }, 1800);
    } else {
      setLastResult({ correct: false, name: players[selectedTargetIdx] });
      setSelectedAnswerId(null);
      setSelectedTargetIdx(null);
      setGuessStep("pick-answer");
      setTimeout(() => {
        setLastResult(null);
        const next = nextGuesserIdx(players.length, eliminated, guesserIdx);
        if (next === -1) {
          const unguessed = answers.filter(a => !a.isGuessed);
          setWinner(unguessed.length === 1 ? players[unguessed[0].authorIdx] : null);
          setPhase("results");
        } else {
          setGuesserIdx(next);
          setPhase("guess-gate");
        }
      }, 1800);
    }
  };

  const newRound = () => {
    setAnswers([]);
    setEliminated([]);
    setWritingIdx(0);
    setAnswerInput("");
    setHideAnswer(true);
    setWinner(null);
    setTopicInput("");
    setPhase("topic");
  };

  // ── PP Screens ──────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <Screen>
        <div className="flex items-center justify-between">
          <Heading />
          <button onClick={onExit} className="text-slate-500 text-xs hover:text-slate-300 mt-1">← Back</button>
        </div>
        <Card>
          <p className="text-slate-400 text-xs uppercase tracking-widest">Pass &amp; Play — Add Players</p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-700 text-white rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Player name"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addPlayer(); }}
              maxLength={24}
            />
            <button
              onClick={addPlayer}
              disabled={!nameInput.trim()}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold px-4 rounded-xl transition"
            >
              Add
            </button>
          </div>
          {players.length > 0 && (
            <ul className="space-y-2 mt-1">
              {players.map((name, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-white">{name}</span>
                  <button onClick={() => removePlayer(i)} className="text-slate-500 hover:text-red-400 text-xs">remove</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Btn
          className="w-full bg-violet-600 hover:bg-violet-500"
          disabled={players.length < 2}
          onClick={startTopic}
        >
          {players.length < 2 ? "Add at least 2 players" : `Start with ${players.length} players`}
        </Btn>
      </Screen>
    );
  }

  if (phase === "topic") {
    return (
      <Screen>
        <Heading />
        <Card>
          <p className="text-slate-400 text-sm">Pick a topic for this round</p>
          <input
            className="w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="e.g. Things you should never say to a teacher"
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") startWriting(); }}
            maxLength={120}
            autoFocus
          />
          <Btn className="w-full bg-violet-600 hover:bg-violet-500" disabled={!topicInput.trim()} onClick={startWriting}>
            Start Writing
          </Btn>
        </Card>
      </Screen>
    );
  }

  if (phase === "write-gate") {
    return (
      <Screen>
        <Heading />
        <div className="bg-slate-800 rounded-2xl p-8 text-center space-y-4">
          <p className="text-slate-400 text-sm uppercase tracking-widest">Pass the phone to</p>
          <p className="text-4xl font-bold text-white">{players[writingIdx]}</p>
          <p className="text-slate-500 text-sm">Everyone else — no peeking!</p>
        </div>
        <Btn
          className="w-full bg-violet-600 hover:bg-violet-500 py-4 text-lg"
          onClick={() => setPhase("write")}
        >
          I have the phone
        </Btn>
      </Screen>
    );
  }

  if (phase === "write") {
    return (
      <Screen>
        <div className="text-center">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Topic</p>
          <h2 className="text-2xl font-bold text-white leading-snug">{topic}</h2>
        </div>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">Your secret answer, {players[writingIdx]}</p>
            <button
              onClick={() => setHideAnswer(h => !h)}
              className="text-slate-500 text-xs hover:text-slate-300"
            >
              {hideAnswer ? "show" : "hide"}
            </button>
          </div>
          <textarea
            className={cn(
              "w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none transition-all",
              hideAnswer && "text-transparent selection:bg-transparent caret-white [text-shadow:0_0_8px_rgba(255,255,255,0.5)]"
            )}
            placeholder={hideAnswer ? "Tap 'show' to see while typing" : "Write your answer…"}
            rows={3}
            value={answerInput}
            onChange={e => setAnswerInput(e.target.value)}
            maxLength={200}
            autoFocus
          />
          <Btn className="w-full bg-violet-600 hover:bg-violet-500" disabled={!answerInput.trim()} onClick={submitAnswer}>
            Submit — then pass the phone back
          </Btn>
        </Card>
        <p className="text-slate-500 text-xs text-center">
          {writingIdx + 1} of {players.length} answers
        </p>
      </Screen>
    );
  }

  if (phase === "guess-gate") {
    const guesserName = players[guesserIdx];
    return (
      <Screen>
        <Heading />
        <div className="bg-slate-800 rounded-2xl p-8 text-center space-y-4">
          <p className="text-slate-400 text-sm uppercase tracking-widest">Pass the phone to</p>
          <p className="text-4xl font-bold text-white">{guesserName}</p>
          <p className="text-slate-500 text-sm">Your turn to guess!</p>
        </div>
        <Btn
          className="w-full bg-violet-600 hover:bg-violet-500 py-4 text-lg"
          onClick={() => setPhase("guess")}
        >
          I have the phone
        </Btn>
      </Screen>
    );
  }

  if (phase === "guess") {
    const guesserName = players[guesserIdx];
    const unguessed = answers.filter(a => !a.isGuessed);
    const guessed = answers.filter(a => a.isGuessed);
    const targets = players
      .map((name, idx) => ({ name, idx }))
      .filter(p => !eliminated.includes(p.idx) && p.idx !== guesserIdx);

    return (
      <Screen>
        <div className="text-center">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Topic</p>
          <h2 className="text-xl font-bold text-white">{topic}</h2>
        </div>

        <div className="bg-violet-700 rounded-xl py-3 px-4 text-center text-sm font-semibold text-white">
          {guesserName}&apos;s turn to guess
        </div>

        {lastResult && (
          <div className={cn(
            "rounded-xl py-3 px-4 text-center text-sm font-semibold",
            lastResult.correct ? "bg-green-700 text-white" : "bg-red-800 text-white"
          )}>
            {lastResult.correct ? `Correct! ${lastResult.name} wrote that.` : `Nope! Not ${lastResult.name}.`}
          </div>
        )}

        {!lastResult && (
          <>
            <Card>
              <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">
                Answers — {unguessed.length} left
              </p>
              <div className="space-y-2">
                {unguessed.map(a => (
                  <button
                    key={a.id}
                    onClick={() => {
                      if (guessStep !== "pick-answer") return;
                      setSelectedAnswerId(a.id);
                      setGuessStep("pick-player");
                      setSelectedTargetIdx(null);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-xl text-sm transition",
                      selectedAnswerId === a.id
                        ? "bg-violet-600 text-white"
                        : guessStep === "pick-answer"
                          ? "bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
                          : "bg-slate-700 text-slate-300 cursor-default"
                    )}
                  >
                    {a.text}
                  </button>
                ))}
              </div>
            </Card>

            {guessStep === "pick-player" && selectedAnswerId && (
              <Card>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-slate-400 text-xs uppercase tracking-widest">Who wrote this?</p>
                  <button
                    className="text-slate-500 text-xs hover:text-slate-300"
                    onClick={() => { setGuessStep("pick-answer"); setSelectedAnswerId(null); setSelectedTargetIdx(null); }}
                  >
                    Back
                  </button>
                </div>
                <p className="text-violet-300 text-sm italic mb-3">
                  &ldquo;{answers.find(a => a.id === selectedAnswerId)?.text}&rdquo;
                </p>
                <div className="space-y-2">
                  {targets.map(({ name, idx }) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedTargetIdx(idx)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-xl text-sm transition",
                        selectedTargetIdx === idx ? "bg-violet-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-white"
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                {selectedTargetIdx !== null && (
                  <Btn className="w-full bg-green-600 hover:bg-green-500 mt-1" onClick={handleGuess}>
                    Confirm Guess
                  </Btn>
                )}
              </Card>
            )}
          </>
        )}

        {eliminated.length > 0 && (
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Eliminated</p>
            <div className="flex flex-wrap gap-2">
              {eliminated.map(idx => (
                <span key={idx} className="bg-slate-700 text-slate-400 text-xs px-3 py-1 rounded-full line-through">
                  {players[idx]}
                </span>
              ))}
            </div>
          </Card>
        )}

        {guessed.length > 0 && (
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Revealed</p>
            <div className="space-y-2">
              {guessed.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <span className="text-slate-400 flex-1">{a.text}</span>
                  <span className="text-slate-500 text-xs flex-shrink-0 mt-0.5">{players[a.authorIdx]}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Screen>
    );
  }

  if (phase === "results") {
    return (
      <Screen>
        <h2 className="text-3xl font-bold text-white text-center">Round Over!</h2>

        {winner ? (
          <Card className="bg-violet-700 border-0">
            <p className="text-violet-200 text-xs uppercase tracking-widest text-center mb-1">Winner</p>
            <p className="text-3xl font-bold text-white text-center">{winner}</p>
            <p className="text-violet-300 text-sm text-center mt-1">Never got guessed</p>
          </Card>
        ) : (
          <Card><p className="text-slate-400 text-center text-sm">No winner this round</p></Card>
        )}

        <Card>
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">All Answers</p>
          <div className="space-y-3">
            {answers.map(a => (
              <div key={a.id} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm">{a.text}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{players[a.authorIdx]}</p>
                </div>
                {players[a.authorIdx] === winner && <span className="text-yellow-400 text-lg">★</span>}
              </div>
            ))}
          </div>
        </Card>

        <div className="flex gap-3">
          <Btn className="flex-1 bg-slate-700 hover:bg-slate-600" onClick={newRound}>New Round</Btn>
          <Btn className="flex-1 bg-violet-600 hover:bg-violet-500" onClick={onExit}>Change Players</Btn>
        </div>
      </Screen>
    );
  }

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gs, setGs] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const [ppMode, setPpMode] = useState(false);

  // Landing inputs
  const [nameInput, setNameInput] = useState(() => {
    try { return localStorage.getItem("things:name") || ""; } catch { return ""; }
  });
  const [codeInput, setCodeInput] = useState(() => {
    try { return localStorage.getItem("things:code") || ""; } catch { return ""; }
  });
  const [mode, setMode] = useState<"home" | "join">(() => {
    try { return localStorage.getItem("things:code") ? "join" : "home"; } catch { return "home"; }
  });

  // Lobby / writing
  const [topicInput, setTopicInput] = useState("");
  const [answerText, setAnswerText] = useState("");

  // Guessing
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [guessStep, setGuessStep] = useState<"pick-answer" | "pick-player">("pick-answer");
  const [lastResult, setLastResult] = useState<{ correct: boolean; name: string } | null>(null);

  // Phone pass (hand off device to phoneless player during guessing)
  const [phonePass, setPhonePass] = useState<{ step: "naming" | "gate" | "active" | "return"; name: string } | null>(null);
  const [passNameInput, setPassNameInput] = useState("");

  // ── Socket ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const s = io({ path: "/socket.io" });
    setSocket(s);
    s.on("game-state", (state: GameState) => {
      setGs(state);
      setError("");
      setDisconnected(false);
    });
    s.on("disconnect", () => setDisconnected(true));
    s.on("connect", () => {
      setDisconnected(false);
      setGs(null);
    });
    return () => { s.disconnect(); };
  }, []);

  useEffect(() => {
    setSelectedAnswerId(null);
    setSelectedTargetId(null);
    setGuessStep("pick-answer");
  }, [gs?.currentGuesserId, gs?.phase]);

  // When proxy turn ends (turn moved on), show return gate
  useEffect(() => {
    if (phonePass?.step === "active" && gs?.currentGuesserId !== gs?.myId) {
      setPhonePass(p => p ? { step: "return", name: p.name } : null);
    }
  }, [gs?.currentGuesserId, gs?.myId, phonePass?.step]);

  // Clear phone pass on phase change
  useEffect(() => {
    if (gs?.phase !== "guessing") setPhonePass(null);
  }, [gs?.phase]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const createRoom = useCallback(() => {
    if (!socket || !nameInput.trim()) return;
    try { localStorage.setItem("things:name", nameInput.trim()); } catch {}
    socket.emit("create-room", { name: nameInput.trim() }, (r: { success: boolean }) => {
      if (!r.success) setError("Could not create room.");
    });
  }, [socket, nameInput]);

  const joinRoom = useCallback(() => {
    if (!socket || !nameInput.trim() || codeInput.length !== 4) return;
    try {
      localStorage.setItem("things:name", nameInput.trim());
      localStorage.setItem("things:code", codeInput.toUpperCase());
    } catch {}
    socket.emit("join-room", { name: nameInput.trim(), code: codeInput.toUpperCase() },
      (r: { success: boolean; error?: string }) => {
        if (!r.success) {
          setError(r.error || "Could not join room.");
          try { localStorage.removeItem("things:code"); } catch {}
        }
      });
  }, [socket, nameInput, codeInput]);

  const startWriting = useCallback(() => {
    if (!socket || !topicInput.trim()) return;
    socket.emit("start-writing", { topic: topicInput.trim() },
      (r: { success: boolean; error?: string }) => {
        if (!r.success) setError(r.error || "Failed to start.");
        else setTopicInput("");
      });
  }, [socket, topicInput]);

  const submitAnswer = useCallback(() => {
    if (!socket || !answerText.trim()) return;
    socket.emit("submit-answer", { text: answerText.trim() },
      (r: { success: boolean; error?: string }) => {
        if (!r.success) setError(r.error || "Failed to submit.");
        else setAnswerText("");
      });
  }, [socket, answerText]);

  const confirmGuess = useCallback(() => {
    if (!socket || !selectedAnswerId || !selectedTargetId) return;
    socket.emit("make-guess", { answerId: selectedAnswerId, targetPlayerId: selectedTargetId },
      (r: { correct: boolean; authorName: string }) => {
        setLastResult({ correct: r.correct, name: r.authorName });
        setTimeout(() => setLastResult(null), 2000);
      });
  }, [socket, selectedAnswerId, selectedTargetId]);

  const newRound = useCallback(() => socket?.emit("new-round"), [socket]);

  const me = gs?.players.find(p => p.id === gs.myId);
  const isMyTurn = gs?.phase === "guessing" && gs.currentGuesserId === gs?.myId;
  const currentGuesser = gs?.players.find(p => p.id === gs?.currentGuesserId);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!socket) return <Screen><p className="text-slate-400 text-sm">Connecting…</p></Screen>;

  if (ppMode) return <PassAndPlay onExit={() => setPpMode(false)} />;

  if (disconnected) {
    return (
      <Screen>
        <div className="bg-yellow-900/60 border border-yellow-700 rounded-2xl p-5 text-center space-y-2">
          <p className="text-yellow-300 font-semibold">Connection lost</p>
          <p className="text-yellow-400 text-sm">Reconnecting… if this takes a while the server may have restarted.</p>
        </div>
      </Screen>
    );
  }

  // ── Landing ───────────────────────────────────────────────────────────────

  if (!gs) {
    return (
      <Screen>
        <Heading />
        <Card>
          <Label>Your name</Label>
          <Input
            placeholder="Enter your name"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            maxLength={24}
            onKeyDown={e => { if (e.key === "Enter" && mode === "join") joinRoom(); }}
          />
          {mode === "join" && (
            <>
              <Label>Room code</Label>
              <Input
                placeholder="XXXX"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.toUpperCase())}
                maxLength={4}
                className="tracking-[0.3em] uppercase text-center"
                onKeyDown={e => { if (e.key === "Enter") joinRoom(); }}
              />
            </>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {mode === "home" ? (
            <div className="space-y-2">
              <div className="flex gap-3">
                <Btn className="flex-1 bg-violet-600 hover:bg-violet-500" disabled={!nameInput.trim()} onClick={createRoom}>
                  Create Room
                </Btn>
                <Btn className="flex-1 bg-slate-700 hover:bg-slate-600" disabled={!nameInput.trim()} onClick={() => { setMode("join"); setError(""); }}>
                  Join Room
                </Btn>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700" /></div>
                <div className="relative flex justify-center"><span className="bg-slate-800 px-2 text-slate-500 text-xs">or</span></div>
              </div>
              <Btn className="w-full bg-emerald-700 hover:bg-emerald-600" onClick={() => setPpMode(true)}>
                Pass &amp; Play — one phone, no Wi-Fi needed
              </Btn>
            </div>
          ) : (
            <div className="flex gap-3">
              <Btn className="flex-1 bg-slate-700 hover:bg-slate-600" onClick={() => { setMode("home"); setError(""); }}>Back</Btn>
              <Btn className="flex-1 bg-violet-600 hover:bg-violet-500" disabled={!nameInput.trim() || codeInput.length !== 4} onClick={joinRoom}>Join</Btn>
            </div>
          )}
        </Card>
      </Screen>
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────

  if (gs.phase === "lobby") {
    return (
      <Screen>
        <Heading />
        <Card>
          <p className="text-slate-400 text-xs uppercase tracking-widest text-center">Room Code</p>
          <p className="text-5xl font-bold tracking-[0.2em] text-violet-400 text-center select-all py-1">{gs.code}</p>
          <p className="text-slate-500 text-xs text-center">Share with friends</p>
        </Card>
        <Card>
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Players ({gs.players.length})</p>
          <ul className="space-y-2">
            {gs.players.map(p => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", p.isHost ? "bg-violet-400" : "bg-slate-600")} />
                <span className="text-white">{p.name}</span>
                {p.id === gs.myId && <span className="text-slate-500 text-xs">(you)</span>}
                {p.isHost && <span className="text-violet-400 text-xs ml-auto">host</span>}
              </li>
            ))}
          </ul>
        </Card>
        {me?.isHost ? (
          <Card>
            <Label>Pick a topic</Label>
            <Input
              placeholder="e.g. Things you should never say on a first date"
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              maxLength={120}
              onKeyDown={e => { if (e.key === "Enter") startWriting(); }}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Btn className="w-full bg-violet-600 hover:bg-violet-500" disabled={!topicInput.trim() || gs.players.length < 2} onClick={startWriting}>
              Start Game
            </Btn>
            {gs.players.length < 2 && <p className="text-slate-500 text-xs text-center">Need at least 2 players</p>}
          </Card>
        ) : (
          <p className="text-slate-500 text-sm text-center">Waiting for the host to start…</p>
        )}
      </Screen>
    );
  }

  // ── Writing ───────────────────────────────────────────────────────────────

  if (gs.phase === "writing") {
    return (
      <Screen>
        <div className="text-center">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Topic</p>
          <h2 className="text-2xl font-bold text-white leading-snug">{gs.topic}</h2>
        </div>
        <Card>
          {me?.isSpectator ? (
            <div className="text-center py-2 space-y-1">
              <p className="text-slate-400 font-semibold">You joined mid-round</p>
              <p className="text-slate-500 text-sm">You&apos;ll play in the next round!</p>
            </div>
          ) : gs.hasSubmitted ? (
            <div className="text-center py-2 space-y-3">
              <p className="text-green-400 font-semibold text-lg">Answer submitted!</p>
              <p className="text-slate-400 text-sm">Waiting for others ({gs.submittedCount}/{gs.totalPlayers})</p>
              <div className="flex gap-1.5 justify-center">
                {Array.from({ length: gs.totalPlayers }).map((_, i) => (
                  <div key={i} className={cn("w-3 h-3 rounded-full", i < gs.submittedCount ? "bg-violet-500" : "bg-slate-600")} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <Label>Your anonymous answer</Label>
              <textarea
                className="w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                placeholder="Write something…"
                rows={3}
                value={answerText}
                onChange={e => setAnswerText(e.target.value)}
                maxLength={200}
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <Btn className="w-full bg-violet-600 hover:bg-violet-500" disabled={!answerText.trim()} onClick={submitAnswer}>
                Submit Answer
              </Btn>
            </>
          )}
        </Card>
        <p className="text-slate-500 text-xs text-center">{gs.submittedCount} / {gs.totalPlayers} submitted</p>
      </Screen>
    );
  }

  // ── Guessing ──────────────────────────────────────────────────────────────

  if (gs.phase === "guessing") {
    const unguessed = (gs.answers || []).filter(a => !a.isGuessed);
    const guessed = (gs.answers || []).filter(a => a.isGuessed);
    const targets = gs.players.filter(p => !p.isEliminated && !p.isSpectator && p.id !== gs.myId);
    const isProxying = phonePass?.step === "active";
    const effectivelyMyTurn = isMyTurn || isProxying;

    // Return gate: proxy player's turn ended, hand phone back
    if (phonePass?.step === "return") {
      return (
        <Screen>
          <Heading />
          <div className="bg-slate-800 rounded-2xl p-8 text-center space-y-4">
            <p className="text-slate-400 text-sm uppercase tracking-widest">Turn over</p>
            <p className="text-3xl font-bold text-white">{phonePass.name}</p>
            <p className="text-slate-500 text-sm">Hand the phone back to {me?.name || "the owner"}</p>
          </div>
          <Btn className="w-full bg-slate-700 hover:bg-slate-600 py-4 text-lg" onClick={() => setPhonePass(null)}>
            Got it
          </Btn>
        </Screen>
      );
    }

    // Handoff gate: "Pass this phone to [name]"
    if (phonePass?.step === "gate") {
      return (
        <Screen>
          <Heading />
          <div className="bg-slate-800 rounded-2xl p-8 text-center space-y-4">
            <p className="text-slate-400 text-sm uppercase tracking-widest">Pass this phone to</p>
            <p className="text-4xl font-bold text-white">{phonePass.name}</p>
            <p className="text-slate-500 text-sm">Your turn to guess!</p>
          </div>
          <Btn
            className="w-full bg-violet-600 hover:bg-violet-500 py-4 text-lg"
            onClick={() => setPhonePass({ step: "active", name: phonePass.name })}
          >
            I have the phone
          </Btn>
          <button
            onClick={() => setPhonePass(null)}
            className="w-full text-slate-500 text-sm hover:text-slate-300 text-center py-1"
          >
            Cancel — keep on this device
          </button>
        </Screen>
      );
    }

    // Name entry: who are we passing to?
    if (phonePass?.step === "naming") {
      return (
        <Screen>
          <Heading />
          <Card>
            <p className="text-slate-400 text-sm">Who are you passing the phone to?</p>
            <Input
              placeholder="Their name"
              value={passNameInput}
              onChange={e => setPassNameInput(e.target.value)}
              maxLength={24}
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter" && passNameInput.trim()) {
                  setPhonePass({ step: "gate", name: passNameInput.trim() });
                  setPassNameInput("");
                }
              }}
            />
            <div className="flex gap-3">
              <Btn className="flex-1 bg-slate-700 hover:bg-slate-600" onClick={() => { setPhonePass(null); setPassNameInput(""); }}>
                Cancel
              </Btn>
              <Btn
                className="flex-1 bg-violet-600 hover:bg-violet-500"
                disabled={!passNameInput.trim()}
                onClick={() => {
                  setPhonePass({ step: "gate", name: passNameInput.trim() });
                  setPassNameInput("");
                }}
              >
                Next
              </Btn>
            </div>
          </Card>
        </Screen>
      );
    }

    return (
      <Screen>
        <div className="text-center">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Topic</p>
          <h2 className="text-xl font-bold text-white">{gs.topic}</h2>
        </div>
        <div className={cn("rounded-xl py-3 px-4 text-center text-sm font-semibold", effectivelyMyTurn ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-300")}>
          {isProxying
            ? `Guessing for ${phonePass!.name}`
            : isMyTurn
              ? "Your turn to guess!"
              : currentGuesser ? `${currentGuesser.name} is guessing…` : "…"
          }
        </div>
        {lastResult && (
          <div className={cn("rounded-xl py-3 px-4 text-center text-sm font-semibold", lastResult.correct ? "bg-green-700 text-white" : "bg-red-800 text-white")}>
            {lastResult.correct ? `Correct! ${lastResult.name} wrote that.` : `Nope! Not ${lastResult.name}.`}
          </div>
        )}
        <Card>
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Answers — {unguessed.length} remaining</p>
          <div className="space-y-2">
            {unguessed.map(a => (
              <button
                key={a.id}
                disabled={!effectivelyMyTurn || guessStep !== "pick-answer"}
                onClick={() => { setSelectedAnswerId(a.id); setGuessStep("pick-player"); setSelectedTargetId(null); }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl text-sm transition",
                  selectedAnswerId === a.id ? "bg-violet-600 text-white" :
                    effectivelyMyTurn && guessStep === "pick-answer" ? "bg-slate-700 hover:bg-slate-600 text-white cursor-pointer" : "bg-slate-700 text-slate-300 cursor-default"
                )}
              >{a.text}</button>
            ))}
          </div>
        </Card>
        {effectivelyMyTurn && guessStep === "pick-player" && selectedAnswerId && (
          <Card>
            <div className="flex items-center justify-between mb-1">
              <p className="text-slate-400 text-xs uppercase tracking-widest">Who wrote this?</p>
              <button className="text-slate-500 text-xs hover:text-slate-300" onClick={() => { setGuessStep("pick-answer"); setSelectedAnswerId(null); setSelectedTargetId(null); }}>Back</button>
            </div>
            <p className="text-violet-300 text-sm italic mb-3">&ldquo;{(gs.answers || []).find(a => a.id === selectedAnswerId)?.text}&rdquo;</p>
            <div className="space-y-2">
              {targets.map(p => (
                <button key={p.id} onClick={() => setSelectedTargetId(p.id)} className={cn("w-full text-left px-4 py-3 rounded-xl text-sm transition", selectedTargetId === p.id ? "bg-violet-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-white")}>
                  {p.name}
                </button>
              ))}
            </div>
            {selectedTargetId && <Btn className="w-full bg-green-600 hover:bg-green-500 mt-1" onClick={confirmGuess}>Confirm Guess</Btn>}
          </Card>
        )}
        {isMyTurn && !isProxying && (
          <button
            onClick={() => setPhonePass({ step: "naming", name: "" })}
            className="w-full text-slate-500 text-sm hover:text-slate-300 text-center py-2 rounded-xl"
          >
            Not {me?.name}&apos;s device? Pass this phone
          </button>
        )}
        {gs.players.some(p => p.isEliminated) && (
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Eliminated</p>
            <div className="flex flex-wrap gap-2">
              {gs.players.filter(p => p.isEliminated).map(p => (
                <span key={p.id} className="bg-slate-700 text-slate-400 text-xs px-3 py-1 rounded-full line-through">{p.name}</span>
              ))}
            </div>
          </Card>
        )}
        {guessed.length > 0 && (
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Revealed</p>
            <div className="space-y-2">
              {guessed.map(a => {
                const author = gs.players.find(p => p.id === a.authorId);
                return (
                  <div key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="text-slate-400 flex-1">{a.text}</span>
                    <span className="text-slate-500 text-xs flex-shrink-0 mt-0.5">{author?.name}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </Screen>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────

  if (gs.phase === "results") {
    return (
      <Screen>
        <h2 className="text-3xl font-bold text-white text-center">Round Over</h2>
        {gs.winner ? (
          <Card className="bg-violet-700 border-0">
            <p className="text-violet-200 text-xs uppercase tracking-widest text-center mb-1">Winner</p>
            <p className="text-3xl font-bold text-white text-center">{gs.winner.id === gs.myId ? "You!" : gs.winner.name}</p>
            <p className="text-violet-300 text-sm text-center mt-1">Never got guessed</p>
          </Card>
        ) : (
          <Card><p className="text-slate-400 text-center text-sm">No winner this round</p></Card>
        )}
        <Card>
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">All Answers</p>
          <div className="space-y-3">
            {(gs.answers || []).map(a => {
              const author = gs.players.find(p => p.id === a.authorId);
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">{a.text}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{author?.name}</p>
                  </div>
                  {a.authorId === gs.winner?.id && <span className="text-yellow-400 text-lg">★</span>}
                </div>
              );
            })}
          </div>
        </Card>
        {me?.isHost ? (
          <Btn className="w-full bg-violet-600 hover:bg-violet-500 py-3" onClick={newRound}>New Round</Btn>
        ) : (
          <p className="text-slate-500 text-sm text-center">Waiting for the host to start a new round…</p>
        )}
      </Screen>
    );
  }

  return null;
}

// ── UI primitives ──────────────────────────────────────────────────────────

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">{children}</div>
    </div>
  );
}

function Heading() {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold text-white tracking-tight">Things</h1>
      <p className="text-slate-500 text-sm mt-1">A party guessing game</p>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-slate-800 rounded-2xl p-5 space-y-3", className)}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-400 text-sm">{children}</p>;
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn("w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-500", className)}
    />
  );
}

function Btn({ children, className, disabled, onClick }: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn("font-semibold py-2.5 rounded-xl transition text-white disabled:opacity-40 disabled:cursor-not-allowed", className)}
    >
      {children}
    </button>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isEliminated: boolean;
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

// ── Main component ────────────────────────────────────────────────────────────

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gs, setGs] = useState<GameState | null>(null);
  const [error, setError] = useState("");

  // Landing inputs
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [mode, setMode] = useState<"home" | "join">("home");

  // Lobby / writing
  const [topicInput, setTopicInput] = useState("");
  const [answerText, setAnswerText] = useState("");

  // Guessing
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [guessStep, setGuessStep] = useState<"pick-answer" | "pick-player">("pick-answer");
  const [lastResult, setLastResult] = useState<{ correct: boolean; name: string } | null>(null);

  // ── Socket ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const s = io({ path: "/socket.io" });
    setSocket(s);
    s.on("game-state", (state: GameState) => {
      setGs(state);
      setError("");
    });
    return () => { s.disconnect(); };
  }, []);

  // Reset guessing UI on turn/phase change
  useEffect(() => {
    setSelectedAnswerId(null);
    setSelectedTargetId(null);
    setGuessStep("pick-answer");
  }, [gs?.currentGuesserId, gs?.phase]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const createRoom = useCallback(() => {
    if (!socket || !nameInput.trim()) return;
    socket.emit("create-room", { name: nameInput.trim() }, (r: { success: boolean }) => {
      if (!r.success) setError("Could not create room.");
    });
  }, [socket, nameInput]);

  const joinRoom = useCallback(() => {
    if (!socket || !nameInput.trim() || codeInput.length !== 4) return;
    socket.emit("join-room", { name: nameInput.trim(), code: codeInput.toUpperCase() },
      (r: { success: boolean; error?: string }) => {
        if (!r.success) setError(r.error || "Could not join room.");
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const me = gs?.players.find(p => p.id === gs.myId);
  const isMyTurn = gs?.phase === "guessing" && gs.currentGuesserId === gs?.myId;
  const currentGuesser = gs?.players.find(p => p.id === gs?.currentGuesserId);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!socket) {
    return <Screen><p className="text-slate-400 text-sm">Connecting…</p></Screen>;
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
            <div className="flex gap-3">
              <Btn
                className="flex-1 bg-violet-600 hover:bg-violet-500"
                disabled={!nameInput.trim()}
                onClick={createRoom}
              >
                Create Room
              </Btn>
              <Btn
                className="flex-1 bg-slate-700 hover:bg-slate-600"
                disabled={!nameInput.trim()}
                onClick={() => { setMode("join"); setError(""); }}
              >
                Join Room
              </Btn>
            </div>
          ) : (
            <div className="flex gap-3">
              <Btn className="flex-1 bg-slate-700 hover:bg-slate-600" onClick={() => { setMode("home"); setError(""); }}>
                Back
              </Btn>
              <Btn
                className="flex-1 bg-violet-600 hover:bg-violet-500"
                disabled={!nameInput.trim() || codeInput.length !== 4}
                onClick={joinRoom}
              >
                Join
              </Btn>
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
            <Btn
              className="w-full bg-violet-600 hover:bg-violet-500"
              disabled={!topicInput.trim() || gs.players.length < 2}
              onClick={startWriting}
            >
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
          {gs.hasSubmitted ? (
            <div className="text-center py-2 space-y-3">
              <p className="text-green-400 font-semibold text-lg">Answer submitted!</p>
              <p className="text-slate-400 text-sm">
                Waiting for others ({gs.submittedCount}/{gs.totalPlayers})
              </p>
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
    const targets = gs.players.filter(p => !p.isEliminated && p.id !== gs.myId);

    return (
      <Screen>
        <div className="text-center">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Topic</p>
          <h2 className="text-xl font-bold text-white">{gs.topic}</h2>
        </div>

        {/* Turn banner */}
        <div className={cn(
          "rounded-xl py-3 px-4 text-center text-sm font-semibold",
          isMyTurn ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-300"
        )}>
          {isMyTurn ? "Your turn to guess!" : currentGuesser ? `${currentGuesser.name} is guessing…` : "…"}
        </div>

        {/* Guess result flash */}
        {lastResult && (
          <div className={cn(
            "rounded-xl py-3 px-4 text-center text-sm font-semibold",
            lastResult.correct ? "bg-green-700 text-white" : "bg-red-800 text-white"
          )}>
            {lastResult.correct ? `Correct! ${lastResult.name} wrote that.` : `Nope! Not ${lastResult.name}.`}
          </div>
        )}

        {/* Unguessed answers */}
        <Card>
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">
            Answers — {unguessed.length} remaining
          </p>
          <div className="space-y-2">
            {unguessed.map(a => (
              <button
                key={a.id}
                disabled={!isMyTurn || guessStep !== "pick-answer"}
                onClick={() => { setSelectedAnswerId(a.id); setGuessStep("pick-player"); setSelectedTargetId(null); }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl text-sm transition",
                  selectedAnswerId === a.id ? "bg-violet-600 text-white" :
                    isMyTurn && guessStep === "pick-answer"
                      ? "bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
                      : "bg-slate-700 text-slate-300 cursor-default"
                )}
              >
                {a.text}
              </button>
            ))}
          </div>
        </Card>

        {/* Player picker */}
        {isMyTurn && guessStep === "pick-player" && selectedAnswerId && (
          <Card>
            <div className="flex items-center justify-between mb-1">
              <p className="text-slate-400 text-xs uppercase tracking-widest">Who wrote this?</p>
              <button
                className="text-slate-500 text-xs hover:text-slate-300"
                onClick={() => { setGuessStep("pick-answer"); setSelectedAnswerId(null); setSelectedTargetId(null); }}
              >
                Back
              </button>
            </div>
            <p className="text-violet-300 text-sm italic mb-3">
              &ldquo;{(gs.answers || []).find(a => a.id === selectedAnswerId)?.text}&rdquo;
            </p>
            <div className="space-y-2">
              {targets.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedTargetId(p.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl text-sm transition",
                    selectedTargetId === p.id ? "bg-violet-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-white"
                  )}
                >
                  {p.name}{p.id === gs.myId && <span className="text-slate-400 text-xs ml-1">(you)</span>}
                </button>
              ))}
            </div>
            {selectedTargetId && (
              <Btn className="w-full bg-green-600 hover:bg-green-500 mt-1" onClick={confirmGuess}>
                Confirm Guess
              </Btn>
            )}
          </Card>
        )}

        {/* Eliminated */}
        {gs.players.some(p => p.isEliminated) && (
          <Card>
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Eliminated</p>
            <div className="flex flex-wrap gap-2">
              {gs.players.filter(p => p.isEliminated).map(p => (
                <span key={p.id} className="bg-slate-700 text-slate-400 text-xs px-3 py-1 rounded-full line-through">
                  {p.name}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Revealed answers */}
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
            <p className="text-3xl font-bold text-white text-center">
              {gs.winner.id === gs.myId ? "You!" : gs.winner.name}
            </p>
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
          <Btn className="w-full bg-violet-600 hover:bg-violet-500 py-3" onClick={newRound}>
            New Round
          </Btn>
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
  return (
    <div className={cn("bg-slate-800 rounded-2xl p-5 space-y-3", className)}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-400 text-sm">{children}</p>;
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full bg-slate-700 text-white rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-violet-500",
        className
      )}
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
      className={cn(
        "font-semibold py-2.5 rounded-xl transition text-white disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import { io } from "socket.io-client";

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isEliminated: boolean;
  isSpectator: boolean;
  isVirtual: boolean;
  ownerId: string | null;
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
}

export default function TVDisplay({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [gs, setGs] = useState<GameState | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socket.on("connect", () => {
      socket.emit("join-display", { code: code.toUpperCase() }, (r: { success: boolean; error?: string }) => {
        if (r.success) setConnected(true);
        else setError(r.error || "Room not found");
      });
    });
    socket.on("game-state", (state: GameState) => setGs(state));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect", () => {
      if (gs) setConnected(true);
    });
    return () => { socket.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400 text-2xl font-semibold">Room not found</p>
          <p className="text-slate-500 text-lg font-mono">{code.toUpperCase()}</p>
        </div>
      </div>
    );
  }

  if (!connected || !gs) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-xl">Connecting to {code.toUpperCase()}…</p>
      </div>
    );
  }

  const currentGuesser = gs.players.find(p => p.id === gs.currentGuesserId);
  const answers = gs.answers || [];
  const realPlayers = gs.players.filter(p => !p.isVirtual && !p.isSpectator);

  return (
    <div className="min-h-screen bg-slate-900 p-10 md:p-14 flex flex-col">

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-8">
        <div className="flex-1 min-w-0">
          <p className="text-slate-500 text-sm uppercase tracking-widest mb-2">Things</p>
          {gs.topic ? (
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">{gs.topic}</h1>
          ) : (
            <h1 className="text-4xl font-bold text-slate-600">Waiting for topic…</h1>
          )}
        </div>
        <span className="text-slate-700 font-mono text-2xl flex-shrink-0 mt-1">{gs.code}</span>
      </div>

      {/* Lobby */}
      {gs.phase === "lobby" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-slate-400 text-2xl">Waiting for game to start…</p>
            <div className="flex flex-wrap gap-3 justify-center mt-4">
              {realPlayers.map(p => (
                <span key={p.id} className="bg-slate-800 text-white text-lg px-5 py-2 rounded-full">
                  {p.name}
                </span>
              ))}
            </div>
            <p className="text-slate-600 text-base mt-2">{realPlayers.length} player{realPlayers.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}

      {/* Writing */}
      {gs.phase === "writing" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6">
            <p className="text-slate-300 text-3xl font-semibold">Players are writing…</p>
            <div className="flex gap-3 justify-center">
              {Array.from({ length: gs.totalPlayers }).map((_, i) => (
                <div key={i} className={`w-5 h-5 rounded-full transition-colors ${i < gs.submittedCount ? "bg-violet-500" : "bg-slate-700"}`} />
              ))}
            </div>
            <p className="text-slate-500 text-xl">{gs.submittedCount} / {gs.totalPlayers} submitted</p>
          </div>
        </div>
      )}

      {/* Guessing / Results */}
      {(gs.phase === "guessing" || gs.phase === "results") && (
        <div className="flex-1 flex flex-col gap-6">
          {/* Banner */}
          {gs.phase === "guessing" && currentGuesser && (
            <div className="bg-violet-700 rounded-2xl px-8 py-5 text-center">
              <p className="text-violet-300 text-sm uppercase tracking-widest mb-1">Guessing now</p>
              <p className="text-4xl font-bold text-white">{currentGuesser.name}</p>
            </div>
          )}
          {gs.phase === "results" && (
            <div className={`rounded-2xl px-8 py-5 text-center ${gs.winner ? "bg-violet-700" : "bg-slate-800"}`}>
              {gs.winner ? (
                <>
                  <p className="text-violet-300 text-sm uppercase tracking-widest mb-1">Winner</p>
                  <p className="text-4xl font-bold text-white">{gs.winner.name} ★</p>
                </>
              ) : (
                <p className="text-slate-400 text-2xl font-semibold">No winner this round</p>
              )}
            </div>
          )}

          {/* Answers */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 flex-1">
            {answers.map(a => {
              const author = a.authorId ? gs.players.find(p => p.id === a.authorId) : null;
              return (
                <div
                  key={a.id}
                  className={`rounded-2xl px-7 py-5 transition-all duration-500 ${
                    a.isGuessed ? "bg-slate-800/40" : "bg-slate-800"
                  }`}
                >
                  <p className={`text-2xl md:text-3xl font-medium leading-snug transition-all ${
                    a.isGuessed ? "line-through text-slate-500" : "text-white"
                  }`}>
                    {a.text}
                  </p>
                  {author && (
                    <p className="text-slate-500 text-base mt-2">— {author.name}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Eliminated row */}
          {gs.players.some(p => p.isEliminated) && (
            <div className="flex flex-wrap gap-3 pt-2">
              {gs.players.filter(p => p.isEliminated).map(p => (
                <span key={p.id} className="bg-slate-800 text-slate-500 text-sm px-4 py-2 rounded-full line-through">
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TVLanding() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const go = () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 4) { setError("Enter the 4-letter room code"); return; }
    router.push(`/tv/${c}`);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-10 px-8">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white tracking-tight">Things</h1>
        <p className="text-slate-400 text-xl mt-3">TV Display</p>
      </div>

      <div className="w-full max-w-sm space-y-5">
        <p className="text-slate-400 text-center text-lg">Enter the room code</p>
        <input
          className="w-full bg-slate-800 text-white text-5xl font-bold tracking-[0.4em] text-center rounded-2xl px-4 py-6 focus:outline-none focus:ring-4 focus:ring-violet-500 uppercase"
          placeholder="XXXX"
          value={code}
          maxLength={4}
          autoFocus
          onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
          onKeyDown={e => { if (e.key === "Enter") go(); }}
        />
        {error && <p className="text-red-400 text-center text-base">{error}</p>}
        <button
          onClick={go}
          disabled={code.trim().length !== 4}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-2xl font-bold py-5 rounded-2xl transition focus:outline-none focus:ring-4 focus:ring-violet-400"
        >
          Connect
        </button>
      </div>

      <p className="text-slate-700 text-sm">Ask the host for the 4-letter room code</p>
    </div>
  );
}

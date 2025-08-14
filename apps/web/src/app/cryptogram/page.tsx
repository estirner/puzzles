"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import cryptogramPlugin, { CGData, CGState, CryptogramComponent, generateCryptogram, type CryptogramDifficulty } from '@repo/plugins-cryptogram';
import puzzles from '@repo/puzzles/index.json';
import { HintPanel } from '@repo/ui';
import { PuzzleLayout } from '../components/PuzzleLayout';

registerPlugin(cryptogramPlugin);

export default function CryptogramPage() {
  const item = (puzzles as any).puzzles.find((p: any) => p.type === 'cryptogram');
  const initialData = item.data as CGData;
  const saveKey = 'puzzle:cryptogram:autosave';
  const [data, setData] = useState<CGData>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (saved?.data) return saved.data as CGData; }
    } catch {}
    return initialData;
  });
  const [state, setState] = useState<CGState>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (saved?.state) return saved.state as CGState; }
    } catch {}
    const plugin = getPlugin<CGData, CGState>('cryptogram')!;
    return plugin.createInitialState(initialData);
  });
  const [hint, setHint] = useState<any | null>(null);
  const [timerMs, setTimerMs] = useState<number>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); const t = saved?.timer; if (t) { const now = Date.now(); const base = Number(t.elapsedMs) || 0; return t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base; } }
    } catch {}
    return 0;
  });
  const [timerRunning, setTimerRunning] = useState<boolean>(() => {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null; if (raw) { const saved = JSON.parse(raw); const t = saved?.timer; if (t && typeof t.running === 'boolean') return Boolean(t.running); } } catch {}
    return true;
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // On first visit without a saved game, auto-start a generated cryptogram so Reveal works (sample lacks plaintext)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(saveKey);
      if (!raw && !initialData.plaintext) {
        const d = generateCryptogram('medium');
        setData(d);
        const plugin = getPlugin<CGData, CGState>('cryptogram')!;
        const fresh = plugin.createInitialState(d);
        setState(fresh);
        setHint(null);
        setTimerMs(0); setTimerRunning(true);
        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Persist
  useEffect(() => {
    try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
  }, [data, state, timerMs, timerRunning]);
  useEffect(() => {
    const handler = () => { try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {} };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [data, state, timerMs, timerRunning]);
  // Timer
  useEffect(() => { if (!timerRunning) return; const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000); return () => clearInterval(id); }, [timerRunning]);
  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000); const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60; const pad = (n: number) => n.toString().padStart(2, '0');
    return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  }
  // New game
  const onNewGame = useCallback((diff: CryptogramDifficulty) => {
    const d = generateCryptogram(diff);
    setData(d);
    const plugin = getPlugin<CGData, CGState>('cryptogram')!;
    const fresh = plugin.createInitialState(d);
    setState(fresh);
    setHint(null);
    setTimerMs(0); setTimerRunning(true);
    try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
  }, []);
  const Comp = useMemo(() => CryptogramComponent, []);
  const plugin = getPlugin<CGData, CGState>('cryptogram')!;
  const solved = plugin.isSolved(data, state);
  // Stop timer when solved
  useEffect(() => {
    if (solved && timerRunning) setTimerRunning(false);
  }, [solved, timerRunning]);

  // Caesar-shift fallback guesser for sample cryptograms without plaintext
  function guessPlaintextFromCaesar(cipher: string): string | null {
    const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const upper = (s: string) => s.toUpperCase();
    const only = upper(cipher).replace(/[^A-Z]/g, '');
    if (!only) return null;
    const freq: Record<string, number> = {};
    for (const ch of only) freq[ch] = (freq[ch] || 0) + 1;
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!top) return null;
    const targets = ['E', 'T', 'A', 'O', 'I', 'N', 'S', 'H', 'R', 'D', 'L', 'U'];
    function decodeWithShift(shift: number): string {
      return cipher.split('').map((ch) => {
        const up = ch.toUpperCase();
        if (!/[A-Z]/.test(up)) return ch;
        const idx = ALPHA.indexOf(up);
        const dec = (idx - shift + 26) % 26;
        const plain = ALPHA[dec];
        return ch === up ? plain : plain.toLowerCase();
      }).join('');
    }
    function score(text: string): number {
      const U = upper(text);
      const words = [' THE ', ' THIS ', ' IS ', ' THERE ', ' AND ', ' OF ', ' TO ', ' IN ', ' THAT ', ' IT ', ' WITH ', ' AS ', ' FOR ', ' WAS ', ' ON ', ' BE ', ' AT ', ' BY ', ' NO ', ' NOT '];
      let s = 0;
      for (const w of words) if (U.includes(w)) s += w.trim().length;
      const vowels = (U.match(/[AEIOU]/g) || []).length; s += Math.min(vowels, 20);
      return s;
    }
    let best: { text: string; score: number } | null = null;
    for (const targ of targets) {
      const shift = (ALPHA.indexOf(top) - ALPHA.indexOf(targ) + 26) % 26;
      const cand = decodeWithShift(shift);
      const sc = score(cand);
      if (!best || sc > best.score) best = { text: cand, score: sc };
    }
    return best?.text || null;
  }

  if (!mounted) return null;
  return (
    <PuzzleLayout
      title="Cryptogram"
      toolbar={(
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {formatTime(timerMs)}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>{timerRunning ? 'Pause' : 'Resume'}</button>
          </div>
          <NewGameControls onNew={onNewGame} />
          <button className="ml-2 rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>{ const hints = plugin.getHints(data, state); setHint(hints[0] ?? null); }}>Hint</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>{
            // Reveal one random unmapped cipher letter using provided plaintext or Caesar guess fallback
            const cipher = data.ciphertext;
            const plain = data.plaintext || guessPlaintextFromCaesar(cipher);
            if (!plain) return;
            const letters = Array.from(new Set(cipher.toUpperCase().replace(/[^A-Z]/g, '').split('')));
            const remaining = letters.filter((c) => !(state.mapping[c] && /[A-Z]/.test(state.mapping[c])));
            if (remaining.length === 0) return;
            const pick = remaining[Math.floor(Math.random() * remaining.length)];
            const counts: Record<string, number> = {};
            const L = Math.min(cipher.length, plain.length);
            for (let i = 0; i < L; i++) {
              const c = cipher[i].toUpperCase();
              const p = plain[i].toUpperCase();
              if (c === pick && /[A-Z]/.test(c) && /[A-Z]/.test(p)) counts[p] = (counts[p] || 0) + 1;
            }
            const best = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
            if (!best) return;
            const next = { ...state.mapping, [pick]: best };
            setState({ mapping: next });
          }}>Reveal letter</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>{
            const cipher = data.ciphertext;
            const plain = data.plaintext || guessPlaintextFromCaesar(cipher);
            if (!plain) return;
            const next: Record<string, string> = { ...state.mapping };
            const L = Math.min(cipher.length, plain.length);
            for (let i = 0; i < L; i++) {
              const c = cipher[i].toUpperCase();
              const p = plain[i].toUpperCase();
              if (/[A-Z]/.test(c) && /[A-Z]/.test(p)) next[c] = p;
            }
            setState({ mapping: next });
          }}>Reveal solution</button>
          {solved && (
            <span className="ml-2 inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-200">Solved</span>
          )}
        </div>
      )}
    >
      <Comp data={data} state={state} onChange={setState} />
      <HintPanel hint={hint} />
    </PuzzleLayout>
  );
}

function NewGameControls({ onNew }: { onNew: (diff: CryptogramDifficulty) => void }) {
  const [difficulty, setDifficulty] = useState<CryptogramDifficulty>('medium');
  const [busy, setBusy] = useState(false);
  return (
    <div className="ml-2 inline-flex items-center gap-2">
      <select
        value={difficulty}
        onChange={(e)=> setDifficulty(e.target.value as CryptogramDifficulty)}
        className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm"
        title="Length"
      >
        <option value="short">Short</option>
        <option value="medium">Medium</option>
        <option value="long">Long</option>
      </select>
      <button
        className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
        onClick={()=>{ setBusy(true); try { onNew(difficulty); } finally { setBusy(false); } }}
        disabled={busy}
      >
        {busy ? 'Generating…' : 'New game'}
      </button>
    </div>
  );
}



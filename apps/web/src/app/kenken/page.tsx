"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import kenkenPlugin, { KenKenData, KenKenState, KenKenComponent } from '@repo/plugins-kenken';
import { generateKenKen, type Difficulty, solveKenKen } from '@repo/plugins-kenken';
import puzzles from '@repo/puzzles/index.json';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';
import { HintPanel } from '@repo/ui';

registerPlugin(kenkenPlugin);

export default function KenKenPage() {
  const item = (puzzles as any).puzzles.find((p: any) => p.type === 'kenken');
  const initialData = (item?.data || { size: 4, cages: [] }) as KenKenData;
  const saveKey = 'puzzle:kenken:autosave';

  const [data, setData] = useState<KenKenData>(initialData);
  const [state, setState] = useState<KenKenState>(() => {
    const plugin = getPlugin<KenKenData, KenKenState>('kenken')!;
    return plugin.createInitialState(initialData);
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [history, setHistory] = useState<KenKenState[]>([]);
  const [future, setFuture] = useState<KenKenState[]>([]);

  // timer
  const [timerMs, setTimerMs] = useState<number>(() => {
    try {
      if (typeof window === 'undefined') return 0;
      const raw = localStorage.getItem(saveKey);
      if (!raw) return 0;
      const saved = JSON.parse(raw);
      const t = saved?.timer;
      if (!t) return 0;
      const now = Date.now();
      const base = Number(t.elapsedMs) || 0;
      return t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base;
    } catch {}
    return 0;
  });
  const [timerRunning, setTimerRunning] = useState<boolean>(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on client after first mount
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (!raw) {
        const d = generateKenKen(4, 'easy');
        const pluginLocal = getPlugin<KenKenData, KenKenState>('kenken')!;
        const fresh = pluginLocal.createInitialState(d);
        setData(d);
        setState(fresh);
        setTimerMs(0);
        setTimerRunning(true);
        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
      } else {
        const saved = JSON.parse(raw);
        if (saved?.data) setData(saved.data as KenKenData);
        if (saved?.state) setState(saved.state as KenKenState);
        const t = saved?.timer;
        if (t) {
          const now = Date.now();
          const base = Number(t.elapsedMs) || 0;
          setTimerMs(t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base);
          if (typeof t.running === 'boolean') setTimerRunning(Boolean(t.running));
        }
      }
    } catch {}
    finally { setHydrated(true); }
  }, []);

  const plugin = getPlugin<KenKenData, KenKenState>('kenken')!;
  const solved = plugin.isSolved(data, state);
  useEffect(() => { if (solved && timerRunning) setTimerRunning(false); }, [solved, timerRunning]);

  useEffect(() => { if (!timerRunning) return; const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000); return () => clearInterval(id); }, [timerRunning]);
  function formatTime(ms: number): string { const s = Math.floor(ms/1000); const mm = Math.floor((s%3600)/60); const ss = s%60; const pad=(n:number)=>n.toString().padStart(2,'0'); return `${pad(mm)}:${pad(ss)}`; }

  const updateState = (next: KenKenState) => {
    const isSame = JSON.stringify(state) === JSON.stringify(next);
    if (isSame) return;
    setHistory((h) => (h.length > 200 ? [...h.slice(h.length - 200), state] : [...h, state]));
    setFuture([]);
    setState(next);
  };
  const restart = () => {
    const fresh = plugin.createInitialState(data);
    setHistory([]); setFuture([]); setState(fresh);
    setTimerMs(0); setTimerRunning(true);
    try { localStorage.setItem(saveKey, JSON.stringify({ data, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
  };

  // autosave after hydration
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
  }, [hydrated, data, state, timerMs, timerRunning]);
  useEffect(() => {
    if (!hydrated) return;
    const handler = () => { try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {} };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hydrated, data, state, timerMs, timerRunning]);

  const onNew = useCallback((size: 4|5|6, diff: Difficulty) => {
    const d = generateKenKen(size, diff);
    const fresh = plugin.createInitialState(d);
    setData(d); setState(fresh); setHistory([]); setFuture([]);
    setTimerMs(0); setTimerRunning(true);
    try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
  }, [plugin]);

  const Comp = useMemo(() => KenKenComponent, []);

  return (
    <PuzzleLayout
      title="KenKen"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state} />
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {mounted ? formatTime(timerMs) : '00:00'}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>
              <span suppressHydrationWarning>{timerRunning ? 'Pause' : 'Resume'}</span>
            </button>
          </div>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={() => {
            setHistory((h)=>{ if(h.length===0) return h; const prev=h[h.length-1]; setFuture((f)=>[state,...f]); setState(prev); return h.slice(0,-1); });
          }} disabled={history.length===0}>Undo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={() => {
            setFuture((f)=>{ if(f.length===0) return f; const next=f[0]; setHistory((h)=>[...h,state]); setState(next); return f.slice(1); });
          }} disabled={future.length===0}>Redo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={restart}>Restart</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={() => {
            // reveal: fill selected or first empty from solution if provided
            const sol = data.solution; if (!sol) return;
            let target = state.selected;
            if (!target || state.grid[target.r][target.c] !== 0) {
              outer: for (let r = 0; r < data.size; r++) for (let c = 0; c < data.size; c++) if (state.grid[r][c] === 0) { target = { r, c }; break outer; }
            }
            if (!target) return;
            const { r, c } = target; const v = sol[r][c];
            const ng = state.grid.map((row) => row.slice());
            ng[r][c] = v; setState({ ...state, grid: ng, selected: { r, c } });
          }}>Reveal</button>
          <button className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-sm hover:bg-emerald-500/25" onClick={() => {
            const sol = data.solution ?? solveKenKen(data);
            if (!sol) return;
            const next: KenKenState = { grid: sol, notes: state.notes, selected: state.selected };
            setHistory((h)=>[...h, state]); setFuture([]); setState(next);
            setTimerRunning(false);
          }}>Show solution</button>
          <NewKenKenControls onNew={onNew} />
        </div>
      )}
      sidebar={undefined}
    >
      <div className="w-full flex justify-center">
        <div className="w-fit">
          {hydrated ? (
            <Comp data={data} state={state} onChange={updateState} />
          ) : (
            <div className="text-white/60 text-sm px-2 py-6">Loading saved game…</div>
          )}
          <div className={`mt-2 ${solved ? 'text-emerald-400' : 'text-white/70'}`}>
            {solved ? (
              <span className="inline-block rounded bg-emerald-500/15 px-3 py-1 text-base font-semibold border border-emerald-400/30">Solved! 🎉</span>
            ) : (
              <span className="text-sm">Fill each row and column with 1..{data.size} and satisfy all cages</span>
            )}
          </div>
        </div>
      </div>
      <HintPanel hint={null} />
    </PuzzleLayout>
  );
}

function NewKenKenControls({ onNew }: { onNew: (size: 4|5|6, diff: Difficulty) => void }) {
  const [size, setSize] = useState<4|5|6>(4);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [busy, setBusy] = useState(false);
  return (
    <div className="ml-2 inline-flex items-center gap-2">
      <select value={size} onChange={(e)=> setSize(parseInt(e.target.value, 10) as 4|5|6)} className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm" title="Size">
        <option value={4}>4×4</option>
        <option value={5}>5×5</option>
        <option value={6}>6×6</option>
      </select>
      <select value={difficulty} onChange={(e)=> setDifficulty(e.target.value as Difficulty)} className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm" title="Difficulty">
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
      <button className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{ try { setBusy(true); onNew(size, difficulty); } finally { setBusy(false); } }} disabled={busy}>
        {busy ? 'Generating…' : 'New game'}
      </button>
    </div>
  );
}



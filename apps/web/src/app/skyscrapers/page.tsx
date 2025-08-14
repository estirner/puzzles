"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import skyscrapersPlugin, { SkyscrapersData, SkyscrapersState, SkyscrapersComponent } from '@repo/plugins-skyscrapers';
import { generateSkyscrapers, type SkyscrapersDifficulty } from '@repo/plugins-skyscrapers';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';
import puzzles from '@repo/puzzles/index.json';

registerPlugin(skyscrapersPlugin);

export default function SkyscrapersPage() {
  const saveKey = 'puzzle:skyscrapers:autosave';

  // Helpers
  function computeId(d: SkyscrapersData): string {
    const s = JSON.stringify({ size: d.size, top: d.top, bottom: d.bottom, left: d.left, right: d.right, mode: d.mode });
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  // Static initial data for SSR (avoid random generation on server)
  const sample = (puzzles as any).puzzles.find((p: any) => p.type === 'skyscrapers');
  const initialData = (sample?.data || { size: 4, top: [0,0,0,0], bottom: [0,0,0,0], left: [0,0,0,0], right: [0,0,0,0] }) as SkyscrapersData;
  const [data, setData] = useState<SkyscrapersData>(initialData);
  const [state, setState] = useState<SkyscrapersState>(() => {
    const pluginLocal = getPlugin<SkyscrapersData, SkyscrapersState>('skyscrapers')!;
    return pluginLocal.createInitialState(initialData);
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(saveKey);
      if (!raw) {
        const d = generateSkyscrapers(4, 'easy', 'count');
        const pluginLocal = getPlugin<SkyscrapersData, SkyscrapersState>('skyscrapers')!;
        const fresh = pluginLocal.createInitialState(d);
        setData(d); setState(fresh);
        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, meta: { id: computeId(d) }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
      } else {
        const saved = JSON.parse(raw);
        if (saved?.data) setData(saved.data as SkyscrapersData);
        if (saved?.state) setState(saved.state as SkyscrapersState);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plugin = getPlugin<SkyscrapersData, SkyscrapersState>('skyscrapers')!;
  const Comp = useMemo(() => SkyscrapersComponent, []);

  // History and autosave
  const [history, setHistory] = useState<SkyscrapersState[]>([]);
  const [future, setFuture] = useState<SkyscrapersState[]>([]);
  useEffect(() => {
    try { localStorage.setItem(saveKey, JSON.stringify({ data, state, meta: { id: computeId(data) }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
  }, [data, state]);

  const updateState = (next: SkyscrapersState) => {
    const isSame = JSON.stringify(state) === JSON.stringify(next);
    if (isSame) return;
    setHistory((h) => (h.length > 200 ? [...h.slice(h.length - 200), state] : [...h, state]));
    setFuture([]);
    setState(next);
  };

  // Timer
  const [timerMs, setTimerMs] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(true);
  useEffect(() => { if (!timerRunning) return; const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000); return () => clearInterval(id); }, [timerRunning]);
  function formatTime(ms: number): string { const s = Math.floor(ms/1000); const mm = Math.floor((s%3600)/60); const ss = s%60; const pad=(n:number)=>n.toString().padStart(2,'0'); return `${pad(mm)}:${pad(ss)}`; }

  // Solved/checked/hint
  const solved = plugin.isSolved(data, state);
  const [checked] = useState<null | boolean>(null);
  const [hint] = useState<any | null>(null);

  useEffect(() => { if (solved && timerRunning) setTimerRunning(false); }, [solved, timerRunning]);

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [state, ...f]);
      setState(prev);
      return h.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, state]);
      setState(next);
      return f.slice(1);
    });
  };
  const restart = () => {
    const fresh = plugin.createInitialState(data);
    setHistory([]); setFuture([]); setState(fresh); setTimerMs(0); setTimerRunning(true);
  };

  const onNew = useCallback((size: 4|5|6|7, diff: SkyscrapersDifficulty, mode: 'count'|'sum', diagonals: boolean) => {
    const d = generateSkyscrapers(size, diff, mode);
    if (diagonals) d.mode = { ...(d.mode || {}), diagonals: true };
    const fresh = plugin.createInitialState(d);
    setData(d); setState(fresh); setHistory([]); setFuture([]); setTimerMs(0); setTimerRunning(true);
    try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, meta: { id: computeId(d) }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
  }, [plugin]);

  return (
    <PuzzleLayout
      title="Skyscrapers"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state} />
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span>Time: {formatTime(timerMs)}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>{timerRunning ? 'Pause' : 'Resume'}</button>
          </div>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={undo} disabled={history.length===0}>Undo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={redo} disabled={future.length===0}>Redo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={restart}>Restart</button>
          {/* hint/check removed per request */}
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={() => {
            const sol = data.solution; if (!sol) return;
            let target = state.selected as { r: number; c: number } | null;
            if (!target || state.grid[target.r][target.c] !== 0) {
              outer: for (let r = 0; r < data.size; r++) for (let c = 0; c < data.size; c++) if (state.grid[r][c] === 0) { target = { r, c }; break outer; }
            }
            if (!target) return;
            const { r, c } = target; const v = sol[r][c];
            const ng = state.grid.map((row) => row.slice());
            ng[r][c] = v; setState({ ...state, grid: ng, selected: { r, c } });
          }}>Reveal</button>
          <button className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-sm hover:bg-emerald-500/25" onClick={() => {
            const sol = data.solution; if (!sol) return;
            const next: SkyscrapersState = { grid: sol.map((row)=>row.slice()), notes: state.notes, selected: state.selected };
            setHistory((h)=>[...h, state]); setFuture([]); setState(next); setTimerRunning(false);
          }}>Show solution</button>
          <NewSkyscrapersControls onNew={onNew} />
        </div>
      )}
      sidebar={undefined}
    >
      <div className="w-full flex justify-center">
        <div className="w-fit">
          {mounted ? (
            <Comp data={data} state={state} onChange={updateState} />
          ) : (
            <div className="text-white/60 text-sm px-2 py-6">Loading…</div>
          )}
          <div className={`mt-2 ${solved ? 'text-emerald-400' : 'text-white/70'}`}>
            {solved ? (
              <span className="inline-block rounded bg-emerald-500/15 px-3 py-1 text-base font-semibold border border-emerald-400/30">Solved! 🎉</span>
            ) : (
              <span className="text-sm">Fill each row and column with 1..{data.size} and satisfy all visibility clues{data.mode?.diagonals? ' and diagonal uniqueness' : ''}</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2" />
    </PuzzleLayout>
  );
}

function NewSkyscrapersControls({ onNew }: { onNew: (size: 4|5|6|7, diff: SkyscrapersDifficulty, mode: 'count'|'sum', diagonals: boolean) => void }) {
  const [size, setSize] = useState<4|5|6|7>(4);
  const [difficulty, setDifficulty] = useState<SkyscrapersDifficulty>('easy');
  const [mode, setMode] = useState<'count'|'sum'>('count');
  const [diagonals, setDiagonals] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="ml-2 inline-flex items-center gap-2">
      <select value={size} onChange={(e)=> setSize(parseInt(e.target.value, 10) as 4|5|6|7)} className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm" title="Size">
        <option value={4}>4×4</option>
        <option value={5}>5×5</option>
        <option value={6}>6×6</option>
        <option value={7}>7×7</option>
      </select>
      <select value={difficulty} onChange={(e)=> setDifficulty(e.target.value as SkyscrapersDifficulty)} className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm" title="Difficulty">
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
      <select value={mode} onChange={(e)=> setMode(e.target.value as 'count'|'sum')} className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm" title="Visibility mode">
        <option value="count">Count</option>
        <option value="sum">Sums</option>
      </select>
      <label className="inline-flex items-center gap-1 text-xs text-white/90">
        <input type="checkbox" checked={diagonals} onChange={(e)=> setDiagonals(e.target.checked)} /> Diagonals
      </label>
      <button className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{ try { setBusy(true); onNew(size, difficulty, mode, diagonals); } finally { setBusy(false); } }} disabled={busy}>
        {busy ? 'Generating…' : 'New game'}
      </button>
    </div>
  );
}



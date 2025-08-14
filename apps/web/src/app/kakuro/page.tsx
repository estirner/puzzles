"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import kakuroPlugin, { KakuroData, KakuroState, KakuroComponent, generateKakuro, solveKakuro, type KakuroSize } from '@repo/plugins-kakuro';
import puzzles from '@repo/puzzles/index.json';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';
import { HintPanel } from '@repo/ui';

registerPlugin(kakuroPlugin);

export default function KakuroPage() {
  const item = (puzzles as any).puzzles.find((p: any) => p.type === 'kakuro');
  const initialData = item.data as KakuroData;
  const saveKey = 'puzzle:kakuro:autosave';

  // data: initialize from static initialData to avoid hydration mismatch
  const [data, setData] = useState<KakuroData>(initialData);
  // state: initialize deterministically, then hydrate from storage after mount
  const [state, setState] = useState<KakuroState>(() => {
    const plugin = getPlugin<KakuroData, KakuroState>('kakuro')!;
    return plugin.createInitialState(initialData);
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Hydrate from localStorage on client after first mount to keep SSR/CSR HTML identical
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (!raw) {
        // No saved game: start a fresh 9×9 automatically
        const d = generateKakuro('9x9');
        const pluginLocal = getPlugin<KakuroData, KakuroState>('kakuro')!;
        const fresh = pluginLocal.createInitialState(d);
        setData(d);
        setState(fresh);
        setTimerMs(0);
        setTimerRunning(true);
        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
      } else {
        const saved = JSON.parse(raw);
        if (saved?.data) setData(saved.data as KakuroData);
        if (saved?.state) setState(saved.state as KakuroState);
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

  const [history, setHistory] = useState<KakuroState[]>([]);
  const [future, setFuture] = useState<KakuroState[]>([]);

  // timer
  const [timerMs, setTimerMs] = useState<number>(() => {
    try {
      if (typeof window === 'undefined') return 0; // avoid hydration mismatch
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

  // solved status
  const plugin = getPlugin<KakuroData, KakuroState>('kakuro')!;
  const solved = plugin.isSolved(data, state);
  useEffect(() => { if (solved && timerRunning) setTimerRunning(false); }, [solved, timerRunning]);

  // autosave only after hydration to avoid overwriting save at mount
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

  useEffect(() => { if (!timerRunning) return; const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000); return () => clearInterval(id); }, [timerRunning]);
  function formatTime(ms: number): string { const s = Math.floor(ms/1000); const mm = Math.floor((s%3600)/60); const ss = s%60; const pad=(n:number)=>n.toString().padStart(2,'0'); return `${pad(mm)}:${pad(ss)}`; }

  // UI helpers
  const updateState = (next: KakuroState) => {
    // ignore no-ops to keep undo/redo stable (e.g., invalid key ignored)
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

  const onNew = useCallback((size: KakuroSize) => {
    const d = generateKakuro(size);
    const fresh = plugin.createInitialState(d);
    setData(d); setState(fresh); setHistory([]); setFuture([]);
    setTimerMs(0); setTimerRunning(true);
    try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
  }, [plugin]);

  const Comp = useMemo(() => KakuroComponent, []);
  const solvedGrid = useMemo(() => solveKakuro(data), [data]);

  function revealSelectedCell() {
    if (!solvedGrid) return;
    // Determine target cell: prefer current selection if valid; otherwise first fill cell
    let target = state.selected;
    const isFill = (r: number, c: number) => {
      const cell: any = data.grid[r][c];
      return !(cell?.block) && !(cell?.sumRight) && !(cell?.sumDown);
    };
    if (!target || !isFill(target.r, target.c)) {
      outer: for (let r = 0; r < data.height; r++) {
        for (let c = 0; c < data.width; c++) {
          if (isFill(r, c)) { target = { r, c }; break outer; }
        }
      }
    }
    if (!target) return;
    const { r, c } = target;
    const value = solvedGrid[r][c];
    const ng = state.grid.map((row) => row.slice());
    if (ng[r][c] === value) return;
    ng[r][c] = value;
    setHistory((h)=>[...h, state]);
    setFuture([]);
    setState({ ...state, grid: ng, selected: { r, c } });
  }

  return (
    <PuzzleLayout
      title="Kakuro"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state} />
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {mounted ? formatTime(timerMs) : '00:00'}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>
              <span suppressHydrationWarning>{timerRunning ? 'Pause' : 'Resume'}</span>
            </button>
          </div>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{
            setHistory((h)=>{ if(h.length===0) return h; const prev=h[h.length-1]; setFuture((f)=>[state,...f]); setState(prev); return h.slice(0,-1); });
          }} disabled={history.length===0}>Undo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{
            setFuture((f)=>{ if(f.length===0) return f; const next=f[0]; setHistory((h)=>[...h,state]); setState(next); return f.slice(1); });
          }} disabled={future.length===0}>Redo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={restart}>Restart</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={revealSelectedCell}>Reveal</button>
          <button className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-sm hover:bg-emerald-500/25" onClick={()=>{
            const solved = solveKakuro(data);
            if (!solved) return;
            const next: KakuroState = { grid: solved, selected: state.selected };
            setHistory((h)=>[...h, state]); setFuture([]); setState(next);
            setTimerRunning(false);
          }}>Show solution</button>
          <NewKakuroControls onNew={onNew} />
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
              <span className="text-sm">Fill all sums with unique digits</span>
            )}
          </div>
        </div>
      </div>
      <HintPanel hint={null} />
    </PuzzleLayout>
  );
}

function NewKakuroControls({ onNew }: { onNew: (size: KakuroSize) => void }) {
  const [size, setSize] = useState<KakuroSize>('9x9');
  const [busy, setBusy] = useState(false);
  return (
    <div className="ml-2 inline-flex items-center gap-2">
      <select
        value={size}
        onChange={(e)=> setSize(e.target.value as KakuroSize)}
        className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm"
        title="Size"
      >
        <option value="7x7">7×7</option>
        <option value="9x9">9×9</option>
        <option value="11x11">11×11</option>
        <option value="13x13">13×13</option>
      </select>
      <button
        className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
        onClick={()=>{ try { setBusy(true); onNew(size); } finally { setBusy(false); } }}
        disabled={busy}
      >
        {busy ? 'Generating…' : 'New game'}
      </button>
    </div>
  );
}



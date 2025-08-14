"use client";
import { useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import nurikabePlugin, { NurikabeData, NurikabeState, NurikabeComponent, generateNurikabe, solveNurikabe } from '@repo/plugins-nurikabe';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';

registerPlugin(nurikabePlugin);

function sample(): NurikabeData { return generateNurikabe('10x10', { islandAreaRatio: 0.55 }); }

export default function NurikabePage() {
  const saveKey = 'puzzle:nurikabe:autosave';
  const initial = useMemo(() => sample(), []);
  const [data, setData] = useState<NurikabeData>(initial);
  const [state, setState] = useState<NurikabeState>(() => getPlugin<NurikabeData, NurikabeState>('nurikabe')!.createInitialState(initial));
  const [hydrated, setHydrated] = useState(false);
  const [timerMs, setTimerMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.data) setData(saved.data as NurikabeData);
        if (saved?.state) setState(saved.state as NurikabeState);
        const t = saved?.timer; if (t) {
          const now = Date.now(); const base = Number(t.elapsedMs)||0;
          setTimerMs(t.running && typeof t.lastUpdateTs==='number' ? base + Math.max(0, now - t.lastUpdateTs) : base);
          if (typeof t.running === 'boolean') setTimerRunning(Boolean(t.running));
        }
      } else {
        // First visit: auto-start a 10x10 game
        const d = generateNurikabe('10x10', { islandAreaRatio: 0.55 });
        const fresh = plugin.createInitialState(d);
        setData(d);
        setState(fresh);
        setTimerMs(0);
        setTimerRunning(true);
        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
      }
    } catch {}
    finally { setHydrated(true); }
  }, []);

  useEffect(() => { if (!timerRunning) return; const id = setInterval(()=> setTimerMs((s)=> s+1000), 1000); return ()=> clearInterval(id); }, [timerRunning]);
  useEffect(() => { if (!hydrated) return; try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {} }, [hydrated, data, state, timerMs, timerRunning]);

  const plugin = getPlugin<NurikabeData, NurikabeState>('nurikabe')!;
  const solved = plugin.isSolved(data, state);
  useEffect(() => { if (solved && timerRunning) setTimerRunning(false); }, [solved, timerRunning]);

  return (
    <PuzzleLayout
      title="Nurikabe"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state} />
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {Math.floor(timerMs/60000).toString().padStart(2,'0')}:{Math.floor((timerMs%60000)/1000).toString().padStart(2,'0')}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>
              <span suppressHydrationWarning>{timerRunning ? 'Pause' : 'Resume'}</span>
            </button>
          </div>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={()=>{ const fresh = plugin.createInitialState(data); setState(fresh); setTimerMs(0); setTimerRunning(true); }}>Restart</button>
          <NewNurikabeControls onNew={(d)=> {
            const fresh = plugin.createInitialState(d);
            setData(d);
            // Ensure state is created from the same data reference synchronously
            setState(fresh);
            setTimerMs(0);
            setTimerRunning(true);
            try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
          }} />
          <button className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-sm hover:bg-emerald-500/25" onClick={()=>{
            let solved = data.solution || solveNurikabe(data, 2000);
            if (!solved) solved = solveNurikabe(data, 4000);
            if (!solved) { alert('No solution found within time'); return; }
            setState({ ...state, marks: solved }); setTimerRunning(false);
            try { localStorage.setItem(saveKey, JSON.stringify({ data, state: { ...state, marks: solved }, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
          }}>Show solution</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={()=>{
            let solved = data.solution || solveNurikabe(data, 1500);
            if (!solved) solved = solveNurikabe(data, 3000);
            if (!solved) { alert('No solution found within time'); return; }
            const choices: Array<{ r: number; c: number }> = [];
            for (let r = 0; r < data.height; r++) for (let c = 0; c < data.width; c++) if ((state.marks[r][c] ?? -1) !== solved[r][c]) choices.push({ r, c });
            if (choices.length === 0) return;
            const pick = choices[(Math.random() * choices.length) | 0];
            const next = state.marks.map((row)=> row.slice());
            next[pick.r][pick.c] = solved[pick.r][pick.c];
            const nextState = { ...state, marks: next, selected: pick };
            setState(nextState);
            try { localStorage.setItem(saveKey, JSON.stringify({ data, state: nextState, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
          }}>Reveal cell</button>
        </div>
      )}
      sidebar={undefined}
    >
      <div className="w-full flex justify-center">
        <div className="w-fit">
          {hydrated ? (
            <NurikabeComponent data={data} state={state} onChange={setState} />
          ) : (
            <div className="text-white/60 text-sm px-2 py-6">Loading saved game…</div>
          )}
          <div className={`mt-2 ${solved ? 'text-emerald-400' : 'text-white/70'}`}>
            {solved ? (
              <span className="inline-block rounded bg-emerald-500/15 px-3 py-1 text-base font-semibold border border-emerald-400/30">Solved! 🎉</span>
            ) : (
              <span className="text-sm">Grow numbered islands to their sizes, keep sea connected, and avoid 2×2 sea blocks.</span>
            )}
          </div>
        </div>
      </div>
    </PuzzleLayout>
  );
}

function NewNurikabeControls({ onNew }: { onNew: (d: NurikabeData) => void }) {
  const [size, setSize] = useState<string>('10x10');
  const [ratio, setRatio] = useState<number>(0.32);
  const [maxIsl, setMaxIsl] = useState<number>(5);
  const [busy, setBusy] = useState(false);
  return (
    <div className="inline-flex items-center gap-3 text-sm">
      <label className="flex items-center gap-2">Size
        <select className="rounded border border-white/15 bg-white/[0.06] px-2 py-1" value={size} onChange={(e)=> setSize(e.target.value)}>
          {['7x7','10x10','12x12','15x15','20x20','custom'].map((s)=> <option key={s} value={s}>{s.replace('x','×')}</option>)}
        </select>
      </label>
      {size === 'custom' && (
        <input className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 w-28" placeholder="e.g., 17x13" onChange={(e)=> setSize(e.target.value)} />
      )}
      <label className="flex items-center gap-2">Island %
        <input type="range" min={0.18} max={0.5} step={0.01} value={ratio} onChange={(e)=> setRatio(parseFloat(e.target.value))} />
        <span className="w-10 text-right tabular-nums">{Math.round(ratio*100)}%</span>
      </label>
      <label className="flex items-center gap-2">Max size
        <input type="range" min={2} max={9} step={1} value={maxIsl} onChange={(e)=> setMaxIsl(parseInt(e.target.value, 10))} />
        <span className="w-6 text-right tabular-nums">{maxIsl}</span>
      </label>
      <button className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{
        try {
          setBusy(true);
          const s = size === 'custom' ? '10x10' : (size as any);
          const d = generateNurikabe(s as any, { islandAreaRatio: ratio });
          onNew(d);
        } finally { setBusy(false); }
      }} disabled={busy}>{busy ? 'Generating…' : 'New game'}</button>
    </div>
  );
}



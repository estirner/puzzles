"use client";
import { useEffect, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import hitoriPlugin, { HitoriData, HitoriState, HitoriComponent } from '@repo/plugins-hitori';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';

registerPlugin(hitoriPlugin);

export default function HitoriPage() {
  const saveKey = 'puzzle:hitori:autosave';
  const [data, setData] = useState<HitoriData | null>(null);
  const [state, setState] = useState<HitoriState | null>(null);
  const [timerMs, setTimerMs] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(true);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [solving, setSolving] = useState<boolean>(false);
  const [cachedSolution, setCachedSolution] = useState<number[][] | null>(null);
  const workerRef = typeof window !== 'undefined'
    ? ((globalThis as any)._hitoriWorker || new Worker(new URL('../workers/hitori-solver.worker.ts', import.meta.url), { type: 'module' }))
    : (null as any);
  if (typeof window !== 'undefined') (globalThis as any)._hitoriWorker = workerRef;

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.data) setData(saved.data as HitoriData);
        if (saved?.state) setState(saved.state as HitoriState);
        const t = saved?.timer; if (t) {
          const now = Date.now(); const base = Number(t.elapsedMs)||0;
          setTimerMs(t.running && typeof t.lastUpdateTs==='number' ? base + Math.max(0, now - t.lastUpdateTs) : base);
          if (typeof t.running === 'boolean') setTimerRunning(Boolean(t.running));
        }
      }
    } catch {}
    finally { setHydrated(true); }
  }, []);

  // If no saved puzzle found, generate one in a worker
  useEffect(() => {
    if (!hydrated) return;
    if (data && state) return;
    const plugin = getPlugin<HitoriData, HitoriState>('hitori')!;
    setGenerating(true);
    const reqId = Math.random().toString(36).slice(2);
    const handler = (ev: MessageEvent<{ reqId?: string; kind: 'generate'; ok: boolean; data?: HitoriData }>) => {
      const msg = ev.data as any;
      if (!msg || msg.reqId !== reqId || msg.kind !== 'generate') return;
      workerRef?.removeEventListener('message', handler as any);
      setGenerating(false);
      if (!msg.ok || !msg.data) return;
      const d = msg.data as HitoriData;
      setData(d);
      setCachedSolution(d.solution || null);
      const fresh = plugin.createInitialState(d);
      setState(fresh);
      try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
    };
    workerRef?.addEventListener('message', handler as any);
    workerRef?.postMessage({ kind: 'generate', size: 10, density, reqId });
    return () => workerRef?.removeEventListener('message', handler as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Debounced autosave to reduce blocking writes
  useEffect(() => {
    if (!hydrated || !data || !state) return;
    const id = setTimeout(() => {
      try { localStorage.setItem(saveKey, JSON.stringify({ data, state: { marks: state.marks }, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
    }, 400);
    return () => clearTimeout(id);
  }, [hydrated, data, state, state?.marks, timerRunning, timerMs]);
  // Save timer less frequently
  useEffect(() => {
    if (!hydrated || !data || !state) return;
    const id = setTimeout(() => {
      try { localStorage.setItem(saveKey, JSON.stringify({ data, state: { marks: state.marks }, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
    }, 5000);
    return () => clearTimeout(id);
  }, [hydrated, timerMs, data, state]);
  useEffect(() => { if (!timerRunning) return; const id = setInterval(()=> setTimerMs((s)=> s+1000), 1000); return ()=> clearInterval(id); }, [timerRunning]);

  const plugin = getPlugin<HitoriData, HitoriState>('hitori')!;
  const [checked, setChecked] = useState<null | boolean>(null);
  const [size, setSize] = useState<number>(10);
  const [density, setDensity] = useState<'sparse' | 'normal' | 'dense'>('normal');

  return (
    <PuzzleLayout
      title="Hitori"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state ?? {}} />
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {Math.floor(timerMs/60000).toString().padStart(2,'0')}:{Math.floor((timerMs%60000)/1000).toString().padStart(2,'0')}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>
              <span suppressHydrationWarning>{timerRunning ? 'Pause' : 'Resume'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/80">
            <label className="flex items-center gap-1">Size
              <select className="rounded border border-white/15 bg-white/[0.06] px-1 py-0.5"
                value={size}
                onChange={(e)=> setSize(parseInt(e.target.value, 10))}
                title="Grid size">
                <option value={6}>6×6</option>
                <option value={8}>8×8</option>
                <option value={10}>10×10</option>
                <option value={12}>12×12</option>
                <option value={15}>15×15</option>
              </select>
            </label>
            <label className="flex items-center gap-1">Density
              <select className="rounded border border-white/15 bg-white/[0.06] px-1 py-0.5"
                value={density}
                onChange={(e)=> setDensity(e.target.value as any)}
                title="Duplicate density">
                <option value="sparse">Sparse</option>
                <option value="normal">Normal</option>
                <option value="dense">Dense</option>
              </select>
            </label>
          </div>
          <button
            className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
            disabled={!data || !state}
            onClick={()=>{ if (!data) return; const fresh = plugin.createInitialState(data); setState(fresh); setTimerMs(0); setTimerRunning(true); setChecked(null); }}
          >Restart</button>
          <button
            className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
            disabled={generating}
            onClick={()=>{
              setChecked(null); setCachedSolution(null);
              setGenerating(true);
              const reqId = Math.random().toString(36).slice(2);
              const handler = (ev: MessageEvent<{ reqId?: string; kind: 'generate'; ok: boolean; data?: HitoriData }>) => {
                const msg = ev.data as any; if (!msg || msg.reqId !== reqId || msg.kind !== 'generate') return;
                workerRef?.removeEventListener('message', handler as any);
                setGenerating(false);
                if (!msg.ok || !msg.data) { alert('Failed to generate'); return; }
                const d = msg.data as HitoriData;
                setData(d);
                setCachedSolution(d.solution || null);
                const fresh = plugin.createInitialState(d);
                setState(fresh);
                setTimerMs(0); setTimerRunning(true);
                try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
              };
              workerRef?.addEventListener('message', handler as any);
              workerRef?.postMessage({ kind: 'generate', size, density, reqId });
            }}
          >{generating ? 'Generating…' : 'New game'}</button>
          <button
            className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-sm hover:bg-emerald-500/25 disabled:opacity-50"
            disabled={!data || !state}
            onClick={()=>{ if (!data || !state) return; const ok = plugin.isSolved(data, state); setChecked(ok); if (ok) setTimerRunning(false); }}
          >Check</button>
          <button
            className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
            disabled={!data || !state || solving}
            onClick={()=>{
              if (!data || !state) return;
              const solved = data.solution || cachedSolution;
              if (solved) {
                const next = solved.map((row)=> row.slice());
                setState((prev)=> ({ ...(prev as HitoriState), marks: next }));
                setTimerRunning(false);
                try { localStorage.setItem(saveKey, JSON.stringify({ data, state: { ...(state as HitoriState), marks: next }, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
                return;
              }
              setSolving(true);
              const reqId = Math.random().toString(36).slice(2);
              const handler = (ev: MessageEvent<{ reqId?: string; kind: 'solve'; ok: boolean; solution?: number[][] | null }>) => {
                const msg = ev.data as any; if (!msg || msg.reqId !== reqId || msg.kind !== 'solve') return;
                workerRef?.removeEventListener('message', handler as any);
                setSolving(false);
                if (!msg.ok || !msg.solution) { alert('No solution found within time'); return; }
                setCachedSolution(msg.solution);
                const next = msg.solution.map((row: number[])=> row.slice());
                setState((prev)=> ({ ...(prev as HitoriState), marks: next }));
                setTimerRunning(false);
                try { localStorage.setItem(saveKey, JSON.stringify({ data, state: { ...(state as HitoriState), marks: next }, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
              };
              workerRef?.addEventListener('message', handler as any);
              // Omit timeoutMs to let worker scale with grid size
              workerRef?.postMessage({ kind: 'solve', data, reqId });
            }}
          >{solving ? 'Solving…' : 'Show solution'}</button>
          <button
            className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
            disabled={!data || !state || solving}
            onClick={()=>{
              if (!data || !state) return;
              const applyReveal = (solution: number[][]) => {
                const choices: Array<{ r: number; c: number }> = [];
                for (let r = 0; r < data.height; r++) for (let c = 0; c < data.width; c++) {
                  if ((state.marks[r][c] ?? 0) !== solution[r][c]) choices.push({ r, c });
                }
                if (choices.length === 0) return;
                const pick = choices[(Math.random() * choices.length) | 0];
                const next = state.marks.map((row)=> row.slice());
                next[pick.r][pick.c] = solution[pick.r][pick.c];
                setState({ ...state, marks: next, selected: pick });
                try { localStorage.setItem(saveKey, JSON.stringify({ data, state: { ...state, marks: next, selected: pick }, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
              };
              const solved = data.solution || cachedSolution;
              if (solved) { applyReveal(solved); return; }
              setSolving(true);
              const reqId = Math.random().toString(36).slice(2);
              const handler = (ev: MessageEvent<{ reqId?: string; kind: 'solve'; ok: boolean; solution?: number[][] | null }>) => {
                const msg = ev.data as any; if (!msg || msg.reqId !== reqId || msg.kind !== 'solve') return;
                workerRef?.removeEventListener('message', handler as any);
                setSolving(false);
                if (!msg.ok || !msg.solution) { alert('No solution found within time'); return; }
                setCachedSolution(msg.solution);
                applyReveal(msg.solution);
              };
              workerRef?.addEventListener('message', handler as any);
              // Omit timeoutMs to let worker scale with grid size
              workerRef?.postMessage({ kind: 'solve', data, reqId });
            }}
          >Reveal cell</button>
        </div>
      )}
      sidebar={undefined}
    >
      <div className="w-full flex justify-center">
        <div className="w-fit">
          {hydrated && data && state ? (
            <HitoriComponent data={data} state={state} onChange={setState as any} />
          ) : (
            <div className="text-white/60 text-sm px-2 py-6">{generating ? 'Generating puzzle…' : 'Loading saved game…'}</div>
          )}
          <div className="mt-2 text-white/70">Black out duplicates; whites must stay connected</div>
          {checked !== null && (
            checked ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-200">
                <span>🎉 Solved!</span>
                <span className="text-emerald-300/80">Time: {Math.floor(timerMs/60000).toString().padStart(2,'0')}:{Math.floor((timerMs%60000)/1000).toString().padStart(2,'0')}</span>
              </div>
            ) : (
              <div className="mt-2 inline-flex items-center rounded-md border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-sm text-red-200">
                Not solved yet
              </div>
            )
          )}
        </div>
      </div>
    </PuzzleLayout>
  );
}



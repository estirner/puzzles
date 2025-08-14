"use client";
import { useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import hashiPlugin, { HashiData, HashiState, HashiComponent } from '@repo/plugins-hashi';
import { generateHashi } from '@repo/plugins-hashi';
import { solveHashi } from '@repo/plugins-hashi';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';
import puzzles from '@repo/puzzles/index.json';

registerPlugin(hashiPlugin);

export default function HashiPage() {
  const item = (puzzles as any).puzzles.find((p: any) => p.type === 'hashi');
  const initialData = (item?.data || generateHashi('12x12')) as HashiData;
  const saveKey = 'puzzle:hashi:autosave';

  const [data, setData] = useState<HashiData>(initialData);
  const [state, setState] = useState<HashiState>(() => {
    const pluginLocal = getPlugin<HashiData, HashiState>('hashi')!;
    return pluginLocal.createInitialState(initialData);
  });
  const [hydrated, setHydrated] = useState(false);
  const [timerMs, setTimerMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const [cellPx, setCellPx] = useState<number>(() => {
    try { if (typeof window !== 'undefined') { const raw = localStorage.getItem('hashi:cellSizePx'); const n = raw ? parseInt(raw, 10) : NaN; if (!Number.isNaN(n) && n >= 20 && n <= 120) return n; } } catch {}
    return 36;
  });

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.data) setData(saved.data as HashiData);
        if (saved?.state) setState(saved.state as HashiState);
        const t = saved?.timer; if (t) {
          const now = Date.now(); const base = Number(t.elapsedMs) || 0;
          setTimerMs(t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base);
          if (typeof t.running === 'boolean') setTimerRunning(Boolean(t.running));
        }
      } else {
        const d = generateHashi('12x12');
        const pluginLocal = getPlugin<HashiData, HashiState>('hashi')!;
        const fresh = pluginLocal.createInitialState(d);
        setData(d); setState(fresh); setTimerMs(0); setTimerRunning(true);
        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
      }
    } catch {}
    finally { setHydrated(true); }
  }, []);

  useEffect(() => { if (!timerRunning) return; const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000); return () => clearInterval(id); }, [timerRunning]);
  useEffect(() => { if (!hydrated) return; try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {} }, [hydrated, data, state, timerMs, timerRunning]);

  const plugin = getPlugin<HashiData, HashiState>('hashi')!;
  const solved = plugin.isSolved(data, state);
  useEffect(() => { if (solved && timerRunning) setTimerRunning(false); }, [solved, timerRunning]);

  function formatTime(ms: number): string { const s = Math.floor(ms/1000); const mm = Math.floor((s%3600)/60); const ss = s%60; const pad=(n:number)=>n.toString().padStart(2,'0'); return `${pad(mm)}:${pad(ss)}`; }

  return (
    <PuzzleLayout
      title="Hashiwokakero"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state} />
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {formatTime(timerMs)}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>
              <span suppressHydrationWarning>{timerRunning ? 'Pause' : 'Resume'}</span>
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-white/80">
            <span>Cell</span>
            <input type="range" min={20} max={96} step={1} value={cellPx} onChange={(e)=> setCellPx(parseInt(e.target.value, 10))} />
            <span className="w-8 tabular-nums text-white/70" suppressHydrationWarning>{cellPx}px</span>
          </div>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={()=>{
            const fresh = plugin.createInitialState(data);
            setState(fresh); setTimerMs(0); setTimerRunning(true);
          }}>Restart</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={()=>{
            // Reveal: ensure we have a reliable solution. If missing, try computing one.
            let sol = data.solution;
            if (!sol || sol.length === 0) {
              const solvedMap = solveHashi(data, 2500);
              if (solvedMap) {
                const entries = Object.entries(solvedMap);
                sol = entries.map(([k, v]) => {
                  const [a, b] = k.split('|'); const [ar, ac] = a.split(',').map(Number); const [br, bc] = b.split(',').map(Number);
                  return { a: { r: ar, c: ac }, b: { r: br, c: bc }, count: v as 1|2 } as any;
                });
              }
            }
            if (!sol) return;
            const keyFor = (a: {r:number;c:number}, b: {r:number;c:number}) => {
              const A = `${a.r},${a.c}`; const B = `${b.r},${b.c}`; return A < B ? `${A}|${B}` : `${B}|${A}`;
            };
            const mismatches = sol.filter(e => {
              const k = keyFor(e.a, e.b);
              const cur = (state.edges as any)[k] || 0; return cur !== e.count;
            });
            if (mismatches.length === 0) return;
            const pick = mismatches[(Math.random()*mismatches.length)|0];
            const k = keyFor(pick.a, pick.b);
            setState({ ...state, edges: { ...state.edges, [k]: pick.count } as any });
          }}>Reveal</button>
          <button className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-sm hover:bg-emerald-500/25" onClick={()=>{
            // Try solver with escalating timeouts
            let solvedMap = solveHashi(data, 2500);
            if (!solvedMap) solvedMap = solveHashi(data, 5000);
            if (!solvedMap) solvedMap = solveHashi(data, 8000);
            if (solvedMap) {
              const candidate = { ...state, edges: solvedMap } as HashiState;
              const ok = plugin.isSolved(data, candidate);
              if (ok) { setState(candidate); setTimerRunning(false); return; }
            }
            // Fallback to embedded solution if solver times out or fails
            if (data.solution && Array.isArray(data.solution)) {
              const dict: Record<string, 0|1|2> = {};
              const keyFor = (a: {r:number;c:number}, b: {r:number;c:number}) => {
                const A = `${a.r},${a.c}`; const B = `${b.r},${b.c}`; return A < B ? `${A}|${B}` : `${B}|${A}`;
              };
              for (const e of data.solution) dict[keyFor(e.a, e.b)] = (e.count as 0|1|2) ?? 0;
              const candidate = { ...state, edges: dict } as HashiState;
              if (plugin.isSolved(data, candidate)) { setState(candidate); setTimerRunning(false); return; }
            }
          }}>Show solution</button>
          <NewHashiControls onNew={(size)=>{
            const d = generateHashi(size);
            const fresh = plugin.createInitialState(d);
            setData(d); setState(fresh); setTimerMs(0); setTimerRunning(true);
            try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
          }} />
        </div>
      )}
      sidebar={undefined}
    >
      <div className="w-full flex justify-center">
        <div className="w-fit">
          {hydrated ? (
            <HashiComponent data={data} state={state} onChange={setState} cellPx={cellPx} onCellPxChange={setCellPx} />
          ) : (
            <div className="text-white/60 text-sm px-2 py-6">Loading saved game…</div>
          )}
          <div className="mt-2 h-8 flex items-center w-full justify-center">
            {solved ? (
              <span className="inline-block rounded bg-emerald-500/15 px-3 py-1 text-base font-semibold border border-emerald-400/30 text-emerald-400">Solved! 🎉</span>
            ) : (
              <span className="text-sm text-white/70 max-w-[40ch] text-center">Connect all islands; place 1–2 bridges per line; match each number and keep the network connected.</span>
            )}
          </div>
        </div>
      </div>
    </PuzzleLayout>
  );
}

function NewHashiControls({ onNew }: { onNew: (size: any) => void }) {
  const [size, setSize] = useState<string>('12x12');
  const [busy, setBusy] = useState(false);
  return (
    <div className="ml-2 inline-flex items-center gap-2">
      <select value={size} onChange={(e)=> setSize(e.target.value)} className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm" title="Size">
        <option value="7x7">7×7</option>
        <option value="10x10">10×10</option>
        <option value="12x12">12×12</option>
        <option value="15x15">15×15</option>
        <option value="20x20">20×20</option>
      </select>
      <button className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{ try { setBusy(true); onNew(size as any); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Generating…' : 'New game'}</button>
    </div>
  );
}



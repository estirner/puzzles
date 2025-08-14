"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import logicGridPlugin, { LogicGridComponent, type LGData, type LGState, generateLogicGrid } from '@repo/plugins-logic-grid';
import puzzles from '@repo/puzzles/index.json';
import { HintPanel } from '@repo/ui';
import { PuzzleLayout } from '../components/PuzzleLayout';

registerPlugin(logicGridPlugin);

export default function LogicGridPage() {
  const items = (puzzles as any).puzzles.filter((p: any) => p.type === 'logic-grid');
  const initialData = (items[0]?.data || generateLogicGrid(3)) as LGData;
  const saveKey = 'puzzle:logic-grid:autosave';
  const [data, setData] = useState<LGData>(() => {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null; if (raw) { const saved = JSON.parse(raw); if (saved?.data) return saved.data as LGData; } } catch {}
    return initialData;
  });
  const [state, setState] = useState<LGState>(() => {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null; if (raw) { const saved = JSON.parse(raw); if (saved?.state) return saved.state as LGState; } } catch {}
    const plugin = getPlugin<LGData, LGState>('logic-grid')!; return plugin.createInitialState(data);
  });
  const [timerMs, setTimerMs] = useState<number>(() => {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null; if (raw) { const saved = JSON.parse(raw); const t = saved?.timer; if (t) { const now = Date.now(); const base = Number(t.elapsedMs) || 0; return t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base; } } } catch {}
    return 0;
  });
  const [timerRunning, setTimerRunning] = useState<boolean>(() => {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null; if (raw) { const saved = JSON.parse(raw); const t = saved?.timer; if (t && typeof t.running === 'boolean') return Boolean(t.running); } } catch {}
    return true;
  });
  const [hint, setHint] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => { try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {} }, [data, state, timerMs, timerRunning]);
  useEffect(() => { const h = () => { try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {} }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [data, state, timerMs, timerRunning]);
  useEffect(() => { if (!timerRunning) return; const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000); return () => clearInterval(id); }, [timerRunning]);
  // Stop on solve
  useEffect(() => { const plugin = getPlugin<LGData, LGState>('logic-grid')!; const ok = plugin.isSolved(data, state); if (ok && timerRunning) setTimerRunning(false); }, [data, state, timerRunning]);

  const Comp = useMemo(() => LogicGridComponent, []);
  const plugin = getPlugin<LGData, LGState>('logic-grid')!;

  function formatTime(ms: number): string { const s = Math.floor(ms / 1000); const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60; const pad = (n: number) => n.toString().padStart(2, '0'); return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`; }

  const [size, setSize] = useState<number>(3);
  const onNewGame = useCallback(() => {
    const d = generateLogicGrid(size) as unknown as LGData;
    setData(d);
    const pl = getPlugin<LGData, LGState>('logic-grid')!;
    const fresh = pl.createInitialState(d);
    setState(fresh);
    setHint(null);
    setTimerMs(0); setTimerRunning(true);
    try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
  }, [size]);

  if (!mounted) return null;
  return (
    <PuzzleLayout
      title="Logic Grid"
      toolbar={(
        <div className="flex items-center gap-2 text-sm">
          <label className="inline-flex items-center gap-2 text-xs text-white/80">
            <span>Size</span>
            <select className="rounded border border-white/15 bg-white/[0.06] px-2 py-1" value={String(size)} onChange={(e)=> setSize(parseInt(e.target.value,10))}>
              {[3].map((n)=> <option key={n} value={String(n)}>{n}×{n}</option>)}
            </select>
          </label>
          <button className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09]" onClick={onNewGame}>New game</button>
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {formatTime(timerMs)}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>{timerRunning ? 'Pause' : 'Resume'}</button>
          </div>
          <button className="ml-2 rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>{ const hints = plugin.getHints(data, state); setHint(hints[0] ?? null); }}>Hint</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>{ const ok = plugin.isSolved(data, state); alert(ok ? 'Solved' : 'Not solved yet'); }}>Check</button>
        </div>
      )}
    >
      <Comp data={data} state={state} onChange={setState} />
      <HintPanel hint={hint} />
    </PuzzleLayout>
  );
}



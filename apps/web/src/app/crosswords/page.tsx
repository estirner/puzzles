"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import crosswordsPlugin, { CWData, CWState, CrosswordComponent, computeNumbering, generateCrossword } from '@repo/plugins-crosswords';
import puzzles from '@repo/puzzles/index.json';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';

registerPlugin(crosswordsPlugin);

export default function CrosswordsPage() {
  const item = (puzzles as any).puzzles.find((p: any) => p.type === 'crosswords');
  const initialData = item.data as CWData;
  const saveKey = 'puzzle:crosswords:autosave';
  const [data, setData] = useState<CWData>(initialData);
  const [state, setState] = useState<CWState>(() => { const plugin = getPlugin<CWData, CWState>('crosswords')!; return plugin.createInitialState(initialData); });
  const Comp = useMemo(() => CrosswordComponent, []);
  const [timerMs, setTimerMs] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(true);
  const [ready, setReady] = useState<boolean>(false);

  // Bootstrap on mount: restore saved, otherwise generate a new one
  useEffect(() => { (async () => {
    let restored = false;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.data && saved?.state) {
          setData(saved.data as CWData);
          setState(saved.state as CWState);
          const t = saved.timer; if (t) {
            const now = Date.now(); const base = Number(t.elapsedMs)||0;
            setTimerMs(t.running && typeof t.lastUpdateTs==='number' ? base + Math.max(0, now - t.lastUpdateTs) : base);
            setTimerRunning(Boolean(t.running));
          }
          restored = true;
        }
      }
    } catch {}
    if (!restored) {
      const d = await generateCrossword('auto');
      const plugin = getPlugin<CWData, CWState>('crosswords')!; const fresh = plugin.createInitialState(d);
      setData(d); setState(fresh); setTimerMs(0); setTimerRunning(true);
      try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })) } catch {}
    }
    setReady(true);
  })().catch(()=>{}); }, []);

  // Timer ticker & autosave
  useEffect(() => { if (!ready || !timerRunning) return; const id = setInterval(()=>setTimerMs((ms)=>ms+1000),1000); return ()=>clearInterval(id); }, [ready, timerRunning]);
  useEffect(() => { if (!ready) return; try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })) } catch {} }, [ready, data, state, timerMs, timerRunning]);

  // Auto-generate handled in bootstrap effect above

  const fileInput = useRef<HTMLInputElement>(null);
  function formatTime(ms: number): string { const s = Math.floor(ms/1000); const mm = Math.floor((s%3600)/60); const ss = s%60; const pad=(n:number)=>n.toString().padStart(2,'0'); return `${pad(mm)}:${pad(ss)}`; }

  const numbering = useMemo(() => computeNumbering(data), [data]);

  // Undo/Redo
  const [history, setHistory] = useState<CWState[]>([]);
  const [future, setFuture] = useState<CWState[]>([]);
  const [solved, setSolved] = useState<boolean>(false);
  const updateState = (next: CWState) => {
    setHistory((h) => (h.length > 200 ? [...h.slice(h.length - 200), state] : [...h, state]));
    setFuture([]);
    setState(next);
  };

  // Stop timer and mark solved when complete
  useEffect(() => {
    const plugin = getPlugin<CWData, CWState>('crosswords')!;
    const ok = plugin.isSolved(data, state);
    setSolved(ok);
    if (ok && timerRunning) setTimerRunning(false);
  }, [data, state, timerRunning]);

  return (
    <PuzzleLayout
      title="Crosswords"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state} />
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span>Time: {formatTime(timerMs)}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>{timerRunning ? 'Pause' : 'Resume'}</button>
          </div>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{
            setHistory((h)=>{ if(h.length===0) return h; const prev=h[h.length-1]; setFuture((f)=>[state,...f]); setState(prev); return h.slice(0,-1); });
          }} disabled={history.length===0}>Undo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{
            setFuture((f)=>{ if(f.length===0) return f; const next=f[0]; setHistory((h)=>[...h,state]); setState(next); return f.slice(1); });
          }} disabled={future.length===0}>Redo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={()=>{
            const plugin = getPlugin<CWData,CWState>('crosswords')!; const fresh = plugin.createInitialState(data); setHistory([]); setFuture([]); setState(fresh); setTimerMs(0); setTimerRunning(true);
            try { localStorage.setItem(saveKey, JSON.stringify({ data, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })) } catch {}
          }}>Restart</button>
          {/* Export/Import removed by request */}
          {/* IPUZ import removed by request */}
          <NewCWControls onNew={async ()=>{ const d = await generateCrossword('auto');
            const plugin = getPlugin<CWData,CWState>('crosswords')!; const fresh = plugin.createInitialState(d); setData(d); setHistory([]); setFuture([]); setState(fresh); setTimerMs(0); setTimerRunning(true); try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })) } catch {} }} />
        </div>
      )}
      sidebar={undefined}
    >
      {ready ? (
        <Comp data={data} state={state} onChange={updateState} />
      ) : (
        <div className="text-sm text-white/70">Loading crossword…</div>
      )}
    </PuzzleLayout>
  );
}

function NewCWControls({ onNew }: { onNew: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="ml-2 inline-flex items-center gap-2">
      <button className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={()=>{ try{ setBusy(true); onNew(); } finally { setBusy(false); } }} disabled={busy}>{busy ? 'Generating…' : 'New game'}</button>
    </div>
  );
}



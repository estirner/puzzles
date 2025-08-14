"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import nonogramsPlugin, { NonogramsData, NonogramsState, NonogramsComponent, generateNonogram, type NonogramSize, type NonogramDensity } from '@repo/plugins-nonograms';
import puzzles from '@repo/puzzles/index.json';
import { PuzzleLayout } from '../components/PuzzleLayout';
import { HintPanel } from '@repo/ui';
import StateShare from '../components/StateShare';

registerPlugin(nonogramsPlugin);

export default function NonogramsPage() {
  const items = (puzzles as any).puzzles.filter((p: any) => p.type === 'nonograms');
  const initialData = (items[0]?.data || { rows: [[1], [1]], cols: [[1], [1]] }) as NonogramsData;
  const saveKey = 'puzzle:nonograms:autosave';

  function computeId(d: NonogramsData): string {
    const sRows = d.rows.map((r) => r.join('.')).join('|');
    const sCols = d.cols.map((c) => c.join('.')).join('|');
    const s = `${sRows}#${sCols}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  const [data, setData] = useState<NonogramsData>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (saved?.data) return saved.data as NonogramsData; }
    } catch {}
    return initialData;
  });

  const [state, setState] = useState<NonogramsState>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (saved?.state) return saved.state as NonogramsState; }
    } catch {}
    const plugin = getPlugin<NonogramsData, NonogramsState>('nonograms')!;
    return plugin.createInitialState(initialData);
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [history, setHistory] = useState<NonogramsState[]>([]);
  const [future, setFuture] = useState<NonogramsState[]>([]);

  const [timerMs, setTimerMs] = useState<number>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        const t = saved?.timer;
        if (t) {
          const now = Date.now();
          const base = Number(t.elapsedMs) || 0;
          return t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base;
        }
      }
    } catch {}
    return 0;
  });
  const [timerRunning, setTimerRunning] = useState<boolean>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); const t = saved?.timer; if (t && typeof t.running === 'boolean') return Boolean(t.running); }
    } catch {}
    return true;
  });

  const [meta, setMeta] = useState<{ id: string } | null>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.meta?.id) return saved.meta as any;
        if (saved?.data) return { id: computeId(saved.data as NonogramsData) };
      }
    } catch {}
    return null;
  });

  // Auto-save on any change
  useEffect(() => {
    try { localStorage.setItem(saveKey, JSON.stringify({ data, state, meta, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
  }, [data, state, meta, timerMs, timerRunning]);

  // Synchronous save on unload to capture last keystroke
  useEffect(() => {
    const handler = () => {
      try { localStorage.setItem(saveKey, JSON.stringify({ data, state, meta, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [data, state, meta, timerMs, timerRunning]);

  // Timer tick
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  }

  // Update state with history tracking
  const updateState = useCallback((next: NonogramsState) => {
    setHistory((h) => (h.length > 200 ? [...h.slice(h.length - 200), state] : [...h, state]));
    setFuture([]);
    setState(next);
    try { localStorage.setItem(saveKey, JSON.stringify({ data, state: next, meta, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
  }, [data, state, meta, timerMs, timerRunning]);

  // Undo / Redo / Restart
  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [state, ...f]);
      setState(prev);
      return h.slice(0, -1);
    });
  }, [state]);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, state]);
      setState(next);
      return f.slice(1);
    });
  }, [state]);
  const restart = useCallback(() => {
    const plugin = getPlugin<NonogramsData, NonogramsState>('nonograms')!;
    const fresh = plugin.createInitialState(data);
    setHistory([]); setFuture([]);
    setState(fresh);
    setTimerMs(0); setTimerRunning(true);
  }, [data]);

  // Stop timer when solved
  useEffect(() => {
    const plugin = getPlugin<NonogramsData, NonogramsState>('nonograms')!;
    const solved = plugin.isSolved(data, state);
    if (solved && timerRunning) setTimerRunning(false);
  }, [data, state, timerRunning]);

  // Partial conflict detection (rows/cols)
  const [conflict, setConflict] = useState<boolean>(false);
  useEffect(() => {
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const runs = (row: number[]): number[] => {
      const out: number[] = [];
      let c = 0;
      for (const v of row) { if (v === 1) c++; else if (c > 0) { out.push(c); c = 0; } }
      if (c > 0) out.push(c);
      return out;
    };
    const rowBad = (): boolean => {
      for (let r = 0; r < data.rows.length; r++) {
        const expected = data.rows[r];
        const row = state.grid[r];
        const actual = runs(row);
        if (actual.length > expected.length) return true;
        for (let i = 0; i < actual.length; i++) if (actual[i] > (expected[i] || 0)) return true;
        const filled = row.filter((v) => v === 1).length;
        if (filled > sum(expected)) return true;
      }
      return false;
    };
    const colBad = (): boolean => {
      const height = data.rows.length; const width = data.cols.length;
      for (let c = 0; c < width; c++) {
        const expected = data.cols[c];
        const col = Array.from({ length: height }, (_, r) => state.grid[r][c]);
        const actual = runs(col);
        if (actual.length > expected.length) return true;
        for (let i = 0; i < actual.length; i++) if (actual[i] > (expected[i] || 0)) return true;
        const filled = col.filter((v) => v === 1).length;
        if (filled > sum(expected)) return true;
      }
      return false;
    };
    setConflict(rowBad() || colBad());
  }, [data, state]);

  // Hint and check
  const [hint, setHint] = useState<any | null>(null);
  const [checked, setChecked] = useState<null | boolean>(null);
  const [solution, setSolution] = useState<number[][] | null>(null);
  const solverWorkerRef = typeof window !== 'undefined'
    ? ((globalThis as any)._nonogramSolverWorker || new Worker(new URL('../workers/nonogram-solver.worker.ts', import.meta.url), { type: 'module' }))
    : (null as any);
  if (typeof window !== 'undefined') (globalThis as any)._nonogramSolverWorker = solverWorkerRef;
  const [solving, setSolving] = useState(false);

  // Initial meta if none present
  useEffect(() => {
    if (!meta) setMeta({ id: computeId(data) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  const Comp = NonogramsComponent;
  const height = data.rows.length; const width = data.cols.length;

  return (
    <PuzzleLayout
      title="Nonograms"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state} />
          {meta && (
            <div className="flex items-center gap-2 text-xs text-white/80">
              <span>Size: {height}×{width}</span>
              <span>•</span>
              <span>ID: {meta.id}</span>
        </div>
          )}
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span>Time: {formatTime(timerMs)}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>{timerRunning ? 'Pause' : 'Resume'}</button>
          </div>
          <button
            className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]"
            title="Export puzzle JSON"
            onClick={() => {
              try {
                const s = JSON.stringify(data);
                const copyWithTextarea = () => {
                  try {
                    const ta = document.createElement('textarea');
                    ta.value = s;
                    ta.setAttribute('readonly', '');
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    return true;
                  } catch { return false; }
                };
                const doClipboard = async () => {
                  try { if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { await navigator.clipboard.writeText(s); return true; } } catch {}
                  return false;
                };
                doClipboard().then((ok) => {
                  if (!ok) {
                    const ok2 = copyWithTextarea();
                    if (!ok2) prompt('Copy puzzle JSON:', s);
                    else {
                      const badge = document.getElementById('nonograms-copied-badge');
                      if (badge) { badge.style.display = 'inline-flex'; setTimeout(()=>{ if (badge) badge.style.display = 'none'; }, 2000); }
                    }
                  } else {
                    const badge = document.getElementById('nonograms-copied-badge');
                    if (badge) { badge.style.display = 'inline-flex'; setTimeout(()=>{ if (badge) badge.style.display = 'none'; }, 2000); }
                  }
                });
              } catch {}
            }}
          >Export</button>
          <span id="nonograms-copied-badge" style={{ display: 'none' }} className="ml-2 inline-flex items-center rounded-full border border-green-500/40 bg-green-500/20 px-2 py-1 text-xs font-medium text-green-200">
            Nonograms JSON copied
          </span>
          <button
            className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]"
            title="Import puzzle JSON"
            onClick={() => {
              const s = prompt('Paste Nonograms JSON { rows:number[][], cols:number[][] }');
              if (!s) return;
              let d: NonogramsData | null = null;
              try { const parsed = JSON.parse(s); if (Array.isArray(parsed?.rows) && Array.isArray(parsed?.cols)) d = parsed as NonogramsData; } catch {}
              if (!d) { alert('Invalid Nonograms JSON'); return; }
              setData(d);
              const plugin = getPlugin<NonogramsData, NonogramsState>('nonograms')!;
              const fresh = plugin.createInitialState(d);
              setState(fresh);
              setHistory([]); setFuture([]);
              const id = computeId(d); setMeta({ id });
              setTimerMs(0); setTimerRunning(true);
              try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, meta: { id }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
            }}
          >Import</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={undo} disabled={history.length===0}>Undo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={redo} disabled={future.length===0}>Redo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={restart}>Restart</button>
          <NewNonogramControls onNew={(d)=>{ setData(d); const plugin = getPlugin<NonogramsData, NonogramsState>('nonograms')!; const fresh = plugin.createInitialState(d); setState(fresh); setChecked(null); setHint(null); setConflict(false); setHistory([]); setFuture([]); const id = computeId(d); setMeta({ id }); setTimerMs(0); setTimerRunning(true); try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, meta: { id }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {} }} />
        </div>
      )}
      sidebar={undefined}
    >
      <Comp data={data} state={state} onChange={updateState} />
      {checked !== null && (
        <div className={`mt-2 text-sm ${checked ? 'text-green-400' : 'text-red-400'}`}>{checked ? 'Solved' : 'Not solved yet'}</div>
      )}
      <HintPanel hint={hint} />
      <div className="mt-3 flex items-center gap-3">
        <button
          className="rounded-md border border-amber-400/30 bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-500/25 hover:border-amber-400/50"
          title="Suggest a next step"
          onClick={() => {
            const h = (nonogramsPlugin as any).getHints(data, state) as any[];
            setHint(h?.[0] || null);
          }}
        >
          Get hint
        </button>
        <button
          className="rounded-md border border-emerald-400/30 bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-100 hover:bg-emerald-500/25 hover:border-emerald-400/50"
          title="Validate current board"
          onClick={() => {
            const ok = (nonogramsPlugin as any).isSolved(data, state);
            setChecked(ok);
          }}
        >
          Check
        </button>
        <button
          className="rounded-md border border-sky-400/30 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-100 hover:bg-sky-500/25 hover:border-sky-400/50"
          title="Solve and fill the board"
          onClick={() => {
            if (solving) return;
            setSolving(true);
            const reqId = Math.random().toString(36).slice(2);
            const handler = (ev: MessageEvent<{ reqId?: string; kind: 'solve'; ok: boolean; solution?: number[][] }>) => {
              if (ev.data?.reqId !== reqId) return;
              solverWorkerRef?.removeEventListener('message', handler);
              setSolving(false);
              if (!ev.data.ok || !ev.data.solution) { alert('No solution found'); return; }
              const sol = ev.data.solution;
              setSolution(sol);
              const next: NonogramsState = { grid: sol.map((r) => r.slice()) };
              updateState(next);
              setChecked(true);
              setHint(null);
            };
            solverWorkerRef?.addEventListener('message', handler);
            solverWorkerRef?.postMessage({ kind: 'solve', data, reqId });
          }}
          disabled={solving}
        >
          {solving ? 'Solving…' : 'Solve'}
        </button>
        {conflict && <ConflictBadge />}
      </div>
    </PuzzleLayout>
  );
}

function ConflictBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-red-500/40 bg-red-500/20 px-2 py-1 text-xs font-medium text-red-200">
      Conflicts
    </span>
  );
}

function NewNonogramControls({ onNew }: { onNew: (d: NonogramsData) => void }) {
  const [size, setSize] = useState<NonogramSize>('10x10');
  const [density, setDensity] = useState<NonogramDensity>('normal');
  const [busy, setBusy] = useState(false);
  return (
    <div className="ml-3 inline-flex items-center gap-2">
      <select
        value={size}
        onChange={(e)=> setSize(e.target.value as NonogramSize)}
        className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm"
        title="Size"
      >
        <option value="5x5">5×5</option>
        <option value="10x10">10×10</option>
        <option value="15x15">15×15</option>
        <option value="20x20">20×20</option>
      </select>
      <select
        value={density}
        onChange={(e)=> setDensity(e.target.value as NonogramDensity)}
        className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm"
        title="Density"
      >
        <option value="sparse">Sparse</option>
        <option value="normal">Normal</option>
        <option value="dense">Dense</option>
      </select>
      <button
        className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
        onClick={() => {
          try {
            setBusy(true);
            const d = generateNonogram(size, density);
            onNew(d);
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
      >
        {busy ? 'Generating…' : 'New game'}
      </button>
    </div>
  );
}



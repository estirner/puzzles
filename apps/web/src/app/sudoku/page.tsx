"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin, type WorkerRequest, type WorkerResponse } from '@repo/engine';
import sudokuPlugin, { SudokuData, SudokuState, SudokuComponent } from '@repo/plugins-sudoku';
import { generateSudoku, type Difficulty } from '@repo/plugins-sudoku';
import puzzles from '@repo/puzzles/index.json';
import { HintPanel } from '@repo/ui';
import StateShare from '../components/StateShare';
import { PuzzleLayout } from '../components/PuzzleLayout';

registerPlugin(sudokuPlugin);

export default function SudokuPage() {
  const item = (puzzles as any).puzzles.find((p: any) => p.type === 'sudoku');
  const initialData = item.data as SudokuData;
  const saveKey = 'puzzle:sudoku:autosave';
  function computeId(d: SudokuData): string {
    const s = d.givens.map((g) => `${g.r},${g.c},${g.v}`).join('|');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }
  const [data, setData] = useState<SudokuData>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (saved?.data) return saved.data as SudokuData; }
    } catch {}
    return initialData;
  });
  const [state, setState] = useState<SudokuState>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (saved?.state) return saved.state as SudokuState; }
    } catch {}
    const plugin = getPlugin<SudokuData, SudokuState>('sudoku')!;
    return plugin.createInitialState(initialData);
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [history, setHistory] = useState<SudokuState[]>([]);
  const [future, setFuture] = useState<SudokuState[]>([]);
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
  const [meta, setMeta] = useState<{ id: string; difficulty: Difficulty | 'restored' } | null>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.meta?.id) return saved.meta as any;
        if (saved?.data) return { id: computeId(saved.data as SudokuData), difficulty: 'restored' };
      }
    } catch {}
    return null;
  });
  // On first visit (no save present), auto-start a new easy game
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(saveKey);
      if (!raw) {
        const d = generateSudoku('easy');
        setData(d);
        const plugin = getPlugin<SudokuData, SudokuState>('sudoku')!;
        const fresh = plugin.createInitialState(d);
        setState(fresh);
        setMeta({ id: computeId(d), difficulty: 'easy' });
        setTimerMs(0); setTimerRunning(true);
        // persist with metadata
        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, meta: { id: computeId(d), difficulty: 'easy' }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Validated = useMemo(() => SudokuComponent, []);
  const [hint, setHint] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [workerRef, setWorkerRef] = useState<Worker | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const existing = (globalThis as any)._solverWorker as Worker | null | undefined;
    if (existing) { setWorkerRef(existing); return; }
    try {
      const w = new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' });
      (globalThis as any)._solverWorker = w;
      setWorkerRef(w);
    } catch {
      setWorkerRef(null);
    }
  }, []);
  function postToWorker<T extends WorkerRequest>(msg: T): Promise<WorkerResponse> {
    if (!workerRef) {
      try {
        const plugin = getPlugin<SudokuData, SudokuState>('sudoku')!;
        if (msg.kind === 'validate') {
          return Promise.resolve({ reqId: 'local', kind: 'validate', result: plugin.validateMove((msg as any).data, (msg as any).state, (msg as any).move) } as any);
        } else if (msg.kind === 'hint') {
          return Promise.resolve({ reqId: 'local', kind: 'hint', result: plugin.getHints((msg as any).data, (msg as any).state) } as any);
        } else if (msg.kind === 'explain') {
          return Promise.resolve({ reqId: 'local', kind: 'explain', result: plugin.explainStep((msg as any).data, (msg as any).state) } as any);
        }
      } catch {}
      return Promise.resolve({ reqId: 'local', kind: (msg as any).kind, result: null as any } as any);
    }
    return new Promise((resolve) => {
      const reqId = Math.random().toString(36).slice(2);
      const handler = (ev: MessageEvent<WorkerResponse>) => {
        if ((ev.data as any).reqId === reqId) {
          workerRef?.removeEventListener('message', handler);
          resolve(ev.data);
        }
      };
      workerRef.addEventListener('message', handler);
      workerRef.postMessage({ ...msg, reqId });
    });
  }
  const [checked, setChecked] = useState<null | boolean>(null);
  const [conflict, setConflict] = useState<boolean>(false);
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

  const updateState = useCallback((next: SudokuState) => {
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
    const plugin = getPlugin<SudokuData, SudokuState>('sudoku')!;
    const fresh = plugin.createInitialState(data);
    setHistory([]); setFuture([]);
    setState(fresh);
    setTimerMs(0); setTimerRunning(true);
  }, [data]);

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

  // Import/Export helpers (sudoku-gen compatible)
  function dataFromPuzzleString(str: string): SudokuData | null {
    const s = (str || '').replace(/\s+/g, '');
    if (s.length !== 81) return null;
    const givens: Array<{ r: number; c: number; v: number }> = [];
    for (let i = 0; i < 81; i++) {
      const ch = s[i];
      if (ch === '-' || ch === '.' || ch === '0') continue;
      const v = Number(ch);
      if (!Number.isInteger(v) || v < 1 || v > 9) return null;
      givens.push({ r: Math.floor(i / 9), c: i % 9, v });
    }
    return { size: 9, givens } as SudokuData;
  }
  function puzzleStringFromData(d: SudokuData): string {
    const map = new Map(d.givens.map((g) => [`${g.r},${g.c}`, g.v] as const));
    let out = '';
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), c = i % 9;
      const v = map.get(`${r},${c}`);
      out += v ? String(v) : '-';
    }
    return out;
  }

  // Stop timer when solved
  useEffect(() => {
    const plugin = getPlugin<SudokuData, SudokuState>('sudoku')!;
    const solved = plugin.isSolved(data, state);
    if (solved && timerRunning) setTimerRunning(false);
  }, [data, state, timerRunning]);

  if (!mounted) return null;
  return (
    <PuzzleLayout
      title="Sudoku"
      toolbar={(
        <div className="flex items-center gap-3">
          <StateShare getState={() => state} />
          {conflict && (
            <span className="ml-2 inline-flex items-center rounded-full border border-red-500/40 bg-red-500/20 px-2 py-1 text-xs font-medium text-red-200">
              Conflicts
            </span>
          )}
          {meta && (
            <div className="flex items-center gap-2 text-xs text-white/80">
              <span>Difficulty: {meta.difficulty}</span>
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
            title="Export puzzle (givens) string"
            onClick={() => {
              try {
                const s = puzzleStringFromData(data);
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
                  try {
                    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                      await navigator.clipboard.writeText(s);
                      return true;
                    }
                  } catch {}
                  return false;
                };
                doClipboard().then((ok) => {
                  if (!ok) {
                    const ok2 = copyWithTextarea();
                    if (!ok2) prompt('Copy puzzle string:', s);
                    else {
                      const badge = document.getElementById('sudoku-copied-badge');
                      if (badge) { badge.style.display = 'inline-flex'; setTimeout(()=>{ if (badge) badge.style.display = 'none'; }, 2000); }
                    }
                  } else {
                    const badge = document.getElementById('sudoku-copied-badge');
                    if (badge) { badge.style.display = 'inline-flex'; setTimeout(()=>{ if (badge) badge.style.display = 'none'; }, 2000); }
                  }
                });
              } catch {}
            }}
          >Export</button>
          <span id="sudoku-copied-badge" style={{ display: 'none' }} className="ml-2 inline-flex items-center rounded-full border border-green-500/40 bg-green-500/20 px-2 py-1 text-xs font-medium text-green-200">
            Sudoku copied to clipboard
          </span>
          <button
            className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]"
            title="Import puzzle from 81-char string"
            onClick={() => {
              const s = prompt('Paste 81-char puzzle string (use - or . for blanks)');
              if (!s) return;
              const d = dataFromPuzzleString(s);
              if (!d) { alert('Invalid puzzle string'); return; }
              setData(d);
              const plugin = getPlugin<SudokuData, SudokuState>('sudoku')!;
              const fresh = plugin.createInitialState(d);
              setState(fresh);
              setHistory([]); setFuture([]);
              const id = computeId(d); setMeta({ id, difficulty: 'restored' });
              setTimerMs(0); setTimerRunning(true);
              try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, meta: { id, difficulty: 'restored' }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
            }}
          >Import</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={undo} disabled={history.length===0}>Undo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50" onClick={redo} disabled={future.length===0}>Redo</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={restart}>Restart</button>
          <NewGameControls onNew={(d, diff)=>{ setData(d); const plugin = getPlugin<SudokuData, SudokuState>('sudoku')!; const fresh = plugin.createInitialState(d); setState(fresh); setChecked(null); setHint(null); setConflict(false); setHistory([]); setFuture([]); const id = computeId(d); setMeta({ id, difficulty: diff }); setTimerMs(0); setTimerRunning(true); try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, meta: { id, difficulty: diff }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {} }} />
        </div>
      )}
      sidebar={undefined}
    >
      <Validated data={data} state={state} onChange={updateState} />
      {checked !== null && (
        <div className={`mt-2 text-sm ${checked ? 'text-green-400' : 'text-red-400'}`}>{checked ? 'Solved' : 'Not solved yet'}</div>
      )}
      <HintPanel hint={hint} />
      {/* live validation in worker */}
      {(() => { (async () => {
        const res = await postToWorker({ kind: 'validate', plugin: 'sudoku', data, state, move: null });
        if (res.kind === 'validate') setConflict(!(res as any).result.ok);
      })().catch(()=>{}); return null; })()}
    </PuzzleLayout>
  );
}

function NewGameControls({ onNew }: { onNew: (d: SudokuData, diff: Difficulty) => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [busy, setBusy] = useState(false);
  return (
    <div className="ml-3 inline-flex items-center gap-2">
      <select
        value={difficulty}
        onChange={(e)=> setDifficulty(e.target.value as Difficulty)}
        className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm"
        title="Difficulty"
      >
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
        <option value="expert">Expert</option>
      </select>
      <button
        className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
        onClick={async ()=>{
          try {
            setBusy(true);
            let d: SudokuData | null = null;
            try {
              d = generateSudoku(difficulty);
            } catch {
              // fallback to pre-generated from index
              const fallbackId = `sudoku-${difficulty}-1`;
              const entry = (puzzles as any).puzzles.find((p: any) => p.id === fallbackId) || (puzzles as any).puzzles.find((p: any) => p.id === 'sudoku-sample-1');
              d = entry?.data as SudokuData;
            }
            if (d) onNew(d, difficulty);
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



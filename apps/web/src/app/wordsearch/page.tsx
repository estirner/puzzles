"use client";
import { useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import wordSearchPlugin, { WSData, WSState, WordSearchComponent, generateWordSearch, WSSize } from '@repo/plugins-wordsearch';
import puzzles from '@repo/puzzles/index.json';
import { HintPanel } from '@repo/ui';

registerPlugin(wordSearchPlugin);

export default function WordSearchPage() {
  const item = (puzzles as any).puzzles.find((p: any) => p.type === 'wordsearch');
  const saveKey = 'puzzle:wordsearch:autosave';
  const [data, setData] = useState<WSData>(() => item.data as WSData);
  const [state, setState] = useState<WSState>(() => {
    const plugin = getPlugin<WSData, WSState>('wordsearch')!;
    return plugin.createInitialState(data);
  });
  const [hint, setHint] = useState<any | null>(null);
  const [timerMs, setTimerMs] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(true);
  const [hintTick, setHintTick] = useState<number>(-1);
  const Comp = useMemo(() => WordSearchComponent, []);
  const [ready, setReady] = useState<boolean>(false);

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(mm)}:${pad(ss)}`;
  }

  // Restore autosave on mount, or auto-start a 12x12 with 12 words if none
  useEffect(() => {
    (async () => {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved?.data && saved?.state) {
            setData(saved.data as WSData);
            const st = saved.state as any;
            const toArray = (v: any): any[] => {
              if (Array.isArray(v)) return v;
              if (v && typeof v === 'object' && typeof (v as any)[Symbol.iterator] === 'function') return Array.from(v as any);
              if (v && typeof v === 'object') return Object.values(v as any);
              return [];
            };
            const norm: WSState = {
              found: new Set<string>(toArray(st?.found)),
              foundCells: new Set<number>(toArray(st?.foundCells)),
              foundWords: Array.isArray(st?.foundWords) ? st.foundWords : toArray(st?.found),
            } as WSState;
            setState(norm);
            const t = saved.timer; if (t) {
              const now = Date.now(); const base = Number(t.elapsedMs)||0;
              setTimerMs(t.running && typeof t.lastUpdateTs==='number' ? base + Math.max(0, now - t.lastUpdateTs) : base);
              setTimerRunning(Boolean(t.running));
            }
            // Ensure the restored game persists immediately with same payload
            try { localStorage.setItem(saveKey, JSON.stringify({ data: saved.data as WSData, state: { found: Array.from(norm.found), foundCells: Array.from(norm.foundCells), foundWords: norm.foundWords }, timer: saved.timer || { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
            setReady(true);
            return;
          }
        }
        // No saved game: auto-start 12x12 with 12 words
        const d = await generateWordSearch('12x12', 12);
        setData(d);
        const plugin = getPlugin<WSData, WSState>('wordsearch')!;
        const fresh = plugin.createInitialState(d);
        setState(fresh);
        setTimerMs(0); setTimerRunning(true);
        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: { found: [], foundCells: [], foundWords: [] }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
        // ensure hint stays idle until user clicks
        setHintTick(-1);
        setReady(true);
      } catch {}
    })().catch(() => {});
  }, []);

  // Timer & Autosave
  useEffect(() => {
    if (!ready || !timerRunning) return;
    const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000);
    return () => clearInterval(id);
  }, [timerRunning, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      if (typeof window !== 'undefined') {
        const toSave = {
          data,
          state: {
            found: Array.from(state.found),
            foundCells: Array.from(state.foundCells),
            foundWords: Array.isArray(state.foundWords) ? state.foundWords : Array.from(state.found),
          },
          timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() }
        };
        localStorage.setItem(saveKey, JSON.stringify(toSave));
      }
    } catch {}
  }, [data, state, timerMs, timerRunning, ready]);

  // Stop timer when solved
  useEffect(() => {
    if (!ready) return;
    const plugin = getPlugin<WSData, WSState>('wordsearch');
    if (!plugin) return;
    const ok = plugin.isSolved(data, state);
    if (ok && timerRunning) setTimerRunning(false);
  }, [data, state, timerRunning, ready]);

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl md:text-5xl font-extrabold gradient-text">Word Search</h1>
          <div className="flex items-center gap-2">
            <NewWSControls
              onNew={(d) => {
                setData(d);
                const plugin = getPlugin<WSData, WSState>('wordsearch')!;
                const fresh = plugin.createInitialState(d);
                setState(fresh);
                setTimerMs(0); setTimerRunning(true);
                try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: { found: [], foundCells: [], foundWords: [] }, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
                setHint(null);
                // Do not auto-trigger hint pulse on new game
                // ensure hintTick is not incremented here
              }}
            />
            <div className="inline-flex items-center gap-2 ml-2 text-xs text-white/90">
              <span>Time: {formatTime(timerMs)}</span>
              <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>{timerRunning ? 'Pause' : 'Resume'}</button>
            </div>
            <button
              className="rounded border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-md hover:bg-white/[0.08]"
              onClick={() => {
                // trigger hint pulse in grid (component listens to hintTick)
                setHintTick((n)=> (n < 0 ? 0 : n + 1));
              }}
            >
              Get hint
            </button>
          </div>
        </div>
        <div className="mt-6">
          {ready ? (
            <Comp
              key={`${data.width}x${data.height}:${data.grid.join('|')}`}
              data={data}
              state={state}
              hintTrigger={hintTick}
              onChange={(updater: any) => {
                setState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
              }}
            />
          ) : (
            <div className="text-sm text-white/70">Loading word search…</div>
          )}
        </div>
        <HintPanel hint={hint} />
      </section>
    </main>
  );
}

function NewWSControls({ onNew }: { onNew: (d: WSData) => void }) {
  const [size, setSize] = useState<WSSize>('10x10');
  const [count, setCount] = useState<number>(12);
  const [busy, setBusy] = useState(false);
  // Dynamic max words by grid size
  const maxWords = size === '8x8' ? 10 : size === '10x10' ? 14 : 20;
  const wordChoices = [8, 10, 12, 14, 16, 20].filter((n) => n <= maxWords);
  // Clamp count when size changes
  useEffect(() => {
    if (count > maxWords) setCount(maxWords);
  }, [size]);
  return (
    <div className="inline-flex items-center gap-2">
      <select
        value={size}
        onChange={(e) => setSize(e.target.value as WSSize)}
        className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm"
        title="Size"
      >
        <option value="8x8">8×8</option>
        <option value="10x10">10×10</option>
        <option value="12x12">12×12</option>
        <option value="15x15">15×15</option>
      </select>
      <select
        value={String(count)}
        onChange={(e) => setCount(parseInt(e.target.value, 10) || 12)}
        className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm"
        title="Words"
      >
        {wordChoices.map((n) => (
          <option key={n} value={String(n)}>{n} words</option>
        ))}
      </select>
      <button
        className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09] disabled:opacity-50"
        onClick={async () => {
          try {
            setBusy(true);
            const d = await generateWordSearch(size, count);
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



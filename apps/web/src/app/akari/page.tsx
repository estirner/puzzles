"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import akariPlugin, { AkariData, AkariState, AkariComponent, generateAkari } from '@repo/plugins-akari';
import { solveAkari } from '@repo/plugins-akari';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';
import { HintPanel } from '@repo/ui';
import puzzles from '@repo/puzzles/index.json';

registerPlugin(akariPlugin);

export default function AkariPage() {
  const item = (puzzles as any).puzzles.find((p: any) => p.type === 'akari');
  const initialData = (item?.data || generateAkari('10x10')) as AkariData;
  const saveKey = 'puzzle:akari:autosave';

  // Keep SSR/CSR identical initially
  // Initialize deterministically for SSR, hydrate from storage after mount
  const [data, setData] = useState<AkariData>(initialData);
  const [state, setState] = useState<AkariState>(() => {
    const pluginLocal = getPlugin<AkariData, AkariState>('akari')!;
    return pluginLocal.createInitialState(initialData);
  });
  const [hydrated, setHydrated] = useState(false);
  const [timerMs, setTimerMs] = useState<number>(() => 0);
  const [timerRunning, setTimerRunning] = useState<boolean>(true);
  // Global cell size state shared with AkariComponent
  const [cellPx, setCellPx] = useState<number>(() => {
    try { if (typeof window !== 'undefined') { const raw = localStorage.getItem('akari:cellSizePx'); const n = raw ? parseInt(raw, 10) : NaN; if (!Number.isNaN(n) && n >= 8 && n <= 120) return n; } } catch {}
    return 24;
  });

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.data) setData(saved.data as AkariData);
        if (saved?.state) setState(saved.state as AkariState);
        const t = saved?.timer; if (t) {
          const now = Date.now();
          const base = Number(t.elapsedMs) || 0;
          setTimerMs(t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base);
          if (typeof t.running === 'boolean') setTimerRunning(Boolean(t.running));
        }
        // hydrate cell size from localStorage if present
        try { const rawCell = localStorage.getItem('akari:cellSizePx'); const n = rawCell ? parseInt(rawCell, 10) : NaN; if (!Number.isNaN(n) && n >= 16 && n <= 120) setCellPx(n); } catch {}
      } else {
        // First visit: auto-start a new 12x12 with 42px cells
        const d = generateAkari('12x12');
        const pluginLocal = getPlugin<AkariData, AkariState>('akari')!;
        const fresh = pluginLocal.createInitialState(d);
        setData(d);
        setState(fresh);
        setTimerMs(0);
        setTimerRunning(true);
        setCellPx(42);
        try {
          localStorage.setItem('akari:cellSizePx', String(42));
          localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } }));
        } catch {}
      }
    } catch {}
    finally { setHydrated(true); }
  }, []);

  // Autosave after hydration
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

  // Validation and solved status
  const plugin = getPlugin<AkariData, AkariState>('akari')!;
  const solved = plugin.isSolved(data, state);
  useEffect(() => { if (solved && timerRunning) setTimerRunning(false); }, [solved, timerRunning]);

  const updateState = useCallback((next: AkariState) => {
    setState(next);
  }, []);

  return (
    <PuzzleLayout
      title="Akari"
      toolbar={(
        <div className="flex items-center gap-3">
           <StateShare getState={() => state} />
           {/* Global cell size slider */}
           {hydrated ? <CellSizeSliderExternal value={cellPx} onChange={setCellPx} /> : null}
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {formatTime(timerMs)}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>
              <span suppressHydrationWarning>{timerRunning ? 'Pause' : 'Resume'}</span>
            </button>
          </div>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={() => {
            const fresh = plugin.createInitialState(data);
            setState(fresh); setTimerMs(0); setTimerRunning(true);
            try { localStorage.setItem(saveKey, JSON.stringify({ data, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
          }}>Restart</button>
          <button
            className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]"
            title="Reveal a random correct cell"
            onClick={() => {
              const solved = data.solution || solveAkari(data, 700);
              if (!solved) return;
              // find an unlit or incorrect cell to reveal
              const choices: Array<{ r: number; c: number }> = [];
              for (let r = 0; r < data.height; r++) for (let c = 0; c < data.width; c++) {
                if (data.grid[r][c].block) continue;
                const shouldBulb = solved[r][c] === true;
                const isBulb = state.bulbs[r][c] === true;
                if (shouldBulb !== isBulb) choices.push({ r, c });
              }
              if (choices.length === 0) return;
              const pick = choices[(Math.random() * choices.length) | 0];
              const next = state.bulbs.map((row) => row.slice());
              next[pick.r][pick.c] = solved[pick.r][pick.c];
              setState({ ...state, bulbs: next, selected: pick });
            }}
          >Reveal cell</button>
          <button
            className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-sm hover:bg-emerald-500/25"
            title="Fill the solution"
            onClick={() => {
              const solved = data.solution || solveAkari(data, 1500);
              if (!solved) return;
              setState({ ...state, bulbs: solved });
              setTimerRunning(false);
            }}
          >Show solution</button>
          <NewAkariControls onNew={(d)=>{ const fresh = plugin.createInitialState(d); setData(d); setState(fresh); setTimerMs(0); setTimerRunning(true); try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {} }} />
        </div>
      )}
      sidebar={undefined}
    >
      <div className="w-full flex justify-center">
        <div className="w-fit">
          {hydrated ? (
            <AkariComponent data={data} state={state} onChange={updateState} cellPx={cellPx} onCellPxChange={setCellPx} showLocalControls={false} />
          ) : (
            <div className="text-white/60 text-sm px-2 py-6">Loading saved game…</div>
          )}
          <div className={`mt-2 ${solved ? 'text-emerald-400' : 'text-white/70'}`}>
            {solved ? (
              <span className="inline-block rounded bg-emerald-500/15 px-3 py-1 text-base font-semibold border border-emerald-400/30">Solved! 🎉</span>
            ) : (
              <span className="text-sm">Light all cells without bulbs seeing each other</span>
            )}
          </div>
          <div className="mt-3"><HintPanel hint={null} /></div>
        </div>
      </div>
    </PuzzleLayout>
  );
}

function NewAkariControls({ onNew }: { onNew: (d: AkariData) => void }) {
  const [size, setSize] = useState<string>('15x15');
  const [blockDensity, setBlockDensity] = useState<number>(0.18);
  const [clueDensity, setClueDensity] = useState<number>(0.6);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 inline-flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">Size
        <select value={size} onChange={(e)=> setSize(e.target.value)} className="rounded border border-white/15 bg-white/[0.06] px-2 py-1">
          <option value="7x7">7×7</option>
          <option value="10x10">10×10</option>
          <option value="12x12">12×12</option>
          <option value="15x15">15×15</option>
          <option value="20x20">20×20</option>
          <option value="25x25">25×25</option>
          <option value="30x30">30×30</option>
          <option value="40x40">40×40</option>
          <option value="custom">Custom…</option>
        </select>
      </label>
      {size === 'custom' && (
        <input
          type="text"
          placeholder="e.g., 37x29"
          className="rounded border border-white/15 bg-white/[0.06] px-2 py-1"
          onChange={(e)=> setSize(e.target.value)}
        />
      )}
      <label className="flex items-center gap-2">Blocks
        <input type="range" min={0.1} max={0.28} step={0.005} value={blockDensity} onChange={(e)=> setBlockDensity(parseFloat(e.target.value))} />
        <span className="w-10 text-right tabular-nums">{(blockDensity*100).toFixed(0)}%</span>
      </label>
      <label className="flex items-center gap-2">Clues
        <input type="range" min={0.0} max={1.0} step={0.05} value={clueDensity} onChange={(e)=> setClueDensity(parseFloat(e.target.value))} />
        <span className="w-10 text-right tabular-nums">{Math.round(clueDensity*100)}%</span>
      </label>
      <button
        className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 hover:bg-white/[0.09] disabled:opacity-50"
        onClick={() => {
          try {
            setBusy(true);
            const s = size === 'custom' ? '15x15' : size;
            const d = generateAkari(s as any, { blockDensity, clueDensity });
            onNew(d);
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
      >{busy ? 'Generating…' : 'New game'}</button>
    </div>
  );
}

function CellSizeSliderExternal({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  useEffect(() => { try { if (typeof window !== 'undefined') localStorage.setItem('akari:cellSizePx', String(value)); } catch {} }, [value]);
  return (
    <div className="flex items-center gap-2 text-xs text-white/80">
      <span>Cell</span>
      <input type="range" min={16} max={96} step={1} value={value} onChange={(e)=> onChange(parseInt(e.target.value, 10))} />
      <span className="w-8 tabular-nums text-white/70" suppressHydrationWarning>{value}px</span>
    </div>
  );
}



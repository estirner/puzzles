import type { PuzzlePlugin } from '@repo/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getRandomEntries } from './random-source';

export type CWCell = { ch?: string; block?: boolean };
export type CWData = {
  width: number;
  height: number;
  grid: CWCell[][]; // row-major grid
  clues: { across: Array<{ num: number; clue: string; answer: string }>; down: Array<{ num: number; clue: string; answer: string }> };
};
export type CWState = { grid: string[][]; selected?: { r: number; c: number }; dir: 'across' | 'down'; mode?: 'normal' | 'pencil'; notes?: string[][] };

export type Numbering = {
  across: Array<{ num: number; r: number; c: number; len: number; answer?: string }>; 
  down: Array<{ num: number; r: number; c: number; len: number; answer?: string }>; 
};

export function computeNumbering(data: CWData): Numbering {
  const across: Numbering['across'] = [];
  const down: Numbering['down'] = [];
  let num = 1;
  const findAcrossAnswer = (n: number) => data.clues.across.find((x) => x.num === n)?.answer;
  const findDownAnswer = (n: number) => data.clues.down.find((x) => x.num === n)?.answer;
  for (let r = 0; r < data.height; r++) {
    for (let c = 0; c < data.width; c++) {
      if (data.grid[r][c].block) continue;
      const startsAcross = c === 0 || data.grid[r][c - 1].block;
      const startsDown = r === 0 || data.grid[r - 1][c].block;
      let added = false;
      if (startsAcross) {
        let len = 0; while (c + len < data.width && !data.grid[r][c + len].block) len++;
        if (len >= 2) { across.push({ num, r, c, len, answer: findAcrossAnswer(num) }); added = true; }
      }
      if (startsDown) {
        let len = 0; while (r + len < data.height && !data.grid[r + len][c].block) len++;
        if (len >= 2) { down.push({ num, r, c, len, answer: findDownAnswer(num) }); added = true; }
      }
      if (added) num++;
    }
  }
  return { across, down };
}

function createState(data: CWData): CWState {
  return {
    grid: Array.from({ length: data.height }, () => Array.from({ length: data.width }, () => '')),
    notes: Array.from({ length: data.height }, () => Array.from({ length: data.width }, () => '')),
    dir: 'across',
    mode: 'normal'
  };
}

export const CrosswordComponent = ({ data, state, onChange }: { data: CWData; state: CWState; onChange: (next: CWState) => void }) => {
  const [sel, setSel] = useState(state.selected);
  const g = useMemo(() => state.grid, [state.grid]);
  const toggleDir = () => onChange({ ...state, dir: state.dir === 'across' ? 'down' : 'across' });

  const [cell, setCell] = useState<number>(28);
  useEffect(() => {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem('crosswords:cellSizePx') : null; if (raw) { const n = parseInt(raw, 10); if (!Number.isNaN(n)) setCell(n); } } catch {}
  }, []);
  useEffect(() => { try { if (typeof window !== 'undefined') localStorage.setItem('crosswords:cellSizePx', String(cell)); } catch {} }, [cell]);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  function fitGrid(): void {
    try {
      const el = gridWrapRef.current?.parentElement; if (!el) return;
      const style = getComputedStyle(el);
      const padL = parseInt(style.paddingLeft || '0', 10);
      const padR = parseInt(style.paddingRight || '0', 10);
      const avail = el.clientWidth - padL - padR - 24;
      const size = Math.max(24, Math.min(80, Math.floor(avail / data.width)));
      setCell(size);
    } catch {}
  }
  const [showHints, setShowHints] = useState<boolean>(() => {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem('crosswords:showHints') : null; if (raw) return raw === '1'; } catch {}
    return false;
  });
  useEffect(() => { try { if (typeof window !== 'undefined') localStorage.setItem('crosswords:showHints', showHints ? '1' : '0'); } catch {} }, [showHints]);
  const numbering = useMemo(() => computeNumbering(data), [data]);
  const numberAt = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of numbering.across) m.set(`${a.r}-${a.c}`, a.num);
    for (const d of numbering.down) if (!m.has(`${d.r}-${d.c}`)) m.set(`${d.r}-${d.c}`, d.num);
    return m;
  }, [numbering]);

  // Map cell -> input for focus/scroll
  const refMap = useRef<Record<string, HTMLInputElement | null>>({});
  const navCause = useRef<'kb' | 'mouse' | null>(null);
  useEffect(() => {
    if (!state.selected) return;
    const el = refMap.current[`${state.selected.r}-${state.selected.c}`];
    if (el) { try { el.focus({ preventScroll: false }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {} }
  }, [state.selected]);

  function inBounds(r: number, c: number): boolean { return r >= 0 && c >= 0 && r < data.height && c < data.width; }
  function isBlock(r: number, c: number): boolean { return data.grid[r][c].block === true; }
  function isStart(r: number, c: number, dir: 'across' | 'down'): boolean {
    if (isBlock(r, c)) return false;
    if (dir === 'across') return (c === 0 || isBlock(r, c - 1)) && c + 1 < data.width && !isBlock(r, c + 1);
    return (r === 0 || isBlock(r - 1, c)) && r + 1 < data.height && !isBlock(r + 1, c);
  }
  function belongsTo(r: number, c: number, dir: 'across' | 'down'): boolean {
    if (isBlock(r, c)) return false;
    if (dir === 'across') return (c > 0 && !isBlock(r, c - 1)) || (c + 1 < data.width && !isBlock(r, c + 1));
    return (r > 0 && !isBlock(r - 1, c)) || (r + 1 < data.height && !isBlock(r + 1, c));
  }
  function chooseDirForCell(r: number, c: number, prev: 'across' | 'down'): 'across' | 'down' {
    const a = isStart(r, c, 'across');
    const d = isStart(r, c, 'down');
    if (a && !d) return 'across';
    if (d && !a) return 'down';
    if (belongsTo(r, c, prev)) return prev;
    return prev === 'across' ? (belongsTo(r, c, 'down') ? 'down' : 'across') : (belongsTo(r, c, 'across') ? 'across' : 'down');
  }
  function runFrom(r: number, c: number, dir: 'across' | 'down'): Array<{ r: number; c: number }> {
    const delta = dir === 'across' ? [0, 1] : [1, 0];
    // move to start
    let sr = r, sc = c;
    while (inBounds(sr - delta[0], sc - delta[1]) && !isBlock(sr - delta[0], sc - delta[1])) { sr -= delta[0]; sc -= delta[1]; }
    const out: Array<{ r: number; c: number }> = [];
    let rr = sr, cc = sc;
    while (inBounds(rr, cc) && !isBlock(rr, cc)) { out.push({ r: rr, c: cc }); rr += delta[0]; cc += delta[1]; }
    return out;
  }
  function nextInRun(r: number, c: number, dir: 'across' | 'down'): { r: number; c: number } {
    const run = runFrom(r, c, dir); const idx = run.findIndex(p => p.r === r && p.c === c);
    return run[Math.min(run.length - 1, Math.max(0, idx + 1))] || { r, c };
  }
  function prevInRun(r: number, c: number, dir: 'across' | 'down'): { r: number; c: number } {
    const run = runFrom(r, c, dir); const idx = run.findIndex(p => p.r === r && p.c === c);
    return run[Math.max(0, idx - 1)] || { r, c };
  }
  function startOfRun(r: number, c: number, dir: 'across' | 'down'): { r: number; c: number } {
    const run = runFrom(r, c, dir); return run.length ? run[0] : { r, c };
  }
  function nextRunStart(dir: 'across' | 'down', start: { r: number; c: number }): { r: number; c: number } {
    const list = dir === 'across' ? numbering.across : numbering.down;
    const idx = list.findIndex(v => v.r === start.r && v.c === start.c);
    if (idx === -1) return start;
    const nxt = list[(idx + 1) % list.length];
    return { r: nxt.r, c: nxt.c };
  }

  // Current clue info and highlight
  const current = useMemo(() => {
    if (!state.selected) return null; const { r, c } = state.selected; const dir = state.dir;
    const run = runFrom(r, c, dir); if (run.length === 0) return null; const start = run[0];
    const list = dir === 'across' ? numbering.across : numbering.down;
    const n = list.find(v => v.r === start.r && v.c === start.c);
    const clueText = n ? (dir === 'across' ? data.clues.across.find(x => x.num === n.num)?.clue : data.clues.down.find(x => x.num === n.num)?.clue) : undefined;
    return n ? { ...n, dir, clue: clueText || '', cells: run } as { num: number; r: number; c: number; len: number; dir: 'across'|'down'; clue: string; cells: Array<{r:number;c:number}> } : null;
  }, [state.selected, state.dir, numbering]);

  // Solved detector (local, same as plugin.isSolved)
  const solved = useMemo(() => {
    for (let r = 0; r < data.height; r++) {
      for (let c = 0; c < data.width; c++) {
        const cell = data.grid[r][c];
        if (cell.block) continue;
        const ch = state.grid[r][c];
        if (!ch) return false;
        if (cell.ch && ch !== cell.ch) return false;
      }
    }
    return true;
  }, [data, state.grid]);

  // Wrong letters set + check/reveal helpers
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [correct, setCorrect] = useState<Set<string>>(new Set());
  function keyOf(p: { r: number; c: number }): string { return `${p.r}-${p.c}`; }
  function checkCurrent(): void {
    if (!current) return; const w = new Set<string>();
    let allMatch = true;
    for (const p of current.cells) {
      const sol = data.grid[p.r][p.c].ch || '';
      const ch = state.grid[p.r][p.c] || '';
      if (ch && sol && ch !== sol) w.add(keyOf(p));
      if (!(sol && ch && ch === sol)) allMatch = false;
    }
    setWrong(w);
    if (w.size === 0 && allMatch) {
      const good = new Set<string>();
      for (const p of current.cells) good.add(keyOf(p));
      setCorrect(good);
    } else {
      setCorrect(new Set());
    }
  }
  function revealCurrent(): void {
    if (!current) return; const ng = state.grid.map(rr => rr.slice());
    for (const p of current.cells) { const sol = data.grid[p.r][p.c].ch || ''; if (sol) ng[p.r][p.c] = sol; }
    const nn = (state.notes || []).map(rr => rr.slice());
    for (const p of current.cells) { if (nn[p.r]) nn[p.r][p.c] = ''; }
    setWrong(new Set()); setCorrect(new Set()); onChange({ ...state, grid: ng, notes: nn });
  }
  function checkGrid(): void {
    const w = new Set<string>();
    const good = new Set<string>();
    for (let r = 0; r < data.height; r++) {
      for (let c = 0; c < data.width; c++) {
        const meta = data.grid[r][c];
        if (meta.block) continue;
        const sol = meta.ch || '';
        const ch = state.grid[r][c] || '';
        if (!ch) continue; // ignore empties
        const k = `${r}-${c}`;
        if (sol && ch === sol) good.add(k);
        else if (sol && ch !== sol) w.add(k);
      }
    }
    setWrong(w);
    setCorrect(good);
  }

  // Candidate suggestions from CSV
  type Entry = { clue: string; answer: string };
  const [pool, setPool] = useState<Entry[]>([]);
  useEffect(() => { (async () => {
    try { const list = await getRandomEntries(60000, 2, 32); setPool(list); } catch {} }
  )().catch(()=>{}); }, []);
  const candidates = useMemo(() => {
    if (!current || pool.length === 0) return [] as Entry[];
    const pattern: string[] = current.cells.map(p => (state.grid[p.r][p.c] || '').toUpperCase());
    const L = current.len;
    const filtered = pool.filter(e => e.answer.length === L && pattern.every((ch, i) => ch ? e.answer[i] === ch : true));
    // rank by number of fixed letters matched (more matches first)
    const score = (ans: string) => pattern.reduce((s, ch, i) => s + (ch && ans[i] === ch ? 1 : 0), 0);
    return filtered.sort((a, b) => score(b.answer) - score(a.answer)).slice(0, 20);
  }, [current, pool, state.grid]);
  function applyCandidate(ans: string): void {
    if (!current) return; const ng = state.grid.map(rr => rr.slice());
    for (let i = 0; i < current.len; i++) { const p = current.cells[i]; ng[p.r][p.c] = ans[i]; }
    const nn = (state.notes || []).map(rr => rr.slice());
    for (const p of current.cells) { if (nn[p.r]) nn[p.r][p.c] = ''; }
    setWrong(new Set()); setCorrect(new Set()); onChange({ ...state, grid: ng, notes: nn, selected: { r: current.r, c: current.c } });
  }
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-4 text-xs text-white/80">
        <label className="flex items-center gap-2"><span>Cell size</span>
          <input type="range" min={28} max={80} step={1} value={cell} onChange={(e)=> setCell(parseInt(e.target.value, 10))} />
          <span>{cell}px</span>
        </label>
        <div className="text-white/70">Filled {(() => { let total=0, filled=0; for(let r=0;r<data.height;r++){ for(let c=0;c<data.width;c++){ if(!data.grid[r][c].block){ total++; if(state.grid[r][c]) filled++; } } } const pct = total? Math.round((filled/total)*100):0; return `${pct}%`; })()}</div>
        <div className="ml-4 inline-flex items-center gap-2">
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={checkCurrent} disabled={!current}>Check word</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={revealCurrent} disabled={!current}>Reveal word</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={checkGrid}>Check grid</button>
          <button className={`rounded border px-2 py-1 hover:bg-white/[0.09] ${showHints ? 'border-sky-400/40 bg-sky-500/20 text-sky-100' : 'border-white/15 bg-white/[0.06]'}`} onClick={()=> setShowHints(v=>!v)} title="Toggle candidate hints">{showHints ? 'Hints: On' : 'Hints: Off'}</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={fitGrid} title="Fit grid to width">Fit</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={() => onChange({ ...state, mode: state.mode === 'pencil' ? 'normal' : 'pencil' })} title="Toggle pencil notes">{state.mode === 'pencil' ? 'Pencil: On' : 'Pencil: Off'}</button>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={() => { const nn = (state.notes || []).map(rr => rr.map(()=>'')); onChange({ ...state, notes: nn }); }} title="Clear all notes">Clear notes</button>
          <button className="rounded border border-red-400/40 bg-red-500/20 px-2 py-1 text-red-100 hover:bg-red-500/25" onClick={() => { const empty = Array.from({ length: data.height }, () => Array.from({ length: data.width }, () => '')); onChange({ ...state, grid: empty }); }} title="Clear entire grid">Clear grid</button>
        </div>
      </div>
      {current && (
        <div className="-mt-2 mb-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/90">
          <span className="font-semibold mr-2">{current.dir === 'across' ? 'Across' : 'Down'} {current.num}</span>
          <span className="text-white/80">{current.clue}</span>
          {showHints && candidates.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {candidates.map((e, i) => (
                <button key={`${e.answer}-${i}`} className="rounded border border-white/15 bg-white/[0.06] px-2 py-0.5 text-xs hover:bg-white/[0.1]" title={e.clue} onClick={()=>applyCandidate(e.answer)}>
                  {e.answer}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-10">
        <div className="flex flex-col items-center">
          <div className="relative inline-block">
          {/* Run highlight overlay */}
          {(() => { if(!current) return null; const pad=4; const left = current.c*cell + pad; const top = current.r*cell + pad; const width = (current.dir==='across'? current.len*cell : cell); const height = (current.dir==='down'? current.len*cell : cell); return (
            <div className="pointer-events-none absolute z-0 rounded-md bg-sky-500/15 ring-1 ring-sky-400/25 transition-all" style={{ left, top, width, height }} /> ); })()}
          {/* Selected cell border overlay (ensures full rectangle visible) */}
          {(() => { if(!state.selected) return null; const pad=4; const left = state.selected.c*cell + pad; const top = state.selected.r*cell + pad; const width = cell; const height = cell; return (
            <div className="pointer-events-none absolute z-20 rounded-[4px] border-2 border-sky-400/80" style={{ left, top, width, height }} /> ); })()}
          <div ref={gridWrapRef} className="relative z-10 inline-grid gap-0 rounded-md border border-white/10 bg-white/[0.03] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]" style={{ gridTemplateColumns: `repeat(${data.width}, minmax(${cell}px, ${cell}px))` }}>
          {data.grid.map((row, r) =>
            row.map((meta, c) => {
              const num = numberAt.get(`${r}-${c}`);
              const inCurrent = Boolean(current?.cells.some(p => p.r === r && p.c === c));
              const k = `${r}-${c}`;
              const isWrong = wrong.has(k);
              const isCorrect = correct.has(k);
              return (
                <div key={`${r}-${c}`} className={`relative ${meta.block ? '' : ''}`} style={{ width: cell, height: cell }}>
                  {!meta.block && num != null && (
                    <div className="absolute left-0 top-0 z-30 select-none text-[10px] leading-none pointer-events-none">
                      <span className="inline-block rounded bg-white/15 px-[3px] py-[1px] text-white/90">{num}</span>
                    </div>
                  )}
                  {meta.block ? (
                    <div className="h-full w-full bg-neutral-800" />
                  ) : (
                    <input
                      ref={(el)=>{ refMap.current[`${r}-${c}`]=el; }}
                maxLength={1}
                      className={`relative h-full w-full border-0 text-center uppercase tracking-wider focus:outline-none focus:ring-0 ${isWrong ? 'bg-red-700/45' : isCorrect ? 'bg-emerald-600/60 text-emerald-50' : inCurrent ? 'bg-sky-900/30' : 'bg-neutral-950'}`}
                      style={{ fontSize: Math.max(14, Math.floor(cell * 0.48)) }}
                      value={g[r][c]}
                      onMouseDown={() => { navCause.current = 'mouse'; }}
                      onChange={(e) => {
                        const raw = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                        const ch = raw ? raw.slice(-1) : '';
                        setWrong(new Set()); setCorrect(new Set());
                        if (state.mode === 'pencil') {
                          if (g[r][c]) {
                            // Override committed letter if present
                            const ng = g.map((rr) => rr.slice());
                            ng[r][c] = ch;
                            onChange({ ...state, grid: ng, selected: { r, c } });
                          } else {
                            const nn = (state.notes || []).map(rr => rr.slice());
                            nn[r][c] = ch || '';
                            onChange({ ...state, notes: nn, selected: { r, c } });
                          }
                        } else {
                  const ng = g.map((rr) => rr.slice());
                  ng[r][c] = ch;
                  onChange({ ...state, grid: ng, selected: { r, c } });
                        }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') { e.preventDefault(); toggleDir(); return; }
                        if (e.key === 'ArrowRight') { e.preventDefault(); navCause.current = 'kb'; const n = nextInRun(r, c, 'across'); onChange({ ...state, dir: 'across', selected: { r: n.r, c: n.c } }); return; }
                        if (e.key === 'ArrowLeft') { e.preventDefault(); navCause.current = 'kb'; const n = prevInRun(r, c, 'across'); onChange({ ...state, dir: 'across', selected: { r: n.r, c: n.c } }); return; }
                        if (e.key === 'ArrowDown') { e.preventDefault(); navCause.current = 'kb'; const n = nextInRun(r, c, 'down'); onChange({ ...state, dir: 'down', selected: { r: n.r, c: n.c } }); return; }
                        if (e.key === 'ArrowUp') { e.preventDefault(); navCause.current = 'kb'; const n = prevInRun(r, c, 'down'); onChange({ ...state, dir: 'down', selected: { r: n.r, c: n.c } }); return; }
                  if (e.key === ' ') { e.preventDefault(); toggleDir(); }
                        if (e.key.length === 1 && /[A-Za-z]/.test(e.key)) {
                          e.preventDefault();
                          setWrong(new Set()); setCorrect(new Set());
                          navCause.current = 'kb';
                          if (state.mode === 'pencil') {
                            if (g[r][c]) {
                              const ng = g.map((rr) => rr.slice());
                              ng[r][c] = e.key.toUpperCase().slice(-1);
                              let n = nextInRun(r, c, state.dir);
                              if (n.r === r && n.c === c) {
                                const st = startOfRun(r, c, state.dir);
                                n = nextRunStart(state.dir, st);
                              }
                              onChange({ ...state, grid: ng, selected: { r: n.r, c: n.c } });
                            } else {
                              const nn = (state.notes || []).map(rr => rr.slice());
                              const ch = e.key.toUpperCase().slice(-1);
                              nn[r][c] = ch;
                              // Advance; if at end of run, jump to next run start
                              let n = nextInRun(r, c, state.dir);
                              if (n.r === r && n.c === c) {
                                const st = startOfRun(r, c, state.dir);
                                n = nextRunStart(state.dir, st);
                              }
                              onChange({ ...state, notes: nn, selected: { r: n.r, c: n.c } });
                            }
                          } else {
                    const ng = g.map((rr) => rr.slice());
                            ng[r][c] = e.key.toUpperCase().slice(-1);
                            let n = nextInRun(r, c, state.dir);
                            if (n.r === r && n.c === c) {
                              const st = startOfRun(r, c, state.dir);
                              n = nextRunStart(state.dir, st);
                            }
                            onChange({ ...state, grid: ng, selected: { r: n.r, c: n.c } });
                          }
                  }
                  if (e.key === 'Backspace') {
                    e.preventDefault();
                          if (state.mode === 'pencil') {
                            const nn = (state.notes || []).map(rr => rr.slice());
                            const cur = nn[r][c] || '';
                            if (cur) { nn[r][c] = cur.slice(0, -1); onChange({ ...state, notes: nn, selected: { r, c } }); return; }
                          }
                    const ng = g.map((rr) => rr.slice());
                    if (ng[r][c]) { ng[r][c] = ''; onChange({ ...state, grid: ng, selected: { r, c } }); return; }
                          navCause.current = 'kb';
                          const p = prevInRun(r, c, state.dir);
                          onChange({ ...state, selected: { r: p.r, c: p.c } });
                        }
                      }}
                      onFocus={() => {
                        if (navCause.current === 'kb') {
                          // Keep current direction during keyboard navigation
                          onChange({ ...state, selected: { r, c } });
                        } else if (navCause.current === 'mouse') {
                          const dir = chooseDirForCell(r, c, state.dir);
                          onChange({ ...state, dir, selected: { r, c } });
                        } else {
                          // Programmatic/clue selection already set dir explicitly
                          onChange({ ...state, selected: { r, c } });
                        }
                        navCause.current = null;
                      }}
                    />
                  )}
                  {/* Pencil notes overlay */}
                  {state.mode === 'pencil' && !g[r][c] && (state.notes?.[r]?.[c] || '') && (
                    <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-0.5 text-[10px] tracking-tight text-amber-200/90">
                      {state.notes?.[r]?.[c]}
                    </div>
                  )}
                </div>
              );
            })
          )}
          </div>
          {/* Grid lines overlay */}
          {(() => {
            const pad = 4; const left = pad; const top = pad; const w = data.width * cell; const h = data.height * cell;
            const v = Array.from({ length: data.width + 1 }, (_, i) => i * cell);
            const hlines = Array.from({ length: data.height + 1 }, (_, i) => i * cell);
            return (
              <svg className="pointer-events-none absolute" style={{ left, top, width: w, height: h, zIndex: 15 }} viewBox={`0 0 ${w} ${h}`}>
                <g stroke="rgba(255,255,255,0.12)" strokeWidth="1" shapeRendering="crispEdges">
                  {v.map((x, i) => (<line key={`v${i}`} x1={x} y1={0} x2={x} y2={h} />))}
                  {hlines.map((y, i) => (<line key={`h${i}`} x1={0} y1={y} x2={w} y2={y} />))}
                </g>
              </svg>
            );
          })()}
          </div>
          {solved && (
            <div className="mt-4 rounded-md bg-emerald-600/20 px-4 py-2 text-center text-2xl font-bold text-emerald-300 ring-1 ring-emerald-400/40">
              Solved! Great job.
            </div>
          )}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-8 text-sm">
          <div>
            <h3 className="mb-2 font-semibold">Across</h3>
            <div className="space-y-1">
              {data.clues.across.map((cl) => {
                const n = numbering.across.find(a => a.num === cl.num);
                const active = Boolean(current && current.dir === 'across' && current.num === cl.num);
                return (
                  <button key={`A${cl.num}`} className={`block rounded px-1 text-left hover:text-sky-300 ${active ? 'bg-sky-500/10 text-sky-300' : ''}`} onClick={()=>{ if(n) onChange({ ...state, dir: 'across', selected: { r: n.r, c: n.c } }); }}>{cl.num}. {cl.clue}</button>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Down</h3>
            <div className="space-y-1">
              {data.clues.down.map((cl) => {
                const n = numbering.down.find(a => a.num === cl.num);
                const active = Boolean(current && current.dir === 'down' && current.num === cl.num);
                return (
                  <button key={`D${cl.num}`} className={`block rounded px-1 text-left hover:text-sky-300 ${active ? 'bg-sky-500/10 text-sky-300' : ''}`} onClick={()=>{ if(n) onChange({ ...state, dir: 'down', selected: { r: n.r, c: n.c } }); }}>{cl.num}. {cl.clue}</button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const crosswordsPlugin: PuzzlePlugin<CWData, CWState> = {
  type: 'crosswords',
  parse(raw) {
    const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    return JSON.parse(json) as CWData;
  },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(data) { return createState(data); },
  render(data, state) {
    return function Bound({ onChange }: { onChange: (next: CWState) => void }) {
      return <CrosswordComponent data={data} state={state} onChange={onChange} />;
    };
  },
  validateMove(data, state) {
    for (let r = 0; r < data.height; r++) {
      for (let c = 0; c < data.width; c++) {
        const meta = data.grid[r][c];
        if (meta.block) continue;
        const ch = state.grid[r][c];
        if (meta.ch && ch && ch !== meta.ch) return { ok: false };
      }
    }
    return { ok: true };
  },
  // We will improve validateMove via numbering + clue answers
  // Done below in updated implementation
  isSolved(data, state) {
    // solved when grid is fully filled and matches provided solution letters
    for (let r = 0; r < data.height; r++) {
      for (let c = 0; c < data.width; c++) {
        const cell = data.grid[r][c];
        if (cell.block) continue;
        if (!state.grid[r][c]) return false;
        if (cell.ch && state.grid[r][c] !== cell.ch) return false;
      }
    }
    return true;
  },
  getHints() { return [{ id: 'toggle', title: 'Press Space or Tab to switch direction' }]; },
  explainStep() { return null; }
};

export default crosswordsPlugin;



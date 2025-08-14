"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractiveCard } from '@repo/ui';

export type KenKenOp = 'add' | 'sub' | 'mul' | 'div' | 'noop';

export type KenKenData = {
  size: number; // n x n
  cages: Array<{ cells: Array<{ r: number; c: number }>; op: KenKenOp; target: number }>;
  // Optional solution for reveal/validation
  solution?: number[][];
};

export type KenKenState = {
  grid: number[][]; // 0 means empty
  notes: number[][][]; // candidates per cell
  selected?: { r: number; c: number } | null;
};

function createEmptyGrid(n: number): number[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
}

function emptyNotes(n: number): number[][][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));
}

function rowHas(grid: number[][], r: number, v: number): boolean { return grid[r].includes(v); }
function colHas(grid: number[][], c: number, v: number): boolean { return grid.some((row) => row[c] === v); }

function validateLatin(grid: number[][]): boolean {
  const n = grid.length;
  for (let r = 0; r < n; r++) {
    const vals = grid[r].filter((x) => x !== 0);
    if (new Set(vals).size !== vals.length) return false;
  }
  for (let c = 0; c < n; c++) {
    const vals: number[] = [];
    for (let r = 0; r < n; r++) if (grid[r][c] !== 0) vals.push(grid[r][c]);
    if (new Set(vals).size !== vals.length) return false;
  }
  return true;
}

function applyOp(op: KenKenOp, values: number[]): number {
  switch (op) {
    case 'add': return values.reduce((a, b) => a + b, 0);
    case 'mul': return values.reduce((a, b) => a * b, 1);
    case 'sub': {
      if (values.length !== 2) return NaN; const [a, b] = values; return Math.abs(a - b);
    }
    case 'div': {
      if (values.length !== 2) return NaN; const [a, b] = values; const hi = Math.max(a, b); const lo = Math.min(a, b); return hi % lo === 0 ? hi / lo : NaN;
    }
    default: return NaN;
  }
}

function validateCages(data: KenKenData, grid: number[][], allowPartial = true): boolean {
  for (const cg of data.cages) {
    const vals = cg.cells.map(({ r, c }) => grid[r][c]).filter((v) => v > 0);
    if (vals.length === 0) continue;
    if (vals.length < cg.cells.length) {
      if (!allowPartial) return false;
      // partial feasibility: conservative min/max bounds (duplicates allowed in cage)
      if (cg.op === 'add') {
        const sum = vals.reduce((a,b)=>a+b,0);
        const rem = cg.cells.length - vals.length;
        const minPossible = sum + rem * 1;
        const maxPossible = sum + rem * data.size;
        if (cg.target < minPossible || cg.target > maxPossible) return false;
      }
      if (cg.op === 'mul') {
        const prod = vals.reduce((a,b)=>a*b,1);
        const rem = cg.cells.length - vals.length;
        const minPossible = prod * 1; // each at least 1
        let maxPossible = prod;
        for (let i = 0; i < rem; i++) maxPossible *= data.size;
        if (cg.target < minPossible || cg.target > maxPossible) return false;
      }
      // sub/div with missing cells: skip pruning here
    } else {
      const res = applyOp(cg.op, vals);
      if (Number.isNaN(res) || res !== cg.target) return false;
    }
  }
  return true;
}

export const KenKenComponent = ({ data, state, onChange }: { data: KenKenData; state: KenKenState; onChange: (next: KenKenState) => void }) => {
  const n = data.size;
  const [selected, setSelected] = useState(state.selected ?? null);
  const grid = useMemo(() => state.grid, [state.grid]);
  const [notesMode, setNotesMode] = useState(false);
  const [stickyDigits, setStickyDigits] = useState(true);
  const [activeDigit, setActiveDigit] = useState<number | null>(null);
  const [ariaMsg, setAriaMsg] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const cageMap = useMemo(() => {
    const map = new Map<string, { op: KenKenOp; target: number; cells: Array<{ r: number; c: number }> }>();
    for (const cg of data.cages) for (const cell of cg.cells) map.set(`${cell.r},${cell.c}`, { op: cg.op, target: cg.target, cells: cg.cells });
    return map;
  }, [data.cages]);

  function candidatesFor(r: number, c: number): number[] {
    if (grid[r][c] !== 0) return [];
    const allowed: number[] = [];
    for (let v = 1; v <= n; v++) {
      if (rowHas(grid, r, v) || colHas(grid, c, v)) continue;
      const cg = cageMap.get(`${r},${c}`);
      if (!cg) { allowed.push(v); continue; }
      const vals = cg.cells.map(({ r: rr, c: cc }) => ((rr === r && cc === c) ? v : grid[rr][cc])).filter((x) => x > 0);
      // simulate placement
      const tmp = grid.map((row) => row.slice()); tmp[r][c] = v;
      if (!validateCages(data, tmp, true)) continue;
      allowed.push(v);
    }
    return allowed;
  }

  const isSameCage = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    const a = cageMap.get(`${r1},${c1}`); const b = cageMap.get(`${r2},${c2}`);
    return a && b && a.cells === b.cells;
  }, [cageMap]);

  function placeNumber(val: number, r: number, c: number) {
    const next = grid.map((row) => row.slice());
    next[r][c] = val;
    const nextNotes = state.notes.map((row) => row.map((arr) => arr.slice()));
    if (val !== 0) {
      for (let i = 0; i < data.size; i++) {
        nextNotes[r][i] = nextNotes[r][i].filter((x) => x !== val);
        nextNotes[i][c] = nextNotes[i][c].filter((x) => x !== val);
      }
    }
    onChange({ ...state, grid: next, notes: nextNotes, selected: { r, c } });
    setSelected({ r, c });
    setAriaMsg(val === 0 ? `Cleared R${r+1}C${c+1}` : `Placed ${val} at R${r+1}C${c+1}`);
  }

  // keyboard navigation
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const sel = selected || { r: 0, c: 0 };
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected({ r: Math.max(0, sel.r - 1), c: sel.c }); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected({ r: Math.min(n - 1, sel.r + 1), c: sel.c }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSelected({ r: sel.r, c: Math.max(0, sel.c - 1) }); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setSelected({ r: sel.r, c: Math.min(n - 1, sel.c + 1) }); }
    const digit = parseInt(e.key, 10);
    if (!Number.isNaN(digit) && digit >= 0 && digit <= n) {
      e.preventDefault();
      if (!selected) return;
      if (notesMode && digit !== 0) {
        const nn = state.notes.map((row) => row.map((arr) => arr.slice()));
        const cellNotes = new Set(nn[selected.r][selected.c]);
        if (cellNotes.has(digit)) cellNotes.delete(digit); else cellNotes.add(digit);
        nn[selected.r][selected.c] = Array.from(cellNotes).sort((a, b) => a - b);
        onChange({ ...state, notes: nn, selected });
      } else {
        placeNumber(digit, selected.r, selected.c);
      }
    }
  }, [selected, n, notesMode, state, onChange]);

  return (
    <div className="p-4">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-6 md:grid-cols-[8rem_minmax(0,48rem)_16rem]">
        <div className="order-2 md:order-1 grid grid-cols-1 gap-2 self-center">
          <InteractiveCard className={`${notesMode?'ring-1 ring-sky-500':''}`} onClick={()=>setNotesMode(v=>!v)}>
            <span className="block text-center">Notes</span>
          </InteractiveCard>
          <InteractiveCard className={`${stickyDigits?'ring-1 ring-sky-500':''}`} onClick={()=>setStickyDigits(v=>!v)}>
            <span className="block text-center">Sticky digits</span>
          </InteractiveCard>
          <InteractiveCard onClick={()=>{ if (!selected) return; placeNumber(0, selected.r, selected.c); }}>
            <span className="block text-center">Clear</span>
          </InteractiveCard>
        </div>
        <div className="order-1 md:order-2 flex justify-center">
          <div
            className="relative grid rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm select-none"
            style={{ gridTemplateColumns: `repeat(${n}, 56px)`, gap: '4px' }}
            role="grid"
            aria-label="KenKen grid"
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const isSelected = selected && selected.r === r && selected.c === c;
                const inSameUnit = selected && (selected.r === r || selected.c === c);
                const sameValueSelected = selected && grid[selected.r][selected.c] !== 0 && grid[selected.r][selected.c] === cell;
                const cg = cageMap.get(`${r},${c}`);
                const cageTopLeft = cg ? (!cg.cells.some((x)=> x.r === r && x.c === c - 1) && !cg.cells.some((x)=> x.r === r - 1 && x.c === c)) : false;
                return (
                  <button
                    key={`${r}-${c}`}
                    className={`relative h-14 w-14 rounded-md border text-center text-xl font-semibold transition-colors bg-neutral-900/70 text-neutral-100 border-neutral-800 ${inSameUnit ? 'bg-white/[0.06]' : ''} ${sameValueSelected ? 'bg-cyan-600/40 text-cyan-100 ring-2 ring-cyan-400' : ''} ${isSelected ? 'ring-2 ring-sky-400' : ''}`}
                    role="gridcell"
                    aria-selected={isSelected ?? undefined}
                    onMouseDown={() => { setSelected({ r, c }); }}
                    onClick={() => { setSelected({ r, c }); if (activeDigit && !notesMode) placeNumber(activeDigit, r, c); if (activeDigit && notesMode) { const nn = state.notes.map((row) => row.map((arr) => arr.slice())); const cellNotes = new Set(nn[r][c]); if (cellNotes.has(activeDigit)) cellNotes.delete(activeDigit); else cellNotes.add(activeDigit); nn[r][c] = Array.from(cellNotes).sort((a,b)=>a-b); onChange({ ...state, notes: nn, selected: { r, c } }); } }}
                  >
                    {/* Cage header */}
                    {cageTopLeft && (
                      <div className="absolute left-1 top-1 text-[10px] text-white/80 pointer-events-none" style={{ zIndex: 30 }}>
                        {cg?.target}{cg?.op==='add'?'+':cg?.op==='sub'?'−':cg?.op==='mul'?'×':cg?.op==='div'?'÷':''}
                      </div>
                    )}
                    {cell !== 0 && (
                      <span className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 20 }}>{cell}</span>
                    )}
                    {cell === 0 && state.notes[r][c].length > 0 && (
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${Math.min(3, n)}, 1fr)` }}>
                        {Array.from({ length: n }, (_, i) => i + 1).map((v) => (
                          <div key={v} className="flex items-center justify-center text-[10px] leading-3 text-neutral-300">
                            {state.notes[r][c].includes(v) ? v : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="order-3 md:order-3 grid grid-cols-3 gap-3 content-center self-center">
          {Array.from({ length: data.size }, (_, i) => i + 1).map((n) => (
            <InteractiveCard
              key={n}
              className={`h-14 text-center flex items-center justify-center p-0 ${(stickyDigits && activeDigit===n)?'ring-2 ring-sky-500':''}`}
              onClick={() => {
                if (stickyDigits) {
                  setActiveDigit((d) => d === n ? null : n);
                  if (!selected) return;
                  if (notesMode) {
                    const nn = state.notes.map((row) => row.map((arr) => arr.slice()));
                    const cellNotes = new Set(nn[selected.r][selected.c]);
                    if (cellNotes.has(n)) cellNotes.delete(n); else cellNotes.add(n);
                    nn[selected.r][selected.c] = Array.from(cellNotes).sort((a, b) => a - b);
                    onChange({ ...state, notes: nn, selected });
                  } else {
                    placeNumber(n, selected.r, selected.c);
                  }
                } else {
                  if (selected) {
                    if (notesMode) {
                      const nn = state.notes.map((row) => row.map((arr) => arr.slice()));
                      const cellNotes = new Set(nn[selected.r][selected.c]);
                      if (cellNotes.has(n)) cellNotes.delete(n); else cellNotes.add(n);
                      nn[selected.r][selected.c] = Array.from(cellNotes).sort((a, b) => a - b);
                      onChange({ ...state, notes: nn, selected });
                    } else {
                      placeNumber(n, selected.r, selected.c);
                    }
                  }
                  setActiveDigit(null);
                }
              }}
            >
              <span className="block text-2xl font-semibold leading-none text-white/90">{n}</span>
            </InteractiveCard>
          ))}
        </div>
      </div>
      <div aria-live="polite" className="sr-only" role="status">{ariaMsg}</div>
    </div>
  );
};

export const kenkenPlugin: PuzzlePlugin<KenKenData, KenKenState> = {
  type: 'kenken',
  parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as KenKenData; },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(data) { return { grid: createEmptyGrid(data.size), notes: emptyNotes(data.size), selected: null }; },
  render(data, state) { return function Bound({ onChange }: { onChange: (next: KenKenState) => void }) { return <KenKenComponent data={data} state={state} onChange={onChange} />; }; },
  validateMove(data, state) {
    const g = state.grid;
    if (!validateLatin(g)) return { ok: false };
    if (!validateCages(data, g, true)) return { ok: false };
    return { ok: true };
  },
  isSolved(data, state) {
    const n = data.size;
    if (!state.grid.every((row) => row.every((v) => v >= 1 && v <= n))) return false;
    if (!validateLatin(state.grid)) return false;
    if (!validateCages(data, state.grid, false)) return false;
    return true;
  },
  getHints(data, state) {
    // Simple hints: naked singles by Latin constraints, or cage completion
    const n = data.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (state.grid[r][c] !== 0) continue;
      const cand = [] as number[];
      for (let v = 1; v <= n; v++) { if (!rowHas(state.grid, r, v) && !colHas(state.grid, c, v)) cand.push(v); }
      if (cand.length === 1) return [{ id: `ns-${r}-${c}`, title: `Only ${cand[0]} fits at R${r+1}C${c+1}` }];
    }
    for (const cg of data.cages) {
      const emptyCells = cg.cells.filter(({ r, c }) => state.grid[r][c] === 0);
      if (emptyCells.length === 1) {
        const filled = cg.cells.filter(({ r, c }) => state.grid[r][c] !== 0).map(({ r, c }) => state.grid[r][c]);
        const need = cg.target - (cg.op === 'add' ? filled.reduce((a,b)=>a+b,0) : 0);
        if (cg.op === 'add') {
          return [{ id: `cage-${emptyCells[0].r}-${emptyCells[0].c}`, title: `Cage sum ${cg.target}`, body: `Complete the sum to ${cg.target}` }];
        }
      }
    }
    return [{ id: 'scan', title: 'Scan rows/columns for uniques', body: 'Use row/col uniqueness and cage math to prune candidates.' }];
  },
  explainStep(data, state) {
    const h = (this as any).getHints(data, state) as any[];
    if (!h || h.length === 0) return { step: 'No step', details: 'No obvious techniques available.' };
    const best = h[0];
    return { step: best.title, details: best.body };
  }
};

export default kenkenPlugin;



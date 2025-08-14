"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { InteractiveCard } from '@repo/ui';

export type SkyscrapersData = {
  size: number; // n x n
  // Edge clues. 0 means no clue. Arrays of length size.
  top: number[];
  bottom: number[];
  left: number[];
  right: number[];
  // Optional variant/mode controls
  mode?: { visibility?: 'count' | 'sum'; diagonals?: boolean };
  // Optional full solution for reveal/check
  solution?: number[][];
};

export type SkyscrapersState = {
  grid: number[][]; // 0 empty, 1..n values
  notes: number[][][]; // candidates per cell
  selected?: { r: number; c: number } | null;
};

function createEmptyGrid(n: number): number[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
}

function emptyNotes(n: number): number[][][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));
}

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

function visibleCount(line: number[]): number {
  let maxSeen = 0;
  let count = 0;
  for (const h of line) {
    if (h === 0) return -1; // incomplete
    if (h > maxSeen) { maxSeen = h; count++; }
  }
  return count;
}

function visibleSum(line: number[]): number {
  let maxSeen = 0;
  let sum = 0;
  for (const h of line) {
    if (h === 0) return -1;
    if (h > maxSeen) { maxSeen = h; sum += h; }
  }
  return sum;
}

function checkEdgeClue(line: number[], clue: number, mode: 'count' | 'sum'): boolean {
  if (!clue || clue <= 0) return true;
  const v = mode === 'sum' ? visibleSum(line) : visibleCount(line);
  if (v < 0) return true; // allow incomplete lines during play
  return v === clue;
}

function getRow(grid: number[][], r: number): number[] { return grid[r]; }
function getCol(grid: number[][], c: number): number[] { return grid.map((row) => row[c]); }

function reversed<T>(arr: T[]): T[] { return [...arr].reverse(); }

function validateEdges(data: SkyscrapersData, grid: number[][], allowPartial = true): boolean {
  const n = data.size;
  const visibilityMode: 'count' | 'sum' = data.mode?.visibility === 'sum' ? 'sum' : 'count';
  for (let i = 0; i < n; i++) {
    const row = getRow(grid, i);
    const col = getCol(grid, i);
    const rowDone = row.every((v) => v !== 0);
    const colDone = col.every((v) => v !== 0);
    if (!allowPartial || rowDone) {
      if (!checkEdgeClue(row, data.left[i], visibilityMode)) return false;
      if (!checkEdgeClue(reversed(row), data.right[i], visibilityMode)) return false;
    }
    if (!allowPartial || colDone) {
      if (!checkEdgeClue(col, data.top[i], visibilityMode)) return false;
      if (!checkEdgeClue(reversed(col), data.bottom[i], visibilityMode)) return false;
    }
  }
  if (data.mode?.diagonals) {
    const main = Array.from({ length: n }, (_, i) => grid[i][i]).filter((v) => v !== 0);
    if (new Set(main).size !== main.length) return false;
    const anti = Array.from({ length: n }, (_, i) => grid[i][n - 1 - i]).filter((v) => v !== 0);
    if (new Set(anti).size !== anti.length) return false;
    if (!allowPartial) {
      if (!grid.every((row) => row.every((v) => v !== 0))) return false;
      if (new Set(Array.from({ length: n }, (_, i) => grid[i][i])).size !== n) return false;
      if (new Set(Array.from({ length: n }, (_, i) => grid[i][n - 1 - i])).size !== n) return false;
    }
  }
  return true;
}

export const SkyscrapersComponent = ({ data, state, onChange }: { data: SkyscrapersData; state: SkyscrapersState; onChange: (next: SkyscrapersState) => void }) => {
  const n = data.size;
  const [selected, setSelected] = useState(state.selected ?? null);
  const grid = useMemo(() => state.grid, [state.grid]);
  const [notesMode, setNotesMode] = useState(false);
  const [stickyDigits, setStickyDigits] = useState(true);
  const [activeDigit, setActiveDigit] = useState<number | null>(null);
  const [ariaMsg, setAriaMsg] = useState('');
  const solution = useMemo(() => {
    // prefer provided solution
    if (data.solution && data.solution.length === n) return data.solution;
    // lightweight DFS solver
    const domain = Array.from({ length: n }, (_, i) => i + 1);
    const g = createEmptyGrid(n);
    const usedRow: Array<Set<number>> = Array.from({ length: n }, () => new Set());
    const usedCol: Array<Set<number>> = Array.from({ length: n }, () => new Set());
    const cells: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (state.grid[r][c] !== 0) {
        g[r][c] = state.grid[r][c];
        usedRow[r].add(g[r][c]);
        usedCol[c].add(g[r][c]);
      } else {
        cells.push({ r, c });
      }
    }
    // simple MRV ordering by currently allowed
    function candidates(r: number, c: number): number[] {
      const out: number[] = [];
      for (const v of domain) {
        if (usedRow[r].has(v) || usedCol[c].has(v)) continue;
        g[r][c] = v;
        if (validateEdges(data, g, true)) out.push(v);
        g[r][c] = 0;
      }
      return out;
    }
    cells.sort((a, b) => candidates(a.r, a.c).length - candidates(b.r, b.c).length);
    function dfs(idx: number): boolean {
      if (idx === cells.length) return validateEdges(data, g, false);
      const { r, c } = cells[idx];
      const cand = candidates(r, c);
      for (const v of cand) {
        g[r][c] = v; usedRow[r].add(v); usedCol[c].add(v);
        if (dfs(idx + 1)) return true;
        usedRow[r].delete(v); usedCol[c].delete(v); g[r][c] = 0;
      }
      return false;
    }
    if (dfs(0)) return g.map((row) => row.slice());
    return null;
  }, [data, n, state.grid]);

  function candidatesFor(r: number, c: number): number[] {
    if (grid[r][c] !== 0) return [];
    const allowed: number[] = [];
    for (let v = 1; v <= n; v++) {
      // Latin constraints
      if (grid[r].includes(v)) continue;
      if (grid.some((row) => row[c] === v)) continue;
      if (data.mode?.diagonals) {
        if (r === c && grid.some((row, i) => i !== r && row[i] === v)) continue;
        if (r + c === n - 1) {
          for (let i = 0; i < n; i++) {
            if (i === r) continue;
            if (grid[i][n - 1 - i] === v) { v = -1 as any; break; }
          }
          if (v === (-1 as any)) continue;
        }
      }
      // Edge feasibility: simulate
      const tmp = grid.map((row) => row.slice());
      tmp[r][c] = v;
      if (!validateEdges(data, tmp, true)) continue;
      allowed.push(v);
    }
    return allowed;
  }

  const placeNumber = useCallback((val: number, r: number, c: number) => {
    const next = grid.map((row) => row.slice());
    next[r][c] = val;
    const nextNotes = state.notes.map((row) => row.map((arr) => arr.slice()));
    if (val !== 0) {
      for (let i = 0; i < n; i++) {
        nextNotes[r][i] = nextNotes[r][i].filter((x) => x !== val);
        nextNotes[i][c] = nextNotes[i][c].filter((x) => x !== val);
      }
    }
    onChange({ ...state, grid: next, notes: nextNotes, selected: { r, c } });
    setSelected({ r, c });
    setAriaMsg(val === 0 ? `Cleared R${r+1}C${c+1}` : `Placed ${val} at R${r+1}C${c+1}`);
  }, [grid, n, state, onChange]);

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
  }, [selected, n, notesMode, state, onChange, placeNumber]);

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
          <InteractiveCard onClick={() => {
            if (!selected) return;
            const nn = state.notes.map((row) => row.map(() => [] as number[]));
            onChange({ ...state, notes: nn, selected });
          }}>
            <span className="block text-center">Clear notes</span>
          </InteractiveCard>
        </div>
        <div className="order-1 md:order-2 flex justify-center">
          <div
            className="relative grid rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm select-none"
            style={{ gridTemplateColumns: `repeat(${n + 2}, 56px)`, gap: '4px' }}
            role="grid"
            aria-label="Skyscrapers grid"
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            {/* Top edge clues row */}
            <div />
            {Array.from({ length: n }, (_, c) => (
              <div key={`top-${c}`} className="h-14 w-14 flex items-center justify-center text-white/80 text-sm" suppressHydrationWarning>{data.top[c] || ''}</div>
            ))}
            <div />

            {/* Middle rows with left/right clues */}
            {Array.from({ length: n }, (_, r) => (
              <Fragment key={`row-${r}`}>
                <div className="h-14 w-14 flex items-center justify-center text-white/80 text-sm" suppressHydrationWarning>{data.left[r] || ''}</div>
                {grid[r].map((cell, c) => {
                  const isSelected = !!selected && selected.r === r && selected.c === c;
                  const inSameUnit = !!selected && (selected.r === r || selected.c === c);
                  const sameValueSelected = !!selected && grid[selected.r][selected.c] !== 0 && grid[selected.r][selected.c] === cell;
                  return (
                    <button
                      key={`${r}-${c}`}
                      className={`h-14 w-14 rounded-md border text-center text-xl font-semibold transition-colors bg-neutral-900/70 text-neutral-100 border-neutral-800 ${inSameUnit ? 'bg-white/[0.06]' : ''} ${sameValueSelected ? 'bg-cyan-600/40 text-cyan-100 ring-2 ring-cyan-400' : ''} ${isSelected ? 'ring-2 ring-sky-400' : ''}`}
                      role="gridcell"
                      aria-selected={isSelected ?? undefined}
                      onMouseDown={() => { setSelected({ r, c }); }}
                      onClick={() => {
                        setSelected({ r, c });
                        if (activeDigit && !notesMode) placeNumber(activeDigit, r, c);
                        if (activeDigit && notesMode) {
                          const nn = state.notes.map((row) => row.map((arr) => arr.slice()));
                          const cellNotes = new Set(nn[r][c]);
                          if (cellNotes.has(activeDigit)) cellNotes.delete(activeDigit); else cellNotes.add(activeDigit);
                          nn[r][c] = Array.from(cellNotes).sort((a,b)=>a-b);
                          onChange({ ...state, notes: nn, selected: { r, c } });
                        }
                      }}
                    >
                      {cell !== 0 ? (
                        <span className="inline-block" suppressHydrationWarning>{cell}</span>
                      ) : (
                        (state.notes[r][c].length > 0) ? (
                          <div className="grid grid-cols-3 gap-[1px] p-[2px] text-[10px] leading-3 text-neutral-300">
                            {Array.from({ length: n }, (_, i) => i + 1).map((v) => (
                              <div key={v} className="text-center">{state.notes[r][c].includes(v) ? v : ''}</div>
                            ))}
                          </div>
                        ) : ''
                      )}
                    </button>
                  );
                })}
                <div className="h-14 w-14 flex items-center justify-center text-white/80 text-sm" suppressHydrationWarning>{data.right[r] || ''}</div>
              </Fragment>
            ))}

            {/* Bottom edge clues row */}
            <div />
            {Array.from({ length: n }, (_, c) => (
              <div key={`bottom-${c}`} className="h-14 w-14 flex items-center justify-center text-white/80 text-sm" suppressHydrationWarning>{data.bottom[c] || ''}</div>
            ))}
            <div />
          </div>
        </div>
        <div className="order-3 md:order-3 grid grid-cols-3 gap-3 content-center self-center">
          {Array.from({ length: n }, (_, i) => i + 1).map((num) => (
            <InteractiveCard
              key={num}
              className={`h-14 text-center flex items-center justify-center p-0 ${(stickyDigits && activeDigit===num)?'ring-2 ring-sky-500':''}`}
              onClick={() => {
                if (stickyDigits) {
                  setActiveDigit((d) => d === num ? null : num);
                  if (!selected) return;
                  if (notesMode) {
                    const nn = state.notes.map((row) => row.map((arr) => arr.slice()));
                    const cellNotes = new Set(nn[selected.r][selected.c]);
                    if (cellNotes.has(num)) cellNotes.delete(num); else cellNotes.add(num);
                    nn[selected.r][selected.c] = Array.from(cellNotes).sort((a, b) => a - b);
                    onChange({ ...state, notes: nn, selected });
                  } else {
                    placeNumber(num, selected.r, selected.c);
                  }
                } else {
                  if (selected) {
                    if (notesMode) {
                      const nn = state.notes.map((row) => row.map((arr) => arr.slice()));
                      const cellNotes = new Set(nn[selected.r][selected.c]);
                      if (cellNotes.has(num)) cellNotes.delete(num); else cellNotes.add(num);
                      nn[selected.r][selected.c] = Array.from(cellNotes).sort((a, b) => a - b);
                      onChange({ ...state, notes: nn, selected });
                    } else {
                      placeNumber(num, selected.r, selected.c);
                    }
                  }
                  setActiveDigit(null);
                }
              }}
            >
              <span className="block text-2xl font-semibold leading-none text-white/90">{num}</span>
            </InteractiveCard>
          ))}
          <InteractiveCard onClick={() => {
            const sol = solution; if (!sol) return;
            let target: { r: number; c: number } | null = selected && state.grid[selected.r][selected.c] === 0 ? selected : null;
            if (!target) {
              const empty: Array<{ r: number; c: number }> = [];
              for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (state.grid[r][c] === 0) empty.push({ r, c });
              if (empty.length === 0) return; target = empty[Math.floor(Math.random() * empty.length)];
            }
            placeNumber(sol[target.r][target.c], target.r, target.c);
          }}>
            <span className="block text-center">Reveal cell</span>
          </InteractiveCard>
          <InteractiveCard onClick={() => {
            const sol = solution; if (!sol) return;
            onChange({ ...state, grid: sol.map((r) => r.slice()), notes: emptyNotes(n) });
          }}>
            <span className="block text-center">Reveal solution</span>
          </InteractiveCard>
        </div>
      </div>
      <div aria-live="polite" className="sr-only" role="status">{ariaMsg}</div>
    </div>
  );
};

export const skyscrapersPlugin: PuzzlePlugin<SkyscrapersData, SkyscrapersState> = {
  type: 'skyscrapers',
  parse(raw) {
    const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    return JSON.parse(json) as SkyscrapersData;
  },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(data) {
    return { grid: createEmptyGrid(data.size), notes: emptyNotes(data.size), selected: null };
  },
  render(data, state) {
    return function Bound({ onChange }: { onChange: (next: SkyscrapersState) => void }) {
      return <SkyscrapersComponent data={data} state={state} onChange={onChange} />;
    };
  },
  validateMove(data, state) {
    const g = state.grid;
    if (!validateLatin(g)) return { ok: false };
    if (!validateEdges(data, g, true)) return { ok: false };
    return { ok: true };
  },
  isSolved(data, state) {
    const n = data.size;
    if (!state.grid.every((row) => row.every((v) => v >= 1 && v <= n))) return false;
    if (!validateLatin(state.grid)) return false;
    if (!validateEdges(data, state.grid, false)) return false;
    return true;
  },
  getHints(data, state) {
    const n = data.size;
    // 1) Latin singles
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (state.grid[r][c] !== 0) continue;
      const cand: number[] = [];
      for (let v = 1; v <= n; v++) {
        if (state.grid[r].includes(v) || state.grid.some((row) => row[c] === v)) continue;
        const tmp = state.grid.map((row) => row.slice()); tmp[r][c] = v;
        if (!validateEdges(data, tmp, true)) continue; cand.push(v);
      }
      if (cand.length === 1) return [{ id: `ns-${r}-${c}`, title: `Only ${cand[0]} fits at R${r+1}C${c+1}` }];
    }
    // 2) Edge forced extremes: if clue is 1, the first cell must be n
    for (let i = 0; i < n; i++) {
      if (data.left[i] === 1 && state.grid[i][0] === 0) return [{ id: `edge-left-${i}`, title: `Row ${i+1}: left clue 1 forces ${n} at C1` }];
      if (data.right[i] === 1 && state.grid[i][n-1] === 0) return [{ id: `edge-right-${i}`, title: `Row ${i+1}: right clue 1 forces ${n} at C${n}` }];
      if (data.top[i] === 1 && state.grid[0][i] === 0) return [{ id: `edge-top-${i}`, title: `Col ${i+1}: top clue 1 forces ${n} at R1` }];
      if (data.bottom[i] === 1 && state.grid[n-1][i] === 0) return [{ id: `edge-bottom-${i}`, title: `Col ${i+1}: bottom clue 1 forces ${n} at R${n}` }];
    }
    return [{ id: 'scan', title: 'Scan rows/columns and apply edge clues', body: 'Use Latin uniqueness and visibility constraints to prune.' }];
  },
  explainStep(data, state) {
    const h = (this as any).getHints(data, state) as any[];
    if (!h || h.length === 0) return { step: 'No step', details: 'No obvious techniques available.' };
    const best = h[0];
    return { step: best.title, details: best.body };
  }
};

export default skyscrapersPlugin;



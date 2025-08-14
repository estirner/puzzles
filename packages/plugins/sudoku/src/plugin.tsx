"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { useEffect, useMemo, useState } from 'react';
import { InteractiveCard } from '@repo/ui';

export type SudokuData = { size: 9; givens: Array<{ r: number; c: number; v: number }> };
export type SudokuState = { grid: number[][]; notes: number[][][]; selected?: { r: number; c: number } };

function createEmptyGrid(): number[][] {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
}

export const SudokuComponent = ({ data, state, onChange }: { data: SudokuData; state: SudokuState; onChange: (next: SudokuState) => void }) => {
  const [selected, setSelected] = useState<{ r: number; c: number } | undefined>(state.selected);
  const [notesMode, setNotesMode] = useState<boolean>(false);
  const [autoCandidates, setAutoCandidates] = useState<boolean>(false);
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const [sideHint, setSideHint] = useState<string | null>(null);
  const [sideSolved, setSideSolved] = useState<null | boolean>(null);
  const [activeDigit, setActiveDigit] = useState<number | null>(null);
  const [strictMode, setStrictMode] = useState<boolean>(false);
  const [ariaMsg, setAriaMsg] = useState<string>("");
  const [stickyDigits, setStickyDigits] = useState<boolean>(true);
  const grid = useMemo(() => state.grid, [state.grid]);

  function computeInvalids(): boolean[][] {
    const invalid: boolean[][] = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => false));
    // rows
    for (let r = 0; r < 9; r++) {
      const counts = new Map<number, number>();
      for (let c = 0; c < 9; c++) {
        const v = grid[r][c];
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      for (let c = 0; c < 9; c++) {
        const v = grid[r][c];
        if (v && (counts.get(v) || 0) > 1) invalid[r][c] = true;
      }
    }
    // cols
    for (let c = 0; c < 9; c++) {
      const counts = new Map<number, number>();
      for (let r = 0; r < 9; r++) {
        const v = grid[r][c];
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      for (let r = 0; r < 9; r++) {
        const v = grid[r][c];
        if (v && (counts.get(v) || 0) > 1) invalid[r][c] = true;
      }
    }
    // boxes
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const counts = new Map<number, number>();
        for (let r = br * 3; r < br * 3 + 3; r++)
          for (let c = bc * 3; c < bc * 3 + 3; c++) {
            const v = grid[r][c];
            if (v) counts.set(v, (counts.get(v) || 0) + 1);
          }
        for (let r = br * 3; r < br * 3 + 3; r++)
          for (let c = bc * 3; c < bc * 3 + 3; c++) {
            const v = grid[r][c];
            if (v && (counts.get(v) || 0) > 1) invalid[r][c] = true;
          }
      }
    }
    return invalid;
  }
  const invalids = useMemo(() => computeInvalids(), [grid]);

  // Digit counters (how many of each number already placed)
  const digitCounts = useMemo(() => {
    const counts = Array.from({ length: 10 }, () => 0);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { const v = grid[r][c]; if (v) counts[v]++; }
    return counts as number[];
  }, [grid]);

  // Keep hover highlight aligned with active digit
  useEffect(() => { setHoveredValue(activeDigit ?? null); }, [activeDigit]);

  // Simple solver from givens for reveal features
  function solveFromGivens(): number[][] | null {
    const g = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
    for (const gv of data.givens) g[gv.r][gv.c] = gv.v;
    const cand = (r: number, c: number): number[] => {
      if (g[r][c] !== 0) return [];
      const used = new Set<number>();
      for (let i = 0; i < 9; i++) { used.add(g[r][i]); used.add(g[i][c]); }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) used.add(g[rr][cc]);
      const list: number[] = []; for (let n = 1; n <= 9; n++) if (!used.has(n)) list.push(n); return list;
    };
    const find = (): { r: number; c: number } | null => { for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (g[r][c] === 0) return { r, c }; return null; };
    const dfs = (): boolean => { const e = find(); if (!e) return true; const cs = cand(e.r, e.c); for (const n of cs) { g[e.r][e.c] = n; if (dfs()) return true; } g[e.r][e.c] = 0; return false; };
    if (dfs()) return g; return null;
  }
  const solution = useMemo(() => solveFromGivens(), [data]);

  function isPlacementValid(n: number, r: number, c: number, base: number[][]): boolean {
    // Validate uniqueness of n at r,c
    for (let i = 0; i < 9; i++) if (i !== c && base[r][i] === n) return false;
    for (let i = 0; i < 9; i++) if (i !== r && base[i][c] === n) return false;
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) if (!(rr === r && cc === c) && base[rr][cc] === n) return false;
    return true;
  }

  function removeNotesAround(nextNotes: number[][][], r: number, c: number, n: number): void {
    for (let i = 0; i < 9; i++) {
      nextNotes[r][i] = nextNotes[r][i].filter((x) => x !== n); // row
      nextNotes[i][c] = nextNotes[i][c].filter((x) => x !== n); // col
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) nextNotes[rr][cc] = nextNotes[rr][cc].filter((x) => x !== n);
  }

  function placeNumber(n: number, r: number, c: number) {
    if (data.givens.some((g) => g.r === r && g.c === c)) return;
    const next = grid.map((row) => row.slice());
    // Enforce remaining count for number n (max 9 occurrences)
    if (n !== 0) {
      const prev = next[r][c];
      const alreadyPlaced = digitCounts[n];
      if (n !== prev && alreadyPlaced >= 9) { setAriaMsg(`No ${n}s remaining`); return; }
    }
    if (strictMode && n !== 0 && !isPlacementValid(n, r, c, next)) { setAriaMsg(`Invalid move ${n} at R${r+1}C${c+1}`); return; }
    next[r][c] = n;
    const nextNotes = state.notes.map((row) => row.map((arr) => arr.slice()));
    if (n !== 0) removeNotesAround(nextNotes, r, c, n);
    onChange({ ...state, grid: next, notes: nextNotes, selected: { r, c } });
    setAriaMsg(n === 0 ? `Cleared R${r+1}C${c+1}` : `Placed ${n} at R${r+1}C${c+1}`);
  }

  function candidatesForCell(r: number, c: number): number[] {
    if (grid[r][c] !== 0) return [];
    const used = new Set<number>();
    for (let i = 0; i < 9; i++) { used.add(grid[r][i]); used.add(grid[i][c]); }
    const br = Math.floor(r / 3) * 3; const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) used.add(grid[rr][cc]);
    const list: number[] = [];
    for (let n = 1; n <= 9; n++) if (!used.has(n)) list.push(n);
    return list;
  }

  // UI helper: 3x3 box relation
  const isSameBox = (r1: number, c1: number, r2: number, c2: number) =>
    Math.floor(r1 / 3) === Math.floor(r2 / 3) && Math.floor(c1 / 3) === Math.floor(c2 / 3);

  return (
    <div className="p-4">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-6 md:grid-cols-[8rem_minmax(0,48rem)_16rem]">
        {/* Left controls */}
        <div className="order-2 md:order-1 flex flex-col gap-2 self-center">
          <InteractiveCard onClick={() => setNotesMode((v)=>!v)} className={`w-full flex items-center justify-center text-center ${notesMode?'ring-1 ring-sky-500':''}`}>
            <span className="text-lg">Notes</span>
          </InteractiveCard>
          <InteractiveCard onClick={() => setStickyDigits((v)=>!v)} className={`w-full flex items-center justify-center text-center ${stickyDigits?'ring-1 ring-sky-500':''}`}>
            <span className="text-lg">Sticky digits</span>
          </InteractiveCard>
          <InteractiveCard onClick={() => setStrictMode((v)=>!v)} className={`w-full flex items-center justify-center text-center ${strictMode?'ring-1 ring-amber-500':''}`}>
            <span className="text-lg">Mistakes {strictMode ? 'On' : 'Off'}</span>
          </InteractiveCard>
          <InteractiveCard
            onClick={() => {
              if (!selected) return;
              if (data.givens.some(g => g.r === selected.r && g.c === selected.c)) return;
              placeNumber(0, selected.r, selected.c);
            }}
            className={`w-full flex items-center justify-center text-center ${selected && data.givens.some(g => g.r === selected.r && g.c === selected.c) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="text-lg">Clear</span>
          </InteractiveCard>
          <InteractiveCard
            onClick={() => {
              if (!selected) return;
              if (data.givens.some(g => g.r === selected.r && g.c === selected.c)) return;
              const nextNotes = state.notes.map((row)=>row.map(()=>[] as number[]));
              onChange({ ...state, notes: nextNotes, selected });
            }}
            className={`w-full flex items-center justify-center text-center ${selected && data.givens.some(g => g.r === selected.r && g.c === selected.c) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="text-lg">Clear notes</span>
          </InteractiveCard>
          <InteractiveCard onClick={() => setAutoCandidates((v)=>!v)} className={`w-full flex items-center justify-center text-center ${autoCandidates?'ring-1 ring-sky-500':''}`}>
            <span className="text-lg">Auto candidates</span>
          </InteractiveCard>
          
        </div>
        {/* Board */}
        <div className="order-1 md:order-2 flex justify-center">
          <div
            className="relative grid grid-cols-9 gap-[4px] rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm select-none"
            role="grid"
            aria-label="Sudoku grid"
            tabIndex={0}
            onKeyDown={(e) => {
          if (!selected) return;
          const n = parseInt(e.key, 10);
          if (!Number.isNaN(n) && n >= 1 && n <= 9) { placeNumber(n, selected.r, selected.c); e.preventDefault(); }
          if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { placeNumber(0, selected.r, selected.c); e.preventDefault(); }
          if (e.key === 'ArrowUp') { setSelected({ r: Math.max(0, selected.r - 1), c: selected.c }); e.preventDefault(); }
          if (e.key === 'ArrowDown') { setSelected({ r: Math.min(8, selected.r + 1), c: selected.c }); e.preventDefault(); }
          if (e.key === 'ArrowLeft') { setSelected({ r: selected.r, c: Math.max(0, selected.c - 1) }); e.preventDefault(); }
          if (e.key === 'ArrowRight') { setSelected({ r: selected.r, c: Math.min(8, selected.c + 1) }); e.preventDefault(); }
          if (e.key.toLowerCase() === 'n') { setNotesMode((v)=>!v); e.preventDefault(); }
          if (e.key.toLowerCase() === 'a') { setAutoCandidates((v)=>!v); e.preventDefault(); }
          if (e.key.toLowerCase() === 'm') { setStrictMode((v)=>!v); e.preventDefault(); }
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const given = data.givens.some((g) => g.r === r && g.c === c);
            const isSelected = selected && selected.r === r && selected.c === c;
            const inSameUnit = selected && (selected.r === r || selected.c === c || isSameBox(selected.r, selected.c, r, c));
            const sameValueSelected = selected && grid[selected.r][selected.c] !== 0 && grid[selected.r][selected.c] === cell;
            const matchesHover = hoveredValue !== null && cell === hoveredValue;
            const thickTop = r % 3 === 0;
            const thickLeft = c % 3 === 0;
            const thickRight = (c + 1) % 3 === 0;
            const thickBottom = (r + 1) % 3 === 0;
            return (
              <button
                key={`${r}-${c}`}
                className={`h-14 w-14 rounded-md border text-center text-xl font-semibold transition-colors ${
                  given ? 'bg-neutral-800/80 text-neutral-200 border-neutral-700' : 'bg-neutral-900/70 text-neutral-100 border-neutral-800'
                }
                ${inSameUnit ? 'bg-white/[0.06]' : ''}
                ${sameValueSelected ? 'bg-cyan-600/40 text-cyan-100 ring-2 ring-cyan-400' : ''}
                ${!sameValueSelected && matchesHover ? 'bg-amber-500/35 text-amber-100 ring-1 ring-amber-300' : ''}
                ${isSelected ? 'ring-2 ring-sky-400' : ''}
                ${invalids[r][c] ? 'border-red-600 ring-red-600 text-red-300' : ''}
                ${thickTop ? 'border-t-2 border-t-white/20' : ''}
                ${thickLeft ? 'border-l-2 border-l-white/20' : ''}
                ${thickRight ? 'border-r-2 border-r-white/20' : ''}
                ${thickBottom ? 'border-b-2 border-b-white/20' : ''}
                `}
                role="gridcell"
                aria-selected={isSelected}
                onMouseDown={() => { setSelected({ r, c }); }}
                onClick={() => { setSelected({ r, c }); if (activeDigit && !notesMode) placeNumber(activeDigit, r, c); if (activeDigit && notesMode) { const nextNotes = state.notes.map((row) => row.map((arr) => arr.slice())); const cellNotes = new Set(nextNotes[r][c]); if (cellNotes.has(activeDigit)) cellNotes.delete(activeDigit); else cellNotes.add(activeDigit); nextNotes[r][c] = Array.from(cellNotes).sort((a, b) => a - b); onChange({ ...state, notes: nextNotes, selected: { r, c } }); }}}
                onFocus={() => setSelected({ r, c })}
              >
                {cell || (
                  (state.notes[r][c].length > 0 || autoCandidates) ? (
                    <div className="grid grid-cols-3 gap-[1px] p-[2px] text-[10px] leading-3 text-neutral-300">
                      {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                        <div key={n} className="text-center">
                          {state.notes[r][c].length > 0
                            ? (state.notes[r][c].includes(n) ? n : '')
                            : (candidatesForCell(r, c).includes(n) ? n : '')}
                        </div>
                      ))}
                    </div>
                  ) : ''
                )}
              </button>
            );
          })
        )}
          </div>
        </div>
        {/* Right number pad and actions */}
        <div className="order-3 md:order-3 grid grid-cols-3 gap-3 content-center self-center">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
            const remaining = 9 - digitCounts[n];
            const disabled = !notesMode && remaining <= 0 && activeDigit !== n;
            return (
            <InteractiveCard
              key={n}
              className={`h-14 text-center flex items-center justify-center p-0 ${(stickyDigits && activeDigit===n)?'ring-2 ring-sky-500':''} ${disabled?'opacity-40 cursor-not-allowed':''}`}
              onMouseEnter={() => setHoveredValue(n)}
              onMouseLeave={() => setHoveredValue(null)}
              onClick={() => {
                if (disabled) return;
                if (stickyDigits) {
                  setActiveDigit((d) => d === n ? null : n);
                  if (!selected) return;
                  if (notesMode) {
                    const nextNotes = state.notes.map((row) => row.map((arr) => arr.slice()));
                    const cellNotes = new Set(nextNotes[selected.r][selected.c]);
                    if (cellNotes.has(n)) cellNotes.delete(n); else cellNotes.add(n);
                    nextNotes[selected.r][selected.c] = Array.from(cellNotes).sort((a, b) => a - b);
                    onChange({ ...state, notes: nextNotes, selected });
                  } else {
                    placeNumber(n, selected.r, selected.c);
                  }
                } else {
                  // one-shot behavior
                  if (selected) {
                    if (notesMode) {
                      const nextNotes = state.notes.map((row) => row.map((arr) => arr.slice()));
                      const cellNotes = new Set(nextNotes[selected.r][selected.c]);
                      if (cellNotes.has(n)) cellNotes.delete(n); else cellNotes.add(n);
                      nextNotes[selected.r][selected.c] = Array.from(cellNotes).sort((a, b) => a - b);
                      onChange({ ...state, notes: nextNotes, selected });
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
            );
          })}
          <div className="col-span-3 grid grid-cols-3 gap-1 text-[11px] text-white/80 mt-1">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
              <div key={`cnt-${n}`} className="text-center"><span className="font-semibold">{n}</span>: <span className="font-semibold">{9 - digitCounts[n]}</span></div>
            ))}
          </div>
          <div className="col-span-3 grid grid-cols-2 gap-3 mt-1">
            <InteractiveCard onClick={() => {
              // lightweight local hint using plugin logic
              const h = (sudokuPlugin as any).getHints(data, state) as any[];
              setSideHint(h?.[0]?.title || 'No hint available');
            }}>
              <span className="block text-center">Get hint</span>
            </InteractiveCard>
            <InteractiveCard onClick={() => {
              const ok = (sudokuPlugin as any).isSolved(data, state);
              setSideSolved(ok);
            }}>
              <span className="block text-center">Check</span>
            </InteractiveCard>
            <InteractiveCard className="flex items-center justify-center text-center" onClick={() => {
              const sol = solution; if (!sol) return;
              // Reveal selected or a random empty cell
              let target: { r: number; c: number } | null = selected && state.grid[selected.r][selected.c] === 0 ? selected : null;
              if (!target) {
                const empty: Array<{ r: number; c: number }> = [];
                for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (state.grid[r][c] === 0) empty.push({ r, c });
                if (empty.length === 0) return; target = empty[Math.floor(Math.random() * empty.length)];
              }
              placeNumber(sol[target.r][target.c], target.r, target.c);
            }}>
              <span className="block text-center">Reveal cell</span>
            </InteractiveCard>
            <InteractiveCard className="flex items-center justify-center text-center" onClick={() => {
              const sol = solution; if (!sol) return;
              const nextNotes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [] as number[]));
              onChange({ ...state, grid: sol.map((r) => r.slice()), notes: nextNotes });
            }}>
              <span className="block text-center">Reveal solution</span>
            </InteractiveCard>
          </div>
          {(sideHint || sideSolved !== null) && (
            <div className="col-span-3 mt-2 text-sm">
              {sideHint && <div className="text-white/90">{sideHint}</div>}
              {sideSolved !== null && (
                <div className={sideSolved ? 'text-green-400' : 'text-red-400'}>{sideSolved ? 'Solved' : 'Not solved yet'}</div>
              )}
            </div>
          )}
        </div>
      </div>
      <div aria-live="polite" className="sr-only" role="status">{ariaMsg}</div>
    </div>
  );
};

export const sudokuPlugin: PuzzlePlugin<SudokuData, SudokuState> = {
  type: 'sudoku',
  parse(raw) {
    const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    const parsed = JSON.parse(json) as SudokuData;
    return parsed;
  },
  serialize(data) {
    return JSON.stringify(data);
  },
  createInitialState(data) {
    const grid = createEmptyGrid();
    for (const g of data.givens) grid[g.r][g.c] = g.v;
    const notes: number[][][] = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [] as number[]));
    return { grid, notes };
  },
  validateMove(_data, state) {
    // Any duplicate in any unit is invalid
    const grid = state.grid;
    const hasDup = (arr: number[]) => {
      const vals = arr.filter((v) => v !== 0);
      return new Set(vals).size !== vals.length;
    };
    for (let r = 0; r < 9; r++) if (hasDup(grid[r])) return { ok: false };
    for (let c = 0; c < 9; c++) if (hasDup(grid.map((row) => row[c]))) return { ok: false };
    for (let br = 0; br < 3; br++)
      for (let bc = 0; bc < 3; bc++) {
        const box: number[] = [];
        for (let r = br * 3; r < br * 3 + 3; r++)
          for (let c = bc * 3; c < bc * 3 + 3; c++) box.push(grid[r][c]);
        if (hasDup(box)) return { ok: false };
      }
    return { ok: true };
  },
  render(data, state) {
    return function Bound({ onChange }: { onChange: (next: SudokuState) => void }) {
      return <SudokuComponent data={data} state={state} onChange={onChange} />;
    };
  },
  isSolved(_data, state) {
    // All cells filled and no unit has duplicates
    if (!state.grid.every((row) => row.every((n) => n !== 0))) return false;
    const g = state.grid;
    const hasDup = (vals: number[]) => new Set(vals).size !== vals.length;
    for (let r = 0; r < 9; r++) if (hasDup(g[r])) return false;
    for (let c = 0; c < 9; c++) if (hasDup(g.map((row) => row[c]))) return false;
    for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
      const box: number[] = [];
      for (let r = br * 3; r < br * 3 + 3; r++)
        for (let c = bc * 3; c < bc * 3 + 3; c++) box.push(g[r][c]);
      if (hasDup(box)) return false;
    }
    return true;
  },
  getHints(data, state) {
    const grid = state.grid;
    function candidates(r: number, c: number): number[] {
      if (grid[r][c] !== 0) return [];
      const used = new Set<number>();
      for (let i = 0; i < 9; i++) { used.add(grid[r][i]); used.add(grid[i][c]); }
      const br = Math.floor(r / 3) * 3; const bc = Math.floor(c / 3) * 3;
      for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++) used.add(grid[rr][cc]);
      const list: number[] = [];
      for (let n = 1; n <= 9; n++) if (!used.has(n)) list.push(n);
      return list;
    }
    const rc = (r: number, c: number) => `R${r + 1}C${c + 1}`;
    // Naked single
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const cand = candidates(r, c);
      if (cand.length === 1) return [{ id: `ns-${r}-${c}`, title: `Naked single at ${rc(r,c)}`, body: `Only ${cand[0]} fits.` }];
    }
    // Hidden single in rows
    for (let r = 0; r < 9; r++) {
      const counts = new Map<number, number>();
      const spots = new Map<number, { r: number; c: number }>();
      for (let c = 0; c < 9; c++) {
        for (const n of candidates(r, c)) { counts.set(n, (counts.get(n) || 0) + 1); spots.set(n, { r, c }); }
      }
      for (const [n, k] of counts) if (k === 1) { const s = spots.get(n)!; return [{ id: `hsr-${r}-${n}`, title: `Hidden single in row ${r + 1}`, body: `${n} only fits at ${rc(s.r,s.c)}.` }]; }
    }
    // Hidden single in columns
    for (let c = 0; c < 9; c++) {
      const counts = new Map<number, number>();
      const spots = new Map<number, { r: number; c: number }>();
      for (let r = 0; r < 9; r++) {
        for (const n of candidates(r, c)) { counts.set(n, (counts.get(n) || 0) + 1); spots.set(n, { r, c }); }
      }
      for (const [n, k] of counts) if (k === 1) { const s = spots.get(n)!; return [{ id: `hsc-${c}-${n}`, title: `Hidden single in column ${c + 1}`, body: `${n} only fits at ${rc(s.r,s.c)}.` }]; }
    }
    // Hidden single in boxes
    for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
      const counts = new Map<number, number>();
      const spots = new Map<number, { r: number; c: number }>();
      for (let r = br * 3; r < br * 3 + 3; r++) for (let c = bc * 3; c < bc * 3 + 3; c++) {
        for (const n of candidates(r, c)) { counts.set(n, (counts.get(n) || 0) + 1); spots.set(n, { r, c }); }
      }
      for (const [n, k] of counts) if (k === 1) { const s = spots.get(n)!; return [{ id: `hsb-${br}${bc}-${n}`, title: `Hidden single in box ${br + 1},${bc + 1}`, body: `${n} only fits at ${rc(s.r,s.c)}.` }]; }
    }
    // Pointing pair/triple (box -> line)
    for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
      for (let n = 1; n <= 9; n++) {
        const rows: Set<number> = new Set();
        const cols: Set<number> = new Set();
        const cells: Array<{ r: number; c: number }> = [];
        for (let r = br * 3; r < br * 3 + 3; r++) for (let c = bc * 3; c < bc * 3 + 3; c++) {
          if (grid[r][c] === 0 && candidates(r, c).includes(n)) { rows.add(r); cols.add(c); cells.push({ r, c }); }
        }
        if (cells.length >= 2 && (rows.size === 1 || cols.size === 1)) {
          const axis = rows.size === 1 ? 'row' : 'column';
          const idx = rows.size === 1 ? Array.from(rows)[0] + 1 : Array.from(cols)[0] + 1;
          return [{ id: `point-${br}${bc}-${n}`, title: `Pointing ${axis}: ${n}`, body: `${n} in box ${br + 1},${bc + 1} sits only in ${axis} ${idx}. Eliminate ${n} from that ${axis} outside the box.` }];
        }
      }
    }
    // Claiming (line -> box): if a number's candidates in a row/col are confined to a single box
    for (let r = 0; r < 9; r++) {
      for (let n = 1; n <= 9; n++) {
        const cs: number[] = [];
        for (let c = 0; c < 9; c++) if (grid[r][c] === 0 && candidates(r, c).includes(n)) cs.push(c);
        if (cs.length >= 2) {
          const boxIdx = new Set(cs.map((c) => Math.floor(c / 3))).size;
          if (boxIdx === 1) return [{ id: `claim-r${r}-${n}`, title: `Claiming in row ${r + 1}`, body: `${n} candidates are confined to one box. Remove ${n} from the rest of that box.` }];
        }
      }
    }
    for (let c = 0; c < 9; c++) {
      for (let n = 1; n <= 9; n++) {
        const rs: number[] = [];
        for (let r = 0; r < 9; r++) if (grid[r][c] === 0 && candidates(r, c).includes(n)) rs.push(r);
        if (rs.length >= 2) {
          const boxIdx = new Set(rs.map((r) => Math.floor(r / 3))).size;
          if (boxIdx === 1) return [{ id: `claim-c${c}-${n}`, title: `Claiming in column ${c + 1}`, body: `${n} candidates are confined to one box. Remove ${n} from the rest of that box.` }];
        }
      }
    }
    // Naked pair in a row
    for (let r = 0; r < 9; r++) {
      const empties = Array.from({ length: 9 }, (_, c) => ({ c, cand: candidates(r, c) })).filter((x) => x.cand.length === 2);
      for (let i = 0; i < empties.length; i++) for (let j = i + 1; j < empties.length; j++) {
        const a = empties[i]; const b = empties[j];
        if (a.cand[0] === b.cand[0] && a.cand[1] === b.cand[1]) {
          return [{ id: `np-r${r}-${a.cand.join('')}`, title: `Naked pair in row ${r + 1}`, body: `Pair ${a.cand.join(', ')} at ${rc(r, a.c)} and ${rc(r, b.c)} allows removing them from other cells in the row.` }];
        }
      }
    }
    // Naked pair in a column
    for (let c = 0; c < 9; c++) {
      const empties = Array.from({ length: 9 }, (_, r) => ({ r, cand: candidates(r, c) })).filter((x) => x.cand.length === 2);
      for (let i = 0; i < empties.length; i++) for (let j = i + 1; j < empties.length; j++) {
        const a = empties[i]; const b = empties[j];
        if (a.cand[0] === b.cand[0] && a.cand[1] === b.cand[1]) {
          return [{ id: `np-c${c}-${a.cand.join('')}`, title: `Naked pair in column ${c + 1}`, body: `Pair ${a.cand.join(', ')} at ${rc(a.r, c)} and ${rc(b.r, c)} allows removing them from other cells in the column.` }];
        }
      }
    }
    // Naked triple (rows/cols)
    const checkNakedTriple = (cells: Array<{ idx: number; cand: number[] }>, axis: 'row' | 'col', index: number) => {
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) for (let k = j + 1; k < cells.length; k++) {
        const s = new Set([...cells[i].cand, ...cells[j].cand, ...cells[k].cand]);
        if (s.size === 3) {
          const trio = Array.from(s).sort((a,b)=>a-b).join(', ');
          const pos = axis === 'row' ? `${rc(index, cells[i].idx)}, ${rc(index, cells[j].idx)}, ${rc(index, cells[k].idx)}` : `${rc(cells[i].idx, index)}, ${rc(cells[j].idx, index)}, ${rc(cells[k].idx, index)}`;
          return [{ id: `nt-${axis[0]}${index}`, title: `Naked triple in ${axis} ${index + 1}`, body: `Triple ${trio} at ${pos} allows removing them from other cells in the ${axis}.` }];
        }
      }
      return null;
    };
    for (let r = 0; r < 9; r++) {
      const cells = Array.from({ length: 9 }, (_, c) => ({ idx: c, cand: candidates(r, c) })).filter((x) => x.cand.length >= 2 && x.cand.length <= 3);
      const hint = checkNakedTriple(cells, 'row', r); if (hint) return hint;
    }
    for (let c = 0; c < 9; c++) {
      const cells = Array.from({ length: 9 }, (_, r) => ({ idx: r, cand: candidates(r, c) })).filter((x) => x.cand.length >= 2 && x.cand.length <= 3);
      const hint = checkNakedTriple(cells, 'col', c); if (hint) return hint;
    }
    // X-Wing (rows)
    for (let n = 1; n <= 9; n++) {
      const rowCols: number[][] = [];
      for (let r = 0; r < 9; r++) {
        const cs: number[] = [];
        for (let c = 0; c < 9; c++) if (grid[r][c] === 0 && candidates(r, c).includes(n)) cs.push(c);
        if (cs.length === 2) rowCols[r] = cs;
      }
      for (let r1 = 0; r1 < 8; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) {
        const a = rowCols[r1]; const b = rowCols[r2];
        if (a && b && a[0] === b[0] && a[1] === b[1]) {
          return [{ id: `xw-r${r1}-${r2}-${n}`, title: `X-Wing on ${n}`, body: `Rows ${r1 + 1} and ${r2 + 1} form an X-Wing on columns ${a[0] + 1} and ${a[1] + 1}. Eliminate ${n} from these columns in other rows.` }];
        }
      }
    }
    return [{ id: 'start', title: 'Try scanning for singles', body: 'Look for cells with only one candidate or units where a number fits only one place.' }];
  },
  explainStep(data, state) {
    const h = (this as any).getHints(data, state) as any[];
    if (!h || h.length === 0) return { step: 'No step', details: 'No obvious techniques available.' };
    const best = h[0];
    return { step: best.title, details: best.body };
  }
};

export default sudokuPlugin;



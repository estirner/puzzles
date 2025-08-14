"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AkariData = {
  width: number;
  height: number;
  grid: Array<Array<{ block?: boolean; clue?: number }>>; // white = {}
  // Optional: embedded solution bulbs for fast reveal/solve
  solution?: boolean[][];
};

export type AkariState = {
  bulbs: boolean[][]; // true indicates a bulb at that white cell
  selected?: { r: number; c: number } | null;
};

function createEmptyBulbGrid(h: number, w: number): boolean[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => false));
}

function computeLit(data: AkariData, bulbs: boolean[][]): boolean[][] {
  const { width, height } = data;
  const blocks: boolean[][] = Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => Boolean(data.grid[r][c].block)));
  const lit: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!bulbs[r][c]) continue;
      lit[r][c] = true;
      for (let rr = r - 1; rr >= 0; rr--) { if (blocks[rr][c]) break; lit[rr][c] = true; }
      for (let rr = r + 1; rr < height; rr++) { if (blocks[rr][c]) break; lit[rr][c] = true; }
      for (let cc = c - 1; cc >= 0; cc--) { if (blocks[r][cc]) break; lit[r][cc] = true; }
      for (let cc = c + 1; cc < width; cc++) { if (blocks[r][cc]) break; lit[r][cc] = true; }
    }
  }
  return lit;
}

function validate(data: AkariData, state: AkariState): { ok: boolean; errors?: string[] } {
  const { width, height } = data;
  const blocks: boolean[][] = Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => Boolean(data.grid[r][c].block)));
  // 1) Bulbs must not see each other along rows/cols (unless blocked)
  for (let r = 0; r < height; r++) {
    let seen = false;
    for (let c = 0; c < width; c++) {
      if (blocks[r][c]) { seen = false; continue; }
      if (state.bulbs[r][c]) {
        if (seen) return { ok: false, errors: ['Bulbs see each other horizontally'] };
        seen = true;
      }
    }
  }
  for (let c = 0; c < width; c++) {
    let seen = false;
    for (let r = 0; r < height; r++) {
      if (blocks[r][c]) { seen = false; continue; }
      if (state.bulbs[r][c]) {
        if (seen) return { ok: false, errors: ['Bulbs see each other vertically'] };
        seen = true;
      }
    }
  }
  // 2) Numbered black cells must have exactly that many adjacent bulbs
  const dr = [-1, 1, 0, 0];
  const dc = [0, 0, -1, 1];
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    const clue = data.grid[r][c].clue;
    if (typeof clue === 'number') {
      let adj = 0;
      for (let k = 0; k < 4; k++) {
        const rr = r + dr[k], cc = c + dc[k];
        if (rr < 0 || cc < 0 || rr >= height || cc >= width) continue;
        if (state.bulbs[rr][cc]) adj++;
      }
      if (adj !== clue) return { ok: false, errors: ['Clue mismatch'] };
    }
  }
  // 3) All white cells must be lit
  const lit = computeLit(data, state.bulbs);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    if (!data.grid[r][c].block && !lit[r][c]) return { ok: false, errors: ['Unlit cell'] };
  }
  return { ok: true };
}

export const AkariComponent = ({ data, state, onChange, cellPx: cellPxProp, onCellPxChange, showLocalControls = true }: { data: AkariData; state: AkariState; onChange: (next: AkariState) => void; cellPx?: number; onCellPxChange?: (n: number) => void; showLocalControls?: boolean }) => {
  const { width, height } = data;
  const bulbs = useMemo(() => state.bulbs, [state.bulbs]);
  const [cellPxInternal, setCellPxInternal] = useState<number>(() => {
    try { if (typeof window !== 'undefined') { const raw = localStorage.getItem('akari:cellSizePx'); const n = raw ? parseInt(raw, 10) : NaN; if (!Number.isNaN(n) && n >= 16 && n <= 120) return n; } } catch {}
    if (width <= 7 && height <= 7) return 56;
    if (width <= 12 && height <= 12) return 40;
    if (width <= 20 && height <= 20) return 32;
    if (width <= 30 && height <= 30) return 26;
    if (width <= 40 && height <= 40) return 20;
    return 16;
  });
  const cellPx = cellPxProp ?? cellPxInternal;
  const setCellPx = onCellPxChange ?? setCellPxInternal;
  useEffect(() => { try { if (typeof window !== 'undefined') localStorage.setItem('akari:cellSizePx', String(cellPx)); } catch {} }, [cellPx]);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-fit once on mount for large boards: clamp cellPx so full width fits container, then let user adjust
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const avail = container.clientWidth;
    if (!avail || avail <= 0) return;
    const target = Math.max(16, Math.floor((avail - 2) / Math.max(1, width)));
    const isBig = width >= 30 || height >= 30;
    if (isBig && cellPx > target) setCellPx(target);
    // run only once on mount for current size
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lit = useMemo(() => computeLit(data, bulbs), [data, bulbs]);

  const toggleBulb = useCallback((r: number, c: number) => {
    if (data.grid[r][c].block) return;
    const next = bulbs.map((row) => row.slice());
    next[r][c] = !next[r][c];
    onChange({ ...state, bulbs: next, selected: { r, c } });
  }, [bulbs, data.grid, onChange, state]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    if (!active?.dataset?.rc) return;
    const [rStr, cStr] = active.dataset.rc.split(',');
    let r = parseInt(rStr, 10); let c = parseInt(cStr, 10);
    if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    if (e.key === 'ArrowDown') r = Math.min(height - 1, r + 1);
    if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    if (e.key === 'ArrowRight') c = Math.min(width - 1, c + 1);
    const next = document.querySelector(`[data-rc="${r},${c}"]`) as HTMLElement | null; next?.focus();
    if (e.key === ' ' || e.key.toLowerCase() === 'b') { e.preventDefault(); toggleBulb(r, c); }
  }, [height, width, toggleBulb]);

  return (
    <div className="p-2 select-none">
      {showLocalControls && (
        <div className="mb-2 flex items-center gap-3 text-xs text-white/80">
          <label className="flex items-center gap-2"><span>Cell size</span>
            <input type="range" min={8} max={96} step={1} value={cellPx} onChange={(e)=> setCellPx(parseInt(e.target.value, 10))} />
            <span>{cellPx}px</span>
          </label>
          <span className="text-white/60">Scroll to pan · Shift+Scroll to zoom</span>
        </div>
      )}
      <div ref={scrollRef} className="inline-block rounded-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] bg-white/[0.02] overflow-auto max-w-full max-h-[78vh]" onWheel={(e)=>{
        if (e.altKey) { e.preventDefault(); const delta = Math.sign(e.deltaY); const next = Math.max(16, Math.min(120, cellPx - delta*2)); setCellPx(next); }
      }}>
        <div className="relative" onKeyDown={onKeyDown}>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${width}, ${cellPx}px)` }}>
            {Array.from({ length: height }).map((_, r) => (
              Array.from({ length: width }).map((__, c) => {
                const cell = data.grid[r][c];
                const isBlock = Boolean(cell.block);
                const hasClue = typeof cell.clue === 'number';
                const hasBulb = bulbs[r][c];
                const isLit = lit[r][c];
                const thickTop = r % 5 === 0;
                const thickLeft = c % 5 === 0;
                const thickRight = (c + 1) % 5 === 0;
                const thickBottom = (r + 1) % 5 === 0;
                const isSelected = state.selected?.r === r && state.selected?.c === c;
                return (
                  <button
                    key={`${r}-${c}`}
                    data-rc={`${r},${c}`}
                    className={`relative border text-center focus:outline-none transition-colors ${
                      isBlock ? 'bg-neutral-800 border-neutral-700' : 'bg-neutral-900/70 border-neutral-800'
                    }
                    ${thickTop ? 'border-t-2 border-t-white/25' : ''}
                    ${thickLeft ? 'border-l-2 border-l-white/25' : ''}
                    ${thickRight ? 'border-r-2 border-r-white/25' : ''}
                    ${thickBottom ? 'border-b-2 border-b-white/25' : ''}
                    `}
                    style={{ width: cellPx, height: cellPx }}
                    onMouseEnter={() => setHover({ r, c })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => onChange({ ...state, selected: { r, c } })}
                    onClick={(e) => { e.preventDefault(); if (!isBlock) toggleBulb(r, c); }}
                    onContextMenu={(e) => { e.preventDefault(); if (!isBlock) toggleBulb(r, c); }}
                    tabIndex={isBlock ? -1 : 0}
                    aria-label={`Cell ${r + 1},${c + 1}`}
                    aria-selected={isSelected}
                  >
                    {/* Hover row/col overlay (below) */}
                    {hover && (hover.r === r || hover.c === c) && (
                      <div className="absolute inset-0 pointer-events-none bg-white/[0.06]" style={{ zIndex: 10 }} />
                    )}
                    {/* Hover cell border (above lit, below selection) */}
                    {hover && hover.r === r && hover.c === c && (
                      <div className="absolute inset-0 pointer-events-none border-2 border-white/80" style={{ zIndex: 38 }} />
                    )}
                    {/* Lit overlay (above hover) */}
                    {!isBlock && isLit && (
                      <div className="absolute inset-0 pointer-events-none bg-amber-300/25" style={{ zIndex: 20 }} />
                    )}
                    {/* Bulb icon (top) */}
                    {!isBlock && hasBulb && (
                      <span className="absolute inset-0 flex items-center justify-center" aria-hidden style={{ zIndex: 30 }}>
                        <svg viewBox="0 0 24 24" width={Math.floor(cellPx * 0.7)} height={Math.floor(cellPx * 0.7)}>
                          <circle cx="12" cy="12" r="6" fill="#fde68a" stroke="#f59e0b" strokeWidth="2" />
                        </svg>
                      </span>
                    )}
                    {/* Selection border (topmost) */}
                    {!isBlock && isSelected && (
                      <div className="absolute inset-0 pointer-events-none border-2 border-sky-400" style={{ zIndex: 40 }} />
                    )}
                    {/* Clue text */}
                    {isBlock && (
                      <span className="absolute inset-0 flex items-center justify-center text-white/90 font-semibold" style={{ fontSize: Math.floor(cellPx * 0.5), zIndex: 25 }}>
                        {hasClue ? cell.clue : ''}
                      </span>
                    )}
                  </button>
                );
              })
            ))}
          </div>
          {/* Selected crosshair overlay (under lit) */}
          {state.selected && (
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: 15 }}>
              {/* Row highlight */}
              <div style={{
                position: 'absolute',
                top: state.selected.r * cellPx,
                left: 0,
                height: cellPx,
                width: width * cellPx,
                background: 'rgba(125,211,252,0.08)'
              }} />
              {/* Col highlight */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: state.selected.c * cellPx,
                width: cellPx,
                height: height * cellPx,
                background: 'rgba(125,211,252,0.08)'
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const akariPlugin: PuzzlePlugin<AkariData, AkariState> = {
  type: 'akari',
  parse(raw) {
    const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    return JSON.parse(json) as AkariData;
  },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(data) {
    return { bulbs: createEmptyBulbGrid(data.height, data.width), selected: null };
  },
  render(data, state) {
    return function Bound({ onChange }: { onChange: (next: AkariState) => void }) {
      return <AkariComponent data={data} state={state} onChange={onChange} />;
    };
  },
  validateMove(data, state) { return validate(data, state); },
  isSolved(data, state) { return validate(data, state).ok; },
  getHints(data, state) {
    // Simple hint: find an unlit cell with all but one possibility blocked by visibility; suggest placing a bulb
    const lit = computeLit(data, state.bulbs);
    for (let r = 0; r < data.height; r++) for (let c = 0; c < data.width; c++) {
      if (data.grid[r][c].block) continue;
      if (!lit[r][c]) {
        return [{ id: `place-${r}-${c}`, title: `Consider a bulb near ${r + 1},${c + 1}`, body: 'Find a position that lights this cell without creating a conflict.' }];
      }
    }
    return [{ id: 'check-clues', title: 'Check numbered blocks', body: 'Match adjacent bulbs to the clue counts.' }];
  },
  explainStep() { return null; }
};

export default akariPlugin;



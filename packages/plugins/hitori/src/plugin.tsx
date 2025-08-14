"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

export type HitoriData = {
  width: number;
  height: number;
  grid: number[][]; // given numbers
  solution?: number[][]; // optional solved marks (0 white,1 black)
};

export type HitoriState = {
  marks: number[][]; // 0 blank (white), 1 blacked out
  selected?: { r: number; c: number } | null;
};

function createState(data: HitoriData): HitoriState {
  return { marks: Array.from({ length: data.height }, () => Array.from({ length: data.width }, () => 0)), selected: null };
}

function isSolved(data: HitoriData, state: HitoriState): boolean {
  const H = data.height, W = data.width;
  // 1) No adjacent blacks orthogonally
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (state.marks[r][c] === 1) {
    if (r+1<H && state.marks[r+1][c]===1) return false;
    if (c+1<W && state.marks[r][c+1]===1) return false;
  }
  // 2) No duplicate visible numbers in any row/col (consider only white cells)
  for (let r = 0; r < H; r++) {
    const seen = new Set<number>();
    for (let c = 0; c < W; c++) if (state.marks[r][c] !== 1) {
      const v = data.grid[r][c]; if (seen.has(v)) return false; seen.add(v);
    }
  }
  for (let c = 0; c < W; c++) {
    const seen = new Set<number>();
    for (let r = 0; r < H; r++) if (state.marks[r][c] !== 1) {
      const v = data.grid[r][c]; if (seen.has(v)) return false; seen.add(v);
    }
  }
  // 3) All white cells connected orthogonally
  const vis: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  let start: { r: number; c: number } | null = null;
  for (let r = 0; r < H && !start; r++) for (let c = 0; c < W; c++) if (state.marks[r][c] !== 1) { start = { r, c }; break; }
  if (!start) return false;
  const q: Array<{ r: number; c: number }> = [start]; vis[start.r][start.c] = true;
  const dr = [-1,1,0,0], dc = [0,0,-1,1];
  while (q.length) {
    const { r, c } = q.shift()!;
    for (let k = 0; k < 4; k++) {
      const rr = r + dr[k], cc = c + dc[k];
      if (rr<0||cc<0||rr>=H||cc>=W) continue; if (state.marks[rr][cc]===1||vis[rr][cc]) continue;
      vis[rr][cc]=true; q.push({ r: rr, c: cc });
    }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (state.marks[r][c] !== 1 && !vis[r][c]) return false;
  return true;
}

const HitoriCell = memo(function HitoriCell({
  v,
  mark,
  isSelected,
  cellPx,
  thickTop,
  thickLeft,
  thickRight,
  thickBottom,
  conflict,
  adjBad,
  onClick,
  onContextMenu,
}: {
  v: number;
  mark: number;
  isSelected: boolean;
  cellPx: number;
  thickTop: boolean;
  thickLeft: boolean;
  thickRight: boolean;
  thickBottom: boolean;
  conflict: boolean;
  adjBad: boolean;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
}) {
  return (
    <button
      className={`relative border text-center transition-colors ${
        mark === 1 ? 'bg-neutral-800 border-neutral-700' : 'bg-neutral-200 text-neutral-900 border-neutral-300'
      }
      ${thickTop ? 'border-t-2 border-t-white/25' : ''}
      ${thickLeft ? 'border-l-2 border-l-white/25' : ''}
      ${thickRight ? 'border-r-2 border-r-white/25' : ''}
      ${thickBottom ? 'border-b-2 border-b-white/25' : ''}
      `}
      style={{ width: cellPx, height: cellPx }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={`Cell`}
    >
      {/* Conflict indicator for white duplicates */}
      {mark !== 1 && conflict && (
        <div className="absolute inset-0 pointer-events-none bg-red-500/20" style={{ zIndex: 15 }} />
      )}
      {/* Adjacent black error */}
      {mark === 1 && adjBad && (
        <div className="absolute inset-0 pointer-events-none bg-red-500/25" style={{ zIndex: 15 }} />
      )}
      {/* number */}
      <span className={`absolute inset-0 flex items-center justify-center font-semibold ${mark===1 ? 'text-white/60' : 'text-neutral-900'}`} style={{ fontSize: Math.floor(cellPx*0.45), zIndex: 20 }}>
        {v}
      </span>
      {/* selection border */}
      {isSelected && <div className="absolute inset-0 pointer-events-none border-2 border-sky-400" style={{ zIndex: 35 }} />}
    </button>
  );
});

export const HitoriComponent = ({ data, state, onChange }: { data: HitoriData; state: HitoriState; onChange: (next: HitoriState) => void }) => {
  const [cellPx, setCellPx] = useState<number>(50);
  const marks = useMemo(() => state.marks, [state.marks]);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Efficient conflicts and adjacency state with incremental updates
  function computeRowConflicts(r: number, m: number[][]): boolean[] {
    const W = data.width; const out = Array.from({ length: W }, () => false);
    const map: Record<number, number[]> = Object.create(null);
    for (let c = 0; c < W; c++) { if (m[r][c] === 1) continue; const v = data.grid[r][c]; (map[v] ||= []).push(c); }
    for (const key in map) { const arr = map[key]; if (arr.length > 1) for (const c of arr) out[c] = true; }
    return out;
  }
  function computeColConflicts(c: number, m: number[][]): boolean[] {
    const H = data.height; const out = Array.from({ length: H }, () => false);
    const map: Record<number, number[]> = Object.create(null);
    for (let r = 0; r < H; r++) { if (m[r][c] === 1) continue; const v = data.grid[r][c]; (map[v] ||= []).push(r); }
    for (const key in map) { const arr = map[key]; if (arr.length > 1) for (const r of arr) out[r] = true; }
    return out;
  }
  function computeAllConflicts(m: number[][]): boolean[][] {
    const H = data.height, W = data.width; const bad: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
    for (let r = 0; r < H; r++) { const row = computeRowConflicts(r, m); for (let c = 0; c < W; c++) if (row[c]) bad[r][c] = true; }
    for (let c = 0; c < data.width; c++) { const col = computeColConflicts(c, m); for (let r = 0; r < data.height; r++) if (col[r]) bad[r][c] = true; }
    return bad;
  }
  function computeAdj(m: number[][]): boolean[][] {
    const H = data.height, W = data.width; const bad: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (m[r][c] === 1) {
      if (r+1<H && m[r+1][c]===1) { bad[r][c]=true; bad[r+1][c]=true; }
      if (c+1<W && m[r][c+1]===1) { bad[r][c]=true; bad[r][c+1]=true; }
    }
    return bad;
  }

  const [conflicts, setConflicts] = useState<boolean[][]>(() => computeAllConflicts(marks));
  const [adjBlack, setAdjBlack] = useState<boolean[][]>(() => computeAdj(marks));

  // Recompute if dimensions or initial marks change radically
  useEffect(() => {
    setConflicts(computeAllConflicts(marks));
    setAdjBlack(computeAdj(marks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.width, data.height]);

  // conflicts and adjBlack are maintained incrementally via state (setConflicts / setAdjBlack)
  // For very large boards, avoid excessive re-renders by batching state updates
  const batchClick = useRef<number>(0);
  return (
    <div className="select-none">
      <div className="mb-2 flex items-center gap-3 text-xs text-white/80">
        <label className="flex items-center gap-2"><span>Cell</span>
          <input className="w-48 md:w-64" type="range" min={32} max={72} step={4} value={cellPx} onChange={(e)=> setCellPx(parseInt(e.target.value, 10))} />
          <span>{cellPx}px</span>
        </label>
      </div>
      <div className="inline-block rounded-md bg-white/[0.02] overflow-auto max-w-full max-h-[75vh]">
        <div
          ref={gridRef}
          className="relative"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const el = gridRef.current; if (!el) return;
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            const c = Math.floor(x / cellPx); const r = Math.floor(y / cellPx);
            if (r < 0 || c < 0 || r >= data.height || c >= data.width) { if (hover) setHover(null); return; }
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
              if (!hover || hover.r !== r || hover.c !== c) setHover({ r, c });
            });
          }}
          style={{ width: data.width * cellPx, height: data.height * cellPx }}
        >
          <div className="grid" style={{ gridTemplateColumns: `repeat(${data.width}, ${cellPx}px)` }}>
          {Array.from({ length: data.height }).map((_, r) => (
            Array.from({ length: data.width }).map((__, c) => {
              const v = data.grid[r][c];
              const mark = marks[r][c];
              const isSelected = state.selected?.r === r && state.selected?.c === c;
              const thickTop = r % 5 === 0;
              const thickLeft = c % 5 === 0;
              const thickRight = (c + 1) % 5 === 0;
              const thickBottom = (r + 1) % 5 === 0;
              return (
                <HitoriCell
                  key={`${r}-${c}`}
                  v={v}
                  mark={mark}
                  isSelected={isSelected}
                  cellPx={cellPx}
                  thickTop={thickTop}
                  thickLeft={thickLeft}
                  thickRight={thickRight}
                  thickBottom={thickBottom}
                  conflict={conflicts[r]?.[c]}
                  adjBad={adjBlack[r]?.[c]}
                  onClick={() => {
                    const next = marks.slice(); next[r] = next[r].slice(); const was = next[r][c]; next[r][c] = was === 1 ? 0 : 1;
                    onChange({ ...state, marks: next, selected: { r, c } });
                    // Incremental conflicts update for row r and col c (batched for large grids)
                    const doUpdates = () => {
                      setConflicts((prev) => {
                        const out = prev.map((row)=> row.slice());
                        const rowFlags = computeRowConflicts(r, next);
                        for (let cc = 0; cc < data.width; cc++) out[r][cc] = rowFlags[cc];
                        const colFlags = computeColConflicts(c, next);
                        for (let rr = 0; rr < data.height; rr++) out[rr][c] = colFlags[rr] || out[rr][c];
                        for (let rr = 0; rr < data.height; rr++) if (!colFlags[rr] && out[rr][c]) {
                          const rf = computeRowConflicts(rr, next);
                          out[rr][c] = rf[c];
                        }
                        return out;
                      });
                      setAdjBlack((prev) => {
                        const out = prev.map((row)=> row.slice());
                        const H = data.height, W = data.width;
                        const ps = [ [r,c], [r-1,c], [r+1,c], [r,c-1], [r,c+1] ];
                        for (const [rr,cc] of ps) {
                          if (rr<0||cc<0||rr>=H||cc>=W) continue;
                          let bad = false;
                          if (next[rr][cc] === 1) {
                            if (rr+1<H && next[rr+1][cc]===1) bad = true;
                            if (rr-1>=0 && next[rr-1][cc]===1) bad = true;
                            if (cc+1<W && next[rr][cc+1]===1) bad = true;
                            if (cc-1>=0 && next[rr][cc-1]===1) bad = true;
                          }
                          out[rr][cc] = bad;
                        }
                        return out;
                      });
                    };
                    if (data.width * data.height >= 144) {
                      // throttle conflict recompute for 12x12+
                      if (rafRef.current) cancelAnimationFrame(rafRef.current);
                      rafRef.current = requestAnimationFrame(doUpdates);
                    } else {
                      doUpdates();
                    }
                  }}
                  onContextMenu={(e) => { e.preventDefault(); const next = marks.slice(); next[r] = next[r].slice(); next[r][c] = 0; onChange({ ...state, marks: next, selected: { r, c } }); }}
                />
              );
            })
          ))}
          </div>
          {/* Global hover row/col overlays and hover border */}
          {hover && (
            <>
              <div className="pointer-events-none absolute left-0" style={{ top: hover.r * cellPx, height: cellPx, width: data.width * cellPx, background: 'rgba(255,255,255,0.05)', zIndex: 10 }} />
              <div className="pointer-events-none absolute top-0" style={{ left: hover.c * cellPx, width: cellPx, height: data.height * cellPx, background: 'rgba(255,255,255,0.05)', zIndex: 10 }} />
              <div className="pointer-events-none absolute" style={{ top: hover.r * cellPx, left: hover.c * cellPx, width: cellPx, height: cellPx, border: '1px solid rgba(255,255,255,0.8)', zIndex: 30 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const hitoriPlugin: PuzzlePlugin<HitoriData, HitoriState> = {
  type: 'hitori',
  parse(raw) {
    const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    return JSON.parse(json) as HitoriData;
  },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(data) { return createState(data); },
  render(data, state) {
    return function Bound({ onChange }: { onChange: (next: HitoriState) => void }) {
      return <HitoriComponent data={data} state={state} onChange={onChange} />;
    };
  },
  validateMove() { return { ok: true }; },
  isSolved(data, state) { return isSolved(data, state); },
  getHints() { return []; },
  explainStep() { return null; }
};

export default hitoriPlugin;



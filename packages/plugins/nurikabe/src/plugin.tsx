"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { useEffect, useMemo, useRef, useState } from 'react';

export type NurikabeData = {
  width: number;
  height: number;
  // numbers for island sizes; -1 means empty cell
  clues: number[][]; // height x width
  // optional binary solution: 1 = island, 0 = sea
  solution?: number[][];
};

export type NurikabeState = {
  marks: number[][]; // -1 unknown, 0 sea, 1 island
  selected?: { r: number; c: number } | null;
};

function createInitialState(data: NurikabeData): NurikabeState {
  return { marks: Array.from({ length: data.height }, () => Array.from({ length: data.width }, () => -1)), selected: null };
}

// Validation helper: no 2x2 sea blocks (standard Nurikabe rule)
function hasNo2x2Sea(state: NurikabeState): boolean {
  const H = state.marks.length, W = state.marks[0]?.length ?? 0;
  for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
    const a = state.marks[r][c], b = state.marks[r][c + 1], d = state.marks[r + 1][c], e = state.marks[r + 1][c + 1];
    if (a === 0 && b === 0 && d === 0 && e === 0) return false;
  }
  return true;
}

// Validation helper: sea must be one connected region (if fully decided)
function seaConnectedIfDecided(state: NurikabeState): boolean {
  const H = state.marks.length, W = state.marks[0]?.length ?? 0;
  // If any -1 remain, skip strict connectivity to allow early play
  let hasUnknown = false;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (state.marks[r][c] === -1) { hasUnknown = true; break; }
  if (hasUnknown) return true;
  // BFS over sea cells
  const seen: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  let sr = -1, sc = -1, seaCount = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (state.marks[r][c] === 0) { seaCount++; if (sr === -1) { sr = r; sc = c; } }
  if (seaCount === 0) return false;
  const q: Array<{ r: number; c: number }> = [];
  q.push({ r: sr, c: sc }); seen[sr][sc] = true;
  const dr = [-1,1,0,0], dc = [0,0,-1,1];
  let seenCount = 0;
  while (q.length) {
    const { r, c } = q.shift()!; seenCount++;
    for (let k = 0; k < 4; k++) {
      const rr = r + dr[k], cc = c + dc[k];
      if (rr<0||cc<0||rr>=H||cc>=W) continue;
      if (state.marks[rr][cc] !== 0 || seen[rr][cc]) continue;
      seen[rr][cc] = true; q.push({ r: rr, c: cc });
    }
  }
  return seenCount === seaCount;
}

// Validation helper: each island must match its clue count and contain exactly one clue
function islandsValidIfDecided(data: NurikabeData, state: NurikabeState): boolean {
  const H = data.height, W = data.width;
  // If unknowns remain, allow gameplay to continue without strict failure
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (state.marks[r][c] === -1) return true;
  const seen: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const dr = [-1,1,0,0], dc = [0,0,-1,1];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (state.marks[r][c] !== 1 || seen[r][c]) continue;
    const q: Array<{ r: number; c: number }> = [{ r, c }];
    seen[r][c] = true;
    let size = 0;
    const cluesInIsland: number[] = [];
    while (q.length) {
      const cur = q.shift()!; size++;
      const clue = data.clues[cur.r][cur.c];
      if (clue >= 0) cluesInIsland.push(clue);
      for (let k = 0; k < 4; k++) {
        const rr = cur.r + dr[k], cc = cur.c + dc[k];
        if (rr<0||cc<0||rr>=H||cc>=W) continue;
        if (state.marks[rr][cc] !== 1 || seen[rr][cc]) continue;
        seen[rr][cc] = true; q.push({ r: rr, c: cc });
      }
    }
    if (cluesInIsland.length !== 1) return false;
    if (cluesInIsland[0] !== size) return false;
  }
  return true;
}

function isSolved(data: NurikabeData, state: NurikabeState): boolean {
  // All decided, no 2x2 sea, sea connected, islands match clues
  for (let r = 0; r < data.height; r++) for (let c = 0; c < data.width; c++) if (state.marks[r][c] === -1) return false;
  if (!hasNo2x2Sea(state)) return false;
  if (!seaConnectedIfDecided(state)) return false;
  if (!islandsValidIfDecided(data, state)) return false;
  return true;
}

export const NurikabeComponent = ({ data, state, onChange }: { data: NurikabeData; state: NurikabeState; onChange: (next: NurikabeState) => void }) => {
  const [cellPx, setCellPx] = useState<number>(40);
  const [showHints, setShowHints] = useState<boolean>(true);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  useEffect(() => {
    const el = gridRef.current; if (!el) return;
    const onLeave = () => setHover(null);
    el.addEventListener('mouseleave', onLeave);
    return () => el.removeEventListener('mouseleave', onLeave);
  }, []);

  const marks = state.marks;
  const H = data.height, W = data.width;

  const twoByTwoViolation = useMemo(() => !hasNo2x2Sea(state), [state]);
  const sea2x2Mask: boolean[][] = useMemo(() => {
    const out: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
    for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
      if (marks[r][c] === 0 && marks[r][c+1] === 0 && marks[r+1][c] === 0 && marks[r+1][c+1] === 0) {
        out[r][c] = out[r][c+1] = out[r+1][c] = out[r+1][c+1] = true;
      }
    }
    return out;
  }, [H, W, marks]);

  const islandInfo = useMemo(() => {
    const compId: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 0));
    const sizes: number[] = [0];
    const clueCounts: number[] = [0];
    const clueReq: number[] = [0];
    let id = 1;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (marks[r][c] !== 1 || compId[r][c] !== 0) continue;
      const q: Array<[number, number]> = [[r, c]]; compId[r][c] = id; let sz = 0; let clues = 0; let required = 0;
      while (q.length) {
        const [rr, cc] = q.shift()!; sz++;
        const clue = data.clues[rr][cc]; if (clue >= 0) { clues++; required = required === 0 ? clue : required; }
        if (rr>0 && marks[rr-1][cc]===1 && compId[rr-1][cc]===0) { compId[rr-1][cc]=id; q.push([rr-1,cc]); }
        if (rr+1<H && marks[rr+1][cc]===1 && compId[rr+1][cc]===0) { compId[rr+1][cc]=id; q.push([rr+1,cc]); }
        if (cc>0 && marks[rr][cc-1]===1 && compId[rr][cc-1]===0) { compId[rr][cc-1]=id; q.push([rr,cc-1]); }
        if (cc+1<W && marks[rr][cc+1]===1 && compId[rr][cc+1]===0) { compId[rr][cc+1]=id; q.push([rr,cc+1]); }
      }
      sizes[id] = sz; clueCounts[id] = clues; clueReq[id] = required;
      id++;
    }
    return { compId, sizes, clueCounts, clueReq };
  }, [H, W, marks, data.clues]);

  const solved = useMemo(() => isSolved(data, state), [data, state]);

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center gap-3 text-xs text-white/80">
        <label className="flex items-center gap-2"><span>Cell</span>
          <input type="range" min={28} max={68} step={2} value={cellPx} onChange={(e)=> setCellPx(parseInt(e.target.value, 10))} />
          <span className="tabular-nums">{cellPx}px</span>
        </label>
        <button className={`rounded border px-2 py-1 ${showHints? 'border-sky-400/50 bg-sky-500/15 text-sky-300':'border-white/15 bg-white/[0.06] hover:bg-white/[0.09] text-white/80'}`} onClick={()=> setShowHints(v=>!v)}>{showHints? 'Hints: On':'Hints: Off'}</button>
        {twoByTwoViolation && <span className="text-red-300">No 2×2 sea blocks allowed</span>}
        {solved && <span className="text-emerald-300">Solved! 🎉</span>}
      </div>
      <div className="inline-block rounded-xl bg-white/[0.03] overflow-auto max-w-full max-h-[75vh] p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_22px_rgba(0,0,0,0.35)]">
        <div
          ref={gridRef}
          className="relative grid"
          style={{ width: W * cellPx, height: H * cellPx, gridTemplateColumns: `repeat(${W}, ${cellPx}px)` }}
          onMouseMove={(e)=>{
            const el = gridRef.current; if (!el) return; const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            const c = Math.floor(x / cellPx); const r = Math.floor(y / cellPx);
            if (r<0||c<0||r>=H||c>=W) { if (hover) setHover(null); return; }
            setHover({ r, c });
          }}
        >
          {hover && (
            <>
              <div className="pointer-events-none absolute" style={{ left: 0, top: hover.r * cellPx, width: W * cellPx, height: cellPx, background: 'rgba(255,255,255,0.05)', zIndex: 1 }} />
              <div className="pointer-events-none absolute" style={{ left: hover.c * cellPx, top: 0, width: cellPx, height: H * cellPx, background: 'rgba(255,255,255,0.05)', zIndex: 1 }} />
            </>
          )}
          {/* Subtle grid lines */}
          <svg className="absolute inset-0 pointer-events-none" width={W * cellPx} height={H * cellPx} style={{ zIndex: 0 }}>
            <g>
              {Array.from({ length: H + 1 }).map((_, r) => (
                <line key={`r-${r}`} x1={0} y1={r * cellPx} x2={W * cellPx} y2={r * cellPx} stroke={r % 5 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'} strokeWidth={r % 5 === 0 ? 1.5 : 1} />
              ))}
              {Array.from({ length: W + 1 }).map((_, c) => (
                <line key={`c-${c}`} x1={c * cellPx} y1={0} x2={c * cellPx} y2={H * cellPx} stroke={c % 5 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'} strokeWidth={c % 5 === 0 ? 1.5 : 1} />
              ))}
            </g>
          </svg>
          {Array.from({ length: H }).map((_, r) => (
            Array.from({ length: W }).map((__, c) => {
              const clue = data.clues[r][c];
              const mark = marks[r][c];
              const isSel = state.selected?.r === r && state.selected?.c === c;
              const bg = mark === 0 ? 'bg-sky-950' : mark === 1 ? 'bg-emerald-100 text-neutral-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]' : 'bg-white/10';
              const sepColor = mark === 1 ? 'rgba(16,185,129,0.45)' : mark === 0 ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.1)';
              const topDiff = r>0 && marks[r-1][c] !== mark && marks[r-1][c] !== -1 && mark !== -1;
              const leftDiff = c>0 && marks[r][c-1] !== mark && marks[r][c-1] !== -1 && mark !== -1;
              const rightDiff = c+1<W && marks[r][c+1] !== mark && marks[r][c+1] !== -1 && mark !== -1;
              const bottomDiff = r+1<H && marks[r+1][c] !== mark && marks[r+1][c] !== -1 && mark !== -1;

              let clueClass = '';
              if (clue >= 0) {
                const id = islandInfo.compId[r][c];
                const size = id ? islandInfo.sizes[id] : 0;
                const req = clue;
                if (size > req) clueClass = 'text-red-500'; else if (size === req) clueClass = 'text-emerald-600'; else clueClass = 'text-neutral-900';
              }
              return (
                <button
                  key={`${r}-${c}`}
                  className={`relative ${bg} transition-colors focus:outline-none hover:brightness-110`}
                  style={{ width: cellPx, height: cellPx }}
                  onClick={() => {
                    const next = marks.map((row)=> row.slice());
                    next[r][c] = mark === 1 ? 0 : mark === 0 ? -1 : 1; // cycle unknown -> island -> sea -> unknown
                    onChange({ ...state, marks: next, selected: { r, c } });
                  }}
                  onContextMenu={(e)=> { e.preventDefault(); const next = marks.map((row)=> row.slice()); next[r][c] = -1; onChange({ ...state, marks: next, selected: { r, c } }); }}
                  aria-label={`Cell (${r+1},${c+1})`}
                >
                  {clue >= 0 && (
                    <span className={`absolute inset-0 flex items-center justify-center font-semibold ${clueClass}`} style={{ fontSize: Math.floor(cellPx*0.45), zIndex: 10 }}>
                      {clue}
                    </span>
                  )}
                  {showHints && sea2x2Mask[r][c] && marks[r][c] === 0 && (
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(239,68,68,0.18)', zIndex: 8 }} />
                  )}
                  {topDiff && <div className="absolute left-0 right-0" style={{ top: 0, height: Math.max(2, Math.floor(cellPx*0.08)), background: sepColor }} />}
                  {bottomDiff && <div className="absolute left-0 right-0" style={{ bottom: 0, height: Math.max(2, Math.floor(cellPx*0.08)), background: sepColor }} />}
                  {leftDiff && <div className="absolute top-0 bottom-0" style={{ left: 0, width: Math.max(2, Math.floor(cellPx*0.08)), background: sepColor }} />}
                  {rightDiff && <div className="absolute top-0 bottom-0" style={{ right: 0, width: Math.max(2, Math.floor(cellPx*0.08)), background: sepColor }} />}
                  {isSel && <div className="absolute inset-0 pointer-events-none border-2 border-sky-400" />}
                  {showHints && mark === 0 && (
                    <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 2px rgba(56,189,248,0.28)' }} />
                  )}
                </button>
              );
            })
          ))}
        </div>
      </div>
    </div>
  );
};

export const nurikabePlugin: PuzzlePlugin<NurikabeData, NurikabeState> = {
  type: 'nurikabe',
  parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as NurikabeData; },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(data) { return createInitialState(data); },
  render(data, state) {
    return function Bound({ onChange }: { onChange: (next: NurikabeState) => void }) {
      return <NurikabeComponent data={data} state={state} onChange={onChange} />;
    };
  },
  validateMove(_data, state) {
    if (!hasNo2x2Sea(state)) return { ok: false, errors: ['2x2 sea block not allowed'] };
    if (!seaConnectedIfDecided(state)) return { ok: false, errors: ['Sea must be one region (once decided)'] };
    return { ok: true };
  },
  isSolved(data, state) { return isSolved(data, state); },
  getHints(data, state) {
    const hints = [
      { id: 'adjacent-to-clue', title: 'Neighbors of a clue cannot be sea', body: 'Cells orthogonally adjacent to a clue must be island.' },
      { id: 'no-2x2-sea', title: 'No 2×2 sea blocks', body: 'Mark at least one cell as island to break any 2×2 sea.' },
      { id: 'complete-island', title: 'Complete the island', body: 'If an island must grow to reach its clue size, extend it where only one expansion is possible.' }
    ];
    return hints;
  },
  explainStep() { return null; }
};

export default nurikabePlugin;



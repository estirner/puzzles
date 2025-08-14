"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type Island = { r: number; c: number; count: number };
export type Edge = { a: { r: number; c: number }; b: { r: number; c: number }; count: 0 | 1 | 2 };

export type HashiData = {
  width: number;
  height: number;
  islands: Island[];
  // Optional solution edges for reveal/fast-solve
  solution?: Edge[];
};

export type HashiState = {
  edges: Record<string, 0 | 1 | 2>;
  selected?: { r: number; c: number } | null;
};

type Neighbor = { islandIdx: number; dir: 'up' | 'down' | 'left' | 'right' };

// Utilities
function keyIsland(p: { r: number; c: number }): string { return `${p.r},${p.c}`; }
function normEdgeKey(a: { r: number; c: number }, b: { r: number; c: number }): string {
  const aKey = keyIsland(a); const bKey = keyIsland(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function isHorizontal(a: { r: number; c: number }, b: { r: number; c: number }): boolean { return a.r === b.r; }
function isVertical(a: { r: number; c: number }, b: { r: number; c: number }): boolean { return a.c === b.c; }

function between(x: number, a: number, b: number): boolean { const [m, M] = a < b ? [a, b] : [b, a]; return x > m && x < M; }

function edgesCross(a1: { r: number; c: number }, a2: { r: number; c: number }, b1: { r: number; c: number }, b2: { r: number; c: number }): boolean {
  // Only horizontal vs vertical can cross (not sharing endpoints)
  const h1 = isHorizontal(a1, a2) ? [a1, a2] as const : null;
  const v1 = isVertical(a1, a2) ? [a1, a2] as const : null;
  const h2 = isHorizontal(b1, b2) ? [b1, b2] as const : null;
  const v2 = isVertical(b1, b2) ? [b1, b2] as const : null;
  if (h1 && v2) {
    const [hA, hB] = h1; const [vA, vB] = v2;
    if (keyIsland(hA) === keyIsland(vA) || keyIsland(hA) === keyIsland(vB) || keyIsland(hB) === keyIsland(vA) || keyIsland(hB) === keyIsland(vB)) return false;
    return hA.r > Math.min(vA.r, vB.r) && hA.r < Math.max(vA.r, vB.r) && vA.c > Math.min(hA.c, hB.c) && vA.c < Math.max(hA.c, hB.c);
  }
  if (h2 && v1) return edgesCross(b1, b2, a1, a2);
  return false;
}

function computeNeighbors(data: HashiData): Map<number, Neighbor[]> {
  const idxByPos = new Map<string, number>();
  data.islands.forEach((isl, i) => idxByPos.set(keyIsland(isl), i));
  const rows = new Map<number, number[]>() as Map<number, number[]>; // row -> sorted cols indices
  const cols = new Map<number, number[]>() as Map<number, number[]>; // col -> sorted rows indices
  for (let i = 0; i < data.islands.length; i++) {
    const isl = data.islands[i];
    const rc = rows.get(isl.r) || []; rc.push(i); rows.set(isl.r, rc);
    const cc = cols.get(isl.c) || []; cc.push(i); cols.set(isl.c, cc);
  }
  for (const [r, arr] of rows) arr.sort((i, j) => data.islands[i].c - data.islands[j].c);
  for (const [c, arr] of cols) arr.sort((i, j) => data.islands[i].r - data.islands[j].r);
  const neigh = new Map<number, Neighbor[]>();
  for (let i = 0; i < data.islands.length; i++) {
    const isl = data.islands[i];
    const ns: Neighbor[] = [];
    const row = rows.get(isl.r)!; const col = cols.get(isl.c)!;
    const cPos = row.indexOf(i);
    if (cPos > 0) ns.push({ islandIdx: row[cPos - 1], dir: 'left' });
    if (cPos >= 0 && cPos < row.length - 1) ns.push({ islandIdx: row[cPos + 1], dir: 'right' });
    const rPos = col.indexOf(i);
    if (rPos > 0) ns.push({ islandIdx: col[rPos - 1], dir: 'up' });
    if (rPos >= 0 && rPos < col.length - 1) ns.push({ islandIdx: col[rPos + 1], dir: 'down' });
    neigh.set(i, ns);
  }
  return neigh;
}

function degreeAtNeighbors(idx: number, data: HashiData, edges: Record<string, 0 | 1 | 2>, neighbors: Map<number, Neighbor[]>): number {
  const p = data.islands[idx];
  const ns = neighbors.get(idx) || [];
  let d = 0;
  for (const n of ns) {
    const q = data.islands[n.islandIdx];
    const k = normEdgeKey(p, q);
    d += edges[k] || 0;
  }
  return d;
}

function buildEdgeList(edges: Record<string, 0 | 1 | 2>): Array<{ a: { r: number; c: number }; b: { r: number; c: number }; count: 1 | 2 }>{
  const out: Array<{ a: { r: number; c: number }; b: { r: number; c: number }; count: 1 | 2 }> = [];
  for (const [k, v] of Object.entries(edges)) {
    if (!v) continue;
    const [aStr, bStr] = k.split('|');
    const [ar, ac] = aStr.split(',').map(Number); const [br, bc] = bStr.split(',').map(Number);
    out.push({ a: { r: ar, c: ac }, b: { r: br, c: bc }, count: v === 2 ? 2 : 1 });
  }
  return out;
}

function hasCrossing(newA: { r: number; c: number }, newB: { r: number; c: number }, edges: Record<string, 0 | 1 | 2>): boolean {
  const list = buildEdgeList(edges);
  for (const e of list) {
    if (edgesCross(newA, newB, e.a, e.b)) return true;
  }
  return false;
}

function isConnected(data: HashiData, edges: Record<string, 0 | 1 | 2>): boolean {
  if (data.islands.length === 0) return true;
  const adj = new Map<number, number[]>();
  for (let i = 0; i < data.islands.length; i++) adj.set(i, []);
  for (const [k, v] of Object.entries(edges)) {
    if (!v) continue;
    const [aStr, bStr] = k.split('|');
    const [ar, ac] = aStr.split(',').map(Number); const [br, bc] = bStr.split(',').map(Number);
    const ai = data.islands.findIndex((x) => x.r === ar && x.c === ac);
    const bi = data.islands.findIndex((x) => x.r === br && x.c === bc);
    if (ai >= 0 && bi >= 0) { adj.get(ai)!.push(bi); adj.get(bi)!.push(ai); }
  }
  // BFS
  const seen = new Set<number>(); const q: number[] = [0]; seen.add(0);
  while (q.length) {
    const i = q.shift()!;
    for (const j of adj.get(i) || []) if (!seen.has(j)) { seen.add(j); q.push(j); }
  }
  return seen.size === data.islands.length;
}

function validateHashi(data: HashiData, state: HashiState): { ok: boolean; errors?: string[] } {
  const errors: string[] = [];
  const neigh = computeNeighbors(data);
  // 1) No crossings
  const edgesList = buildEdgeList(state.edges);
  for (let i = 0; i < edgesList.length; i++) {
    for (let j = i + 1; j < edgesList.length; j++) {
      if (edgesCross(edgesList[i].a, edgesList[i].b, edgesList[j].a, edgesList[j].b)) {
        errors.push('Bridges cross');
        return { ok: false, errors };
      }
    }
  }
  // 2) Degree constraints not exceeded
  for (let i = 0; i < data.islands.length; i++) {
    const need = data.islands[i].count;
    const have = degreeAtNeighbors(i, data, state.edges, neigh);
    if (have > need) { errors.push('Island overfilled'); return { ok: false, errors }; }
  }
  return { ok: true };
}

export const HashiComponent = ({ data, state, onChange, cellPx: cellPxProp, onCellPxChange }: { data: HashiData; state: HashiState; onChange: (next: HashiState) => void; cellPx?: number; onCellPxChange?: (n: number) => void }) => {
  const neighbors = useMemo(() => computeNeighbors(data), [data]);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [errorFlash, setErrorFlash] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ a: { r: number; c: number }; b: { r: number; c: number } } | null>(null);
  const [cellPxInternal, setCellPxInternal] = useState<number>(() => {
    try { if (typeof window !== 'undefined') { const raw = localStorage.getItem('hashi:cellSizePx'); const n = raw ? parseInt(raw, 10) : NaN; if (!Number.isNaN(n) && n >= 20 && n <= 120) return n; } } catch {}
    const maxDim = Math.max(data.width, data.height);
    if (maxDim <= 8) return 64; if (maxDim <= 12) return 48; if (maxDim <= 20) return 36; return 28;
  });
  const cellPx = cellPxProp ?? cellPxInternal;
  const setCellPx = onCellPxChange ?? setCellPxInternal;
  useEffect(() => { try { if (typeof window !== 'undefined') localStorage.setItem('hashi:cellSizePx', String(cellPx)); } catch {} }, [cellPx]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-fit for very large boards
  useEffect(() => {
    const container = scrollRef.current; if (!container) return;
    const avail = container.clientWidth; if (!avail) return;
    const target = Math.max(20, Math.floor((avail - 8) / Math.max(1, data.width)));
    const isBig = data.width >= 30 || data.height >= 30;
    if (isBig && cellPx > target) setCellPx(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const islByKey = useMemo(() => {
    const m = new Map<string, number>();
    data.islands.forEach((x, i) => m.set(keyIsland(x), i));
    return m;
  }, [data.islands]);

  const getNeighborIfInline = useCallback((a: { r: number; c: number }, b: { r: number; c: number }): number | null => {
    if (a.r === b.r) {
      const row = data.islands.filter((x) => x.r === a.r).sort((p, q) => p.c - q.c);
      const idxA = row.findIndex((x) => x.c === a.c);
      const idxB = row.findIndex((x) => x.c === b.c);
      if (idxA === -1 || idxB === -1) return null;
      const d = Math.sign(idxB - idxA);
      for (let i = idxA + d; i !== idxB; i += d) {
        // If any island sits between, then they are not direct neighbors
        return null;
      }
      const ix = islByKey.get(keyIsland(b));
      return typeof ix === 'number' ? ix : null;
    }
    if (a.c === b.c) {
      const col = data.islands.filter((x) => x.c === a.c).sort((p, q) => p.r - q.r);
      const idxA = col.findIndex((x) => x.r === a.r);
      const idxB = col.findIndex((x) => x.r === b.r);
      if (idxA === -1 || idxB === -1) return null;
      const d = Math.sign(idxB - idxA);
      for (let i = idxA + d; i !== idxB; i += d) return null;
      const ix = islByKey.get(keyIsland(b));
      return typeof ix === 'number' ? ix : null;
    }
    return null;
  }, [data.islands, islByKey]);

  function toggleEdge(a: { r: number; c: number }, b: { r: number; c: number }) {
    const k = normEdgeKey(a, b);
    const prev = state.edges[k] || 0;
    const next = ((prev + 1) % 3) as 0 | 1 | 2;
    if (next > 0) {
      // disallow if would cross
      const temp: Record<string, 0 | 1 | 2> = { ...state.edges, [k]: next };
      if (hasCrossing(a, b, { ...state.edges, [k]: 0 }) || hasCrossing(a, b, temp)) {
        // crossing if adding; revert and flash
        setErrorFlash('cross'); setTimeout(() => setErrorFlash(null), 400);
        return;
      }
    }
    const edges = { ...state.edges, [k]: next };
    onChange({ ...state, edges });
  }

  function setEdgeCount(a: { r: number; c: number }, b: { r: number; c: number }, count: 0 | 1 | 2) {
    const k = normEdgeKey(a, b);
    if (count > 0) {
      const temp: Record<string, 0 | 1 | 2> = { ...state.edges, [k]: count };
      if (hasCrossing(a, b, { ...state.edges, [k]: 0 }) || hasCrossing(a, b, temp)) { setErrorFlash('cross'); setTimeout(()=> setErrorFlash(null), 400); return; }
    }
    const edges = { ...state.edges, [k]: count };
    onChange({ ...state, edges });
  }

  const drawEdge = (e: { a: { r: number; c: number }; b: { r: number; c: number }; count: 1 | 2 }) => {
    const [ar, ac] = [e.a.r, e.a.c]; const [br, bc] = [e.b.r, e.b.c];
    const edgeKey = `${Math.min(ar, br)},${Math.min(ac, bc)}|${Math.max(ar, br)},${Math.max(ac, bc)}`;
    if (ar === br) {
      const row = ar; const c0 = Math.min(ac, bc); const c1 = Math.max(ac, bc);
      const x = (c0 + 0.5) * cellPx; const y = (row + 0.5) * cellPx;
      const w = (c1 - c0) * cellPx;
      const stroke = e.count === 2 ? [ -4, +4 ] : [ 0 ];
      return stroke.map((dy, i) => (
        <div key={`h-${edgeKey}-${i}`} className="absolute bg-white/90" style={{ left: x, top: y + dy - 2, width: w, height: 4, borderRadius: 2 }} />
      ));
    }
    if (ac === bc) {
      const col = ac; const r0 = Math.min(ar, br); const r1 = Math.max(ar, br);
      const x = (col + 0.5) * cellPx; const y = (r0 + 0.5) * cellPx;
      const h = (r1 - r0) * cellPx;
      const stroke = e.count === 2 ? [ -4, +4 ] : [ 0 ];
      return stroke.map((dx, i) => (
        <div key={`v-${edgeKey}-${i}`} className="absolute bg-white/90" style={{ left: x + dx - 2, top: y, width: 4, height: h, borderRadius: 2 }} />
      ));
    }
    return null;
  };

  const edgesList = useMemo(() => buildEdgeList(state.edges), [state.edges]);

  // Selection mechanics: click first island to select, click neighbor to toggle edge; click elsewhere to move selection
  const selected = state.selected ? data.islands.findIndex((x) => x.r === state.selected!.r && x.c === state.selected!.c) : -1;
  const selectIsland = (i: number) => { onChange({ ...state, selected: { r: data.islands[i].r, c: data.islands[i].c } }); };
  const clearSelection = () => { onChange({ ...state, selected: null }); };

  function isNeighbor(aIdx: number, bIdx: number): boolean {
    if (aIdx < 0 || bIdx < 0) return false;
    const ns = neighbors.get(aIdx) || [];
    return ns.some((n) => n.islandIdx === bIdx);
  }

  function handleIslandClick(i: number) {
    if (selected < 0) { selectIsland(i); return; }
    if (selected === i) { clearSelection(); return; }
    if (isNeighbor(selected, i)) {
      toggleEdge(data.islands[selected], data.islands[i]);
      // keep selection on original island for multi-connections convenience
      return;
    }
    selectIsland(i);
  }

  function moveSelection(dir: 'up' | 'down' | 'left' | 'right') {
    if (selected < 0) return;
    const ns = neighbors.get(selected) || [];
    const target = ns.find((n) => n.dir === dir);
    if (target) selectIsland(target.islandIdx);
  }

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); clearSelection(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection('up'); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection('down'); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveSelection('left'); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection('right'); return; }
    if (selected >= 0) {
      const focus = selected;
      const neighborIndexFromHover = () => {
        if (hoverEdge) {
          const aIdx = data.islands.findIndex((x)=> x.r===hoverEdge.a.r && x.c===hoverEdge.a.c);
          const bIdx = data.islands.findIndex((x)=> x.r===hoverEdge.b.r && x.c===hoverEdge.b.c);
          const j = aIdx === focus ? bIdx : bIdx === focus ? aIdx : -1;
          if (j >= 0) return j;
        }
        if (hover) {
          const j = data.islands.findIndex((x) => x.r === hover.r && x.c === hover.c);
          if (j >= 0) return j;
        }
        return -1;
      };
      // Fallback: if no hover, but corridor end has only one neighbor, act on that neighbor
      const fallbackNeighbor = () => {
        const ns = neighbors.get(focus) || [];
        return ns.length === 1 ? ns[0].islandIdx : -1;
      };
      const pickNeighbor = () => {
        const j = neighborIndexFromHover();
        if (j >= 0 && isNeighbor(focus, j)) return j;
        const fb = fallbackNeighbor();
        return fb >= 0 ? fb : -1;
      };
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const j = pickNeighbor();
        if (j >= 0) toggleEdge(data.islands[focus], data.islands[j]);
      }
      if (e.key === '0' || e.key === '1' || e.key === '2') {
        e.preventDefault();
        const j = pickNeighbor();
        if (j >= 0) setEdgeCount(data.islands[focus], data.islands[j], (e.key as any) as 0|1|2);
      }
    } else if ([ 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter' ].includes(e.key)) {
      // If no selection yet, select the first island to activate keyboard mode
      e.preventDefault(); if (data.islands.length > 0) selectIsland(0);
    }
  }, [hover, hoverEdge, selected, neighbors, data.islands, state]);

  return (
    <div className="p-2 select-none">
      <div className="mb-2 flex items-center gap-3 text-xs text-white/80 min-h-6">
        <label className="flex items-center gap-2"><span>Cell size</span>
          <input type="range" min={20} max={120} step={1} value={cellPx} onChange={(e)=> setCellPx(parseInt(e.target.value, 10))} />
          <span className="w-10 text-right tabular-nums">{cellPx}px</span>
        </label>
        <span className="text-white/60">Click between islands to toggle a bridge</span>
      </div>
      <div ref={scrollRef} className={`inline-block rounded-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] bg-white/[0.02] overflow-auto max-w-full max-h-[78vh] ${errorFlash ? 'ring-2 ring-rose-500/60' : ''}`}>
        <div
          ref={containerRef}
          className="relative focus:outline-none"
          tabIndex={0}
          onKeyDown={onKeyDown}
          style={{ width: data.width * cellPx, height: data.height * cellPx }}
        >
          {/* Grid lines */}
          <svg width={data.width * cellPx} height={data.height * cellPx} className="absolute inset-0">
            <g stroke="rgba(255,255,255,0.08)" strokeWidth="1">
              {Array.from({ length: data.height + 1 }).map((_, r) => (
                <line key={`r${r}`} x1={0} y1={r * cellPx} x2={data.width * cellPx} y2={r * cellPx} />
              ))}
              {Array.from({ length: data.width + 1 }).map((_, c) => (
                <line key={`c${c}`} x1={c * cellPx} y1={0} x2={c * cellPx} y2={data.height * cellPx} />
              ))}
            </g>
            {/* Row/Col bands for selected island */}
            {selected >= 0 && (
              <g>
                <rect x={0} y={data.islands[selected].r * cellPx} width={data.width * cellPx} height={cellPx} fill="rgba(125,211,252,0.08)" />
                <rect x={data.islands[selected].c * cellPx} y={0} width={cellPx} height={data.height * cellPx} fill="rgba(125,211,252,0.08)" />
              </g>
            )}
          </svg>
          {/* Edges (bridges) */}
          <div className="absolute inset-0">
            {edgesList.map((e, idx) => (
              <div key={`e${idx}`}>{drawEdge(e)}</div>
            ))}
          </div>
          {/* Click hitboxes between neighbor islands */}
          <div className="absolute inset-0">
            {data.islands.map((isla, i) => {
              const ns = neighbors.get(i) || [];
              return ns.map((nb, k) => {
                const other = data.islands[nb.islandIdx];
                const a = isla; const b = other;
                const kEdge = normEdgeKey(a, b);
                const count = state.edges[kEdge] || 0;
                const left = Math.min(a.c, b.c) * cellPx + (cellPx * 0.5);
                const top = Math.min(a.r, b.r) * cellPx + (cellPx * 0.5);
                const w = Math.abs(a.c - b.c) * cellPx;
                const h = Math.abs(a.r - b.r) * cellPx;
                const style: React.CSSProperties = {
                  left, top, width: Math.max(6, w || 6), height: Math.max(6, h || 6),
                  transform: `translate(${-3}px, ${-3}px)`,
                  cursor: 'pointer'
                };
                return (
                  <div
                    key={`hit-${i}-${k}`}
                    className={`absolute ${count ? 'bg-white/[0.02]' : ''}`}
                    style={style}
                    onMouseEnter={()=> setHoverEdge({ a, b })}
                    onMouseLeave={()=> setHoverEdge(null)}
                    onClick={(e)=>{ e.preventDefault(); containerRef.current?.focus(); toggleEdge(a, b); }}
                    onContextMenu={(e)=>{ e.preventDefault(); const prev = state.edges[kEdge] || 0; const edges = { ...state.edges, [kEdge]: (prev === 0 ? 0 : (prev === 1 ? 0 : 1)) as 0|1|2 }; onChange({ ...state, edges }); }}
                    title={`Toggle bridge between (${a.r+1},${a.c+1}) and (${b.r+1},${b.c+1})`}
                  />
                );
              });
            })}
          </div>
          {/* Islands */}
          {data.islands.map((isla, i) => {
            const have = degreeAtNeighbors(i, data, state.edges, neighbors);
            const need = isla.count;
            const good = have >= need && isConnected(data, state.edges);
            const over = have > need;
            const x = isla.c * cellPx + cellPx * 0.5; const y = isla.r * cellPx + cellPx * 0.5;
            const R = Math.max(12, Math.floor(cellPx * 0.35));
            const isSel = selected === i;
            const isHover = hover && hover.r === isla.r && hover.c === isla.c;
            return (
              <button
                key={`isl-${i}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm focus:outline-none ${over ? 'border-rose-400 bg-rose-500/20' : good ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/40 bg-white/10'} ${isSel ? 'ring-2 ring-sky-400' : ''} ${isHover ? 'bg-white/20' : ''}`}
                style={{ left: x, top: y, width: R * 2, height: R * 2 }}
                onMouseEnter={()=> setHover({ r: isla.r, c: isla.c })}
                onMouseLeave={()=> setHover(null)}
                onClick={(e)=>{ e.preventDefault(); handleIslandClick(i); }}
                aria-label={`Island ${i+1} needs ${need}`}
              >
                <span className={`absolute inset-0 flex items-center justify-center font-bold ${over ? 'text-rose-200' : good ? 'text-emerald-200' : 'text-white/90'}`} style={{ fontSize: Math.max(12, Math.floor(cellPx * 0.45)) }}>{need}</span>
              </button>
            );
          })}
          {/* Hover edge preview (kept in its own layer) */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            {hoverEdge ? drawEdge({ a: hoverEdge.a, b: hoverEdge.b, count: 1 }) : null}
          </div>
        </div>
      </div>
      {/* Keyboard legend / controls */}
      <div className="mt-2 text-xs text-white/70 flex flex-wrap gap-3">
        <span>Arrows: move selection</span>
        <span>Enter/Space: toggle to hovered neighbor</span>
        <span>Esc: clear selection</span>
      </div>
    </div>
  );
};

export const hashiPlugin: PuzzlePlugin<HashiData, HashiState> = {
  type: 'hashi',
  parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as HashiData; },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(_data) { return { edges: {}, selected: null }; },
  render(data, state) {
    return function Bound({ onChange }: { onChange: (next: HashiState) => void }) {
      return <HashiComponent data={data} state={state} onChange={onChange} />;
    };
  },
  validateMove(data, state) { return validateHashi(data, state); },
  isSolved(data, state) {
    // No crossings, all islands meet degree, and connectivity
    const v = validateHashi(data, state); if (!v.ok) return false;
    const neigh = computeNeighbors(data);
    for (let i = 0; i < data.islands.length; i++) if (degreeAtNeighbors(i, data, state.edges, neigh) !== data.islands[i].count) return false;
    return isConnected(data, state.edges);
  },
  getHints(data, state) {
    // Simple deterministic hints
    const neigh = computeNeighbors(data);
    // 1) If island need equals number of neighbors, each neighbor must have at least one bridge
    for (let i = 0; i < data.islands.length; i++) {
      const need = data.islands[i].count; const ns = neigh.get(i) || [];
      const current = degreeAtNeighbors(i, data, state.edges, neigh);
      const remaining = need - current;
      if (remaining <= 0) continue;
      // max capacity = 2 per neighbor
      const maxCap = ns.length * 2;
      if (remaining === ns.length) {
        return [{ id: `one-${i}`, title: `Island ${i + 1}: place at least 1 to each neighbor`, body: 'Remaining degree equals the number of neighbors.' }];
      }
      if (remaining === maxCap) {
        return [{ id: `two-${i}`, title: `Island ${i + 1}: all neighbors are double`, body: 'Remaining degree equals twice the number of neighbors.' }];
      }
    }
    return [{ id: 'scan', title: 'Scan extremes', body: 'Look for high-degree islands or corridors with only one neighbor.' }];
  },
  explainStep() { return null; },
};

export default hashiPlugin;



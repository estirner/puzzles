import type { HashiData, Island, Edge } from './plugin';

export type HashiSize = '7x7' | '10x10' | '12x12' | '15x15' | '20x20' | `${number}x${number}` | { width: number; height: number };

function dims(size: HashiSize): { width: number; height: number } {
  if (typeof size === 'object') return { width: Math.max(3, Math.floor(size.width)), height: Math.max(3, Math.floor(size.height)) };
  if (typeof size === 'string' && size.includes('x')) {
    const [wStr, hStr] = size.split('x');
    const w = Math.max(3, parseInt(wStr, 10));
    const h = Math.max(3, parseInt(hStr, 10));
    if (Number.isFinite(w) && Number.isFinite(h)) return { width: w, height: h };
  }
  switch (size) {
    case '7x7': return { width: 7, height: 7 };
    case '10x10': return { width: 10, height: 10 };
    case '12x12': return { width: 12, height: 12 };
    case '15x15': return { width: 15, height: 15 };
    case '20x20': return { width: 20, height: 20 };
    default: return { width: 15, height: 15 };
  }
}

function normEdgeKey(a: { r: number; c: number }, b: { r: number; c: number }): string {
  const aKey = `${a.r},${a.c}`; const bKey = `${b.r},${b.c}`;
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function edgesCross(a1: { r: number; c: number }, a2: { r: number; c: number }, b1: { r: number; c: number }, b2: { r: number; c: number }): boolean {
  const h1 = a1.r === a2.r ? [a1, a2] as const : null;
  const v1 = a1.c === a2.c ? [a1, a2] as const : null;
  const h2 = b1.r === b2.r ? [b1, b2] as const : null;
  const v2 = b1.c === b2.c ? [b1, b2] as const : null;
  if (h1 && v2) {
    const [hA, hB] = h1; const [vA, vB] = v2;
    if ((hA.r === vA.r && hA.c === vA.c) || (hA.r === vB.r && hA.c === vB.c) || (hB.r === vA.r && hB.c === vA.c) || (hB.r === vB.r && hB.c === vB.c)) return false;
    return hA.r > Math.min(vA.r, vB.r) && hA.r < Math.max(vA.r, vB.r) && vA.c > Math.min(hA.c, hB.c) && vA.c < Math.max(hA.c, hB.c);
  }
  if (h2 && v1) return edgesCross(b1, b2, a1, a2);
  return false;
}

function isConnected(islands: Island[], edges: Record<string, 1 | 2>): boolean {
  if (islands.length === 0) return true;
  const adj = new Map<number, number[]>();
  for (let i = 0; i < islands.length; i++) adj.set(i, []);
  for (const [k, v] of Object.entries(edges)) {
    if (!v) continue;
    const [aStr, bStr] = k.split('|');
    const [ar, ac] = aStr.split(',').map(Number); const [br, bc] = bStr.split(',').map(Number);
    const ai = islands.findIndex((x) => x.r === ar && x.c === ac);
    const bi = islands.findIndex((x) => x.r === br && x.c === bc);
    if (ai >= 0 && bi >= 0) { adj.get(ai)!.push(bi); adj.get(bi)!.push(ai); }
  }
  const seen = new Set<number>(); const q: number[] = [0]; seen.add(0);
  while (q.length) { const i = q.shift()!; for (const j of adj.get(i) || []) if (!seen.has(j)) { seen.add(j); q.push(j); } }
  return seen.size === islands.length;
}

// Simple constructive generator: place islands on a sparse grid and connect using a randomized spanning process with some double bridges.
export function generateHashi(size: HashiSize = '10x10'): HashiData {
  function attempt(): HashiData {
    const { width, height } = dims(size);
    const grid: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
    // Place islands on lattice points to keep neighbor lines clear (avoid adjacent cells)
    const step = Math.max(2, Math.floor(Math.min(width, height) / 5));
    const islands: Island[] = [];
    for (let r = 1; r < height - 1; r += step) {
      for (let c = 1; c < width - 1; c += step) {
        if (Math.random() < 0.7) { islands.push({ r, c, count: 0 }); grid[r][c] = true; }
      }
    }
    if (islands.length < 4) {
      // fallback: place a small plus pattern
      islands.length = 0; const midR = Math.floor(height / 2); const midC = Math.floor(width / 2);
      islands.push({ r: midR, c: midC, count: 0 });
      islands.push({ r: midR, c: Math.max(1, midC - 2), count: 0 });
      islands.push({ r: midR, c: Math.min(width - 2, midC + 2), count: 0 });
      islands.push({ r: Math.max(1, midR - 2), c: midC, count: 0 });
      islands.push({ r: Math.min(height - 2, midR + 2), c: midC, count: 0 });
    }
    // Build nearest neighbors horizontally and vertically
    const byRow = new Map<number, Island[]>(); const byCol = new Map<number, Island[]>();
    for (const isl of islands) {
      const r = byRow.get(isl.r) || []; r.push(isl); r.sort((a, b) => a.c - b.c); byRow.set(isl.r, r);
      const c = byCol.get(isl.c) || []; c.push(isl); c.sort((a, b) => a.r - b.r); byCol.set(isl.c, c);
    }
    const neighbors: Array<{ a: Island; b: Island }>= [];
    for (const row of byRow.values()) for (let i = 0; i < row.length - 1; i++) neighbors.push({ a: row[i], b: row[i + 1] });
    for (const col of byCol.values()) for (let i = 0; i < col.length - 1; i++) neighbors.push({ a: col[i], b: col[i + 1] });

    // Kruskal-like randomized spanning using neighbors to ensure connectivity and no crossings
    const edges: Record<string, 1 | 2> = {};
    function addEdge(a: Island, b: Island, count: 1 | 2): boolean {
      const k = normEdgeKey(a, b);
      if (edges[k]) return false;
      // no crossing with existing edges
      for (const [kk] of Object.entries(edges)) {
        const [as, bs] = kk.split('|'); const [ar, ac] = as.split(',').map(Number); const [br, bc] = bs.split(',').map(Number);
        if (edgesCross({ r: a.r, c: a.c }, { r: b.r, c: b.c }, { r: ar, c: ac }, { r: br, c: bc })) return false;
      }
      edges[k] = count; return true;
    }

    // Simple disjoint set to avoid cycles until we have a spanning structure
    const parent = Array.from({ length: islands.length }, (_, i) => i);
    const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
    const union = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    function idxOf(isl: Island): number { return islands.findIndex((x)=>x.r===isl.r && x.c===isl.c); }

    // Shuffle neighbors
    for (let i = neighbors.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]]; }
    for (const n of neighbors) {
      const ia = idxOf(n.a), ib = idxOf(n.b);
      if (find(ia) !== find(ib)) {
        addEdge(n.a, n.b, Math.random() < 0.25 ? 2 : 1);
        union(ia, ib);
      }
    }
    // Optionally add a few extra non-crossing edges to increase degrees
    for (const n of neighbors) {
      const k = normEdgeKey(n.a, n.b);
      if (!edges[k] && Math.random() < 0.35) addEdge(n.a, n.b, 1);
      if (Object.keys(edges).length > islands.length * 2) break;
    }

    // Compute degree per island and set island counts; cap at 8 and min 1
    const deg = new Map<string, number>();
    for (const isl of islands) deg.set(`${isl.r},${isl.c}`, 0);
    for (const [k, v] of Object.entries(edges)) {
      const [a, b] = k.split('|');
      deg.set(a, (deg.get(a) || 0) + v);
      deg.set(b, (deg.get(b) || 0) + v);
    }
    for (const isl of islands) {
      const d = Math.min(8, Math.max(1, deg.get(`${isl.r},${isl.c}`) || 1));
      isl.count = d as number;
    }

    // Ensure connectivity; if not, link closest components
    if (!isConnected(islands, edges)) {
      // naive: connect random neighbor pairs until connected
      for (const n of neighbors) {
        const k = normEdgeKey(n.a, n.b);
        if (!edges[k]) { edges[k] = 1; if (isConnected(islands, edges)) break; }
      }
    }

    // Serialize edges list for solution
    const solution: Edge[] = Object.entries(edges).map(([k, v]) => {
      const [a, b] = k.split('|'); const [ar, ac] = a.split(',').map(Number); const [br, bc] = b.split(',').map(Number);
      return { a: { r: ar, c: ac }, b: { r: br, c: bc }, count: v } as Edge;
    });

    return { width, height, islands: islands.map((x) => ({ ...x })), solution } as HashiData;
  }

  // Ensure solvability by our solver; retry a few times if necessary
  for (let tries = 0; tries < 10; tries++) {
    const puzzle = attempt();
    const solved = solveHashi(puzzle, 2000);
    if (solved) {
      // Normalize solution onto the puzzle for future reveals
      const edges: Edge[] = Object.entries(solved).map(([k, v]) => {
        const [a, b] = k.split('|'); const [ar, ac] = a.split(',').map(Number); const [br, bc] = b.split(',').map(Number);
        return { a: { r: ar, c: ac }, b: { r: br, c: bc }, count: v as 1|2 } as Edge;
      });
      return { ...puzzle, solution: edges } as HashiData;
    }
  }

  // Fallback: return a small easy puzzle if repeated failures (very unlikely)
  const tiny = attempt();
  return tiny;
}

export type { HashiData };


// -------- Solver (from counts) --------
type EdgeVar = { a: Island; b: Island; key: string; crossing: number[] };

function buildNeighbors(islands: Island[]): Map<number, number[]> {
  const byRow = new Map<number, number[]>(); const byCol = new Map<number, number[]>();
  for (let i = 0; i < islands.length; i++) {
    const isl = islands[i];
    const rr = byRow.get(isl.r) || []; rr.push(i); byRow.set(isl.r, rr);
    const cc = byCol.get(isl.c) || []; cc.push(i); byCol.set(isl.c, cc);
  }
  for (const [r, arr] of byRow) arr.sort((i, j) => islands[i].c - islands[j].c);
  for (const [c, arr] of byCol) arr.sort((i, j) => islands[i].r - islands[j].r);
  const neigh = new Map<number, number[]>();
  for (let i = 0; i < islands.length; i++) neigh.set(i, []);
  for (const arr of byRow.values()) for (let k = 0; k < arr.length; k++) {
    if (k > 0) neigh.get(arr[k])!.push(arr[k - 1]);
    if (k + 1 < arr.length) neigh.get(arr[k])!.push(arr[k + 1]);
  }
  for (const arr of byCol.values()) for (let k = 0; k < arr.length; k++) {
    if (k > 0) neigh.get(arr[k])!.push(arr[k - 1]);
    if (k + 1 < arr.length) neigh.get(arr[k])!.push(arr[k + 1]);
  }
  return neigh;
}

export function solveHashi(puzzle: HashiData, timeoutMs = 2000): Record<string, 0 | 1 | 2> | null {
  const { islands } = puzzle;
  const N = islands.length;
  const neigh = buildNeighbors(islands);
  // Build edge variables for each neighbor pair only once
  const edgeIndex = new Map<string, number>();
  const edges: EdgeVar[] = [];
  for (let u = 0; u < N; u++) {
    for (const v of neigh.get(u) || []) {
      if (u < v) {
        const key = normEdgeKey(islands[u], islands[v]);
        edgeIndex.set(key, edges.length);
        edges.push({ a: islands[u], b: islands[v], key, crossing: [] });
      }
    }
  }
  // Precompute endpoint indices for edges
  const edgeU: number[] = []; const edgeV: number[] = [];
  for (let i = 0; i < edges.length; i++) {
    const u = islands.findIndex((x) => x.r === edges[i].a.r && x.c === edges[i].a.c);
    const v = islands.findIndex((x) => x.r === edges[i].b.r && x.c === edges[i].b.c);
    edgeU[i] = u; edgeV[i] = v;
  }
  // Precompute crossing pairs
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edgesCross(edges[i].a, edges[i].b, edges[j].a, edges[j].b)) {
        edges[i].crossing.push(j); edges[j].crossing.push(i);
      }
    }
  }
  const need: number[] = islands.map((isl) => isl.count);
  const remaining: number[] = [...need];
  const val: (-1 | 0 | 1 | 2)[] = Array.from({ length: edges.length }, () => -1);
  const incident: number[][] = Array.from({ length: N }, () => []);
  for (let i = 0; i < edges.length; i++) {
    const u = islands.findIndex((x) => x.r === edges[i].a.r && x.c === edges[i].a.c);
    const v = islands.findIndex((x) => x.r === edges[i].b.r && x.c === edges[i].b.c);
    incident[u].push(i); incident[v].push(i);
  }
  const maxCap: number[] = Array.from({ length: edges.length }, () => 2);
  const start = Date.now();

  function feasibleDegrees(): boolean {
    // each island's remaining degree must be achievable by its unassigned incident edges
    for (let u = 0; u < N; u++) {
      let cap = 0; let used = 0; let remEdges = 0;
      for (const ei of incident[u]) {
        if (val[ei] > 0) used += val[ei] as (1|2);
        if (val[ei] === -1) { cap += maxCap[ei]; remEdges++; }
      }
      const rem = need[u] - used;
      if (rem < 0) return false; // overfilled
      if (rem > cap) return false; // cannot reach target
      // Optional pruning: if no remaining edges but rem > 0 -> impossible
      if (remEdges === 0 && rem !== 0) return false;
    }
    return true;
  }

  function crosses(ei: number): boolean {
    if (val[ei] <= 0) return false;
    for (const j of edges[ei].crossing) if (val[j] > 0) return true;
    return false;
  }

  function pickEdge(): number {
    // choose unassigned edge with min of combined remaining degree on its endpoints
    let best = -1; let score = 1e9;
    for (let i = 0; i < edges.length; i++) {
      if (val[i] !== -1) continue;
      const u = edgeU[i];
      const v = edgeV[i];
      let ru = need[u]; let rv = need[v];
      for (const ei of incident[u]) if (val[ei] > 0) ru -= val[ei] as (1|2);
      for (const ei of incident[v]) if (val[ei] > 0) rv -= val[ei] as (1|2);
      const s = Math.max(0, ru) + Math.max(0, rv);
      if (s < score) { score = s; best = i; if (s === 0) break; }
    }
    return best;
  }

  let result: Record<string, 0 | 1 | 2> | null = null;

  function dfs(): boolean {
    if (Date.now() - start > timeoutMs) return false; // give up without success
    const idx = pickEdge();
    if (idx < 0) {
      // all edges assigned (as 0 or more); check degrees exact and connectivity
      for (let u = 0; u < N; u++) {
        let sum = 0; for (const ei of incident[u]) if (val[ei] > 0) sum += val[ei] as (1|2);
        if (sum !== need[u]) return false;
      }
      // Extra safety: ensure no crossings among chosen positive edges
      for (let i = 0; i < edges.length; i++) if (val[i] > 0) {
        for (let j = i + 1; j < edges.length; j++) if (val[j] > 0) {
          if (edgesCross(edges[i].a, edges[i].b, edges[j].a, edges[j].b)) return false;
        }
      }
      const map: Record<string, 1 | 2> = {} as any;
      for (let i = 0; i < edges.length; i++) if (val[i] > 0) map[edges[i].key] = val[i] as (1|2);
      if (!isConnected(islands, map)) return false;
      result = {} as any; for (const [k, v] of Object.entries(map)) (result as any)[k] = v as any;
      return true;
    }
    // Try values 2,1,0 (prefer higher to satisfy degrees quickly)
    for (const candidate of [2, 1, 0] as const) {
      val[idx] = candidate;
      if (crosses(idx)) { val[idx] = -1; continue; }
      // If current partial assignment is impossible, backtrack and clear choice
      if (!feasibleDegrees()) { val[idx] = -1; continue; }
      // adjust remaining only when placing positive bridges
      const u = edgeU[idx];
      const v = edgeV[idx];
      if (candidate > 0) { remaining[u] -= candidate; remaining[v] -= candidate; }
      if (dfs()) return true;
      if (candidate > 0) { remaining[u] += candidate; remaining[v] += candidate; }
      // Clear assignment before trying next candidate
      val[idx] = -1;
    }
    return false;
  }

  dfs();
  return result;
}


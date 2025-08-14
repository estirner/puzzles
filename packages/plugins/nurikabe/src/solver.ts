import type { NurikabeData, NurikabeState } from './plugin';

export type SolveResult = number[][] | null; // marks (0 sea, 1 island) or null if timeout/unsolved

function timeNow() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

function copyMarks(m: number[][]): number[][] { return m.map((row) => row.slice()); }

function neighbors4(r: number, c: number, H: number, W: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (r > 0) out.push([r - 1, c]);
  if (r + 1 < H) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c + 1 < W) out.push([r, c + 1]);
  return out;
}

function has2x2Sea(marks: number[][]): boolean {
  const H = marks.length, W = marks[0]?.length ?? 0;
  for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
    if (marks[r][c] === 0 && marks[r][c + 1] === 0 && marks[r + 1][c] === 0 && marks[r + 1][c + 1] === 0) return true;
  }
  return false;
}

function seaConnectedIfDecided(marks: number[][]): boolean {
  const H = marks.length, W = marks[0]?.length ?? 0;
  let hasUnknown = false;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] === -1) hasUnknown = true;
  if (hasUnknown) return true;
  let sr = -1, sc = -1, total = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { if (marks[r][c] === 0) { total++; if (sr === -1) { sr = r; sc = c; } } }
  if (total === 0) return false;
  const seen: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const q: Array<[number, number]> = [[sr, sc]]; seen[sr][sc] = true;
  let cnt = 0;
  while (q.length) {
    const [r, c] = q.shift()!; cnt++;
    for (const [rr, cc] of neighbors4(r, c, H, W)) {
      if (marks[rr][cc] !== 0 || seen[rr][cc]) continue;
      seen[rr][cc] = true; q.push([rr, cc]);
    }
  }
  return cnt === total;
}

function checkIslands(data: NurikabeData, marks: number[][]): boolean {
  const H = data.height, W = data.width;
  // Map islands components and track clues and sizes
  const seen: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (marks[r][c] !== 1 || seen[r][c]) continue;
    let size = 0; const clues: number[] = [];
    const q: Array<[number, number]> = [[r, c]]; seen[r][c] = true;
    while (q.length) {
      const [rr, cc] = q.shift()!; size++;
      const clue = data.clues[rr][cc]; if (clue >= 0) clues.push(clue);
      for (const [ar, ac] of neighbors4(rr, cc, H, W)) {
        if (marks[ar][ac] !== 1 || seen[ar][ac]) continue; seen[ar][ac] = true; q.push([ar, ac]);
      }
    }
    if (clues.length > 1) return false; // multiple clues in an island
    if (clues.length === 1 && size > clues[0]) return false; // over-sized relative to clue
  }
  return true;
}

function allDecided(m: number[][]) { for (const row of m) for (const v of row) if (v === -1) return false; return true; }

function satisfied(data: NurikabeData, marks: number[][]): boolean {
  if (has2x2Sea(marks)) return false;
  if (!seaConnectedIfDecided(marks)) return false;
  if (!checkIslands(data, marks)) return false;
  // If decided, verify island sizes equal clues exactly
  if (allDecided(marks)) {
    const H = data.height, W = data.width;
    const seen: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] === 1 && !seen[r][c]) {
      const q: Array<[number, number]> = [[r, c]]; seen[r][c] = true;
      let size = 0; const clues: number[] = [];
      while (q.length) {
        const [rr, cc] = q.shift()!; size++;
        const clue = data.clues[rr][cc]; if (clue >= 0) clues.push(clue);
        for (const [ar, ac] of neighbors4(rr, cc, H, W)) {
          if (marks[ar][ac] !== 1 || seen[ar][ac]) continue; seen[ar][ac] = true; q.push([ar, ac]);
        }
      }
      if (clues.length !== 1 || clues[0] !== size) return false;
    }
  }
  return true;
}

function chooseCell(data: NurikabeData, marks: number[][]): [number, number] | null {
  const H = marks.length, W = marks[0]?.length ?? 0;
  // heuristic: pick nearest unknown to any clue first
  const unknowns: Array<[number, number]> = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] === -1) unknowns.push([r, c]);
  if (unknowns.length === 0) return null;
  let best: [number, number] | null = null;
  let bestDist = Infinity;
  for (const [r, c] of unknowns) {
    let d = Infinity;
    for (let rr = 0; rr < H; rr++) for (let cc = 0; cc < W; cc++) {
      if (data.clues[rr][cc] >= 0) {
        const man = Math.abs(rr - r) + Math.abs(cc - c);
        if (man < d) d = man;
      }
    }
    if (d < bestDist) { bestDist = d; best = [r, c]; }
  }
  return best;
}

export function solveNurikabe(data: NurikabeData, timeoutMs = 1500, seed?: number): SolveResult {
  const H = data.height, W = data.width;
  const rng = seed != null ? seeded(seed) : Math.random;
  let best: number[][] | null = null;
  const start = timeNow();
  const marks0: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => -1));
  // Set clue cells to island
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (data.clues[r][c] >= 0) marks0[r][c] = 1;

  function dfs(marks: number[][]): boolean {
    if (timeNow() - start > timeoutMs) return false;
    if (!satisfied(data, marks)) return false;
    const pick = chooseCell(data, marks);
    if (!pick) { best = copyMarks(marks); return true; }
    const [r, c] = pick;
    // Try island first if near a clue to accelerate
    const order: number[] = rng() < 0.65 ? [1, 0] : [0, 1];
    for (const v of order) {
      marks[r][c] = v as 0 | 1;
      if (dfs(marks)) return true;
      marks[r][c] = -1;
    }
    return false;
  }
  dfs(marks0);
  return best;
}

function seeded(seed: number) {
  let s = (seed | 0) >>> 0;
  return function rand() {
    // xorshift32
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (s % 0xFFFFFFFF) / 0xFFFFFFFF;
  };
}



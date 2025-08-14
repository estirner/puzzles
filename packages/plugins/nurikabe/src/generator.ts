import type { NurikabeData } from './plugin';

type SizePreset = '7x7' | '10x10' | '12x12' | '15x15' | '20x20' | `${number}x${number}`;

function parseSize(sz: SizePreset | { width: number; height: number }): { width: number; height: number } {
  if (typeof sz === 'string') {
    const m = sz.match(/^(\d+)x(\d+)$/);
    if (!m) throw new Error('Invalid size');
    return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
  }
  return { width: sz.width, height: sz.height };
}

function neighbors4(r: number, c: number, H: number, W: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (r > 0) out.push([r - 1, c]);
  if (r + 1 < H) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c + 1 < W) out.push([r, c + 1]);
  return out;
}

function noOrthIslandAdj(idGrid: number[][], r: number, c: number): boolean {
  const H = idGrid.length, W = idGrid[0]?.length ?? 0;
  for (const [rr, cc] of neighbors4(r, c, H, W)) {
    if (idGrid[rr][cc] > 0) return false;
  }
  return true;
}

function noAdjDifferentIsland(idGrid: number[][], r: number, c: number, islandId: number): boolean {
  const H = idGrid.length, W = idGrid[0]?.length ?? 0;
  for (const [rr, cc] of neighbors4(r, c, H, W)) {
    const id = idGrid[rr][cc];
    if (id > 0 && id !== islandId) return false;
  }
  return true;
}

// Helper: if turning (r,c) into sea would create a 2x2 all-sea block
function wouldCreate2x2Sea(marks: number[][], r: number, c: number): boolean {
  const H = marks.length, W = marks[0]?.length ?? 0;
  for (let dr = -1; dr <= 0; dr++) for (let dc = -1; dc <= 0; dc++) {
    const r0 = r + dr, c0 = c + dc;
    if (r0 < 0 || c0 < 0 || r0 + 1 >= H || c0 + 1 >= W) continue;
    let cnt = 0;
    // consider (r,c) as sea
    cnt += (r0 === r && c0 === c) ? 1 : (marks[r0][c0] === 0 ? 1 : 0);
    cnt += (r0 === r && c0 + 1 === c) ? 1 : (marks[r0][c0 + 1] === 0 ? 1 : 0);
    cnt += (r0 + 1 === r && c0 === c) ? 1 : (marks[r0 + 1][c0] === 0 ? 1 : 0);
    cnt += (r0 + 1 === r && c0 + 1 === c) ? 1 : (marks[r0 + 1][c0 + 1] === 0 ? 1 : 0);
    if (cnt === 4) return true;
  }
  return false;
}

// Carve a connected sea of given size without 2x2 all-sea
function carveSea(width: number, height: number, targetSea: number): number[][] {
  const W = width, H = height;
  const marks: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 1));
  let sr = (Math.random() * H) | 0, sc = (Math.random() * W) | 0;
  marks[sr][sc] = 0; let seaCount = 1;
  const frontier: Array<[number, number]> = [];
  const inFrontier: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const pushNeighbors = (r: number, c: number) => {
    for (const [rr, cc] of neighbors4(r, c, H, W)) {
      if (marks[rr][cc] === 1 && !inFrontier[rr][cc]) { inFrontier[rr][cc] = true; frontier.push([rr, cc]); }
    }
  };
  pushNeighbors(sr, sc);
  let safety = W * H * 30;
  while (seaCount < targetSea && frontier.length && safety-- > 0) {
    const idx = (Math.random() * frontier.length) | 0;
    const [r, c] = frontier.splice(idx, 1)[0];
    inFrontier[r][c] = false;
    if (marks[r][c] === 0) continue;
    if (wouldCreate2x2Sea(marks, r, c)) continue;
    marks[r][c] = 0; seaCount++;
    pushNeighbors(r, c);
  }
  return marks;
}

function seaConnected(marks: number[][]): boolean {
  const H = marks.length, W = marks[0]?.length ?? 0;
  let sr = -1, sc = -1, total = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (marks[r][c] === 0) { total++; if (sr === -1) { sr = r; sc = c; } }
  }
  if (total === 0) return false;
  const seen: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const q: Array<[number, number]> = [];
  q.push([sr, sc]); seen[sr][sc] = true;
  let seenCount = 0;
  while (q.length) {
    const [r, c] = q.shift()!; seenCount++;
    for (const [rr, cc] of neighbors4(r, c, H, W)) {
      if (marks[rr][cc] !== 0 || seen[rr][cc]) continue;
      seen[rr][cc] = true; q.push([rr, cc]);
    }
  }
  return seenCount === total;
}

function no2x2Sea(marks: number[][]): boolean {
  const H = marks.length, W = marks[0]?.length ?? 0;
  for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
    if (marks[r][c] === 0 && marks[r][c + 1] === 0 && marks[r + 1][c] === 0 && marks[r + 1][c + 1] === 0) return false;
  }
  return true;
}

/**
 * Generate a Nurikabe puzzle by sampling a valid solution grid, then placing clues.
 * This generator prioritizes a connected sea and no 2x2 sea blocks.
 */
export function generateNurikabe(size: SizePreset | { width: number; height: number }, opts?: { islandAreaRatio?: number }): NurikabeData {
  const { width: W, height: H } = parseSize(size);
  const islandAreaRatio = Math.min(0.8, Math.max(0.2, opts?.islandAreaRatio ?? 0.55));
  const targetSea = Math.max(1, Math.min(W * H - 1, Math.floor(W * H * (1 - islandAreaRatio))));

  let marks = carveSea(W, H, targetSea);
  // Ensure connectivity by retrying a few times if needed
  let tries = 40;
  while (!seaConnected(marks) && tries-- > 0) marks = carveSea(W, H, targetSea);

  const clues: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => -1));
  const seen: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (marks[r][c] !== 1 || seen[r][c]) continue;
    const comp: Array<[number, number]> = [];
    const q: Array<[number, number]> = [[r, c]]; seen[r][c] = true;
    while (q.length) {
      const [rr, cc] = q.shift()!; comp.push([rr, cc]);
      for (const [ar, ac] of neighbors4(rr, cc, H, W)) if (!seen[ar][ac] && marks[ar][ac] === 1) { seen[ar][ac] = true; q.push([ar, ac]); }
    }
    const pick = comp[(Math.random() * comp.length) | 0];
    clues[pick[0]][pick[1]] = comp.length;
  }
  return { width: W, height: H, clues, solution: marks };
}



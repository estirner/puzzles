import type { AkariData } from './plugin';

// Simple random Akari generator: builds a rectangular grid with some black numbered cells.
// Akari rules: place bulbs in white cells so that every white cell is lit, bulbs don't see each other along rows/cols unless blocked by black cells, and numbered black cells have exactly that many adjacent bulbs.

export type AkariSize = '7x7' | '10x10' | '12x12' | '15x15' | '20x20' | '25x25' | '30x30' | '40x40' | `${number}x${number}` | { width: number; height: number };

export type AkariGenOptions = {
  blockDensity?: number; // 0..1 (~0.14 - 0.24 reasonable)
  clueDensity?: number; // 0..1 (probability a block gets a clue)
  symmetry?: 'none' | 'rotational' | 'mirror';
  requireUnique?: boolean; // try to ensure unique solution (time-limited)
  maxSolveMs?: number; // uniqueness solver time budget
};

function dims(size: AkariSize): { width: number; height: number } {
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
    case '25x25': return { width: 25, height: 25 };
    case '30x30': return { width: 30, height: 30 };
    case '40x40': return { width: 40, height: 40 };
    default: return { width: 15, height: 15 };
  }
}

type Cell = { block?: boolean; clue?: number } | {};

// Helper to compute lighting from bulbs (used for validation)
export function computeLighting(width: number, height: number, bulbs: Array<{ r: number; c: number }>, blocks: boolean[][]): boolean[][] {
  const lit: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (const { r, c } of bulbs) {
    lit[r][c] = true;
    // up
    for (let rr = r - 1; rr >= 0; rr--) { if (blocks[rr][c]) break; lit[rr][c] = true; }
    // down
    for (let rr = r + 1; rr < height; rr++) { if (blocks[rr][c]) break; lit[rr][c] = true; }
    // left
    for (let cc = c - 1; cc >= 0; cc--) { if (blocks[r][cc]) break; lit[r][cc] = true; }
    // right
    for (let cc = c + 1; cc < width; cc++) { if (blocks[r][cc]) break; lit[r][cc] = true; }
  }
  return lit;
}

// Utility: enforce "no 2x2 all blocks"
function violates2x2Blocks(blocks: boolean[][], r: number, c: number): boolean {
  const h = blocks.length, w = blocks[0].length;
  for (let dr of [0, -1]) for (let dc of [0, -1]) {
    const r0 = r + dr, c0 = c + dc; if (r0 < 0 || c0 < 0 || r0 + 1 >= h || c0 + 1 >= w) continue;
    let count = 0; if (blocks[r0][c0]) count++; if (blocks[r0+1][c0]) count++; if (blocks[r0][c0+1]) count++; if (blocks[r0+1][c0+1]) count++;
    if (count === 4) return true;
  }
  return false;
}

// Break long white corridors by inserting blocks (keeps at least 1 white between blocks on both sides)
function capCorridors(blocks: boolean[][], maxLen = 8): void {
  const h = blocks.length, w = blocks[0].length;
  // Rows
  for (let r = 0; r < h; r++) {
    let c = 0;
    while (c < w) {
      while (c < w && blocks[r][c]) c++;
      const start = c;
      while (c < w && !blocks[r][c]) c++;
      const end = c - 1;
      if (end >= start && end - start + 1 > maxLen) {
        const splits = Math.ceil((end - start + 1) / maxLen) - 1;
        for (let i = 1; i <= splits; i++) {
          const pos = Math.max(start + 1, Math.min(end - 1, start + Math.floor((i * (end - start + 1)) / (splits + 1))));
          blocks[r][pos] = true;
        }
      }
    }
  }
  // Cols
  for (let c = 0; c < w; c++) {
    let r = 0;
    while (r < h) {
      while (r < h && blocks[r][c]) r++;
      const start = r;
      while (r < h && !blocks[r][c]) r++;
      const end = r - 1;
      if (end >= start && end - start + 1 > maxLen) {
        const splits = Math.ceil((end - start + 1) / maxLen) - 1;
        for (let i = 1; i <= splits; i++) {
          const pos = Math.max(start + 1, Math.min(end - 1, start + Math.floor((i * (end - start + 1)) / (splits + 1))));
          blocks[pos][c] = true;
        }
      }
    }
  }
}

// Build a block mask using a lattice seed, optional symmetry, and jitter
function buildBlocks(width: number, height: number, density: number, symmetry: 'none' | 'rotational' | 'mirror'): boolean[][] {
  const blocks: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const stepR = Math.max(3, Math.floor(height / 5));
  const stepC = Math.max(3, Math.floor(width / 5));
  const rOffset = 1 + ((Math.random() * (stepR - 1)) | 0);
  const cOffset = 1 + ((Math.random() * (stepC - 1)) | 0);
  // lattice
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    if (((r + rOffset) % stepR === 0) && ((c + cOffset) % stepC === 0)) blocks[r][c] = true;
  }
  // jitter to reach density
  const total = width * height;
  const target = Math.floor(total * density);
  let placed = blocks.flat().filter(Boolean).length;
  let guard = 0;
  function place(r: number, c: number) {
    const set = (rr: number, cc: number) => { if (rr>=0&&cc>=0&&rr<height&&cc<width) blocks[rr][cc] = true; };
    if (blocks[r][c]) return;
    blocks[r][c] = true;
    if (symmetry === 'mirror') set(r, width - 1 - c);
    if (symmetry === 'rotational') set(height - 1 - r, width - 1 - c);
  }
  while (placed < target && guard++ < total * 10) {
    const r = (Math.random() * height) | 0; const c = (Math.random() * width) | 0;
    place(r, c);
    // Disallow 2x2 all blocks
    if (violates2x2Blocks(blocks, r, c)) blocks[r][c] = false; else placed = blocks.flat().filter(Boolean).length;
  }
  capCorridors(blocks, Math.max(6, Math.floor(Math.min(width, height) / 3)));
  return blocks;
}

// Count solutions up to 'limit' (>=1) with a timeout; returns number in [0..limit]
export function countSolutions(puzzle: AkariData, limit = 2, timeoutMs = 200): number {
  const start = Date.now();
  const H = puzzle.height, W = puzzle.width;
  const isBlock = (r: number, c: number) => Boolean(puzzle.grid[r][c].block);
  // Precompute row/col segments
  const rowSegId: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => -1));
  const colSegId: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => -1));
  const rowSegCells: Array<Array<{ r: number; c: number }>> = [];
  const colSegCells: Array<Array<{ r: number; c: number }>> = [];
  for (let r = 0; r < H; r++) {
    let c = 0;
    while (c < W) {
      while (c < W && isBlock(r, c)) c++;
      const startC = c; const cells: Array<{ r: number; c: number }> = [];
      while (c < W && !isBlock(r, c)) { rowSegId[r][c] = rowSegCells.length; cells.push({ r, c }); c++; }
      if (cells.length > 0) rowSegCells.push(cells);
    }
  }
  for (let c = 0; c < W; c++) {
    let r = 0;
    while (r < H) {
      while (r < H && isBlock(r, c)) r++;
      const startR = r; const cells: Array<{ r: number; c: number }> = [];
      while (r < H && !isBlock(r, c)) { colSegId[r][c] = colSegCells.length; cells.push({ r, c }); r++; }
      if (cells.length > 0) colSegCells.push(cells);
    }
  }
  // Clue neighbors
  const clueAt: Array<{ r: number; c: number; need: number; neigh: Array<{ r: number; c: number }> }> = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const clue = puzzle.grid[r][c].clue;
    if (typeof clue === 'number') {
      const neigh: Array<{ r: number; c: number }> = [];
      if (r > 0 && !isBlock(r - 1, c)) neigh.push({ r: r - 1, c });
      if (r + 1 < H && !isBlock(r + 1, c)) neigh.push({ r: r + 1, c });
      if (c > 0 && !isBlock(r, c - 1)) neigh.push({ r, c: c - 1 });
      if (c + 1 < W && !isBlock(r, c + 1)) neigh.push({ r, c: c + 1 });
      clueAt.push({ r, c, need: clue, neigh });
    }
  }
  const bulbs: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const rowUsed: boolean[] = Array.from({ length: rowSegCells.length }, () => false);
  const colUsed: boolean[] = Array.from({ length: colSegCells.length }, () => false);
  const lit: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const clueCount: number[] = clueAt.map(() => 0);

  function canLight(r: number, c: number): Array<{ r: number; c: number }> {
    const cells: Array<{ r: number; c: number }> = [];
    // same row segment
    const rs = rowSegId[r][c]; if (rs >= 0) for (const p of rowSegCells[rs]) if (!bulbs[p.r][p.c] && !rowUsed[rs] && !colUsed[colSegId[p.r][p.c]]) cells.push(p);
    const cs = colSegId[r][c]; if (cs >= 0) for (const p of colSegCells[cs]) if (!bulbs[p.r][p.c] && !rowUsed[rowSegId[p.r][p.c]] && !colUsed[cs]) cells.push(p);
    // dedupe
    const seen = new Set<string>(); const out: Array<{ r: number; c: number }> = [];
    for (const p of cells) { const k = `${p.r},${p.c}`; if (!seen.has(k)) { seen.add(k); out.push(p); } }
    return out;
  }

  function applyBulb(p: { r: number; c: number }, on: boolean): boolean {
    const rs = rowSegId[p.r][p.c]; const cs = colSegId[p.r][p.c];
    if (on) {
      if (rowUsed[rs] || colUsed[cs]) return false;
      rowUsed[rs] = true; colUsed[cs] = true; bulbs[p.r][p.c] = true;
      // update lit
      for (let rr = p.r; rr >= 0; rr--) { if (isBlock(rr, p.c)) break; lit[rr][p.c] = true; }
      for (let rr = p.r + 1; rr < H; rr++) { if (isBlock(rr, p.c)) break; lit[rr][p.c] = true; }
      for (let cc = p.c; cc >= 0; cc--) { if (isBlock(p.r, cc)) break; lit[p.r][cc] = true; }
      for (let cc = p.c + 1; cc < W; cc++) { if (isBlock(p.r, cc)) break; lit[p.r][cc] = true; }
      // clue counts
      for (let i = 0; i < clueAt.length; i++) {
        const cl = clueAt[i];
        if (cl.neigh.some(n => n.r === p.r && n.c === p.c)) clueCount[i] += 1;
      }
      return true;
    } else {
      // backtrack: recompute lit fast by resetting row/col segments is costly; so rebuild lit from scratch (acceptable for small grids in uniqueness check)
      bulbs[p.r][p.c] = false; rowUsed[rs] = false; colUsed[cs] = false;
      for (let i = 0; i < clueAt.length; i++) {
        const cl = clueAt[i]; if (cl.neigh.some(n => n.r === p.r && n.c === p.c)) clueCount[i] -= 1;
      }
      for (let rr = 0; rr < H; rr++) for (let cc = 0; cc < W; cc++) lit[rr][cc] = false;
      for (let rr = 0; rr < H; rr++) for (let cc = 0; cc < W; cc++) if (bulbs[rr][cc]) {
        for (let r2 = rr; r2 >= 0; r2--) { if (isBlock(r2, cc)) break; lit[r2][cc] = true; }
        for (let r2 = rr + 1; r2 < H; r2++) { if (isBlock(r2, cc)) break; lit[r2][cc] = true; }
        for (let c2 = cc; c2 >= 0; c2--) { if (isBlock(rr, c2)) break; lit[rr][c2] = true; }
        for (let c2 = cc + 1; c2 < W; c2++) { if (isBlock(rr, c2)) break; lit[rr][c2] = true; }
      }
      return true;
    }
  }

  function feasibleClues(): boolean {
    for (let i = 0; i < clueAt.length; i++) {
      const cl = clueAt[i]; const have = clueCount[i];
      if (have > cl.need) return false;
      // remaining candidates around the clue (not violating used segments)
      let rem = 0;
      for (const n of cl.neigh) {
        const rs = rowSegId[n.r][n.c]; const cs = colSegId[n.r][n.c];
        if (!bulbs[n.r][n.c] && !rowUsed[rs] && !colUsed[cs]) rem++;
      }
      if (have + rem < cl.need) return false;
    }
    return true;
  }

  let solutions = 0;
  function dfs(): boolean {
    if (Date.now() - start > timeoutMs) return true; // stop due to timeout
    if (solutions >= limit) return true;
    // pick an unlit white cell with fewest options
    let target: { r: number; c: number } | null = null;
    let best = 1e9; let bestCands: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (isBlock(r, c)) continue; if (lit[r][c]) continue;
      const cand = canLight(r, c);
      if (cand.length === 0) return false;
      if (cand.length < best) { best = cand.length; target = { r, c }; bestCands = cand; if (best === 1) break; }
    }
    if (!target) {
      // all white cells lit; verify clues exactly matched
      for (let i = 0; i < clueAt.length; i++) if (clueCount[i] !== clueAt[i].need) return false;
      solutions += 1; return false; // continue search for another solution
    }
    // try candidates
    for (const p of bestCands) {
      if (!applyBulb(p, true)) continue;
      if (feasibleClues() && dfs()) { /* early stop */ }
      applyBulb(p, false);
      if (solutions >= limit || Date.now() - start > timeoutMs) break;
    }
    return false;
  }
  dfs();
  return solutions;
}

export function generateAkari(size: AkariSize = '10x10', opts: AkariGenOptions = {}): AkariData {
  const { width, height } = dims(size);
  const targetBlockRatio = typeof opts.blockDensity === 'number' ? Math.min(0.3, Math.max(0.08, opts.blockDensity)) : (Math.min(0.22, Math.max(0.14, Math.log10(Math.max(10, width * height)) * 0.045)));
  const symmetry = opts.symmetry || 'none';
  const clueDensity = typeof opts.clueDensity === 'number' ? Math.min(1, Math.max(0, opts.clueDensity)) : 0.6;
  // Build blocks
  let blocks = buildBlocks(width, height, targetBlockRatio, symmetry);
  // Ensure no 2x2 all blocks anywhere (should already hold)
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (violates2x2Blocks(blocks, r, c)) blocks[r][c] = false;

  // Greedy solution bulbs that fully light grid (we keep this as solution)
  const bulbs: Array<{ r: number; c: number }> = [];
  const lit = computeLighting(width, height, [], blocks);
  function seesBulb(r: number, c: number): boolean {
    for (let rr = r - 1; rr >= 0; rr--) { if (blocks[rr][c]) break; if (bulbs.some(b => b.r === rr && b.c === c)) return true; }
    for (let rr = r + 1; rr < height; rr++) { if (blocks[rr][c]) break; if (bulbs.some(b => b.r === rr && b.c === c)) return true; }
    for (let cc = c - 1; cc >= 0; cc--) { if (blocks[r][cc]) break; if (bulbs.some(b => b.r === r && b.c === cc)) return true; }
    for (let cc = c + 1; cc < width; cc++) { if (blocks[r][cc]) break; if (bulbs.some(b => b.r === r && b.c === cc)) return true; }
    return false;
  }
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    if (blocks[r][c]) continue;
    if (!lit[r][c] && !seesBulb(r, c)) {
      bulbs.push({ r, c });
      const newLit = computeLighting(width, height, [ { r, c } ], blocks);
      for (let rr = 0; rr < height; rr++) for (let cc = 0; cc < width; cc++) lit[rr][cc] = lit[rr][cc] || newLit[rr][cc];
    }
  }
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (!blocks[r][c] && !lit[r][c]) {
    bulbs.push({ r, c });
    const newLit = computeLighting(width, height, [ { r, c } ], blocks);
    for (let rr = 0; rr < height; rr++) for (let cc = 0; cc < width; cc++) lit[rr][cc] = lit[rr][cc] || newLit[rr][cc];
  }

  // Build puzzle grid (blocks + clues)
  const grid: Cell[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ({})));
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (blocks[r][c]) (grid[r][c] as any).block = true;
  function assignClues(prob: number) {
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
      if (!blocks[r][c]) continue;
      if (Math.random() > prob) { (grid[r][c] as any).clue = undefined; continue; }
      let adj = 0; if (r > 0 && bulbs.some(b => b.r === r - 1 && b.c === c)) adj++;
      if (r + 1 < height && bulbs.some(b => b.r === r + 1 && b.c === c)) adj++;
      if (c > 0 && bulbs.some(b => b.r === r && b.c === c - 1)) adj++;
      if (c + 1 < width && bulbs.some(b => b.r === r && b.c === c + 1)) adj++;
      (grid[r][c] as any).clue = adj;
    }
  }
  assignClues(clueDensity);

  // Optional uniqueness attempt for smaller boards
  if (opts.requireUnique && width * height <= 400) {
    const budget = typeof opts.maxSolveMs === 'number' ? Math.max(50, opts.maxSolveMs) : 250;
    let attempts = 0; let ok = false; let prob = clueDensity;
    while (attempts++ < 5) {
      const data: AkariData = { width, height, grid: grid.map(row => row.map(cell => ({ ...(cell as any) }))) };
      const cnt = countSolutions(data, 2, budget);
      if (cnt === 1) { ok = true; break; }
      // Increase clue density and retry a few times
      prob = Math.min(1, prob + 0.1);
      assignClues(prob);
    }
    // ok or not, we proceed with current grid
  }

  // Embed solution for faster reveal/solve usage
  const solution: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  for (const b of bulbs) solution[b.r][b.c] = true;
  return { width, height, grid: grid.map(row => row.map(cell => ({ ...(cell as any) }))), solution } as AkariData;
}

export type { AkariData };

// Solve and return one bulbs grid (true for bulb) or null if not found within time budget
export function solveAkari(puzzle: AkariData, timeoutMs = 1500): boolean[][] | null {
  const start = Date.now();
  const H = puzzle.height, W = puzzle.width;
  const isBlock = (r: number, c: number) => Boolean(puzzle.grid[r][c].block);
  // Precompute row/col segments
  const rowSegId: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => -1));
  const colSegId: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => -1));
  const rowSegCells: Array<Array<{ r: number; c: number }>> = [];
  const colSegCells: Array<Array<{ r: number; c: number }>> = [];
  for (let r = 0; r < H; r++) {
    let c = 0;
    while (c < W) {
      while (c < W && isBlock(r, c)) c++;
      const cells: Array<{ r: number; c: number }> = [];
      while (c < W && !isBlock(r, c)) { rowSegId[r][c] = rowSegCells.length; cells.push({ r, c }); c++; }
      if (cells.length > 0) rowSegCells.push(cells);
    }
  }
  for (let c = 0; c < W; c++) {
    let r = 0;
    while (r < H) {
      while (r < H && isBlock(r, c)) r++;
      const cells: Array<{ r: number; c: number }> = [];
      while (r < H && !isBlock(r, c)) { colSegId[r][c] = colSegCells.length; cells.push({ r, c }); r++; }
      if (cells.length > 0) colSegCells.push(cells);
    }
  }
  // Clue neighbors
  const clueAt: Array<{ r: number; c: number; need: number; neigh: Array<{ r: number; c: number }> }> = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const clue = puzzle.grid[r][c].clue;
    if (typeof clue === 'number') {
      const neigh: Array<{ r: number; c: number }> = [];
      if (r > 0 && !isBlock(r - 1, c)) neigh.push({ r: r - 1, c });
      if (r + 1 < H && !isBlock(r + 1, c)) neigh.push({ r: r + 1, c });
      if (c > 0 && !isBlock(r, c - 1)) neigh.push({ r, c: c - 1 });
      if (c + 1 < W && !isBlock(r, c + 1)) neigh.push({ r, c: c + 1 });
      clueAt.push({ r, c, need: clue, neigh });
    }
  }
  const bulbs: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const lit: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const rowUsed: boolean[] = Array.from({ length: rowSegCells.length }, () => false);
  const colUsed: boolean[] = Array.from({ length: colSegCells.length }, () => false);
  const clueCount: number[] = clueAt.map(() => 0);

  function canLight(r: number, c: number): Array<{ r: number; c: number }> {
    const cells: Array<{ r: number; c: number }> = [];
    const rs = rowSegId[r][c]; if (rs >= 0 && !rowUsed[rs]) for (const p of rowSegCells[rs]) if (!bulbs[p.r][p.c]) cells.push(p);
    const cs = colSegId[r][c]; if (cs >= 0 && !colUsed[cs]) for (const p of colSegCells[cs]) if (!bulbs[p.r][p.c]) cells.push(p);
    const seen = new Set<string>(); const out: Array<{ r: number; c: number }> = [];
    for (const p of cells) { const k = `${p.r},${p.c}`; if (!seen.has(k)) { seen.add(k); out.push(p); } }
    return out;
  }

  function applyBulb(p: { r: number; c: number }, on: boolean): void {
    const rs = rowSegId[p.r][p.c]; const cs = colSegId[p.r][p.c];
    if (on) {
      rowUsed[rs] = true; colUsed[cs] = true; bulbs[p.r][p.c] = true;
      for (let rr = p.r; rr >= 0; rr--) { if (isBlock(rr, p.c)) break; lit[rr][p.c] = true; }
      for (let rr = p.r + 1; rr < H; rr++) { if (isBlock(rr, p.c)) break; lit[rr][p.c] = true; }
      for (let cc = p.c; cc >= 0; cc--) { if (isBlock(p.r, cc)) break; lit[p.r][cc] = true; }
      for (let cc = p.c + 1; cc < W; cc++) { if (isBlock(p.r, cc)) break; lit[p.r][cc] = true; }
      for (let i = 0; i < clueAt.length; i++) { const cl = clueAt[i]; if (cl.neigh.some(n => n.r === p.r && n.c === p.c)) clueCount[i] += 1; }
    } else {
      bulbs[p.r][p.c] = false; rowUsed[rs] = false; colUsed[cs] = false;
      for (let i = 0; i < clueAt.length; i++) { const cl = clueAt[i]; if (cl.neigh.some(n => n.r === p.r && n.c === p.c)) clueCount[i] -= 1; }
      for (let rr = 0; rr < H; rr++) for (let cc = 0; cc < W; cc++) lit[rr][cc] = false;
      for (let rr = 0; rr < H; rr++) for (let cc = 0; cc < W; cc++) if (bulbs[rr][cc]) {
        for (let r2 = rr; r2 >= 0; r2--) { if (isBlock(r2, cc)) break; lit[r2][cc] = true; }
        for (let r2 = rr + 1; r2 < H; r2++) { if (isBlock(r2, cc)) break; lit[r2][cc] = true; }
        for (let c2 = cc; c2 >= 0; c2--) { if (isBlock(rr, c2)) break; lit[rr][c2] = true; }
        for (let c2 = cc + 1; c2 < W; c2++) { if (isBlock(rr, c2)) break; lit[rr][c2] = true; }
      }
    }
  }

  function feasibleClues(): boolean {
    for (let i = 0; i < clueAt.length; i++) {
      const cl = clueAt[i]; const have = clueCount[i];
      if (have > cl.need) return false;
      let rem = 0;
      for (const n of cl.neigh) {
        const rs = rowSegId[n.r][n.c]; const cs = colSegId[n.r][n.c];
        if (!bulbs[n.r][n.c] && !rowUsed[rs] && !colUsed[cs]) rem++;
      }
      if (have + rem < cl.need) return false;
    }
    return true;
  }

  let found: boolean[][] | null = null;
  function dfs(): boolean {
    if (Date.now() - start > timeoutMs) return true;
    // choose an unlit white cell with fewest options
    let target: { r: number; c: number } | null = null;
    let best = 1e9; let bestCands: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (isBlock(r, c) || lit[r][c]) continue;
      const cand = canLight(r, c);
      if (cand.length === 0) return false;
      if (cand.length < best) { best = cand.length; target = { r, c }; bestCands = cand; if (best === 1) break; }
    }
    if (!target) {
      // all white cells lit and now verify clues exact
      for (let i = 0; i < clueAt.length; i++) if (clueCount[i] !== clueAt[i].need) return false;
      found = bulbs.map(row => row.slice());
      return true;
    }
    for (const p of bestCands) {
      const rs = rowSegId[p.r][p.c]; const cs = colSegId[p.r][p.c];
      if (rowUsed[rs] || colUsed[cs]) continue;
      applyBulb(p, true);
      if (feasibleClues() && dfs()) return true;
      applyBulb(p, false);
      if (Date.now() - start > timeoutMs) break;
    }
    return false;
  }
  dfs();
  return found;
}



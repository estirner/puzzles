import type { HitoriData } from './plugin';

// ---- Utilities ----
function latinSquare(n: number): number[][] {
  const grid: number[][] = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => 1 + ((r + c) % n)));
  return grid;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Create a randomized Latin square by permuting rows, columns, and symbols
function randomizedLatinSquare(n: number): number[][] {
  const base = latinSquare(n);
  const rowOrder = shuffleInPlace(Array.from({ length: n }, (_, i) => i));
  const colOrder = shuffleInPlace(Array.from({ length: n }, (_, i) => i));
  const symOrder = shuffleInPlace(Array.from({ length: n }, (_, i) => i + 1));
  const out: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = base[rowOrder[r]][colOrder[c]];
      out[r][c] = symOrder[v - 1];
    }
  }
  return out;
}

function deepCopy<T>(arr: T[][]): T[][] { return arr.map((row) => row.slice()); }

// Introduce duplicates by copying neighbor values with some probability
function introduceDuplicates(grid: number[][], prob = 0.22): number[][] {
  const n = grid.length;
  const out = deepCopy(grid);
  // Mix of local neighbor copies and row/col copies
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (Math.random() < prob) {
        const op = Math.random();
        if (op < 0.55) {
          // local neighbor
          const neighbors = [
            r > 0 ? { r: r - 1, c } : null,
            r + 1 < n ? { r: r + 1, c } : null,
            c > 0 ? { r, c: c - 1 } : null,
            c + 1 < n ? { r, c: c + 1 } : null,
          ].filter(Boolean) as Array<{ r: number; c: number }>;
          if (neighbors.length) {
            const pick = neighbors[(Math.random() * neighbors.length) | 0];
            out[r][c] = out[pick.r][pick.c];
          }
        } else if (op < 0.8) {
          // copy from same row random column
          const cc = (Math.random() * n) | 0;
          out[r][c] = out[r][cc];
        } else {
          // copy from same column random row
          const rr = (Math.random() * n) | 0;
          out[r][c] = out[rr][c];
        }
      }
    }
  }
  return out;
}

function densityToProb(density?: 'sparse' | 'normal' | 'dense' | number): number {
  if (typeof density === 'number') return Math.max(0.05, Math.min(0.6, density));
  const roll = Math.random();
  if (density === 'sparse') {
    return 0.10 + roll * 0.12; // 10% - 22%
  }
  if (density === 'dense') {
    return 0.28 + roll * 0.20; // 28% - 48%
  }
  // normal
  return 0.18 + roll * 0.18; // 18% - 36%
}

// ---- Fast constructive generator for larger sizes ----
function whitesConnected(m: number[][]): boolean {
  const H = m.length, W = m[0].length;
  let start: { r: number; c: number } | null = null;
  for (let r = 0; r < H && !start; r++) for (let c = 0; c < W; c++) if (m[r][c] !== 1) { start = { r, c }; break; }
  if (!start) return false;
  const vis: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const q: Array<{ r: number; c: number }> = [start];
  vis[start.r][start.c] = true;
  const dr = [-1, 1, 0, 0], dc = [0, 0, -1, 1];
  while (q.length) {
    const { r, c } = q.shift()!;
    for (let k = 0; k < 4; k++) {
      const rr = r + dr[k], cc = c + dc[k];
      if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
      if (m[rr][cc] === 1 || vis[rr][cc]) continue;
      vis[rr][cc] = true; q.push({ r: rr, c: cc });
    }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (m[r][c] !== 1 && !vis[r][c]) return false;
  return true;
}

function canBlack(m: number[][], r: number, c: number): boolean {
  const H = m.length, W = m[0].length;
  if (m[r][c] === 1) return false;
  if (r > 0 && m[r - 1][c] === 1) return false;
  if (r + 1 < H && m[r + 1][c] === 1) return false;
  if (c > 0 && m[r][c - 1] === 1) return false;
  if (c + 1 < W && m[r][c + 1] === 1) return false;
  return true;
}

function generateMaskFast(n: number, density?: 'sparse' | 'normal' | 'dense' | number): number[][] {
  const H = n, W = n;
  const marks: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 0));
  const ratio = typeof density === 'number'
    ? Math.max(0.10, Math.min(0.38, density))
    : density === 'sparse'
      ? 0.16
      : density === 'dense'
        ? 0.30
        : 0.22;
  const target = Math.floor(H * W * ratio);
  let blacks = 0;
  const maxTries = H * W * 8;
  for (let t = 0; t < maxTries && blacks < target; t++) {
    const r = (Math.random() * H) | 0;
    const c = (Math.random() * W) | 0;
    if (!canBlack(marks, r, c)) continue;
    marks[r][c] = 1;
    if (!whitesConnected(marks)) { marks[r][c] = 0; continue; }
    blacks += 1;
  }
  // If too few blacks placed, greedily scan and place safely
  if (blacks < target) {
    outer: for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (blacks >= target) break outer;
      if (!canBlack(marks, r, c)) continue;
      marks[r][c] = 1;
      if (!whitesConnected(marks)) { marks[r][c] = 0; continue; }
      blacks += 1;
    }
  }
  return marks;
}

function introduceDuplicatesWithMask(base: number[][], marks: number[][]): number[][] {
  const H = base.length, W = base[0].length;
  const out = deepCopy(base);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (marks[r][c] !== 1) continue;
      const useRow = Math.random() < 0.65;
      if (useRow) {
        const candidates: number[] = [];
        for (let cc = 0; cc < W; cc++) if (cc !== c && marks[r][cc] === 0) candidates.push(out[r][cc]);
        if (candidates.length) out[r][c] = candidates[(Math.random() * candidates.length) | 0];
      } else {
        const candidates: number[] = [];
        for (let rr = 0; rr < H; rr++) if (rr !== r && marks[rr][c] === 0) candidates.push(out[rr][c]);
        if (candidates.length) out[r][c] = candidates[(Math.random() * candidates.length) | 0];
      }
    }
  }
  return out;
}

function generateFastWithEmbeddedSolution(size: number, density?: 'sparse' | 'normal' | 'dense' | number): HitoriData {
  const marks = generateMaskFast(size, density);
  const base = randomizedLatinSquare(size);
  const grid = introduceDuplicatesWithMask(base, marks);
  return { width: size, height: size, grid, solution: marks };
}

// ---- Solver for uniqueness check ----
// Count solutions up to limit. Returns number in [0..limit]
export function countHitoriSolutions(data: HitoriData, limit = 2, timeoutMs = 1000): number {
  const start = Date.now();
  const H = data.height, W = data.width;
  const marks: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => -1)); // -1 unknown, 0 white, 1 black

  // Track whites per (row, value) and (col, value)
  const maxVal = Math.max(...data.grid.flat());
  const rowWhite: number[][] = Array.from({ length: H }, () => Array.from({ length: maxVal + 1 }, () => 0));
  const colWhite: number[][] = Array.from({ length: W }, () => Array.from({ length: maxVal + 1 }, () => 0));

  // Helper checks
  function canBeBlack(r: number, c: number): boolean {
    if (r > 0 && marks[r - 1][c] === 1) return false;
    if (r + 1 < H && marks[r + 1][c] === 1) return false;
    if (c > 0 && marks[r][c - 1] === 1) return false;
    if (c + 1 < W && marks[r][c + 1] === 1) return false;
    return true;
  }
  function canBeWhite(r: number, c: number): boolean {
    const v = data.grid[r][c];
    if (rowWhite[r][v] >= 1) return false;
    if (colWhite[c][v] >= 1) return false;
    return true;
  }

  // Compute domain for a cell
  function domain(r: number, c: number): { w: boolean; b: boolean; size: number; score: number } {
    const v = data.grid[r][c];
    const w = canBeWhite(r, c);
    const b = canBeBlack(r, c);
    let dupRow = 0, dupCol = 0;
    for (let cc = 0; cc < W; cc++) if (cc !== c && data.grid[r][cc] === v) dupRow++;
    for (let rr = 0; rr < H; rr++) if (rr !== r && data.grid[rr][c] === v) dupCol++;
    const score = dupRow + dupCol;
    return { w, b, size: (w?1:0) + (b?1:0), score };
  }

  // Choose next cell with MRV, tie-breaker by duplicates score
  function pickNext(): { r: number; c: number } | null {
    let best: { r: number; c: number } | null = null;
    let bestSize = 3;
    let bestScore = -1;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] === -1) {
      const d = domain(r, c);
      if (d.size === 0) return { r, c }; // dead end, force prune soon
      if (d.size < bestSize || (d.size === bestSize && d.score > bestScore)) {
        bestSize = d.size; bestScore = d.score; best = { r, c };
      }
    }
    return best;
  }

  function propagate(assignments: Array<{ r: number; c: number }>): boolean {
    let changed = true;
    while (changed) {
      if (Date.now() - start > timeoutMs) return true;
      changed = false;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] === -1) {
        const d = domain(r, c);
        if (d.size === 0) return false; // contradiction
        if (d.size === 1) {
          if (d.w) {
            const v = data.grid[r][c];
            marks[r][c] = 0; rowWhite[r][v] += 1; colWhite[c][v] += 1; assignments.push({ r, c });
          } else if (d.b) {
            marks[r][c] = 1; assignments.push({ r, c });
          }
          changed = true;
        }
      }
    }
    return true;
  }

  function fullyConnected(): boolean {
    const vis: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
    let start: { r: number; c: number } | null = null;
    for (let r = 0; r < H && !start; r++) for (let c = 0; c < W; c++) if (marks[r][c] !== 1) { start = { r, c }; break; }
    if (!start) return false;
    const q: Array<{ r: number; c: number }> = [start]; vis[start.r][start.c] = true;
    const dr = [-1,1,0,0], dc = [0,0,-1,1];
    while (q.length) {
      const { r, c } = q.shift()!;
      for (let k = 0; k < 4; k++) { const rr = r + dr[k], cc = c + dc[k]; if (rr<0||cc<0||rr>=H||cc>=W) continue; if (marks[rr][cc]===1||vis[rr][cc]) continue; vis[rr][cc]=true; q.push({ r: rr, c: cc }); }
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] !== 1 && !vis[r][c]) return false;
    return true;
  }

  let solutions = 0;
  function dfs(): boolean {
    if (solutions >= limit) return true;
    if (Date.now() - start > timeoutMs) return true;
    // Propagate forced decisions
    const propagated: Array<{ r: number; c: number }> = [];
    if (!propagate(propagated)) {
      // revert
      for (let i = propagated.length - 1; i >= 0; i--) {
        const { r, c } = propagated[i];
        if (marks[r][c] === 0) { const v = data.grid[r][c]; rowWhite[r][v] -= 1; colWhite[c][v] -= 1; }
        marks[r][c] = -1;
      }
      return false;
    }
    const pick = pickNext();
    if (!pick) {
      if (fullyConnected()) solutions += 1;
      // revert propagation before returning
      for (let i = propagated.length - 1; i >= 0; i--) {
        const { r, c } = propagated[i];
        if (marks[r][c] === 0) { const v = data.grid[r][c]; rowWhite[r][v] -= 1; colWhite[c][v] -= 1; }
        marks[r][c] = -1;
      }
      return false;
    }
    const { r, c } = pick;
    const v = data.grid[r][c];
    // Branch order: try white first (prefers resolving duplicates), then black
    if (canBeWhite(r, c)) {
      marks[r][c] = 0; rowWhite[r][v] += 1; colWhite[c][v] += 1;
      dfs();
      rowWhite[r][v] -= 1; colWhite[c][v] -= 1; marks[r][c] = -1;
      if (solutions >= limit || Date.now() - start > timeoutMs) {
        for (let i = propagated.length - 1; i >= 0; i--) {
          const { r: rr, c: cc } = propagated[i];
          if (marks[rr][cc] === 0) { const vv = data.grid[rr][cc]; rowWhite[rr][vv] -= 1; colWhite[cc][vv] -= 1; }
          marks[rr][cc] = -1;
        }
        return true;
      }
    }
    if (canBeBlack(r, c)) {
      marks[r][c] = 1;
      dfs();
      marks[r][c] = -1;
      if (solutions >= limit || Date.now() - start > timeoutMs) {
        for (let i = propagated.length - 1; i >= 0; i--) {
          const { r: rr, c: cc } = propagated[i];
          if (marks[rr][cc] === 0) { const vv = data.grid[rr][cc]; rowWhite[rr][vv] -= 1; colWhite[cc][vv] -= 1; }
          marks[rr][cc] = -1;
        }
        return true;
      }
    }
    // revert propagation before backing out
    for (let i = propagated.length - 1; i >= 0; i--) {
      const { r: rr, c: cc } = propagated[i];
      if (marks[rr][cc] === 0) { const vv = data.grid[rr][cc]; rowWhite[rr][vv] -= 1; colWhite[cc][vv] -= 1; }
      marks[rr][cc] = -1;
    }
    return false;
  }
  dfs();
  return solutions;
}

export function generateHitori(
  size: number = 8,
  attempts: number = 120,
  options?: { density?: 'sparse' | 'normal' | 'dense' | number }
): HitoriData {
  const density = options?.density;
  const useUniqueCheck = size <= 10;
  const timeBudgetUnique = Math.max(1200, Math.min(20000, 1000 + size * size * 40));
  const solveBudget = Math.max(5000, Math.min(40000, 6000 + size * size * 80));
  // For larger sizes, use a constructive generator that embeds a valid solution quickly
  if (size >= 10) {
    // Try a few attempts to avoid local unlucky picks
    for (let t = 0; t < 3; t++) {
      const data = generateFastWithEmbeddedSolution(size, density);
      // spot-validate connectivity/adjacency quickly
      if (whitesConnected(data.solution!)) return data;
    }
    const data = generateFastWithEmbeddedSolution(size, density);
    return data;
  }
  // Try a number of variations and require a computed solution (and uniqueness for small sizes)
  const maxAttempts = useUniqueCheck ? attempts : Math.max(30, Math.min(80, Math.ceil(attempts * 0.5)));
  for (let t = 0; t < maxAttempts; t++) {
    const base = randomizedLatinSquare(size);
    const dupProb = densityToProb(density) * (0.95 + Math.random() * 0.1); // small jitter
    const grid = introduceDuplicates(base, dupProb);
    const data: HitoriData = { width: size, height: size, grid };
    if (useUniqueCheck) {
      const cnt = countHitoriSolutions(data, 2, timeBudgetUnique);
      if (cnt !== 1) continue;
    }
    const sol = solveHitori(data, solveBudget);
    if (sol) return { ...data, solution: sol };
  }
  // Escalate search: more tries with slightly higher density and same/greater budgets
  const escalatedTries = useUniqueCheck ? Math.max(150, Math.min(400, 120 + size * 10)) : Math.max(100, Math.min(250, 80 + size * 10));
  for (let t = 0; t < escalatedTries; t++) {
    const base = randomizedLatinSquare(size);
    const grid = introduceDuplicates(base, densityToProb(density) * 1.08);
    const data: HitoriData = { width: size, height: size, grid };
    const sol = solveHitori(data, solveBudget + Math.floor(size * size * 20));
    if (sol) return { ...data, solution: sol };
  }
  // Final attempt: fix one candidate and invest a larger budget to extract a solution for embedding
  const finalGrid = introduceDuplicates(randomizedLatinSquare(size), densityToProb(density));
  const finalData: HitoriData = { width: size, height: size, grid: finalGrid };
  const finalBudget = Math.max(solveBudget, 12000 + size * size * 120);
  const finalSol = solveHitori(finalData, finalBudget);
  if (finalSol) return { ...finalData, solution: finalSol };
  // Last resort: return any instance (may lack embedded solution)
  return finalData as HitoriData;
}

export type { HitoriData };

// Solve a Hitori puzzle; returns marks grid (0 white, 1 black) or null if not found in time
export function solveHitori(data: HitoriData, timeoutMs = 2000): number[][] | null {
  const start = Date.now();
  const H = data.height, W = data.width;
  const marks: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => -1));
  const maxVal = Math.max(...data.grid.flat());
  const rowWhite: number[][] = Array.from({ length: H }, () => Array.from({ length: maxVal + 1 }, () => 0));
  const colWhite: number[][] = Array.from({ length: W }, () => Array.from({ length: maxVal + 1 }, () => 0));

  function canBeBlack(r: number, c: number): boolean {
    if (r > 0 && marks[r - 1][c] === 1) return false;
    if (r + 1 < H && marks[r + 1][c] === 1) return false;
    if (c > 0 && marks[r][c - 1] === 1) return false;
    if (c + 1 < W && marks[r][c + 1] === 1) return false;
    return true;
  }
  function canBeWhite(r: number, c: number): boolean {
    const v = data.grid[r][c];
    if (rowWhite[r][v] >= 1) return false;
    if (colWhite[c][v] >= 1) return false;
    return true;
  }
  function fullyConnected(): boolean {
    const vis: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
    let startCell: { r: number; c: number } | null = null;
    for (let r = 0; r < H && !startCell; r++) for (let c = 0; c < W; c++) if (marks[r][c] !== 1) { startCell = { r, c }; break; }
    if (!startCell) return false;
    const q: Array<{ r: number; c: number }> = [startCell]; vis[startCell.r][startCell.c] = true;
    const dr = [-1,1,0,0], dc = [0,0,-1,1];
    while (q.length) {
      const { r, c } = q.shift()!;
      for (let k = 0; k < 4; k++) {
        const rr = r + dr[k], cc = c + dc[k];
        if (rr<0||cc<0||rr>=H||cc>=W) continue; if (marks[rr][cc]===1||vis[rr][cc]) continue;
        vis[rr][cc]=true; q.push({ r: rr, c: cc });
      }
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] !== 1 && !vis[r][c]) return false;
    return true;
  }

  function domain(r: number, c: number): { w: boolean; b: boolean; size: number; score: number } {
    const v = data.grid[r][c];
    const w = canBeWhite(r, c);
    const b = canBeBlack(r, c);
    let dupRow = 0, dupCol = 0;
    for (let cc = 0; cc < W; cc++) if (cc !== c && data.grid[r][cc] === v) dupRow++;
    for (let rr = 0; rr < H; rr++) if (rr !== r && data.grid[rr][c] === v) dupCol++;
    const score = dupRow + dupCol;
    return { w, b, size: (w?1:0) + (b?1:0), score };
  }

  function pickNext(): { r: number; c: number } | null {
    let best: { r: number; c: number } | null = null;
    let bestSize = 3;
    let bestScore = -1;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] === -1) {
      const d = domain(r, c);
      if (d.size === 0) return { r, c };
      if (d.size < bestSize || (d.size === bestSize && d.score > bestScore)) {
        bestSize = d.size; bestScore = d.score; best = { r, c };
      }
    }
    return best;
  }

  function propagate(assignments: Array<{ r: number; c: number }>): boolean {
    let changed = true;
    while (changed) {
      if (Date.now() - start > timeoutMs) return true;
      changed = false;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (marks[r][c] === -1) {
        const d = domain(r, c);
        if (d.size === 0) return false;
        if (d.size === 1) {
          if (d.w) {
            const v = data.grid[r][c];
            marks[r][c] = 0; rowWhite[r][v] += 1; colWhite[c][v] += 1; assignments.push({ r, c });
          } else if (d.b) {
            marks[r][c] = 1; assignments.push({ r, c });
          }
          changed = true;
        }
      }
    }
    return true;
  }

  let solved: number[][] | null = null;
  function dfs(): boolean {
    if (Date.now() - start > timeoutMs) return true;
    const propagated: Array<{ r: number; c: number }>= [];
    if (!propagate(propagated)) {
      for (let i = propagated.length - 1; i >= 0; i--) {
        const { r, c } = propagated[i];
        if (marks[r][c] === 0) { const v = data.grid[r][c]; rowWhite[r][v] -= 1; colWhite[c][v] -= 1; }
        marks[r][c] = -1;
      }
      return false;
    }
    const pick = pickNext();
    if (!pick) {
      if (fullyConnected()) { solved = marks.map((row)=> row.map((v)=> v === -1 ? 0 : v)); }
      for (let i = propagated.length - 1; i >= 0; i--) {
        const { r, c } = propagated[i];
        if (marks[r][c] === 0) { const v = data.grid[r][c]; rowWhite[r][v] -= 1; colWhite[c][v] -= 1; }
        marks[r][c] = -1;
      }
      return Boolean(solved);
    }
    const { r, c } = pick; const v = data.grid[r][c];
    // Try white then black
    if (canBeWhite(r, c)) {
      marks[r][c] = 0; rowWhite[r][v] += 1; colWhite[c][v] += 1;
      if (dfs()) return true;
      rowWhite[r][v] -= 1; colWhite[c][v] -= 1; marks[r][c] = -1;
      if (Date.now() - start > timeoutMs) {
        for (let i = propagated.length - 1; i >= 0; i--) {
          const { r: rr, c: cc } = propagated[i];
          if (marks[rr][cc] === 0) { const vv = data.grid[rr][cc]; rowWhite[rr][vv] -= 1; colWhite[cc][vv] -= 1; }
          marks[rr][cc] = -1;
        }
        return Boolean(solved);
      }
    }
    if (canBeBlack(r, c)) {
      marks[r][c] = 1;
      if (dfs()) return true;
      marks[r][c] = -1;
    }
    for (let i = propagated.length - 1; i >= 0; i--) {
      const { r: rr, c: cc } = propagated[i];
      if (marks[rr][cc] === 0) { const vv = data.grid[rr][cc]; rowWhite[rr][vv] -= 1; colWhite[cc][vv] -= 1; }
      marks[rr][cc] = -1;
    }
    return false;
  }
  dfs();
  return solved;
}



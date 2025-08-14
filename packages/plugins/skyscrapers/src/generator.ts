import type { SkyscrapersData } from './plugin';

export type SkyscrapersDifficulty = 'easy' | 'medium' | 'hard';

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

function generateLatinSquare(n: number): number[][] {
  const base = Array.from({ length: n }, (_, i) => i + 1);
  const rows: number[][] = [];
  for (let r = 0; r < n; r++) rows.push(base.map((_, c) => ((c + r) % n) + 1));
  const rp = shuffle(Array.from({ length: n }, (_, i) => i));
  const cp = shuffle(Array.from({ length: n }, (_, i) => i));
  const permRows = rp.map((ri) => rows[ri]);
  const grid = Array.from({ length: n }, (_, r) => cp.map((ci) => permRows[r][ci]));
  return grid;
}

function visibleCount(line: number[]): number { let m = 0, k = 0; for (const h of line) { if (h > m) { m = h; k++; } } return k; }
function visibleSum(line: number[]): number { let m = 0, s = 0; for (const h of line) { if (h > m) { m = h; s += h; } } return s; }

function cluesFromSolution(sol: number[][], mode: 'count' | 'sum') {
  const n = sol.length;
  const top: number[] = []; const bottom: number[] = []; const left: number[] = []; const right: number[] = [];
  const vis = mode === 'sum' ? visibleSum : visibleCount;
  for (let c = 0; c < n; c++) {
    const col = Array.from({ length: n }, (_, r) => sol[r][c]);
    top[c] = vis(col);
    bottom[c] = vis([...col].reverse());
  }
  for (let r = 0; r < n; r++) {
    const row = sol[r];
    left[r] = vis(row);
    right[r] = vis([...row].reverse());
  }
  return { top, bottom, left, right };
}

function maskClues(clues: { top: number[]; bottom: number[]; left: number[]; right: number[] }, difficulty: SkyscrapersDifficulty) {
  const { top, bottom, left, right } = clues;
  const n = top.length;
  // keep more clues for easier puzzles
  const keepRatio = difficulty === 'easy' ? 0.9 : difficulty === 'medium' ? 0.65 : 0.45;
  function mask(arr: number[]): number[] {
    return arr.map((v) => (Math.random() < keepRatio ? v : 0));
  }
  return { top: mask(top), bottom: mask(bottom), left: mask(left), right: mask(right) };
}

export function generateSkyscrapers(size: 4 | 5 | 6 | 7, difficulty: SkyscrapersDifficulty = 'easy', mode: 'count' | 'sum' = 'count'): SkyscrapersData {
  const n = size;
  const solution = generateLatinSquare(n);
  const fullClues = cluesFromSolution(solution, mode);
  const masked = maskClues(fullClues, difficulty);
  return {
    size: n,
    top: masked.top,
    bottom: masked.bottom,
    left: masked.left,
    right: masked.right,
    mode: { visibility: mode },
    solution,
  };
}



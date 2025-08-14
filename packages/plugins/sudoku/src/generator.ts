import type { SudokuData } from './plugin';
import { getSudoku } from 'sudoku-gen';

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

function createEmptyGrid(): number[][] {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCandidates(grid: number[][], r: number, c: number): number[] {
  if (grid[r][c] !== 0) return [];
  const used = new Set<number>();
  for (let i = 0; i < 9; i++) {
    used.add(grid[r][i]);
    used.add(grid[i][c]);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++)
    for (let cc = bc; cc < bc + 3; cc++) used.add(grid[rr][cc]);
  const list: number[] = [];
  for (let n = 1; n <= 9; n++) if (!used.has(n)) list.push(n);
  return list;
}

function findEmptyCell(grid: number[][]): { r: number; c: number } | null {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) if (grid[r][c] === 0) return { r, c };
  return null;
}

function cloneGrid(grid: number[][]): number[][] {
  return grid.map((row) => row.slice());
}

// Backtracking solver; when countLimit is 2, we stop as soon as we find >1 solutions
function countSolutions(grid: number[][], countLimit = 2): number {
  const empty = findEmptyCell(grid);
  if (!empty) return 1;
  const { r, c } = empty;
  const candidates = shuffle(getCandidates(grid, r, c));
  let count = 0;
  for (const n of candidates) {
    grid[r][c] = n;
    count += countSolutions(grid, countLimit);
    if (count >= countLimit) {
      grid[r][c] = 0;
      return count;
    }
  }
  grid[r][c] = 0;
  return count;
}

function solve(grid: number[][]): boolean {
  const empty = findEmptyCell(grid);
  if (!empty) return true;
  const { r, c } = empty;
  const candidates = shuffle(getCandidates(grid, r, c));
  for (const n of candidates) {
    grid[r][c] = n;
    if (solve(grid)) return true;
  }
  grid[r][c] = 0;
  return false;
}

function generateFullSolution(): number[][] {
  const grid = createEmptyGrid();
  // Seed with a shuffled first row to diversify solutions
  const firstRow = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let c = 0; c < 9; c++) grid[0][c] = firstRow[c];
  if (!solve(grid)) {
    // Fallback if rare failure
    return generateFullSolution();
  }
  return grid;
}

function targetGivensForDifficulty(diff: Difficulty): number {
  const ranges: Record<Difficulty, [number, number]> = {
    easy: [38, 45],
    medium: [32, 37],
    hard: [26, 31],
    expert: [22, 26],
  };
  const [min, max] = ranges[diff];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function minDistributionThresholds(diff: Difficulty): { box: number; row: number; col: number } {
  switch (diff) {
    case 'easy': return { box: 4, row: 3, col: 3 };
    case 'medium': return { box: 3, row: 2, col: 2 };
    case 'hard': return { box: 2, row: 1, col: 1 };
    case 'expert': return { box: 1, row: 0, col: 0 };
  }
}

function boxIndex(r: number, c: number): number { return Math.floor(r / 3) * 3 + Math.floor(c / 3); }

function hasUniqueSolution(puzzleGrid: number[][]): boolean {
  const grid = cloneGrid(puzzleGrid);
  const solutions = countSolutions(grid, 2);
  return solutions === 1;
}

function toSudokuDataFromGrid(grid: number[][]): SudokuData {
  const givens: Array<{ r: number; c: number; v: number }> = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] !== 0) givens.push({ r, c, v: grid[r][c] });
  return { size: 9, givens } as SudokuData;
}

export function generateSudoku(difficulty: Difficulty): SudokuData {
  const { puzzle } = getSudoku(difficulty);
  const givens: Array<{ r: number; c: number; v: number }> = [];
  for (let i = 0; i < 81; i++) {
    const ch = puzzle[i];
    if (ch && ch !== '-') {
      const v = Number(ch);
      if (!Number.isNaN(v) && v >= 1 && v <= 9) givens.push({ r: Math.floor(i / 9), c: i % 9, v });
    }
  }
  return { size: 9, givens } as SudokuData;
}

export type { Difficulty };



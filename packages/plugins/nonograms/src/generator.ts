import type { NonogramsData } from './plugin';

export type NonogramSize = '5x5' | '10x10' | '15x15' | '20x20';
export type NonogramDensity = 'sparse' | 'normal' | 'dense';

function dimsForSize(size: NonogramSize): { width: number; height: number } {
  switch (size) {
    case '5x5': return { width: 5, height: 5 };
    case '10x10': return { width: 10, height: 10 };
    case '15x15': return { width: 15, height: 15 };
    case '20x20': return { width: 20, height: 20 };
  }
}

function probForDensity(density: NonogramDensity): number {
  switch (density) {
    case 'sparse': return 0.33;
    case 'normal': return 0.45;
    case 'dense': return 0.58;
  }
}

function runsFromLine(line: number[]): number[] {
  const runs: number[] = [];
  let count = 0;
  for (const v of line) { if (v === 1) count++; else if (count > 0) { runs.push(count); count = 0; } }
  if (count > 0) runs.push(count);
  return runs;
}

function ensureNotEmpty(line: number[], p: number): void {
  if (line.some((v) => v === 1)) return;
  // force one random cell to 1 so the row/col isn't completely empty
  const idx = Math.floor(Math.random() * line.length);
  line[idx] = Math.random() < Math.max(0.5, p) ? 1 : 1;
}

export function generateNonogram(size: NonogramSize = '10x10', density: NonogramDensity = 'normal'): NonogramsData {
  const { width, height } = dimsForSize(size);
  const p = probForDensity(density);
  // Create a random binary grid with the given density
  const g: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => (Math.random() < p ? 1 : 0)));
  // Avoid fully empty rows/columns for more interesting puzzles
  for (let r = 0; r < height; r++) ensureNotEmpty(g[r], p);
  for (let c = 0; c < width; c++) {
    const col = Array.from({ length: height }, (_, r) => g[r][c]);
    ensureNotEmpty(col, p);
    for (let r = 0; r < height; r++) g[r][c] = col[r];
  }
  // Build clues
  const rows: number[][] = [];
  const cols: number[][] = [];
  for (let r = 0; r < height; r++) {
    const rr = runsFromLine(g[r]);
    rows.push(rr.length ? rr : []);
  }
  for (let c = 0; c < width; c++) {
    const col = Array.from({ length: height }, (_, r) => g[r][c]);
    const cc = runsFromLine(col);
    cols.push(cc.length ? cc : []);
  }
  return { rows, cols, solution: g.map((r) => r.slice()) } as NonogramsData;
}

export type { NonogramsData };



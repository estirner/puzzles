import type { NonogramsData } from './plugin';

function generateLinePossibilities(length: number, runs: number[]): number[][] {
  if (!runs || runs.length === 0) {
    return [Array.from({ length }, () => 0)];
  }
  const k = runs.length;
  const minLen = runs.reduce((a, b) => a + b, 0) + (k - 1);
  if (minLen > length) return [];
  const free = length - minLen;
  const results: number[][] = [];

  // distribute `free` among k+1 gaps (leading, between runs, trailing)
  function distribute(idx: number, acc: number[]): void {
    if (idx === k + 1) {
      const gaps = acc; // length k+1, sum to free
      const line: number[] = [];
      // leading gap
      for (let z = 0; z < gaps[0]; z++) line.push(0);
      for (let i = 0; i < k; i++) {
        for (let o = 0; o < runs[i]; o++) line.push(1);
        if (i < k - 1) {
          // required separator zero + extra gap
          line.push(0);
          for (let z = 0; z < gaps[i + 1]; z++) line.push(0);
        }
      }
      // trailing gap
      for (let z = 0; z < gaps[k]; z++) line.push(0);
      if (line.length === length) results.push(line);
      return;
    }
    const used = acc.reduce((a, b) => a + b, 0);
    const remain = free - used;
    for (let g = 0; g <= remain; g++) distribute(idx + 1, [...acc, g]);
  }
  distribute(0, []);
  return results;
}

export function solveNonogram(data: NonogramsData): number[][] | null {
  if (data.solution && data.solution.length) {
    return data.solution.map((r) => r.slice());
  }
  const height = data.rows.length;
  const width = data.cols.length;
  const rowPoss: number[][][] = data.rows.map((r) => generateLinePossibilities(width, r));
  const colPossInitial: number[][][] = data.cols.map((c) => generateLinePossibilities(height, c));
  if (rowPoss.some((p) => p.length === 0) || colPossInitial.some((p) => p.length === 0)) return null;

  const grid: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));

  function dfs(rowIndex: number, colPoss: number[][][]): boolean {
    if (rowIndex === height) return true;
    // simple heuristic: try the row with fewest possibilities next
    const rowOrder: number[] = Array.from({ length: height }, (_, i) => i);
    // reorder so current rowIndex stays consistent
    // but we can just scan in order for now
    for (const pattern of rowPoss[rowIndex]) {
      // Check columns compatibility and build next colPoss
      const nextColPoss: number[][][] = Array.from({ length: width }, (_, c) => []);
      let ok = true;
      for (let c = 0; c < width; c++) {
        const keep: number[][] = [];
        for (const poss of colPoss[c]) {
          if (poss[rowIndex] === pattern[c]) keep.push(poss);
        }
        if (keep.length === 0) { ok = false; break; }
        nextColPoss[c] = keep;
      }
      if (!ok) continue;
      // apply row pattern
      for (let c = 0; c < width; c++) grid[rowIndex][c] = pattern[c];
      if (dfs(rowIndex + 1, nextColPoss)) return true;
    }
    return false;
  }

  const success = dfs(0, colPossInitial);
  return success ? grid.map((r) => r.slice()) : null;
}

export { generateLinePossibilities };



import type { KenKenData, KenKenOp } from './plugin';

export type Difficulty = 'easy' | 'medium' | 'hard';

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateLatinSquare(n: number): number[][] {
  const base = Array.from({ length: n }, (_, i) => i + 1);
  const rows: number[][] = [];
  let offset = 0;
  for (let r = 0; r < n; r++) {
    const row = base.map((_, c) => ((c + offset) % n) + 1);
    rows.push(row);
    offset = (offset + 1) % n;
  }
  // random row/col permutations to diversify
  const rp = shuffle(Array.from({ length: n }, (_, i) => i));
  const cp = shuffle(Array.from({ length: n }, (_, i) => i));
  const permRows = rp.map((ri) => rows[ri]);
  const grid = Array.from({ length: n }, (_, r) => cp.map((ci) => permRows[r][ci]));
  return grid;
}

function opOf(values: number[], prefer: KenKenOp[]): { op: KenKenOp; target: number } {
  // Choose an operation and resulting target based on cage values
  const tryOrder = [...prefer, 'add', 'mul', 'sub', 'div'];
  for (const op of tryOrder) {
    if (op === 'add') {
      return { op, target: values.reduce((a, b) => a + b, 0) };
    }
    if (op === 'mul') {
      return { op, target: values.reduce((a, b) => a * b, 1) };
    }
    if (op === 'sub' && values.length === 2) {
      const [a, b] = values;
      const t = Math.abs(a - b);
      return { op, target: t };
    }
    if (op === 'div' && values.length === 2) {
      const [a, b] = values;
      const hi = Math.max(a, b); const lo = Math.min(a, b);
      if (hi % lo === 0) return { op, target: hi / lo };
    }
  }
  // fallback to addition
  return { op: 'add', target: values.reduce((a, b) => a + b, 0) };
}

function neighbors(n: number, r: number, c: number): Array<{ r: number; c: number }> {
  const out: Array<{ r: number; c: number }> = [];
  if (r > 0) out.push({ r: r - 1, c });
  if (r + 1 < n) out.push({ r: r + 1, c });
  if (c > 0) out.push({ r, c: c - 1 });
  if (c + 1 < n) out.push({ r, c: c + 1 });
  return out;
}

export function generateKenKen(size: 4 | 5 | 6, difficulty: Difficulty = 'easy'): KenKenData {
  const n = size;
  const solution = generateLatinSquare(n);
  const seen = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
  const cellsPerCageTarget = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 2.3 : 2.7;
  const preferOps: KenKenOp[] = difficulty === 'easy' ? ['add'] : difficulty === 'medium' ? ['add', 'sub'] : ['mul', 'add', 'div', 'sub'];

  type Cage = { cells: Array<{ r: number; c: number }>; op: KenKenOp; target: number };
  const cages: Cage[] = [];

  // Greedy BFS region growing for cages
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (seen[r][c]) continue;
      const cageCells: Array<{ r: number; c: number }> = [{ r, c }];
      seen[r][c] = true;
      const targetSize = Math.max(1, Math.min(n, Math.round(cellsPerCageTarget + (Math.random() - 0.5))));
      while (cageCells.length < targetSize) {
        const frontier = shuffle(cageCells.flatMap(({ r, c }) => neighbors(n, r, c))).filter(({ r, c }) => !seen[r][c]);
        if (frontier.length === 0) break;
        const pick = frontier[0];
        // Avoid making 2-cell subtraction/division cages that are impossible (equal values)
        const preview = [...cageCells, pick];
        cageCells.push(pick);
        seen[pick.r][pick.c] = true;
      }
      const values = cageCells.map(({ r, c }) => solution[r][c]);
      const { op, target } = opOf(values, preferOps);
      cages.push({ cells: cageCells, op, target });
    }
  }

  // Build data
  const data: KenKenData = {
    size: n,
    cages: cages.map((cg) => ({ cells: cg.cells, op: cg.op, target: cg.target })),
    solution,
  };
  return data;
}



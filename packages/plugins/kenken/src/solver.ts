import type { KenKenData, KenKenOp } from './plugin';

function applyOp(op: KenKenOp, values: number[]): number {
  switch (op) {
    case 'add': return values.reduce((a, b) => a + b, 0);
    case 'mul': return values.reduce((a, b) => a * b, 1);
    case 'sub': { const [a, b] = values; return Math.abs(a - b); }
    case 'div': { const [a, b] = values; const hi = Math.max(a, b), lo = Math.min(a, b); return hi / lo; }
    default: return NaN as unknown as number;
  }
}

function cageOkPartial(op: KenKenOp, target: number, values: number[], missing: number, n: number): boolean {
  // Fast partial feasibility checks
  if (op === 'add') {
    const sum = values.reduce((a,b)=>a+b,0);
    if (sum > target) return false;
    // Max possible with remaining picks (no duplicates 1..n distinct): optimistic upper bound
    const used = new Set(values);
    let maxAdd = 0; let left = missing;
    for (let v = n; v >= 1 && left > 0; v--) { if (!used.has(v)) { maxAdd += v; left--; } }
    if (sum + maxAdd < target) return false;
    return true;
  }
  if (op === 'mul') {
    const prod = values.reduce((a,b)=>a*b,1);
    if (prod > target) return false;
    // rough upper bound: multiply by largest available digits
    const used = new Set(values);
    let maxMul = prod; let left = missing;
    for (let v = n; v >= 1 && left > 0; v--) { if (!used.has(v)) { maxMul *= v; left--; } }
    if (maxMul < target) return false;
    return true;
  }
  // sub/div cages are size 2; when partial, can't prune beyond duplicates handled elsewhere
  return true;
}

export function solveKenKen(data: KenKenData): number[][] | null {
  const n = data.size;
  const grid: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  const cageByCell = new Map<string, { op: KenKenOp; target: number; cells: Array<{ r: number; c: number }> }>();
  for (const cg of data.cages) for (const cell of cg.cells) cageByCell.set(`${cell.r},${cell.c}`, { op: cg.op, target: cg.target, cells: cg.cells });

  function canPlace(r: number, c: number, v: number): boolean {
    // row/col uniqueness
    for (let i = 0; i < n; i++) { if (grid[r][i] === v) return false; if (grid[i][c] === v) return false; }
    const cg = cageByCell.get(`${r},${c}`);
    if (!cg) return true;
    const values: number[] = [];
    for (const cell of cg.cells) {
      const curr = (cell.r === r && cell.c === c) ? v : grid[cell.r][cell.c];
      if (curr > 0) {
        values.push(curr);
      }
    }
    if (values.length === cg.cells.length) {
      if (cg.op === 'div' || cg.op === 'sub') {
        if (values.length !== 2) return false;
        const res = applyOp(cg.op, values);
        return Math.abs(res - cg.target) < 1e-9;
      }
      return applyOp(cg.op, values) === cg.target;
    }
    // Partial feasibility
    const missing = cg.cells.length - values.length;
    return cageOkPartial(cg.op, cg.target, values, missing, n);
  }

  function nextCell(): { r: number; c: number; cand: number[] } | null {
    let best: { r: number; c: number; cand: number[] } | null = null;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c] === 0) {
      const cand: number[] = [];
      for (let v = 1; v <= n; v++) if (canPlace(r, c, v)) cand.push(v);
      if (cand.length === 0) return { r, c, cand };
      if (!best || cand.length < best.cand.length) best = { r, c, cand };
      if (best.cand.length === 1) return best;
    }
    return best;
  }

  function dfs(): boolean {
    const pick = nextCell();
    if (!pick) return true; // all filled
    const { r, c, cand } = pick;
    // Heuristic: try values that satisfy cage op closeness first for add/mul
    const sorted = cand.slice();
    const cg = cageByCell.get(`${r},${c}`);
    if (cg && (cg.op === 'add' || cg.op === 'mul')) {
      sorted.sort((a, b) => {
        const evalVal = (x: number) => {
          const curr: number[] = [];
          for (const cell of (cg?.cells || [])) {
            const v0 = (cell.r === r && cell.c === c) ? x : grid[cell.r][cell.c];
            if (v0 > 0) curr.push(v0);
          }
          const res = applyOp(cg.op, curr);
          return Math.abs((cg?.target || 0) - res);
        };
        return evalVal(a) - evalVal(b);
      });
    }
    for (const v of sorted) {
      grid[r][c] = v;
      if (dfs()) return true;
      grid[r][c] = 0;
    }
    return false;
  }

  if (dfs()) return grid.map((row) => row.slice());
  return null;
}

export default solveKenKen;



import type { KakuroData } from './plugin';

export type KakuroSize = '7x7' | '9x9' | '11x11' | '13x13';

type CellType = 'fill' | 'block';

function dimsForSize(size: KakuroSize): { width: number; height: number } {
  switch (size) {
    case '7x7':
      return { width: 7, height: 7 }; // includes top/left clue bands
    case '9x9':
      return { width: 9, height: 9 };
    case '11x11':
      return { width: 11, height: 11 };
    case '13x13':
    default:
      return { width: 13, height: 13 };
  }
}

function randomInt(min: number, max: number): number {
  return min + ((Math.random() * (max - min + 1)) | 0);
}

// Partition [1..n] into contiguous segments of length in [2, maxLen]
function randomPartitions(n: number, maxLen: number): number[] {
  const parts: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    const maxAllowed = Math.min(maxLen, remaining);
    const minLen = Math.min(2, maxAllowed);
    const len = remaining <= 3 ? remaining : randomInt(minLen, Math.max(minLen, Math.min(maxAllowed, 5)));
    // Avoid 1-length tail: if tail would be 1, adjust
    if (remaining - len === 1) {
      if (len > 2) {
        parts.push(len - 1);
        remaining -= (len - 1);
        continue;
      } else if (remaining >= 4) {
        parts.push(2);
        remaining -= 2;
        continue;
      }
    }
    parts.push(len);
    remaining -= len;
  }
  return parts;
}

function seedLatticeMask(innerW: number, innerH: number): CellType[][] {
  // Start with a dotted lattice that guarantees short segments in both axes
  const mask: CellType[][] = Array.from({ length: innerH }, () => Array.from({ length: innerW }, () => 'fill' as CellType));
  const stepR = (innerH <= 8) ? 3 : 4; // tighter lattice for smaller boards
  const stepC = (innerW <= 8) ? 3 : 4;
  const rOffset = 1 + ((Math.random() * (stepR - 1)) | 0);
  const cOffset = 1 + ((Math.random() * (stepC - 1)) | 0);
  for (let r = 0; r < innerH; r++) {
    for (let c = 0; c < innerW; c++) {
      if (((r + rOffset) % stepR === 0) && ((c + cOffset) % stepC === 0)) mask[r][c] = 'block';
    }
  }
  // Add random jitter blocks to avoid repeated patterns
  const area = innerW * innerH;
  const extra = Math.floor(area * ((innerW <= 8 || innerH <= 8) ? 0.10 : 0.08));
  for (let k = 0; k < extra; k++) {
    const r = randomInt(1, innerH - 2);
    const c = randomInt(1, innerW - 2);
    mask[r][c] = 'block';
  }
  return mask;
}

// Build a block mask using row/column partitions so runs occur within rectangles (used for small sizes)
function buildPartitionMask(innerW: number, innerH: number): CellType[][] {
  // Entire grid includes a top clue row and left clue column added later.
  // Here we construct only inner area mask of size innerH x innerW.
  const mask: CellType[][] = Array.from({ length: innerH }, () => Array.from({ length: innerW }, () => 'fill' as CellType));
  // Partition rows and cols into rooms
  const rowParts = randomPartitions(innerH, Math.min(5, innerH));
  const colParts = randomPartitions(innerW, Math.min(5, innerW));
  // Compute cumulative boundaries
  let rSum = 0;
  const rowCuts: number[] = [];
  for (const len of rowParts) { rSum += len; rowCuts.push(rSum); }
  let cSum = 0;
  const colCuts: number[] = [];
  for (const len of colParts) { cSum += len; colCuts.push(cSum); }
  // Place block lines at the boundaries between rooms
  // Horizontal cuts (rows)
  for (const rCut of rowCuts.slice(0, -1)) {
    for (let c = 0; c < innerW; c++) mask[rCut][c] = 'block';
  }
  // Vertical cuts (cols)
  for (const cCut of colCuts.slice(0, -1)) {
    for (let r = 0; r < innerH; r++) mask[r][cCut] = 'block';
  }
  // Sprinkle interior blocks to reduce corridors inside rooms
  // Slightly higher prob for bigger boards to fight corridors
  const area = innerW * innerH;
  const interiorBlockProbability = area >= 144 ? 0.2 : area >= 80 ? 0.16 : 0.12;
  for (let r = 0; r < innerH; r++) {
    for (let c = 0; c < innerW; c++) {
      const onRowCut = rowCuts.includes(r);
      const onColCut = colCuts.includes(c);
      if (mask[r][c] === 'fill' && !onRowCut && !onColCut) {
        if (Math.random() < interiorBlockProbability) mask[r][c] = 'block';
      }
    }
  }
  return mask;
}

// Basic block mask used as a last-resort fallback. Places one horizontal and
// one vertical divider roughly through the middle so the board is always
// solvable and has at least a couple of runs in each direction.
function buildBlockMask(innerW: number, innerH: number): CellType[][] {
  const mask: CellType[][] = Array.from({ length: innerH }, () => Array.from({ length: innerW }, () => 'fill' as CellType));
  const midR = Math.max(1, Math.min(innerH - 2, Math.floor(innerH / 2)));
  const midC = Math.max(1, Math.min(innerW - 2, Math.floor(innerW / 2)));
  for (let c = 0; c < innerW; c++) mask[midR][c] = 'block';
  for (let r = 0; r < innerH; r++) mask[r][midC] = 'block';
  return mask;
}
type AcrossRun = { r: number; start: number; end: number; len: number };
type DownRun = { c: number; start: number; end: number; len: number };

function computeAcrossRuns(mask: CellType[][]): AcrossRun[] {
  const h = mask.length; const w = mask[0].length; const runs: AcrossRun[] = [];
  for (let r = 0; r < h; r++) {
    let c = 0;
    while (c < w) {
      while (c < w && mask[r][c] === 'block') c++;
      const start = c;
      while (c < w && mask[r][c] === 'fill') c++;
      const end = c - 1;
      const len = end - start + 1;
      if (len >= 2) runs.push({ r, start, end, len });
    }
  }
  return runs;
}

function computeDownRuns(mask: CellType[][]): DownRun[] {
  const h = mask.length; const w = mask[0].length; const runs: DownRun[] = [];
  for (let c = 0; c < w; c++) {
    let r = 0;
    while (r < h) {
      while (r < h && mask[r][c] === 'block') r++;
      const start = r;
      while (r < h && mask[r][c] === 'fill') r++;
      const end = r - 1;
      const len = end - start + 1;
      if (len >= 2) runs.push({ c, start, end, len });
    }
  }
  return runs;
}

function enforceCoverage(mask: CellType[][]): void {
  const h = mask.length; const w = mask[0].length;
  // Ensure every row has at least one across run of length >= 2
  const acrossRuns = computeAcrossRuns(mask);
  const rowsWithAcross: Set<number> = new Set(acrossRuns.map(r => r.r));
  for (let r = 0; r < h; r++) {
    if (rowsWithAcross.has(r)) continue;
    // find the longest fill segment and split it
    let best: { start: number; end: number; len: number } | null = null;
    let c = 0;
    while (c < w) {
      while (c < w && mask[r][c] === 'block') c++;
      const start = c;
      while (c < w && mask[r][c] === 'fill') c++;
      const end = c - 1;
      const len = end - start + 1;
      if (len > 0 && (!best || len > best.len)) best = { start, end, len };
    }
    if (best && best.len >= 4) {
      const splitAt = best.start + Math.floor(best.len / 2);
      mask[r][splitAt] = 'block';
    } else {
      // If the row is mostly blocks or tiny, try toggling a random interior to block to create 2-length segments
      const cc = Math.max(1, Math.min(w - 2, Math.floor(w / 2)));
      mask[r][cc] = 'block';
    }
  }

  // Ensure every column has at least one down run of length >= 2
  const downRuns = computeDownRuns(mask);
  const colsWithDown: Set<number> = new Set(downRuns.map(r => r.c));
  for (let c = 0; c < w; c++) {
    if (colsWithDown.has(c)) continue;
    let best: { start: number; end: number; len: number } | null = null;
    let r = 0;
    while (r < h) {
      while (r < h && mask[r][c] === 'block') r++;
      const start = r;
      while (r < h && mask[r][c] === 'fill') r++;
      const end = r - 1;
      const len = end - start + 1;
      if (len > 0 && (!best || len > best.len)) best = { start, end, len };
    }
    if (best && best.len >= 4) {
      const splitAt = best.start + Math.floor(best.len / 2);
      mask[splitAt][c] = 'block';
    } else {
      const rr = Math.max(1, Math.min(h - 2, Math.floor(h / 2)));
      mask[rr][c] = 'block';
    }
  }

  // Split very long runs (>=8) to improve clue density, avoid 1-length pieces
  for (const run of computeAcrossRuns(mask)) {
    if (run.len >= 8) {
      const splitAt = run.start + Math.floor(run.len / 2);
      if (splitAt - run.start >= 2 && run.end - splitAt >= 2) mask[run.r][splitAt] = 'block';
    }
  }
  for (const run of computeDownRuns(mask)) {
    if (run.len >= 8) {
      const splitAt = run.start + Math.floor(run.len / 2);
      if (splitAt - run.start >= 2 && run.end - splitAt >= 2) mask[splitAt][run.c] = 'block';
    }
  }
}

// Ensure every row and column has at least one block to avoid full-width/height corridors
function ensureRowColBlocks(mask: CellType[][]): void {
  const h = mask.length; const w = mask[0].length;
  // Rows
  for (let r = 0; r < h; r++) {
    let hasBlock = false; for (let c = 0; c < w; c++) if (mask[r][c] === 'block') { hasBlock = true; break; }
    if (!hasBlock) {
      // place a block roughly at 1/3 or 2/3 to preserve run >= 2 on both sides
      const candidates = [Math.floor(w/3), Math.floor((2*w)/3), Math.floor(w/2)].filter(x=>x>1 && x<w-2);
      const c = candidates.length ? candidates[(Math.random()*candidates.length)|0] : Math.max(1, Math.min(w-2, Math.floor(w/2)));
      mask[r][c] = 'block';
    }
  }
  // Columns
  for (let c = 0; c < w; c++) {
    let hasBlock = false; for (let r = 0; r < h; r++) if (mask[r][c] === 'block') { hasBlock = true; break; }
    if (!hasBlock) {
      const candidates = [Math.floor(h/3), Math.floor((2*h)/3), Math.floor(h/2)].filter(x=>x>1 && x<h-2);
      const r = candidates.length ? candidates[(Math.random()*candidates.length)|0] : Math.max(1, Math.min(h-2, Math.floor(h/2)));
      mask[r][c] = 'block';
    }
  }
}

// Break horizontal corridors across multiple adjacent rows (windowHeight rows)
function breakHorizontalCorridors(mask: CellType[][], windowHeight = 3, maxSpan = 4): void {
  const h = mask.length; const w = mask[0].length;
  let changed = true; let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    for (let r0 = 0; r0 <= h - windowHeight; r0++) {
      let c = 0;
      while (c < w) {
        // skip columns that contain a block in any row of the window
        while (c < w) {
          let blocked = false; for (let rr = r0; rr < r0 + windowHeight; rr++) if (mask[rr][c] === 'block') { blocked = true; break; }
          if (!blocked) break; c++;
        }
        const start = c;
        while (c < w) {
          let blocked = false; for (let rr = r0; rr < r0 + windowHeight; rr++) if (mask[rr][c] === 'block') { blocked = true; break; }
          if (blocked) break; c++;
        }
        const end = c - 1;
        const span = end - start + 1;
        if (span > maxSpan) {
          // insert a block in the middle of the window to break corridor
          const rMid = r0 + Math.floor(windowHeight / 2);
          let cMid = start + Math.floor(span / 2);
          // try to keep at least 2 cells on both sides for that row segment
          let left = cMid; while (left > start && mask[rMid][left - 1] === 'fill') left--;
          let right = cMid; while (right < end && mask[rMid][right + 1] === 'fill') right++;
          const segLen = right - left + 1;
          if (segLen <= 4) { // safe to split roughly in middle
            cMid = left + Math.floor(segLen / 2);
          }
          mask[rMid][cMid] = 'block';
          changed = true; break; // restart scanning
        }
      }
      if (changed) break;
    }
  }
}

// Break vertical corridors across multiple adjacent columns (windowWidth columns)
function breakVerticalCorridors(mask: CellType[][], windowWidth = 3, maxSpan = 4): void {
  const h = mask.length; const w = mask[0].length;
  let changed = true; let guard = 0;
  while (changed && guard++ < 50) {
    changed = false;
    for (let c0 = 0; c0 <= w - windowWidth; c0++) {
      let r = 0;
      while (r < h) {
        // skip rows that contain a block in any col of the window
        while (r < h) {
          let blocked = false; for (let cc = c0; cc < c0 + windowWidth; cc++) if (mask[r][cc] === 'block') { blocked = true; break; }
          if (!blocked) break; r++;
        }
        const start = r;
        while (r < h) {
          let blocked = false; for (let cc = c0; cc < c0 + windowWidth; cc++) if (mask[r][cc] === 'block') { blocked = true; break; }
          if (blocked) break; r++;
        }
        const end = r - 1;
        const span = end - start + 1;
        if (span > maxSpan) {
          const cMid = c0 + Math.floor(windowWidth / 2);
          let rMid = start + Math.floor(span / 2);
          let up = rMid; while (up > start && mask[up - 1][cMid] === 'fill') up--;
          let down = rMid; while (down < end && mask[down + 1][cMid] === 'fill') down++;
          const segLen = down - up + 1;
          if (segLen <= 4) rMid = up + Math.floor(segLen / 2);
          mask[rMid][cMid] = 'block';
          changed = true; break;
        }
      }
      if (changed) break;
    }
  }
}

// Enforce a strict maximum run length by evenly inserting blocks so that
// every contiguous fill segment in each row/col ends up within [2, maxLen].
function enforceMaxRunLengths(mask: CellType[][], maxLen: number): void {
  const h = mask.length; const w = mask[0].length;
  function splitRow(r: number): boolean {
    let changed = false;
    let c = 0;
    while (c < w) {
      while (c < w && mask[r][c] === 'block') c++;
      const start = c;
      while (c < w && mask[r][c] === 'fill') c++;
      const end = c - 1;
      const len = end - start + 1;
      if (len > maxLen) {
        const splits = Math.ceil(len / maxLen) - 1;
        // place splits roughly evenly
        for (let i = 1; i <= splits; i++) {
          let pos = start + Math.floor((i * len) / (splits + 1));
          // keep at least 2 cells on both sides
          pos = Math.max(start + 2, Math.min(end - 2, pos));
          if (mask[r][pos] !== 'block') { mask[r][pos] = 'block'; changed = true; }
        }
      }
    }
    return changed;
  }
  function splitCol(c: number): boolean {
    let changed = false;
    let r = 0;
    while (r < h) {
      while (r < h && mask[r][c] === 'block') r++;
      const start = r;
      while (r < h && mask[r][c] === 'fill') r++;
      const end = r - 1;
      const len = end - start + 1;
      if (len > maxLen) {
        const splits = Math.ceil(len / maxLen) - 1;
        for (let i = 1; i <= splits; i++) {
          let pos = start + Math.floor((i * len) / (splits + 1));
          pos = Math.max(start + 2, Math.min(end - 2, pos));
          if (mask[pos][c] !== 'block') { mask[pos][c] = 'block'; changed = true; }
        }
      }
    }
    return changed;
  }
  let changed = true; let guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    for (let r = 0; r < h; r++) changed = splitRow(r) || changed;
    for (let c = 0; c < w; c++) changed = splitCol(c) || changed;
  }
}

// Remove singleton fill cells (cells that do not belong to any across or down
// run of length >= 2). Turning them into blocks prevents orphan empty cells
// without clues, which can show up as "empty corridors" in small boards.
function eliminateSingletons(mask: CellType[][]): void {
  const h = mask.length; const w = mask[0].length;
  let changed = true; let guard = 0;
  function segmentLenRow(r: number, c: number): number {
    let left = c; while (left - 1 >= 0 && mask[r][left - 1] === 'fill') left--;
    let right = c; while (right + 1 < w && mask[r][right + 1] === 'fill') right++;
    return right - left + 1;
  }
  function segmentLenCol(r: number, c: number): number {
    let up = r; while (up - 1 >= 0 && mask[up - 1][c] === 'fill') up--;
    let down = r; while (down + 1 < h && mask[down + 1][c] === 'fill') down++;
    return down - up + 1;
  }
  while (changed && guard++ < 10) {
    changed = false;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (mask[r][c] !== 'fill') continue;
        const aLen = segmentLenRow(r, c);
        const dLen = segmentLenCol(r, c);
        if (aLen < 2 && dLen < 2) { mask[r][c] = 'block'; changed = true; }
      }
    }
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fill digits for all fill cells respecting unique digits per horizontal/vertical run.
function fillSolution(mask: CellType[][]): number[][] {
  const innerH = mask.length;
  const innerW = mask[0].length;
  const grid: number[][] = Array.from({ length: innerH }, () => Array.from({ length: innerW }, () => 0));

  // Precompute run indices for across and down
  const acrossRunId: number[][] = Array.from({ length: innerH }, () => Array.from({ length: innerW }, () => -1));
  const downRunId: number[][] = Array.from({ length: innerH }, () => Array.from({ length: innerW }, () => -1));
  type Run = { cells: Array<{ r: number; c: number }> };
  const acrossRuns: Run[] = [];
  const downRuns: Run[] = [];

  // Across runs
  for (let r = 0; r < innerH; r++) {
    let c = 0;
    while (c < innerW) {
      while (c < innerW && mask[r][c] === 'block') c++;
      const start = c;
      while (c < innerW && mask[r][c] === 'fill') c++;
      const end = c - 1;
      const len = end - start + 1;
      if (len >= 2) {
        const id = acrossRuns.length;
        const cells: Array<{ r: number; c: number }> = [];
        for (let cc = start; cc <= end; cc++) { acrossRunId[r][cc] = id; cells.push({ r, c: cc }); }
        acrossRuns.push({ cells });
      }
    }
  }
  // Down runs
  for (let c = 0; c < innerW; c++) {
    let r = 0;
    while (r < innerH) {
      while (r < innerH && mask[r][c] === 'block') r++;
      const start = r;
      while (r < innerH && mask[r][c] === 'fill') r++;
      const end = r - 1;
      const len = end - start + 1;
      if (len >= 2) {
        const id = downRuns.length;
        const cells: Array<{ r: number; c: number }> = [];
        for (let rr = start; rr <= end; rr++) { downRunId[rr][c] = id; cells.push({ r: rr, c }); }
        downRuns.push({ cells });
      }
    }
  }

  // Track used digits per run
  const usedAcross: Array<Set<number>> = acrossRuns.map(() => new Set<number>());
  const usedDown: Array<Set<number>> = downRuns.map(() => new Set<number>());

  // Order cells by degree (intersection of runs) to reduce backtracking
  const cellOrder: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < innerH; r++) for (let c = 0; c < innerW; c++) if (mask[r][c] === 'fill') cellOrder.push({ r, c });
  cellOrder.sort((a, b) => {
    const aDeg = (acrossRunId[a.r][a.c] !== -1 ? acrossRuns[acrossRunId[a.r][a.c]].cells.length : 0)
      + (downRunId[a.r][a.c] !== -1 ? downRuns[downRunId[a.r][a.c]].cells.length : 0);
    const bDeg = (acrossRunId[b.r][b.c] !== -1 ? acrossRuns[acrossRunId[b.r][b.c]].cells.length : 0)
      + (downRunId[b.r][b.c] !== -1 ? downRuns[downRunId[b.r][b.c]].cells.length : 0);
    return bDeg - aDeg;
  });

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  function assign(idx: number): boolean {
    if (idx >= cellOrder.length) return true;
    const { r, c } = cellOrder[idx];
    const aId = acrossRunId[r][c];
    const dId = downRunId[r][c];
    const aUsed = aId >= 0 ? usedAcross[aId] : new Set<number>();
    const dUsed = dId >= 0 ? usedDown[dId] : new Set<number>();
    const candidates = shuffle(digits.filter((n) => !aUsed.has(n) && !dUsed.has(n)));
    for (const n of candidates) {
      grid[r][c] = n;
      if (aId >= 0) aUsed.add(n);
      if (dId >= 0) dUsed.add(n);
      if (assign(idx + 1)) return true;
      if (aId >= 0) aUsed.delete(n);
      if (dId >= 0) dUsed.delete(n);
      grid[r][c] = 0;
    }
    return false;
  }

  const ok = assign(0);
  if (!ok) throw new Error('Failed to generate Kakuro solution');
  return grid;
}

export function generateKakuro(size: KakuroSize = '9x9'): KakuroData {
  // We build a grid with an extra top row and left column to host clue cells
  const { width, height } = dimsForSize(size);
  const innerW = width - 1;
  const innerH = height - 1;

  function build(): KakuroData {
    // Use lattice seeding for all sizes. Partition-based full-row/column cuts
    // tend to create empty corridors and orphan cells on small boards (e.g. 7×7).
    const mask = seedLatticeMask(innerW, innerH);
    enforceCoverage(mask);
    ensureRowColBlocks(mask);
    // Strictly cap every row/col run length to avoid corridors
    const cap = 4; // allow slightly longer runs on larger boards
    enforceMaxRunLengths(mask, cap);
    // Additionally break multi-row / multi-column corridor windows (2 and 3 high)
    breakHorizontalCorridors(mask, Math.min(2, innerH), 3);
    breakHorizontalCorridors(mask, Math.min(3, innerH), 3);
    breakVerticalCorridors(mask, Math.min(2, innerW), 3);
    breakVerticalCorridors(mask, Math.min(3, innerW), 3);
    // Finally remove any singletons so every fill cell participates in a run
    eliminateSingletons(mask);
    // Re-assert coverage in case singleton removal created sparse rows/cols
    enforceCoverage(mask);
    const solution = fillSolution(mask);
    const grid: any[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ block: true })));
    grid[0][0] = { block: true };
    // Fill cells
    for (let r = 0; r < innerH; r++) {
      for (let c = 0; c < innerW; c++) {
        const R = r + 1, C = c + 1;
        grid[R][C] = (mask[r][c] === 'fill') ? {} : { block: true };
      }
    }
    let acrossRuns = 0;
    for (let r = 0; r < innerH; r++) {
      let c = 0;
      while (c < innerW) {
        while (c < innerW && mask[r][c] === 'block') c++;
        const start = c;
        while (c < innerW && mask[r][c] === 'fill') c++;
        const end = c - 1;
        if (end - start + 1 >= 2) {
          acrossRuns++;
          const sum = solution[r].slice(start, end + 1).reduce((a, b) => a + b, 0);
          const clueCell = grid[r + 1][start];
          const base = (clueCell && (clueCell.sumRight || clueCell.sumDown)) ? clueCell : {};
          grid[r + 1][start] = { ...base, sumRight: sum };
        }
      }
    }
    let downRuns = 0;
    for (let c = 0; c < innerW; c++) {
      let r = 0;
      while (r < innerH) {
        while (r < innerH && mask[r][c] === 'block') r++;
        const start = r;
        while (r < innerH && mask[r][c] === 'fill') r++;
        const end = r - 1;
        if (end - start + 1 >= 2) {
          downRuns++;
          let sum = 0; for (let rr = start; rr <= end; rr++) sum += solution[rr][c];
          const clueCell = grid[start][c + 1];
          const base = (clueCell && (clueCell.sumRight || clueCell.sumDown)) ? clueCell : {};
          grid[start][c + 1] = { ...base, sumDown: sum };
        }
      }
    }
    // Ensure top row/left col fidelity
    for (let c = 1; c < width; c++) if (!('sumDown' in grid[0][c])) grid[0][c] = { block: true };
    for (let r = 1; r < height; r++) if (!('sumRight' in grid[r][0])) grid[r][0] = { block: true };

    // Validate: require a decent number of runs and a reasonable fill ratio,
    // and strictly reject any row/col with a segment > cap to prevent corridors
    const totalCells = innerW * innerH;
    let fillCount = 0; for (let r = 0; r < innerH; r++) for (let c = 0; c < innerW; c++) if (mask[r][c] === 'fill') fillCount++;
    const fillRatio = fillCount / Math.max(1, totalCells);
    if (acrossRuns < Math.max(4, Math.floor(innerH * 0.75))) throw new Error('too-few-across');
    if (downRuns < Math.max(4, Math.floor(innerW * 0.75))) throw new Error('too-few-down');
    if (fillRatio < 0.45) throw new Error('too-sparse');
    // corridor check
    for (const r of computeAcrossRuns(mask)) if (r.len > 4) throw new Error('corridor-row');
    for (const d of computeDownRuns(mask)) if (d.len > 4) throw new Error('corridor-col');
    // multi-row/col corridor validation
    // if any 3-row window has a continuous span > 6 without a block, reject
    const h = innerH, w = innerW;
    for (let r0 = 0; r0 <= h - Math.min(3, h); r0++) {
      let c = 0;
      while (c < w) {
        while (c < w) {
          let blocked = false; for (let rr = r0; rr < r0 + Math.min(3, h); rr++) if ((mask[rr][c]) === 'block') { blocked = true; break; }
          if (!blocked) break; c++;
        }
        const start = c; while (c < w) {
          let blocked = false; for (let rr = r0; rr < r0 + Math.min(3, h); rr++) if ((mask[rr][c]) === 'block') { blocked = true; break; }
          if (blocked) break; c++;
        }
        if (c - start > 6) throw new Error('corridor-window-row');
      }
    }
    for (let c0 = 0; c0 <= w - Math.min(3, w); c0++) {
      let r = 0;
      while (r < h) {
        while (r < h) {
          let blocked = false; for (let cc = c0; cc < c0 + Math.min(3, w); cc++) if ((mask[r][cc]) === 'block') { blocked = true; break; }
          if (!blocked) break; r++;
        }
        const start = r; while (r < h) {
          let blocked = false; for (let cc = c0; cc < c0 + Math.min(3, w); cc++) if ((mask[r][cc]) === 'block') { blocked = true; break; }
          if (blocked) break; r++;
        }
        if (r - start > 6) throw new Error('corridor-window-col');
      }
    }
    return { width, height, grid } as KakuroData;
  }

  // Retry a few times for a healthy layout
  for (let attempt = 0; attempt < 80; attempt++) {
    try { return build(); } catch { /* retry */ }
  }
  // Fallback to a simple open grid with at least one partition in each direction
  const mask = buildBlockMask(innerW, innerH);
  for (let r = 0; r < innerH; r++) for (let c = 0; c < innerW; c++) if (mask[r][c] !== 'block') mask[r][c] = 'fill';
  const solution = fillSolution(mask);
  const grid: any[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ block: true })));
  for (let r = 0; r < innerH; r++) for (let c = 0; c < innerW; c++) grid[r+1][c+1] = {};
  for (let r = 0; r < innerH; r++) { let sum = 0; for (let c = 0; c < innerW; c++) sum += solution[r][c]; grid[r+1][0] = { sumRight: sum }; }
  for (let c = 0; c < innerW; c++) { let sum = 0; for (let r = 0; r < innerH; r++) sum += solution[r][c]; grid[0][c+1] = { sumDown: sum }; }
  grid[0][0] = { block: true };
  return { width, height, grid } as KakuroData;
}

export type { KakuroData };


// ---- Solver ----
// Solve a Kakuro puzzle defined by `data` using backtracking with run-combination pruning.
// Returns a full grid of numbers (same shape as `data.grid`, zeros in non-fill cells), or null if unsolvable.
export function solveKakuro(data: KakuroData): number[][] | null {
  const height = data.height;
  const width = data.width;

  // Identify fill cells and runs from the clue grid
  type Cell = { r: number; c: number; aId: number; dId: number };
  type Run = { id: number; cells: Array<{ r: number; c: number }>; target: number; combos: number[] };

  function isBlock(r: number, c: number): boolean {
    const cell = data.grid[r][c] as any; return Boolean(cell && cell.block);
  }
  function isClue(r: number, c: number): boolean {
    const cell = data.grid[r][c] as any; return Boolean(cell && (cell.sumRight || cell.sumDown));
  }
  function isFill(r: number, c: number): boolean { return !isBlock(r, c) && !isClue(r, c); }

  const acrossRuns: Run[] = [];
  const downRuns: Run[] = [];
  const aIdAt: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));
  const dIdAt: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));

  // Build across runs from sumRight clues
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell: any = data.grid[r][c];
      if (cell && cell.sumRight) {
        const target = cell.sumRight as number;
        const cells: Array<{ r: number; c: number }> = [];
        for (let cc = c + 1; cc < width && isFill(r, cc); cc++) cells.push({ r, c: cc });
        if (cells.length >= 2) {
          const id = acrossRuns.length; acrossRuns.push({ id, cells, target, combos: [] });
          for (const { r: rr, c: cc } of cells) aIdAt[rr][cc] = id;
        }
      }
    }
  }
  // Build down runs from sumDown clues
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell: any = data.grid[r][c];
      if (cell && cell.sumDown) {
        const target = cell.sumDown as number;
        const cells: Array<{ r: number; c: number }> = [];
        for (let rr = r + 1; rr < height && isFill(rr, c); rr++) cells.push({ r: rr, c });
        if (cells.length >= 2) {
          const id = downRuns.length; downRuns.push({ id, cells, target, combos: [] });
          for (const { r: rr, c: cc } of cells) dIdAt[rr][cc] = id;
        }
      }
    }
  }

  // Collect fill cells
  const fillCells: Cell[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (isFill(r, c)) fillCells.push({ r, c, aId: aIdAt[r][c], dId: dIdAt[r][c] });
    }
  }

  // Some cells may not be in a run if the source is malformed; guard.
  for (const cell of fillCells) {
    if (cell.aId < 0 && cell.dId < 0) return null;
  }

  // Precompute all possible combos (as 9-bit bitmasks) for (len, sum)
  const memo = new Map<string, number[]>();
  function combos(len: number, sum: number, start = 1): number[] {
    const key = `${len}|${sum}|${start}`;
    const cached = memo.get(key); if (cached) return cached;
    const out: number[] = [];
    if (len === 0) { if (sum === 0) out.push(0); memo.set(key, out); return out; }
    for (let d = start; d <= 9; d++) {
      if (d > sum) break;
      for (const rest of combos(len - 1, sum - d, d + 1)) {
        out.push(rest | (1 << (d - 1)));
      }
    }
    memo.set(key, out); return out;
  }
  const bitCount = (m: number): number => (m ? ((m & 1) + bitCount(m >>> 1)) : 0);
  function maskToDigits(mask: number): number[] { const arr: number[] = []; for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) arr.push(d); return arr; }

  for (const run of acrossRuns) run.combos = combos(run.cells.length, run.target);
  for (const run of downRuns) run.combos = combos(run.cells.length, run.target);
  if (acrossRuns.some(r => r.combos.length === 0) || downRuns.some(r => r.combos.length === 0)) return null;

  // Track used digit masks per run during assignment
  const usedA: number[] = acrossRuns.map(() => 0);
  const usedD: number[] = downRuns.map(() => 0);

  // Utility: union of digits across combos that are supersets of used mask
  function allowedFromCombos(used: number, combs: number[]): number {
    let allow = 0; for (const m of combs) if ((m & used) === used) allow |= m; return allow;
  }

  // Build quick lookup from coord to cell index for state grid
  const valueGrid: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));

  // Choose next cell: fewest candidate digits heuristic
  function nextCell(): { idx: number; candidates: number[] } | null {
    let bestIdx = -1; let bestMask = 0; let bestCount = 1e9;
    for (let i = 0; i < fillCells.length; i++) {
      const { r, c, aId, dId } = fillCells[i];
      if (valueGrid[r][c] !== 0) continue;
      let maskA = 0x1FF, maskD = 0x1FF; // 9 bits
      if (aId >= 0) {
        const allow = allowedFromCombos(usedA[aId], acrossRuns[aId].combos);
        maskA = allow & ~usedA[aId];
      }
      if (dId >= 0) {
        const allow = allowedFromCombos(usedD[dId], downRuns[dId].combos);
        maskD = allow & ~usedD[dId];
      }
      const mask = maskA & maskD;
      const count = bitCount(mask);
      if (count === 0) return { idx: i, candidates: [] };
      if (count < bestCount) { bestCount = count; bestMask = mask; bestIdx = i; if (count === 1) break; }
    }
    if (bestIdx < 0) return null;
    return { idx: bestIdx, candidates: maskToDigits(bestMask) };
  }

  // Check viability: there exists at least one combo superset for used masks
  function viableRun(usedMask: number, combs: number[]): boolean {
    for (const m of combs) if ((m & usedMask) === usedMask) return true; return false;
  }

  function assignAll(): boolean {
    const pick = nextCell();
    if (!pick) {
      // all fill cells assigned
      return true;
    }
    const { idx, candidates } = pick;
    if (candidates.length === 0) return false;
    const { r, c, aId, dId } = fillCells[idx];
    // Try candidates in a stable order to avoid deep backtracking
    for (const n of candidates) {
      const bit = 1 << (n - 1);
      const prevA = aId >= 0 ? usedA[aId] : 0;
      const prevD = dId >= 0 ? usedD[dId] : 0;
      if (aId >= 0 && (prevA & bit)) continue; if (dId >= 0 && (prevD & bit)) continue;
      if (aId >= 0) usedA[aId] |= bit; if (dId >= 0) usedD[dId] |= bit;
      // Prune: runs must remain viable
      const okA = aId < 0 || viableRun(usedA[aId], acrossRuns[aId].combos);
      const okD = dId < 0 || viableRun(usedD[dId], downRuns[dId].combos);
      if (okA && okD) {
        valueGrid[r][c] = n;
        if (assignAll()) return true;
        valueGrid[r][c] = 0;
      }
      if (aId >= 0) usedA[aId] = prevA; if (dId >= 0) usedD[dId] = prevD;
    }
    return false;
  }

  const success = assignAll();
  return success ? valueGrid : null;
}



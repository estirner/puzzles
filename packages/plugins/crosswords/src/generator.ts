import type { CWData, CWCell } from './plugin';
import { getRandomEntries } from './random-source';

export type CWSize = '5x5' | '11x11' | 'auto';

type Entry = { clue: string; answer: string };

function chooseCanvas(size: CWSize): number {
  // Larger canvas gives the placer room; we crop later to the used bounding box
  if (size === '5x5') return 13;
  if (size === '11x11') return 21;
  return 19; // auto (denser default)
}

function shuffle<T>(arr: T[]): T[] { return arr.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]); }

export async function generateCrossword(size: CWSize = 'auto'): Promise<CWData> {
  // Load entries from the CSV subset in public
  const pool: Entry[] = await getRandomEntries(20000, 3, 15);
  const clueOfAll: Record<string, string> = {};
  for (const e of pool) { const A = e.answer.toUpperCase(); if (!clueOfAll[A]) clueOfAll[A] = e.clue; }
  const entries = shuffle(pool).slice(0, Math.min(600, pool.length));
  // Prefer longer words first for better crossing
  entries.sort((a, b) => b.answer.length - a.answer.length);

  const canvas = chooseCanvas(size);
  const height = canvas;
  const width = canvas;
    const letters: string[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ''));

  type Dir = 'A' | 'D';
  const dr: Record<Dir, number> = { A: 0, D: 1 };
  const dc: Record<Dir, number> = { A: 1, D: 0 };

  function inBounds(r: number, c: number): boolean { return r >= 0 && c >= 0 && r < height && c < width; }
  function hasLetter(r: number, c: number): boolean { return inBounds(r, c) && Boolean(letters[r][c]); }

  function canPlace(answer: string, r: number, c: number, dir: Dir, requireCross: boolean): number | null {
    const rr = dr[dir]; const cc = dc[dir];
    // Bounds
    const endR = r + rr * (answer.length - 1);
    const endC = c + cc * (answer.length - 1);
    if (!inBounds(r, c) || !inBounds(endR, endC)) return null;
    // Boundary cells before/after must be empty (if they exist)
    const beforeR = r - rr, beforeC = c - cc;
    const afterR = endR + rr, afterC = endC + cc;
    if (inBounds(beforeR, beforeC) && letters[beforeR][beforeC]) return null;
    if (inBounds(afterR, afterC) && letters[afterR][afterC]) return null;

    let crosses = 0;
    for (let i = 0; i < answer.length; i++) {
      const cr = r + rr * i, cc2 = c + cc * i;
      const existing = letters[cr][cc2];
      if (existing && existing !== answer[i]) return null; // conflict
      // If this is a new letter (not crossing), avoid perpendicular adjacency
      if (!existing) {
        // For across avoid letters above/below; for down avoid left/right
        if (dir === 'A') {
          if (hasLetter(cr - 1, cc2) || hasLetter(cr + 1, cc2)) return null;
        } else {
          if (hasLetter(cr, cc2 - 1) || hasLetter(cr, cc2 + 1)) return null;
        }
        // Note: we previously blocked sequences of new letters here, but that prevented any fresh word
        // from being placed. We rely on `requireCross` for densification instead.
      } else {
        crosses++;
      }
    }
    if (requireCross && crosses === 0) return null;
    return crosses;
  }

  function place(answer: string, r: number, c: number, dir: Dir): void {
    const rr = dr[dir]; const cc = dc[dir];
    for (let i = 0; i < answer.length; i++) { const cr = r + rr * i, cc2 = c + cc * i; letters[cr][cc2] = answer[i]; }
  }

  type Placed = { answer: string; clue: string; r: number; c: number; dir: Dir };
  const placed: Placed[] = [];
  const usedAnswers = new Set<string>();

  // Seed with the longest word across in the center
  if (entries.length > 0) {
    const first = entries[0];
    const r = Math.floor(height / 2);
    const c = Math.max(0, Math.floor(width / 2 - first.answer.length / 2));
    if (canPlace(first.answer, r, c, 'A', false) !== null) {
      place(first.answer, r, c, 'A');
      placed.push({ answer: first.answer, clue: first.clue, r, c, dir: 'A' });
      usedAnswers.add(first.answer);
    }
  }

  // Try to place the rest with crossings, multiple passes to densify
  const cap = size === '5x5' ? 15 : size === '11x11' ? 40 : 70;
  for (let pass = 0; pass < 3 && placed.length < cap; pass++) {
    let addedThisPass = 0;
    for (let idx = 1; idx < entries.length && placed.length < cap; idx++) {
      const { answer, clue } = entries[idx];
      if (usedAnswers.has(answer)) continue;
      let best: { r: number; c: number; dir: Dir; crosses: number } | null = null;
      // Scan the board and try to align one of the letters
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const ch = letters[r][c];
          if (!ch) continue;
          for (let i = 0; i < answer.length; i++) {
            if (answer[i] !== ch) continue;
            const startAcrossC = c - i; // place across
            const startDownR = r - i; // place down
            const crossA = canPlace(answer, r, startAcrossC, 'A', true);
            if (crossA !== null) {
              if (!best || crossA > best.crosses) best = { r, c: startAcrossC, dir: 'A', crosses: crossA };
            }
            const crossD = canPlace(answer, startDownR, c, 'D', true);
            if (crossD !== null) {
              if (!best || crossD > best.crosses) best = { r: startDownR, c, dir: 'D', crosses: crossD };
            }
          }
        }
      }
      if (best) {
        place(answer, best.r, best.c, best.dir);
        placed.push({ answer, clue, r: best.r, c: best.c, dir: best.dir });
        usedAnswers.add(answer);
        addedThisPass++;
      }
    }
    if (addedThisPass === 0) break;
  }

  // Compute bounding box of letters
  let minR = height, minC = width, maxR = -1, maxC = -1;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (letters[r][c]) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
    }
  }
  if (maxR < 0) {
    // Nothing placed — fall back to a tiny empty puzzle
    return { width: 5, height: 5, grid: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ block: true } as CWCell))), clues: { across: [], down: [] } };
  }

  // Add a small margin and crop; also clamp final size to avoid ultra-wide/ultra-tall puzzles
  minR = Math.max(0, minR - 1);
  minC = Math.max(0, minC - 1);
  maxR = Math.min(height - 1, maxR + 1);
  maxC = Math.min(width - 1, maxC + 1);
  const MAX_DIM = 25;
  if (maxR - minR + 1 > MAX_DIM) { const overflow = (maxR - minR + 1) - MAX_DIM; minR += Math.ceil(overflow / 2); maxR = minR + MAX_DIM - 1; }
  if (maxC - minC + 1 > MAX_DIM) { const overflow = (maxC - minC + 1) - MAX_DIM; minC += Math.ceil(overflow / 2); maxC = minC + MAX_DIM - 1; }
  const outH = maxR - minR + 1;
  const outW = maxC - minC + 1;

  const grid: CWCell[][] = Array.from({ length: outH }, (_, r) => Array.from({ length: outW }, (_, c) => {
    const ch = letters[minR + r][minC + c];
    return ch ? ({ ch } as CWCell) : ({ block: true } as CWCell);
  }));

  // Build clues and numbering from the final grid
  const clueOf: Record<string, string> = { ...clueOfAll };
  for (const p of placed) if (!clueOf[p.answer]) clueOf[p.answer] = p.clue;

  const cluesAcross: CWData['clues']['across'] = [];
  const cluesDown: CWData['clues']['down'] = [];
  let num = 1;
  for (let r = 0; r < outH; r++) {
    for (let c = 0; c < outW; c++) {
      if (grid[r][c].block) continue;
      const startsA = (c === 0 || grid[r][c - 1].block) && (c + 1 < outW) && !grid[r][c + 1].block;
      const startsD = (r === 0 || grid[r - 1][c].block) && (r + 1 < outH) && !grid[r + 1][c].block;
      let added = false;
      if (startsA) {
        let w = ''; let cc = c; while (cc < outW && !grid[r][cc].block) { w += letters[minR + r][minC + cc]; cc++; }
        if (w.length >= 2) { cluesAcross.push({ num, clue: clueOf[w] || 'Across', answer: w }); added = true; }
      }
      if (startsD) {
        let w = ''; let rr = r; while (rr < outH && !grid[rr][c].block) { w += letters[minR + rr][minC + c]; rr++; }
        if (w.length >= 2) { cluesDown.push({ num, clue: clueOf[w] || 'Down', answer: w }); added = true; }
      }
      if (added) num++;
    }
  }

  return { width: outW, height: outH, grid, clues: { across: cluesAcross, down: cluesDown } } as CWData;
}

export type { CWData };



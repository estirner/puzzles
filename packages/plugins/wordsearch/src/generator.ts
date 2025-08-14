import type { WSData } from './plugin';
import { getWordList } from './random-source';

export type WSSize = '8x8' | '10x10' | '12x12' | '15x15';

type Direction = { dr: number; dc: number };
const DIRECTIONS: Direction[] = [
  { dr: 0, dc: 1 },   // right
  { dr: 1, dc: 0 },   // down
  { dr: 0, dc: -1 },  // left
  { dr: -1, dc: 0 },  // up
  { dr: 1, dc: 1 },   // down-right
  { dr: -1, dc: -1 }, // up-left
  { dr: 1, dc: -1 },  // down-left
  { dr: -1, dc: 1 },  // up-right
];

// Bias selection toward diagonals and reverse directions to increase difficulty
const WEIGHTED_DIRECTIONS: Direction[] = [
  // diagonals (heavier weight)
  { dr: 1, dc: 1 }, { dr: 1, dc: 1 }, { dr: 1, dc: 1 },
  { dr: -1, dc: -1 }, { dr: -1, dc: -1 }, { dr: -1, dc: -1 },
  { dr: 1, dc: -1 }, { dr: 1, dc: -1 }, { dr: 1, dc: -1 },
  { dr: -1, dc: 1 }, { dr: -1, dc: 1 }, { dr: -1, dc: 1 },
  // straight reversed
  { dr: 0, dc: -1 }, { dr: 0, dc: -1 },
  { dr: -1, dc: 0 }, { dr: -1, dc: 0 },
  // straight forward (lighter weight)
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
];

function dimsForSize(size: WSSize): { width: number; height: number } {
  switch (size) {
    case '8x8':
      return { width: 8, height: 8 };
    case '10x10':
      return { width: 10, height: 10 };
    case '12x12':
      return { width: 12, height: 12 };
    case '15x15':
      return { width: 15, height: 15 };
    default:
      return { width: 10, height: 10 };
  }
}

// A compact built-in dictionary fallback used if words.txt is unavailable.
const FALLBACK_DICTIONARY: string[] = [
  // animals
  'CAT','DOG','WOLF','FOX','BEAR','LION','TIGER','MOUSE','RAT','HORSE','ZEBRA','OTTER','SEAL','WHALE','SHARK','EAGLE','HAWK','DOVE','SNAKE','LIZARD','FROG','TOAD','BISON','MOOSE','DEER','RABBIT','PANDA','KOALA','GORILLA','MONKEY','CAMEL','LLAMA','YAK','SHEEP','GOAT','PIG','COW','BULL','HEN','DUCK','SWAN','CRAB','SQUID','OCTOPUS','SPIDER','ANT','BEE','WASP','BUG',
  // nature
  'RIVER','LAKE','OCEAN','MOUNTAIN','VALLEY','DESERT','FOREST','ISLAND','GLACIER','CANYON','VOLCANO','PRAIRIE','MEADOW','BEACH','CLIFF',
  // colors
  'RED','BLUE','GREEN','YELLOW','PURPLE','ORANGE','VIOLET','INDIGO','BLACK','WHITE','BROWN','PINK','CYAN','MAGENTA','GRAY',
  // foods
  'BREAD','CHEESE','APPLE','BANANA','ORANGE','GRAPE','PEACH','PEAR','PLUM','MELON','BERRY','MANGO','PAPAYA','TOMATO','POTATO','ONION','GARLIC','CARROT','LETTUCE','PEPPER','CHILI','GINGER','HONEY','SUGAR','COCOA','COFFEE','TEA','MILK',
  // misc
  'PLANET','GALAXY','COMET','ASTEROID','ROCKET','SATELLITE','ORBIT','GRAVITY','ENERGY','ATOM','MOLECULE','CRYSTAL','CIRCUIT','ENGINE','BRIDGE','TUNNEL','LIBRARY','MUSEUM','THEATER','GARDEN','MARKET','SCHOOL','STATION','AIRPORT',
];

function shuffle<T>(arr: T[]): T[] {
  // Crypto-backed Fisher–Yates with safe buffer size; fall back to Math.random
  const out = arr.slice();
  const n = out.length;
  const cryptoObj: Crypto | undefined = (typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined);
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    for (let i = n - 1; i > 0; i--) {
      cryptoObj.getRandomValues(buf); // 4 bytes per call, below 65536-byte limit
      const j = buf[0] % (i + 1);
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

function createEmptyGrid(width: number, height: number): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ''));
}

function canPlace(
  grid: string[][],
  word: string,
  r: number,
  c: number,
  dir: Direction,
): boolean {
  const h = grid.length;
  const w = grid[0].length;
  for (let i = 0; i < word.length; i++) {
    const rr = r + dir.dr * i;
    const cc = c + dir.dc * i;
    if (rr < 0 || rr >= h || cc < 0 || cc >= w) return false;
    const ch = grid[rr][cc];
    if (ch && ch !== word[i]) return false; // conflict with different letter
  }
  return true;
}

function placeWord(
  grid: string[][],
  word: string,
  maxTries = 200,
): boolean {
  const h = grid.length;
  const w = grid[0].length;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const dir = DIRECTIONS[(Math.random() * DIRECTIONS.length) | 0];
    // choose a start such that the word can fit within bounds for this dir
    const rMin = dir.dr === -1 ? word.length - 1 : 0;
    const rMax = dir.dr === 1 ? h - word.length : h - 1;
    const cMin = dir.dc === -1 ? word.length - 1 : 0;
    const cMax = dir.dc === 1 ? w - word.length : w - 1;
    if (rMax < rMin || cMax < cMin) continue;
    const r = rMin + ((Math.random() * (rMax - rMin + 1)) | 0);
    const c = cMin + ((Math.random() * (cMax - cMin + 1)) | 0);
    if (!canPlace(grid, word, r, c, dir)) continue;
    for (let i = 0; i < word.length; i++) {
      const rr = r + dir.dr * i;
      const cc = c + dir.dc * i;
      grid[rr][cc] = word[i];
    }
    return true;
  }
  return false;
}

export async function generateWordSearch(size: WSSize = '10x10', targetWordCount = 12): Promise<WSData> {
  const { width, height } = dimsForSize(size);
  const grid = createEmptyGrid(width, height);
  // Filter dictionary by max word length and sample. Prefer external list.
  const maxLen = Math.max(width, height);
  let source = await getWordList(50000, 3, maxLen);
  if (!source || source.length === 0) source = FALLBACK_DICTIONARY;
  const deduped = Array.from(new Set(source.map((w) => w.toUpperCase()))).filter(
    (w) => w.length >= 3 && w.length <= maxLen,
  );
  // Exclude some recently used words to increase variety across new games
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('wordsearch:recentWords');
      if (raw) {
        const recent: string[] = JSON.parse(raw);
        const recentSet = new Set(recent);
        source = deduped.filter((w) => !recentSet.has(w));
      }
    }
  } catch {}
  const pool = shuffle(source.length ? source : deduped);
  // Build a length histogram and construct a mixed order: start with 3-5 letters, then interleave mids/longs
  const byLen: Map<number, string[]> = new Map();
  for (const w of pool) {
    const L = w.length; if (!byLen.has(L)) byLen.set(L, []); byLen.get(L)!.push(w);
  }
  for (const arr of byLen.values()) shuffle(arr);
  const lengths = Array.from(byLen.keys()).sort((a, b) => a - b);
  const shortLens = lengths.filter((L) => L <= 5);
  const midLens = lengths.filter((L) => L >= 6 && L <= Math.max(8, Math.floor(maxLen * 0.75)));
  const longLens = lengths.filter((L) => L > Math.max(8, Math.floor(maxLen * 0.75)));

  // Target distribution: prioritize variety and include longer words when grid allows
  const n = targetWordCount;
  const targetLong = maxLen >= 8 ? Math.max(1, Math.floor(n * 0.3)) : 0;
  const targetMid = Math.max(1, Math.floor(n * 0.4));
  const targetShort = Math.max(0, n - targetLong - targetMid);

  function drainFrom(lens: number[], count: number): string[] {
    const out: string[] = [];
    const lensCopy = lens.slice();
    while (out.length < count && lensCopy.length) {
      const L = lensCopy[0];
      const bucket = byLen.get(L) || [];
      while (out.length < count && bucket.length) out.push(bucket.pop() as string);
      if (bucket.length === 0) lensCopy.shift();
    }
    return out;
  }

  // Choose candidates by buckets, then shuffle for placement ordering
  const chosenPool: string[] = [];
  chosenPool.push(...drainFrom(longLens, targetLong));
  chosenPool.push(...drainFrom(midLens, targetMid));
  chosenPool.push(...drainFrom(shortLens, targetShort));
  // If we still need more, pull from any remaining buckets starting with mids/longs to increase length variety
  if (chosenPool.length < n) {
    const remaining: string[] = [
      ...midLens.flatMap((L) => byLen.get(L) || []),
      ...longLens.flatMap((L) => byLen.get(L) || []),
      ...shortLens.flatMap((L) => byLen.get(L) || []),
    ];
    const extra = shuffle(remaining).slice(0, n - chosenPool.length);
    chosenPool.push(...extra);
  }
  const candidates = shuffle(chosenPool);

  const chosen: string[] = [];
  // Shuffle the mixed list so multiple new games yield different word sets
  const randomized = shuffle(candidates.slice());
  for (const word of randomized) {
    if (chosen.length >= targetWordCount) break;
    const placed = placeWordWithOverlapBias(grid, word);
    if (placed) chosen.push(word);
  }

  // If we couldn't place enough, try shorter-first as a fallback
  if (chosen.length < Math.max(6, Math.floor(targetWordCount * 0.6))) {
    const fallback = shuffle(pool.slice());
    for (const word of fallback) {
      if (chosen.length >= targetWordCount) break;
      if (chosen.includes(word)) continue;
      if (placeWordWithOverlapBias(grid, word)) chosen.push(word);
    }
  }

  // Fill remaining empty cells with random letters
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!grid[r][c]) grid[r][c] = String.fromCharCode(65 + ((Math.random() * 26) | 0));
    }
  }

  const rows: string[] = grid.map((row) => row.join(''));
  // Remember recently used words to avoid immediate repetition in future generations
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('wordsearch:recentWords');
      const prev: string[] = raw ? JSON.parse(raw) : [];
      const next = Array.from(new Set([...chosen, ...prev])).slice(0, 500);
      localStorage.setItem('wordsearch:recentWords', JSON.stringify(next));
    }
  } catch {}
  return { width, height, grid: rows, words: chosen };
}

function randomInt(min: number, max: number): number {
  return min + ((Math.random() * (max - min + 1)) | 0);
}

function chooseWeightedDirection(): Direction {
  const idx = (Math.random() * WEIGHTED_DIRECTIONS.length) | 0;
  return WEIGHTED_DIRECTIONS[idx];
}

function scorePlacement(grid: string[][], word: string, r: number, c: number, dir: Direction): number {
  const h = grid.length;
  const w = grid[0].length;
  let overlaps = 0;
  for (let i = 0; i < word.length; i++) {
    const rr = r + dir.dr * i;
    const cc = c + dir.dc * i;
    if (rr < 0 || rr >= h || cc < 0 || cc >= w) return -1;
    const ch = grid[rr][cc];
    if (ch && ch !== word[i]) return -1;
    if (ch && ch === word[i]) overlaps++;
  }
  return overlaps;
}

function placeWordWithOverlapBias(grid: string[][], word: string, samples = 500): boolean {
  const h = grid.length;
  const w = grid[0].length;
  let best: { r: number; c: number; dir: Direction; score: number } | null = null;
  for (let s = 0; s < samples; s++) {
    const dir = chooseWeightedDirection();
    const rMin = dir.dr === -1 ? word.length - 1 : 0;
    const rMax = dir.dr === 1 ? h - word.length : h - 1;
    const cMin = dir.dc === -1 ? word.length - 1 : 0;
    const cMax = dir.dc === 1 ? w - word.length : w - 1;
    if (rMax < rMin || cMax < cMin) continue;
    const r = randomInt(rMin, rMax);
    const c = randomInt(cMin, cMax);
    const sc = scorePlacement(grid, word, r, c, dir);
    if (sc < 0) continue;
    if (!best || sc > best.score || (sc === best.score && Math.random() < 0.5)) {
      best = { r, c, dir, score: sc };
      // Short-circuit for highly overlapping placements
      if (best.score >= Math.max(2, Math.floor(word.length / 2))) break;
    }
  }
  if (!best) {
    // Fallback to simple placement attempts
    return placeWord(grid, word, 200);
  }
  for (let i = 0; i < word.length; i++) {
    const rr = best.r + best.dir.dr * i;
    const cc = best.c + best.dir.dc * i;
    grid[rr][cc] = word[i];
  }
  return true;
}

export type { WSData };



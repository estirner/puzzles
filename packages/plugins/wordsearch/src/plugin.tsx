"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PuzzlePlugin } from '../../../engine/src/index';

export type WSData = { grid: string[]; width: number; height: number; words: string[] };
export type WSState = { found: Set<string>; foundCells: Set<number>; foundWords?: string[] };

function coords(i: number, w: number) { return { r: Math.floor(i / w), c: i % w }; }

export const WordSearchComponent = ({ data, state, onChange, hintTrigger }: { data: WSData; state: WSState; onChange: (next: WSState) => void; hintTrigger?: number }) => {
  const letters = useMemo(() => data.grid.join('').split(''), [data.grid]);
  const [selection, setSelection] = useState<number[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [cellPx, setCellPx] = useState<number>(() => {
    if (data.width <= 8 && data.height <= 8) return 56;
    if (data.width <= 10 && data.height <= 10) return 48;
    if (data.width >= 15 || data.height >= 15) return 32;
    return 40;
  });
  // Load saved cell size after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('wordsearch:cellSizePx');
        const n = raw ? parseInt(raw, 10) : NaN;
        if (!Number.isNaN(n) && n >= 20 && n <= 80) setCellPx((prev) => (prev === n ? prev : n));
      }
    } catch {}
  }, []);
  useEffect(() => { try { if (typeof window !== 'undefined') localStorage.setItem('wordsearch:cellSizePx', String(cellPx)); } catch {} }, [cellPx]);
  const gridStyle = { gridTemplateColumns: `repeat(${data.width}, ${cellPx}px)` } as const;
  const strokePx = Math.max(2, Math.floor(cellPx * 0.10));

  const anchorRef = useRef<{ r: number; c: number } | null>(null);
  const dirRef = useRef<{ dr: number; dc: number } | null>(null);

  function rcFromIndex(i: number) { return { r: Math.floor(i / data.width), c: i % data.width }; }
  function indexFromRC(r: number, c: number) { return r * data.width + c; }

  function toSetFromAny<T>(v: any): Set<T> {
    if (!v) return new Set<T>();
    if (v instanceof Set) return v as Set<T>;
    if (Array.isArray(v)) return new Set<T>(v as T[]);
    if (typeof v === 'object') return new Set<T>(Object.values(v) as T[]);
    return new Set<T>();
  }

  function snapToOctant(dr: number, dc: number): { dr: number; dc: number } | null {
    if (dr === 0 && dc === 0) return null;
    const angle = Math.atan2(dr, dc); // rows increase downward
    const oct = ((Math.round(angle / (Math.PI / 4)) + 8) % 8);
    switch (oct) {
      case 0: return { dr: 0, dc: 1 };   // right
      case 1: return { dr: 1, dc: 1 };   // down-right
      case 2: return { dr: 1, dc: 0 };   // down
      case 3: return { dr: 1, dc: -1 };  // down-left
      case 4: return { dr: 0, dc: -1 };  // left
      case 5: return { dr: -1, dc: -1 }; // up-left
      case 6: return { dr: -1, dc: 0 };  // up
      case 7: return { dr: -1, dc: 1 };  // up-right
      default: return null;
    }
  }

  // Returns exact 8-direction unit if cursor is aligned with row/col/diag from anchor, otherwise null
  function alignedDirection(from: { r: number; c: number }, to: { r: number; c: number }): { dr: number; dc: number } | null {
    const dr = to.r - from.r;
    const dc = to.c - from.c;
    if (dr === 0 && dc === 0) return null;
    if (dr === 0) return { dr: 0, dc: Math.sign(dc) };
    if (dc === 0) return { dr: Math.sign(dr), dc: 0 };
    if (Math.abs(dr) === Math.abs(dc)) return { dr: Math.sign(dr), dc: Math.sign(dc) };
    return null;
  }

  const buildLineSelection = useCallback((from: { r: number; c: number }, to: { r: number; c: number }, lockedDir: { dr: number; dc: number } | null, candidateDir: { dr: number; dc: number } | null): number[] => {
    // Determine direction priority: locked > exact-aligned candidate > snapped octant
    let dir = lockedDir || candidateDir || snapToOctant(to.r - from.r, to.c - from.c);
    if (!dir) return [indexFromRC(from.r, from.c)];
    // Project 'to' onto the ray from 'from' along dir
    const stepsR = dir.dr === 0 ? 0 : Math.abs(to.r - from.r);
    const stepsC = dir.dc === 0 ? 0 : Math.abs(to.c - from.c);
    const steps = dir.dr !== 0 && dir.dc !== 0 ? Math.min(stepsR, stepsC) : Math.max(stepsR, stepsC);
    const cells: number[] = [];
    for (let k = 0; k <= steps; k++) {
      const rr = from.r + dir.dr * k;
      const cc = from.c + dir.dc * k;
      if (rr < 0 || rr >= data.height || cc < 0 || cc >= data.width) break;
      cells.push(indexFromRC(rr, cc));
    }
    return cells;
  }, [data.height, data.width]);

  const finalizeSelection = useCallback((indices?: number[]) => {
    const seq = indices ?? selection;
    if (seq.length === 0) return;
    const picked = seq.map((i) => letters[i]).join('').toUpperCase();
    const rev = picked.split('').reverse().join('');
    const dict = data.words.map((w) => w.toUpperCase());
    const match = dict.includes(picked) ? picked : dict.includes(rev) ? rev : null;
    if (match) {
      (onChange as any)((curr: WSState) => {
        const prevFound = toSetFromAny<string>(curr?.found);
        const nextFound = new Set(Array.from(prevFound));
        nextFound.add(match);
        const prevWords = Array.isArray((curr as any)?.foundWords) ? ((curr as any).foundWords as string[]) : Array.from(prevFound);
        const nextWords = prevWords.slice();
        if (!nextWords.map((w)=>w.toUpperCase()).includes(match)) nextWords.push(match);
        return { ...curr, found: nextFound, foundCells: toSetFromAny<number>(curr?.foundCells), foundWords: nextWords } as WSState;
      });
    }
    setSelection([]);
    anchorRef.current = null; dirRef.current = null;
  }, [data.words, letters, onChange, selection, state.found, state.foundCells]);

  const handleCellClick = useCallback((i: number) => {
    const pos = rcFromIndex(i);
    // No anchor: start new selection at this cell
    if (!anchorRef.current) {
      anchorRef.current = pos; dirRef.current = null; setSelection([i]);
      return;
    }
    const a = anchorRef.current;
    // If clicking the same anchor again, deselect
    if (!dirRef.current && a.r === pos.r && a.c === pos.c) {
      anchorRef.current = null; dirRef.current = null; setSelection([]);
      return;
    }
    // If no direction locked yet, try to set it based on alignment; if not aligned, re-anchor here
    if (!dirRef.current) {
      const cand = alignedDirection(a, pos);
      if (!cand) {
        anchorRef.current = pos; dirRef.current = null; setSelection([i]);
        return;
      }
      dirRef.current = cand;
    }
    const dir = dirRef.current!;
    // Ensure clicked is collinear and ahead of anchor along dir
    const dr = pos.r - a.r; const dc = pos.c - a.c;
    const stepR = dir.dr === 0 ? 0 : dr / dir.dr;
    const stepC = dir.dc === 0 ? 0 : dc / dir.dc;
    const steps = dir.dr !== 0 && dir.dc !== 0 ? stepR : (dir.dr === 0 ? stepC : stepR);
    if (!Number.isFinite(steps) || !Number.isInteger(steps) || steps < 0) {
      // Re-anchor if invalid extension
      anchorRef.current = pos; dirRef.current = null; setSelection([i]);
      return;
    }
    const cells: number[] = [];
    for (let k = 0; k <= steps; k++) {
      const rr = a.r + dir.dr * k; const cc = a.c + dir.dc * k;
      if (rr < 0 || rr >= data.height || cc < 0 || cc >= data.width) break;
      cells.push(indexFromRC(rr, cc));
    }
    setSelection(cells);
    // Auto-confirm on end click
    finalizeSelection(cells);
  }, [data.height, data.width]);

  // Hint pulse: briefly highlight the start of a random remaining word
  const [hintIdx, setHintIdx] = useState<number | null>(null);
  const hintTimer = useRef<number | null>(null);
  useEffect(() => {
    if (typeof hintTrigger === 'undefined' || hintTrigger < 0) return;
    // pick a random not-yet-found word, locate in grid, and pulse its first cell
    const remaining = data.words.filter((w) => !new Set(Array.from(toSetFromAny<string>(state.found))).has(w));
    if (remaining.length === 0) return;
    const word = remaining[Math.floor(Math.random() * remaining.length)].toUpperCase();
    const h = data.height; const w = data.width;
    const dirs = [
      { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: -1, dc: 0 },
      { dr: 1, dc: 1 }, { dr: -1, dc: -1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 },
    ];
    const gridChars = letters.map((c) => c.toUpperCase());
    function tryAt(r: number, c: number, d: { dr: number; dc: number }): number[] | null {
      const idxs: number[] = [];
      for (let i = 0; i < word.length; i++) {
        const rr = r + d.dr * i; const cc = c + d.dc * i;
        if (rr < 0 || rr >= h || cc < 0 || cc >= w) return null;
        const idx = indexFromRC(rr, cc);
        if (gridChars[idx] !== word[i]) return null;
        idxs.push(idx);
      }
      return idxs;
    }
    let anchor: number | null = null;
    outer: for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        for (const d of dirs) {
          const path = tryAt(r, c, d);
          if (path) { anchor = path[0]; break outer; }
        }
      }
    }
    if (anchor !== null) {
      setHintIdx(anchor);
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHintIdx(null), 1200) as unknown as number;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintTrigger]);

  // Compute per-word paths and per-cell color map for found words
  const { foundPaths, colorByIndex, wordColor } = useMemo(() => {
    const paths: Array<{ word: string; cells: number[] }> = [];
    const colorMap = new Map<number, string>();
    const h = data.height; const w = data.width;
    const dirs = [
      { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: -1, dc: 0 },
      { dr: 1, dc: 1 }, { dr: -1, dc: -1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 },
    ];
    const gridChars = letters.map((c) => c.toUpperCase());
    function tryAt(word: string, r: number, c: number, d: { dr: number; dc: number }): number[] | null {
      const idxs: number[] = [];
      for (let i = 0; i < word.length; i++) {
        const rr = r + d.dr * i; const cc = c + d.dc * i;
        if (rr < 0 || rr >= h || cc < 0 || cc >= w) return null;
        const idx = indexFromRC(rr, cc);
        if (gridChars[idx] !== word[i]) return null;
        idxs.push(idx);
      }
      return idxs;
    }
    const palette = [
      'rgb(34,197,94)',   // green
      'rgb(14,165,233)',  // sky
      'rgb(168,85,247)',  // violet
      'rgb(245,158,11)',  // amber
      'rgb(239,68,68)',   // red
      'rgb(20,184,166)',  // teal
      'rgb(236,72,153)',  // pink
      'rgb(249,115,22)',  // orange
      'rgb(59,130,246)',  // blue
      'rgb(16,185,129)',  // emerald
    ];
    const hash = (s: string): number => {
      let h1 = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0; }
      return h1 >>> 0;
    };
    const withAlpha = (rgb: string, a: number): string => rgb.replace('rgb', 'rgba').replace(')', `, ${a})`);
    const wordsList: string[] = Array.isArray((state as any).foundWords)
      ? ((state as any).foundWords as string[])
      : Array.from(toSetFromAny<string>((state as any).found));
    for (const raw of wordsList) {
      const word = raw.toUpperCase();
      let done = false;
      for (let r = 0; r < h && !done; r++) {
        for (let c = 0; c < w && !done; c++) {
          for (const d of dirs) {
            const fwd = tryAt(word, r, c, d);
            if (fwd) { paths.push({ word, cells: fwd }); done = true; break; }
            const rev = tryAt(word.split('').reverse().join(''), r, c, d);
            if (rev) { paths.push({ word, cells: rev }); done = true; break; }
          }
        }
      }
    }
    for (const p of paths) {
      const col = palette[hash(p.word) % palette.length];
      for (const idx of p.cells) colorMap.set(idx, col);
    }
    return { foundPaths: paths, colorByIndex: colorMap, wordColor: (w: string) => palette[hash(w.toUpperCase()) % palette.length] };
  }, [data.height, data.width, letters, state.found, state.foundCells, state.foundWords]);

  const solved = useMemo(() => {
    const target = new Set<string>(data.words.map((w) => w.toUpperCase()));
    const foundList: string[] = Array.isArray((state as any).foundWords) ? (state as any).foundWords as string[] : Array.from(toSetFromAny<string>(state.found));
    let count = 0;
    const seen = new Set<string>();
    for (const w of foundList) {
      const U = (w || '').toUpperCase();
      if (target.has(U) && !seen.has(U)) { seen.add(U); count++; }
    }
    return count >= target.size && target.size > 0;
  }, [data.words, state.found, state.foundWords]);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-white/80">
          <span className="mr-3">Found {state.found.size}/{data.words.length}</span>
          {selection.length > 0 && (
            <span className="rounded bg-white/10 px-2 py-0.5">{selection.map((i)=>letters[i]).join('')}</span>
          )}
        </div>
        <div className="inline-flex items-center gap-2">
          <button className="rounded bg-white/10 px-2 py-1 text-sm hover:bg-white/15" onClick={()=>setCellPx((n)=>Math.max(20, n-4))}>−</button>
          <span className="text-xs text-white/70 w-10 text-center">{cellPx}px</span>
          <button className="rounded bg-white/10 px-2 py-1 text-sm hover:bg-white/15" onClick={()=>setCellPx((n)=>Math.min(80, n+4))}>+</button>
        </div>
      </div>
      <div className="flex items-start gap-4">
        <div className="inline-block max-w-full overflow-auto rounded-xl border border-white/10 bg-black/30 p-2 shadow-lg shadow-black/40">
      <div className="grid" style={gridStyle}>
        {letters.map((ch, i) => (
          <button key={i}
              className={`relative border border-neutral-700 text-center font-semibold transition-colors duration-100 focus:outline-none ${hover===i ? 'bg-white/10' : 'bg-neutral-950/80'}`}
              data-index={i}
              style={{ width: cellPx, height: cellPx, lineHeight: `${cellPx}px`, fontSize: Math.max(14, Math.floor(cellPx * 0.42)) }}
              onMouseEnter={()=>{
                setHover(i);
                const a = anchorRef.current;
                if (a) {
                  const cur = rcFromIndex(i);
                  const cand = alignedDirection(a, cur) || snapToOctant(cur.r - a.r, cur.c - a.c);
                  const next = buildLineSelection(a, cur, dirRef.current, cand);
                  setSelection(next);
                }
              }}
              onMouseLeave={()=>setHover(null)}
              onClick={(e) => { e.preventDefault(); handleCellClick(i); }}
            >
              <span className="pointer-events-none select-none" style={{ position: 'relative', top: -1 }}>{ch}</span>
              {selection.includes(i) && (
                <span className="pointer-events-none absolute inset-0 rounded animate-[pathGlow_250ms_ease-out]" style={{ border: `${strokePx}px solid rgb(56,189,248)`, backgroundColor: 'rgba(56,189,248,0.12)' }} />
              )}
              {colorByIndex.has(i) && !selection.includes(i) && (
                <span className="pointer-events-none absolute inset-0 rounded" style={{ border: `${strokePx}px solid ${colorByIndex.get(i)!}`, backgroundColor: `${colorByIndex.get(i)!.replace('rgb','rgba').replace(')', ', 0.15)')}` }} />
              )}
              {hintIdx === i && !selection.includes(i) && (
                <span className="pointer-events-none absolute inset-0 rounded animate-pulse" style={{ border: `${strokePx}px solid rgba(250,204,21,0.9)`, backgroundColor: 'rgba(250,204,21,0.2)' }} />
              )}
            </button>
          ))}
          </div>
        </div>
        <div className="min-w-[16rem]">
          <div className={`sticky top-4 rounded-xl p-4 shadow-lg ${solved ? 'border border-emerald-500/50 bg-emerald-900/20 text-emerald-200 shadow-emerald-900/30' : 'border border-white/10 bg-white/5 text-white/80'}`}>
            <div className="mb-2 flex items-center gap-2 text-lg font-bold">
              {solved ? (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_20px_6px_rgba(74,222,128,0.6)]" />
                  <span>Solved!</span>
                </>
              ) : (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                  <span>Find the words</span>
                </>
              )}
            </div>
            {!solved && <div className="mb-2 text-sm opacity-90">Click a start cell, then an aligned end cell to confirm.</div>}
            <div className="mt-2">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">Words</div>
              <ul className="max-h-[60vh] overflow-auto pr-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: '0.25rem', columnGap: '1rem' }}>
                {data.words.map((w) => {
                  const upper = w.toUpperCase();
                  const foundSet = new Set(Array.from(toSetFromAny<string>((state as any).found)).map((x)=> (x||'').toUpperCase()));
                  const isFound = foundSet.has(upper);
                  const col = wordColor(w);
                  return (
                    <li key={w} className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: col, opacity: isFound ? 1 : 0.5 }} />
                      <span className={`text-sm ${isFound ? 'line-through' : ''}`} style={isFound ? { color: col } : undefined}>{w}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
      {/* word list moved to right panel */}
    </div>
  );
};

export const wordSearchPlugin: PuzzlePlugin<WSData, WSState> = {
  type: 'wordsearch',
  parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as WSData; },
  serialize(data) { return JSON.stringify(data); },
  createInitialState() { return { found: new Set<string>(), foundCells: new Set<number>() } as WSState; },
  render(data, state) { return function Bound({ onChange }: { onChange: (next: WSState) => void }) { return <WordSearchComponent data={data} state={state} onChange={onChange} />; }; },
  validateMove() { return { ok: true }; },
  isSolved(data, state) { return data.words.every((w) => state.found.has(w)); },
  getHints(data, state) {
    const remaining = data.words.filter((w) => !state.found.has(w));
    return [{ id: 'remain', title: `${remaining.length} words remaining`, body: remaining.slice(0, 5).join(', ') }];
  },
  explainStep() { return null; }
};

export default wordSearchPlugin;




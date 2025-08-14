"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type NonogramsData = {
  rows: number[][];
  cols: number[][];
  // Optional full solution grid (0/1) for fast solving when available
  solution?: number[][];
};

export type NonogramsState = {
  grid: number[][]; // -1 cross, 0 unknown, 1 filled
};

function createGrid(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function runsFromRow(row: number[]): number[] {
  const runs: number[] = [];
  let count = 0;
  for (const cell of row) {
    if (cell === 1) count += 1; else if (count > 0) { runs.push(count); count = 0; }
  }
  if (count > 0) runs.push(count);
  return runs.length ? runs : (row.some(c => c === 1) ? runs : []);
}

function validate(data: NonogramsData, state: NonogramsState): boolean {
  const height = data.rows.length;
  const width = data.cols.length;
  for (let r = 0; r < height; r++) {
    const actual = runsFromRow(state.grid[r]);
    const expected = data.rows[r];
    if (actual.join(',') !== expected.join(',')) return false;
  }
  for (let c = 0; c < width; c++) {
    const col = Array.from({ length: height }, (_, r) => state.grid[r][c]);
    const actual = runsFromRow(col);
    const expected = data.cols[c];
    if (actual.join(',') !== expected.join(',')) return false;
  }
  return true;
}

export const NonogramsComponent = ({ data, state, onChange }: { data: NonogramsData; state: NonogramsState; onChange: (next: NonogramsState) => void }) => {
  const height = data.rows.length;
  const width = data.cols.length;
  const grid = useMemo(() => state.grid, [state.grid]);

  const [cellPx, setCellPx] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('nonograms:cellSizePx');
        const n = raw ? parseInt(raw, 10) : NaN;
        if (!Number.isNaN(n) && n >= 12 && n <= 200) return n;
      }
    } catch {}
    if (width <= 10 && height <= 10) return 72;
    if (width <= 15 && height <= 15) return 48;
    if (width > 30 || height > 30) return 20;
    if (width > 25 || height > 25) return 24;
    return 36;
  });
  useEffect(() => {
    try { if (typeof window !== 'undefined') localStorage.setItem('nonograms:cellSizePx', String(cellPx)); } catch {}
  }, [cellPx]);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);

  // Scroll sync refs
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const colCluesRef = useRef<HTMLDivElement | null>(null);
  const rowCluesRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef<boolean>(false);
  const syncFrom = useRef<'grid' | 'col' | 'row' | null>(null);

  const onGridScroll = useCallback(() => {
    if (syncingRef.current && syncFrom.current !== 'grid') return;
    syncingRef.current = true; syncFrom.current = 'grid';
    const g = gridScrollRef.current; const c = colCluesRef.current; const r = rowCluesRef.current;
    if (g && c) c.scrollLeft = g.scrollLeft;
    if (g && r) r.scrollTop = g.scrollTop;
    syncingRef.current = false; syncFrom.current = null;
  }, []);
  const onColScroll = useCallback(() => {
    if (syncingRef.current && syncFrom.current !== 'col') return;
    syncingRef.current = true; syncFrom.current = 'col';
    const c = colCluesRef.current; const g = gridScrollRef.current;
    if (c && g) g.scrollLeft = c.scrollLeft;
    syncingRef.current = false; syncFrom.current = null;
  }, []);
  const onRowScroll = useCallback(() => {
    if (syncingRef.current && syncFrom.current !== 'row') return;
    syncingRef.current = true; syncFrom.current = 'row';
    const r = rowCluesRef.current; const g = gridScrollRef.current;
    if (r && g) g.scrollTop = r.scrollTop;
    syncingRef.current = false; syncFrom.current = null;
  }, []);

  // Drag paint
  const dragRef = useRef<{ active: boolean; setTo: -1 | 0 | 1; button: 0 | 2 } | null>(null);
  useEffect(() => {
    const up = () => { if (dragRef.current) dragRef.current.active = false; };
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up); };
  }, []);

  const applyAt = useCallback((r: number, c: number, value: -1 | 0 | 1) => {
    const next = grid.map((rr) => rr.slice());
    next[r][c] = value;
    onChange({ grid: next });
  }, [grid, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus();
    const v = grid[r][c];
    const button = e.button; // 0 left, 2 right
    const setTo: -1 | 0 | 1 = button === 2 ? (v === -1 ? 0 : -1) : (v === 1 ? 0 : 1);
    dragRef.current = { active: true, setTo, button: button as 0 | 2 };
    applyAt(r, c, setTo);
  }, [applyAt, grid]);

  const handleMouseEnter = useCallback((_e: React.MouseEvent, r: number, c: number) => {
    if (!dragRef.current?.active) return;
    applyAt(r, c, dragRef.current.setTo);
  }, [applyAt]);

  // Helpers
  function runsFromRow(row: number[]): number[] {
    const runs: number[] = [];
    let count = 0;
    for (const cell of row) { if (cell === 1) count += 1; else if (count > 0) { runs.push(count); count = 0; } }
    if (count > 0) runs.push(count);
    return runs.length ? runs : (row.some(c => c === 1) ? runs : []);
  }
  const rowSatisfied = useMemo(() => {
    return data.rows.map((exp, r) => {
      const act = runsFromRow(grid[r]);
      const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
      return act.join(',') === exp.join(',') && grid[r].filter((v) => v === 1).length === sum(exp);
    });
  }, [data.rows, grid]);
  const colSatisfied = useMemo(() => {
    const out: boolean[] = [];
    const height = data.rows.length; const width = data.cols.length;
    for (let c = 0; c < width; c++) {
      const col = Array.from({ length: height }, (_, r) => grid[r][c]);
      const act = runsFromRow(col);
      const exp = data.cols[c];
      const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
      out[c] = act.join(',') === exp.join(',') && col.filter((v) => v === 1).length === sum(exp);
    }
    return out;
  }, [data.cols, data.rows.length, grid]);

  const maxColLines = useMemo(() => Math.max(1, ...data.cols.map((c) => Math.max(1, c.length))), [data.cols]);
  const clueFontPx = Math.max(10, Math.min(24, Math.floor(cellPx * 0.6)));
  // Extra padding to ensure last line of column clues isn't clipped under the grid
  const topCluesH = maxColLines * (clueFontPx + 4) + 10;
  const maxRowDigits = useMemo(() => {
    const maxLen = Math.max(1, ...data.rows.map((r) => (r.length ? r.map((n) => String(n).length).reduce((a, b) => a + 1 + b, -1) : 1)));
    return Math.min(12, maxLen);
  }, [data.rows]);
  const leftCluesW = Math.max(48, maxRowDigits * (clueFontPx * 0.6) + 16);

  return (
    <div className="p-2 select-none" onKeyDown={(e) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.dataset?.rc) return;
      const [rStr, cStr] = active.dataset.rc.split(',');
      let r = parseInt(rStr, 10); let c = parseInt(cStr, 10);
      if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
      if (e.key === 'ArrowDown') r = Math.min(height - 1, r + 1);
      if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
      if (e.key === 'ArrowRight') c = Math.min(width - 1, c + 1);
      const next = document.querySelector(`[data-rc="${r},${c}"]`) as HTMLElement | null; next?.focus();
    }}>
      {/* Controls */}
      <div className="mb-2 flex items-center gap-3 text-xs text-white/80">
        <label className="flex items-center gap-2"><span>Cell size</span>
          <input type="range" min={16} max={120} step={1} value={cellPx} onChange={(e)=> setCellPx(parseInt(e.target.value, 10))} />
          <span>{cellPx}px</span>
        </label>
      </div>
      {/* Layout grid: top-left corner, top clues (sync X), left clues (sync Y), center grid (scroll both) */}
      <div className="grid" style={{ gridTemplateColumns: `${leftCluesW}px 1fr`, gridTemplateRows: `${topCluesH}px 1fr` }}>
        {/* Corner */}
        <div style={{ width: leftCluesW, height: topCluesH }} className="border-b border-r border-white/10 bg-white/[0.04] backdrop-blur-sm rounded-tl-lg" />
        {/* Column clues */}
        <div ref={colCluesRef} onScroll={onColScroll} className="overflow-x-auto overflow-y-hidden border-b border-white/10 bg-white/[0.03]">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${width}, ${cellPx}px)`, padding: '6px 8px 10px 8px' }}>
            {data.cols.map((c, i) => {
              const lines = c.length ? c : [0];
              const satisfied = colSatisfied[i];
              return (
                <div
                  key={i}
                  className={`flex min-h-full flex-col items-center justify-end gap-0.5 px-1 ${satisfied ? 'text-green-300' : 'text-neutral-300'}`}
                  style={{ fontSize: clueFontPx, lineHeight: `${clueFontPx + 2}px` }}
                >
                  {lines.map((n, k) => (
                    <div key={k}>{n}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        {/* Row clues */}
        <div ref={rowCluesRef} onScroll={onRowScroll} className="overflow-y-auto overflow-x-hidden border-r border-white/10 bg-white/[0.03]">
          <div className="flex flex-col" style={{ padding: '6px 6px 6px 6px', height: height * cellPx }}>
            {data.rows.map((r, i) => (
              <div
                key={i}
                style={{ height: cellPx, fontSize: clueFontPx, lineHeight: `${clueFontPx + 2}px` }}
                className={`flex items-center justify-end gap-1 pr-1 ${rowSatisfied[i] ? 'text-emerald-300' : 'text-neutral-300'}`}
              >
                {r.length ? r.map((n, idx) => (
                  <span key={idx}>{n}{idx < r.length - 1 ? '\u2004' : ''}</span>
                )) : <span>0</span>}
              </div>
            ))}
          </div>
        </div>
        {/* Grid */}
        <div ref={gridScrollRef} onScroll={onGridScroll} className="overflow-auto rounded-br-lg bg-white/[0.02]">
          <div
            className="relative shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] rounded-md"
            style={{ width: width * cellPx, height: height * cellPx }}
            onMouseLeave={() => setHover(null)}
          >
            <div className="grid" style={{ gridTemplateColumns: `repeat(${width}, ${cellPx}px)` }}>
              {grid.map((row, r) => row.map((v, c) => {
                const isHoverRow = hover && hover.r === r;
                const isHoverCol = hover && hover.c === c;
                const thickTop = r % 5 === 0;
                const thickLeft = c % 5 === 0;
                const thickRight = (c + 1) % 5 === 0;
                const thickBottom = (r + 1) % 5 === 0;
                return (
                  <button
                    key={`${r}-${c}`}
                    data-rc={`${r},${c}`}
                    className={`relative border text-center focus:outline-none focus:ring-2 focus:ring-sky-500/70 transition-colors ${
                      v === 1 ? 'bg-neutral-200 text-neutral-900 border-neutral-300' : v === -1 ? 'bg-neutral-950 text-neutral-400 border-neutral-800' : 'bg-neutral-900/70 border-neutral-800'
                    }
                    ${isHoverRow || isHoverCol ? 'bg-white/[0.06]' : ''}
                    ${thickTop ? 'border-t-2 border-t-white/25' : ''}
                    ${thickLeft ? 'border-l-2 border-l-white/25' : ''}
                    ${thickRight ? 'border-r-2 border-r-white/25' : ''}
                    ${thickBottom ? 'border-b-2 border-b-white/25' : ''}
                    `}
                    style={{ width: cellPx, height: cellPx }}
                    onMouseDown={(e) => handleMouseDown(e, r, c)}
                    onMouseEnter={(e) => { setHover({ r, c }); handleMouseEnter(e, r, c); }}
                    onFocus={() => { setSelected({ r, c }); setHover({ r, c }); }}
                    onBlur={() => { setHover(null); }}
                    onDoubleClick={(e) => { e.preventDefault(); applyAt(r, c, 0); }}
                    onClick={(e) => {
                      e.preventDefault();
                      const v0 = grid[r][c];
                      applyAt(r, c, v0 === 1 ? 0 : 1);
                    }}
                    onContextMenu={(e) => { e.preventDefault(); const v0 = grid[r][c]; applyAt(r, c, v0 === -1 ? 0 : -1); }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ') { e.preventDefault(); const v0 = grid[r][c]; applyAt(r, c, v0 === 1 ? 0 : 1); }
                      if (e.key.toLowerCase() === 'x') { e.preventDefault(); const v0 = grid[r][c]; applyAt(r, c, v0 === -1 ? 0 : -1); }
                    }}
                    aria-label={`Cell ${r + 1},${c + 1}`}
                  >
                    {grid[r][c] === -1 ? <span className="text-white/70">×</span> : ''}
                  </button>
                );
              }))}
            </div>
            {/* Selected crosshair */}
            {selected && (
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {/* Row highlight */}
                <div style={{
                  position: 'absolute',
                  top: selected.r * cellPx,
                  left: 0,
                  height: cellPx,
                  width: width * cellPx,
                  background: 'rgba(125,211,252,0.08)'
                }} />
                {/* Col highlight */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: selected.c * cellPx,
                  width: cellPx,
                  height: height * cellPx,
                  background: 'rgba(125,211,252,0.08)'
                }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const nonogramsPlugin: PuzzlePlugin<NonogramsData, NonogramsState> = {
  type: 'nonograms',
  parse(raw) {
    const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    return JSON.parse(json) as NonogramsData;
  },
  serialize(data) {
    return JSON.stringify(data);
  },
  createInitialState(data) {
    return { grid: createGrid(data.rows.length, data.cols.length) };
  },
  render(data, state) {
    return function Bound({ onChange }: { onChange: (next: NonogramsState) => void }) {
      return <NonogramsComponent data={data} state={state} onChange={onChange} />;
    };
  },
  validateMove(data, state) {
    // Partial validation: no row/col runs can exceed target; no filled count can exceed totals
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const runs = (line: number[]): number[] => {
      const out: number[] = []; let c = 0; for (const v of line) { if (v === 1) c++; else if (c > 0) { out.push(c); c = 0; } }
      if (c > 0) out.push(c); return out;
    };
    const height = data.rows.length; const width = data.cols.length;
    for (let r = 0; r < height; r++) {
      const actual = runs(state.grid[r]);
      const expected = data.rows[r];
      if (actual.length > expected.length) return { ok: false };
      for (let i = 0; i < actual.length; i++) if (actual[i] > (expected[i] || 0)) return { ok: false };
      const filled = state.grid[r].filter((v) => v === 1).length;
      if (filled > sum(expected)) return { ok: false };
    }
    for (let c = 0; c < width; c++) {
      const col = Array.from({ length: height }, (_, r) => state.grid[r][c]);
      const actual = runs(col);
      const expected = data.cols[c];
      if (actual.length > expected.length) return { ok: false };
      for (let i = 0; i < actual.length; i++) if (actual[i] > (expected[i] || 0)) return { ok: false };
      const filled = col.filter((v) => v === 1).length;
      if (filled > sum(expected)) return { ok: false };
    }
    return { ok: true };
  },
  isSolved(data, state) {
    return validate(data, state);
  },
  getHints(data, state) {
    const height = data.rows.length; const width = data.cols.length;
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    // 1) Complete/empty line logic
    for (let r = 0; r < height; r++) {
      const need = sum(data.rows[r]);
      const unknown = state.grid[r].filter((v) => v === 0).length;
      const filled = state.grid[r].filter((v) => v === 1).length;
      if (need === filled && unknown > 0) return [{ id: `row-clear-${r}`, title: `Row ${r + 1} complete`, body: 'Mark remaining cells with crosses (X).' }];
      if (need === filled + unknown && unknown > 0) return [{ id: `row-fill-${r}`, title: `Row ${r + 1}: all unknowns are filled`, body: 'Fill all remaining cells.' }];
    }
    for (let c = 0; c < width; c++) {
      const col = Array.from({ length: height }, (_, r) => state.grid[r][c]);
      const need = sum(data.cols[c]);
      const unknown = col.filter((v) => v === 0).length;
      const filled = col.filter((v) => v === 1).length;
      if (need === filled && unknown > 0) return [{ id: `col-clear-${c}`, title: `Column ${c + 1} complete`, body: 'Mark remaining cells with crosses (X).' }];
      if (need === filled + unknown && unknown > 0) return [{ id: `col-fill-${c}`, title: `Column ${c + 1}: all unknowns are filled`, body: 'Fill all remaining cells.' }];
    }
    // 2) Overlap technique for large runs
    const overlapHint = (len: number, runs: number[]): { start: number; end: number }[] => {
      const total = runs.reduce((a, b) => a + b, 0) + (runs.length - 1);
      const free = len - total; if (free < 0) return [];
      const marks: { start: number; end: number }[] = [];
      let pos = 0;
      for (const r of runs) {
        const earliestStart = pos;
        const latestStart = pos + free;
        const overlapStart = Math.max(earliestStart, latestStart);
        const overlapEnd = Math.min(earliestStart + r, latestStart + r);
        if (overlapEnd - overlapStart > 0) marks.push({ start: overlapStart, end: overlapEnd });
        pos = earliestStart + r + 1; // +1 for spacer
      }
      return marks;
    };
    // Try rows then cols for any guaranteed overlaps not already filled
    for (let r = 0; r < height; r++) {
      const marks = overlapHint(width, data.rows[r]);
      for (const { start, end } of marks) {
        for (let c = start; c < end; c++) if (state.grid[r][c] === 0)
          return [{ id: `row-ov-${r}-${start}-${end}`, title: `Row ${r + 1}: overlap`, body: `Cells ${start + 1}-${end} must be filled.` }];
      }
    }
    for (let c = 0; c < width; c++) {
      const marks = overlapHint(height, data.cols[c]);
      for (const { start, end } of marks) {
        for (let r = start; r < end; r++) if (state.grid[r][c] === 0)
          return [{ id: `col-ov-${c}-${start}-${end}`, title: `Column ${c + 1}: overlap`, body: `Cells ${start + 1}-${end} must be filled.` }];
      }
    }
    // 3) Fallback progress hint
    for (let r = 0; r < height; r++) {
      const need = sum(data.rows[r]); const have = state.grid[r].filter((v) => v === 1).length;
      if (have < need) return [{ id: `r${r}`, title: `Row ${r + 1}: ${have}/${need} filled` }];
    }
    return [{ id: 'done', title: 'Try verifying columns' }];
  },
  explainStep() {
    return null;
  }
};

export default nonogramsPlugin;



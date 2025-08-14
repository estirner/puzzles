import type { PuzzlePlugin } from '@repo/engine';
import { useMemo, useState } from 'react';

export type KakuroCell = { sumRight?: number; sumDown?: number; block?: boolean } | { value?: number };
export type KakuroData = { width: number; height: number; grid: KakuroCell[][] };
export type KakuroState = { grid: number[][]; selected?: { r: number; c: number } };

function emptyState(w: number, h: number): number[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
}

export const KakuroComponent = ({ data, state, onChange }: { data: KakuroData; state: KakuroState; onChange: (next: KakuroState) => void }) => {
  const [sel, setSel] = useState(state.selected);
  const g = useMemo(() => state.grid, [state.grid]);

  function isClue(r: number, c: number): boolean {
    const cell = data.grid[r][c] as any;
    return Boolean(cell && (cell.sumRight || cell.sumDown));
  }
  function isBlock(r: number, c: number): boolean {
    const cell = data.grid[r][c] as any;
    return Boolean(cell && cell.block);
  }
  function isFill(r: number, c: number): boolean {
    return !isBlock(r, c) && !isClue(r, c);
  }
  function sameAcrossRun(a: { r: number; c: number } | undefined, r: number, c: number): boolean {
    if (!a) return false; if (a.r !== r) return false;
    const [c0, c1] = a.c < c ? [a.c, c] : [c, a.c];
    for (let cc = c0; cc <= c1; cc++) if (!isFill(r, cc)) return false;
    return true;
  }
  function sameDownRun(a: { r: number; c: number } | undefined, r: number, c: number): boolean {
    if (!a) return false; if (a.c !== c) return false;
    const [r0, r1] = a.r < r ? [a.r, r] : [r, a.r];
    for (let rr = r0; rr <= r1; rr++) if (!isFill(rr, c)) return false;
    return true;
  }
  function focusCell(r: number, c: number) {
    const el = document.getElementById(`kcell-${r}-${c}`) as HTMLInputElement | null;
    el?.focus();
  }
  function moveSelection(r: number, c: number, dr: number, dc: number) {
    let rr = r + dr; let cc = c + dc;
    while (rr >= 0 && rr < data.height && cc >= 0 && cc < data.width) {
      if (isFill(rr, cc)) {
        const nextSel = { r: rr, c: cc } as const;
        setSel(nextSel);
        // Notify parent so selection is persisted in app state (for Reveal etc.)
        onChange({ ...state, selected: nextSel });
        setTimeout(()=>focusCell(rr, cc), 0);
        return;
      }
      rr += dr; cc += dc;
    }
  }

  // --- Run helpers for UI/highlighting ---
  function getAcrossInfo(r: number, c: number):
    | { cells: Array<{ r: number; c: number }>; clue?: { r: number; c: number; target: number };
        sum: number; dup: boolean; over: boolean; complete: boolean }
    | null {
    if (!isFill(r, c)) return null;
    let cc = c; while (cc - 1 >= 0 && isFill(r, cc - 1)) cc--;
    const startC = cc; const clueC = startC - 1;
    const cells: Array<{ r: number; c: number }> = [];
    cc = startC; while (cc < data.width && isFill(r, cc)) { cells.push({ r, c: cc }); cc++; }
    const values = cells.map(({ r, c }) => g[r][c]).filter((n) => n > 0);
    const sum = values.reduce((a, b) => a + b, 0);
    let target = 0; let clue: { r: number; c: number; target: number } | undefined;
    if (clueC >= 0) { const cl: any = data.grid[r][clueC]; if (cl?.sumRight) { target = cl.sumRight; clue = { r, c: clueC, target }; } }
    const counts = new Map<number, number>(); for (const n of values) counts.set(n, (counts.get(n) || 0) + 1);
    const dup = Array.from(counts.values()).some((k) => k > 1);
    const over = target > 0 && sum > target;
    const complete = target > 0 && values.length === cells.length && sum === target && !dup;
    return { cells, clue, sum, dup, over, complete };
  }
  function getDownInfo(r: number, c: number):
    | { cells: Array<{ r: number; c: number }>; clue?: { r: number; c: number; target: number };
        sum: number; dup: boolean; over: boolean; complete: boolean }
    | null {
    if (!isFill(r, c)) return null;
    let rr = r; while (rr - 1 >= 0 && isFill(rr - 1, c)) rr--;
    const startR = rr; const clueR = startR - 1;
    const cells: Array<{ r: number; c: number }> = [];
    rr = startR; while (rr < data.height && isFill(rr, c)) { cells.push({ r: rr, c }); rr++; }
    const values = cells.map(({ r, c }) => g[r][c]).filter((n) => n > 0);
    const sum = values.reduce((a, b) => a + b, 0);
    let target = 0; let clue: { r: number; c: number; target: number } | undefined;
    if (clueR >= 0) { const cl: any = data.grid[clueR][c]; if (cl?.sumDown) { target = cl.sumDown; clue = { r: clueR, c, target }; } }
    const counts = new Map<number, number>(); for (const n of values) counts.set(n, (counts.get(n) || 0) + 1);
    const dup = Array.from(counts.values()).some((k) => k > 1);
    const over = target > 0 && sum > target;
    const complete = target > 0 && values.length === cells.length && sum === target && !dup;
    return { cells, clue, sum, dup, over, complete };
  }

  const acrossInfo = sel ? getAcrossInfo(sel.r, sel.c) : null;
  const downInfo = sel ? getDownInfo(sel.r, sel.c) : null;
  const acrossSet = new Set<string>(acrossInfo?.cells.map(({ r, c }) => `${r},${c}`));
  const downSet = new Set<string>(downInfo?.cells.map(({ r, c }) => `${r},${c}`));

  // Responsive sizing: 36px–56px scaled with viewport width
  const cellSizeVar = 'clamp(36px, 5.2vw, 56px)';
  const cols = `repeat(${data.width}, minmax(var(--cell), var(--cell)))`;
  return (
    <div className="p-2">
      <div
        className="grid w-fit mx-auto rounded-md bg-black/25 p-1"
        style={{ gridTemplateColumns: cols, ['--cell' as any]: cellSizeVar }}
      >
        {data.grid.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r}-${c}`;
            if ('block' in cell && cell.block) return (
              <div
                key={key}
                className="bg-neutral-800 border border-neutral-700"
                style={{ width: 'var(--cell)', height: 'var(--cell)' }}
              />
            );
            const clue = 'sumRight' in cell || 'sumDown' in cell;
            if (clue) {
              const sr = (cell as any).sumRight;
              const sd = (cell as any).sumDown;
              const isAcrossClue = Boolean(acrossInfo?.clue && acrossInfo.clue.r === r && acrossInfo.clue.c === c);
              const isDownClue = Boolean(downInfo?.clue && downInfo.clue.r === r && downInfo.clue.c === c);
              const aErr = isAcrossClue && (acrossInfo?.dup || acrossInfo?.over);
              const dErr = isDownClue && (downInfo?.dup || downInfo?.over);
              const aGood = isAcrossClue && acrossInfo?.complete;
              const dGood = isDownClue && downInfo?.complete;
              const border = aErr || dErr ? 'border-rose-400/60' : aGood || dGood ? 'border-emerald-400/60' : 'border-neutral-600';
              const ring = isAcrossClue || isDownClue ? 'ring-2 ring-sky-400' : '';
              const textA = aErr ? 'text-rose-300' : aGood ? 'text-emerald-300' : 'text-neutral-100';
              const textD = dErr ? 'text-rose-300' : dGood ? 'text-emerald-300' : 'text-neutral-100';
              return (
                <div
                  key={key}
                  className={`relative border ${border} ${ring} text-[11px] leading-none font-medium`}
                  style={{
                    width: 'var(--cell)',
                    height: 'var(--cell)',
                    // Lighter bottom-left triangle, darker top-right triangle to clearly distinguish clues
                    backgroundImage: 'linear-gradient(135deg, rgba(64,64,64,1) 50%, rgba(20,20,20,1) 50%)',
                  }}
                >
                  <div className={`absolute right-0 top-0 p-1 ${textD}`}>{sd ?? ''}</div>
                  <div className={`absolute bottom-0 left-0 p-1 ${textA}`}>{sr ?? ''}</div>
                </div>
              );
            }
            const isSel = sel && sel.r === r && sel.c === c;
            const inAcross = sel && acrossSet.size > 0 ? acrossSet.has(`${r},${c}`) : sameAcrossRun(sel, r, c);
            const inDown = sel && downSet.size > 0 ? downSet.has(`${r},${c}`) : sameDownRun(sel, r, c);
            const hasErr = (inAcross && (acrossInfo?.dup || acrossInfo?.over)) || (inDown && (downInfo?.dup || downInfo?.over));
            const runTint = isSel ? '' : hasErr ? 'bg-rose-500/15' : inAcross || inDown ? (inAcross && inDown ? 'bg-sky-500/20' : 'bg-sky-500/12') : '';
            const hl = isSel ? 'relative z-10 ring-2 ring-sky-500 border-transparent' : runTint;
            return (
              <input
                id={`kcell-${r}-${c}`}
                key={key}
                value={g[r][c] || ''}
                maxLength={1}
                className={`border bg-neutral-950 text-center text-white text-[16px] font-semibold ${hl} ${isSel ? '' : 'border-neutral-700'} shadow-inner`}
                style={{ width: 'var(--cell)', height: 'var(--cell)' }}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={`Row ${r} Column ${c}`}
                onChange={(e) => {
                  const match = e.target.value.match(/[1-9]/);
                  if (!match) return; // ignore invalid characters entirely
                  const val = parseInt(match[0], 10);
                  if (g[r][c] === val) return; // no-op
                  const ng = g.map((rr) => rr.slice());
                  ng[r][c] = val;
                  onChange({ ...state, grid: ng, selected: { r, c } });
                }}
                onFocus={() => { setSel({ r, c }); onChange({ ...state, selected: { r, c } }); }}
                onKeyDown={(e)=>{
                  if (e.key === 'ArrowLeft') { e.preventDefault(); moveSelection(r, c, 0, -1); }
                  else if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection(r, c, 0, 1); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(r, c, -1, 0); }
                  else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(r, c, 1, 0); }
                  else if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();
                    if (g[r][c] !== 0) {
                      const ng = g.map((rr) => rr.slice());
                      ng[r][c] = 0; onChange({ ...state, grid: ng, selected: { r, c } });
                    }
                  } else if (/^[1-9]$/.test(e.key)) {
                    e.preventDefault();
                    const n = parseInt(e.key, 10);
                    if (g[r][c] !== n) {
                      const ng = g.map((rr) => rr.slice());
                      ng[r][c] = n; onChange({ ...state, grid: ng, selected: { r, c } });
                    }
                    // advance within across run if exists
                    moveSelection(r, c, 0, 1);
                  } else if (e.key === 'Tab') {
                    e.preventDefault();
                    if (e.shiftKey) moveSelection(r, c, 0, -1); else moveSelection(r, c, 0, 1);
                  } else if (e.key === '0') {
                    e.preventDefault();
                    if (g[r][c] !== 0) {
                      const ng = g.map((rr) => rr.slice());
                      ng[r][c] = 0; onChange({ ...state, grid: ng, selected: { r, c } });
                    }
                  } else if (e.key.length === 1) {
                    // ignore all other printable characters so history doesn't change
                    e.preventDefault();
                  }
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

export const kakuroPlugin: PuzzlePlugin<KakuroData, KakuroState> = {
  type: 'kakuro',
  parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as KakuroData; },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(data) { return { grid: emptyState(data.width, data.height) }; },
  render(data, state) { return function Bound({ onChange }: { onChange: (next: KakuroState) => void }) { return <KakuroComponent data={data} state={state} onChange={onChange} />; }; },
  validateMove() { return { ok: true }; },
  isSolved(data, state) {
    // Validate each clue sum with no duplicate digits in a run
    function validateRun(cells: Array<{ r: number; c: number }>, target: number): boolean {
      const vals = cells.map(({ r, c }) => state.grid[r][c]).filter((n) => n > 0);
      if (new Set(vals).size !== vals.length) return false;
      const sum = vals.reduce((a, b) => a + b, 0);
      // allow partial <= target; full equals target with all cells filled
      if (vals.length < cells.length) return sum <= target;
      return sum === target;
    }
    // check all right/down clues
    for (let r = 0; r < data.height; r++) {
      for (let c = 0; c < data.width; c++) {
        const cell = data.grid[r][c] as any;
        if (cell.sumRight) {
          const cells: Array<{ r: number; c: number }> = [];
          for (let cc = c + 1; cc < data.width && !(data.grid[r][cc] as any).block && !(data.grid[r][cc] as any).sumRight && !(data.grid[r][cc] as any).sumDown; cc++) cells.push({ r, c: cc });
          if (!validateRun(cells, cell.sumRight)) return false;
        }
        if (cell.sumDown) {
          const cells: Array<{ r: number; c: number }> = [];
          for (let rr = r + 1; rr < data.height && !(data.grid[rr][c] as any).block && !(data.grid[rr][c] as any).sumRight && !(data.grid[rr][c] as any).sumDown; rr++) cells.push({ r: rr, c });
          if (!validateRun(cells, cell.sumDown)) return false;
        }
      }
    }
    // all cells non-clue/non-block must be filled
    for (let r = 0; r < data.height; r++) for (let c = 0; c < data.width; c++) {
      const cell = data.grid[r][c] as any;
      if (!cell.block && !cell.sumRight && !cell.sumDown) {
        if (!state.grid[r][c]) return false;
      }
    }
    return true;
  },
  getHints() { return [
    { id: 'sums', title: 'Use unique sums', body: 'Each run uses digits 1–9 without repetition.' },
    { id: 'pair', title: 'Corner pairs', body: 'Short runs (2 cells) have limited pairs. For sum S, pairs are chosen from 1–9.' },
  ]; },
  explainStep() { return null; }
};

export default kakuroPlugin;



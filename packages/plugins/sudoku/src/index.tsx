import type { PuzzlePlugin } from '@repo/engine';
import { useMemo, useState } from 'react';

export type SudokuData = { size: 9; givens: Array<{ r: number; c: number; v: number }> };
export type SudokuState = { grid: number[][]; selected?: { r: number; c: number } };

function createEmptyGrid(): number[][] {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
}

export const SudokuComponent = ({ data, state, onChange }: { data: SudokuData; state: SudokuState; onChange: (next: SudokuState) => void }) => {
  const [selected, setSelected] = useState<{ r: number; c: number } | undefined>(state.selected);
  const grid = useMemo(() => state.grid, [state.grid]);

  return (
    <div className="p-4">
      <div className="grid grid-cols-9 gap-1 max-w-[28rem] select-none">
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const given = data.givens.some((g) => g.r === r && g.c === c);
            const isSelected = selected && selected.r === r && selected.c === c;
            return (
              <button
                key={`${r}-${c}`}
                className={`h-10 w-10 rounded border text-center text-lg font-semibold ${
                  given ? 'bg-neutral-800 text-neutral-200 border-neutral-700' : 'bg-neutral-900 text-neutral-100 border-neutral-800'
                } ${isSelected ? 'ring-2 ring-sky-500' : ''}`}
                onClick={() => {
                  setSelected({ r, c });
                }}
              >
                {cell || ''}
              </button>
            );
          })
        )}
      </div>
      <div className="mt-4 grid grid-cols-10 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-700"
            onClick={() => {
              if (!selected) return;
              const next = grid.map((r) => r.slice());
              next[selected.r][selected.c] = n;
              onChange({ ...state, grid: next, selected });
            }}
          >
            {n}
          </button>
        ))}
        <button
          className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-700"
          onClick={() => {
            if (!selected) return;
            const next = grid.map((r) => r.slice());
            next[selected.r][selected.c] = 0;
            onChange({ ...state, grid: next, selected });
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export const sudokuPlugin: PuzzlePlugin<SudokuData, SudokuState> = {
  type: 'sudoku',
  parse(raw) {
    const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    const parsed = JSON.parse(json) as SudokuData;
    return parsed;
  },
  serialize(data) {
    return JSON.stringify(data);
  },
  createInitialState(data) {
    const grid = createEmptyGrid();
    for (const g of data.givens) grid[g.r][g.c] = g.v;
    return { grid };
  },
  render(data, state) {
    return SudokuComponent.bind(null, { data, state });
  },
  validateMove(_data, state) {
    const rowsOk = state.grid.every((row) => {
      const nums = row.filter((n) => n !== 0);
      return new Set(nums).size === nums.length;
    });
    const colsOk = Array.from({ length: 9 }).every((_, c) => {
      const col = state.grid.map((r) => r[c]).filter((n) => n !== 0);
      return new Set(col).size === col.length;
    });
    return { ok: rowsOk && colsOk };
  },
  isSolved(_data, state) {
    return state.grid.every((row) => row.every((n) => n !== 0));
  },
  getHints() {
    return [{ id: 'start', title: 'Start with singles', body: 'Look for rows/cols with 8 filled cells.' }];
  },
  explainStep() {
    return null;
  }
};

export default sudokuPlugin;



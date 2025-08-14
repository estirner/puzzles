"use client";
import { useMemo, useState } from 'react';
import { PuzzleLayout } from '../../components/PuzzleLayout';
import { SudokuComponent, SudokuData, SudokuState } from '@repo/plugins-sudoku';

export default function SudokuEditorPage() {
  const [data, setData] = useState<SudokuData>({ size: 9, givens: [] });
  const [state, setState] = useState<SudokuState>({ grid: Array.from({ length: 9 }, () => Array(9).fill(0)), notes: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [])) });
  const Comp = useMemo(() => SudokuComponent, []);
  return (
    <PuzzleLayout title="Sudoku Editor" sidebar={(
      <div className="space-y-2 text-sm">
        <button className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-700" onClick={() => {
          const json = JSON.stringify({ ...data, givens: [] });
          navigator.clipboard?.writeText(json).catch(() => {});
          alert('Puzzle JSON copied to clipboard');
        }}>Copy JSON</button>
      </div>
    )}>
      <Comp data={data} state={state} onChange={setState} />
    </PuzzleLayout>
  );
}



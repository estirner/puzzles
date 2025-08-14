"use client";
import { useMemo, useState } from 'react';
import { PuzzleLayout } from '../../components/PuzzleLayout';
import { NonogramsComponent, NonogramsData, NonogramsState } from '@repo/plugins-nonograms';

export default function NonogramsEditorPage() {
  const [data, setData] = useState<NonogramsData>({ rows: [[1],[1]], cols: [[1],[1]] });
  const [state, setState] = useState<NonogramsState>({ grid: [[0,0],[0,0]] });
  const Comp = useMemo(() => NonogramsComponent, []);
  return (
    <PuzzleLayout title="Nonograms Editor" sidebar={(
      <div className="space-y-2 text-sm">
        <button className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 hover:border-neutral-700" onClick={() => {
          const json = JSON.stringify(data);
          navigator.clipboard?.writeText(json).catch(() => {});
          alert('Puzzle JSON copied to clipboard');
        }}>Copy JSON</button>
      </div>
    )}>
      <Comp data={data} state={state} onChange={setState} />
    </PuzzleLayout>
  );
}



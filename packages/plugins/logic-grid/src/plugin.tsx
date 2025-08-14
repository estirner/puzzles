import type { PuzzlePlugin } from '@repo/engine';
import { useMemo, useState } from 'react';

export type LGData = { categories: Array<{ name: string; items: string[] }>; clues: string[]; solution?: Record<string, Record<string, string>> };
export type LGState = { matrix: Record<string, Record<string, number>> };

function initMatrix(data: LGData): LGState {
  const matrix: LGState['matrix'] = {};
  const base = data.categories[0].items;
  for (const a of base) {
    matrix[a] = {} as any;
    for (let i = 1; i < data.categories.length; i++) {
      for (const b of data.categories[i].items) {
        matrix[a][`${data.categories[i].name}:${b}`] = 0; // 1 yes, -1 no, 0 unknown
      }
    }
  }
  return { matrix };
}

export const LogicGridComponent = ({ data, state, onChange }: { data: LGData; state: LGState; onChange: (next: LGState) => void }) => {
  const [catIndex, setCatIndex] = useState(1);
  const base = data.categories[0];
  const other = data.categories[catIndex];
  const keys = base.items.map((a) => other.items.map((b) => `${other.name}:${b}`));
  return (
    <div className="p-2">
      <div className="mb-3 flex gap-2 text-sm">
        <span className="text-neutral-400">Relate {base.name} to</span>
        <select className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1" value={catIndex} onChange={(e) => setCatIndex(parseInt(e.target.value, 10))}>
          {data.categories.slice(1).map((c, i) => (
            <option key={c.name} value={i + 1}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="inline-grid" style={{ gridTemplateColumns: `repeat(${other.items.length + 1}, minmax(3rem, 3rem))` }}>
        <div />
        {other.items.map((b) => (
          <div key={b} className="h-10 w-12 truncate p-1 text-center text-xs text-neutral-300">{b}</div>
        ))}
        {base.items.map((a, r) => (
          <>
            <div key={`${a}-label`} className="h-10 w-12 truncate p-1 text-xs text-neutral-300">{a}</div>
            {other.items.map((b, c) => {
              const k = `${other.name}:${b}`;
              const v = state.matrix[a][k];
              return (
                <button
                  key={`${a}-${k}`}
                  className={`h-10 w-12 border ${v === 1 ? 'bg-green-900/40 border-green-700' : v === -1 ? 'bg-red-900/40 border-red-700' : 'bg-neutral-900 border-neutral-800'}`}
                  onClick={() => {
                    const next = JSON.parse(JSON.stringify(state.matrix)) as LGState['matrix'];
                    const nextVal = v === 0 ? 1 : v === 1 ? -1 : 0;
                    next[a][k] = nextVal;
                    if (nextVal === 1) {
                      // Row exclusion
                      for (const bb of other.items) if (bb !== b) next[a][`${other.name}:${bb}`] = -1;
                      // Column exclusion
                      for (const aa of base.items) if (aa !== a) next[aa][`${other.name}:${b}`] = -1;
                    }
                    onChange({ matrix: next });
                  }}
                />
              );
            })}
          </>
        ))}
      </div>
      <div className="mt-4 text-sm text-neutral-300">
        <div className="font-semibold">Clues</div>
        <ul className="list-disc pl-5">
          {data.clues.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </div>
    </div>
  );
};

export const logicGridPlugin: PuzzlePlugin<LGData, LGState> = {
  type: 'logic-grid',
  parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as LGData; },
  serialize(data) { return JSON.stringify(data); },
  createInitialState(data) { return initMatrix(data); },
  render(data, state) { return function Bound({ onChange }: { onChange: (next: LGState) => void }) { return <LogicGridComponent data={data} state={state} onChange={onChange} />; }; },
  validateMove(data, state) {
    const base = data.categories[0];
    for (let i = 1; i < data.categories.length; i++) {
      const cat = data.categories[i];
      for (const a of base.items) {
        const vals = cat.items.map((b) => state.matrix[a][`${cat.name}:${b}`]);
        if (vals.filter((v) => v === 1).length > 1) return { ok: false };
      }
      for (const b of cat.items) {
        const vals = base.items.map((a) => state.matrix[a][`${cat.name}:${b}`]);
        if (vals.filter((v) => v === 1).length > 1) return { ok: false };
      }
    }
    return { ok: true };
  },
  isSolved(data, state) {
    // solved when every base item has exactly one positive relation per other category
    const base = data.categories[0];
    for (const a of base.items) {
      for (let i = 1; i < data.categories.length; i++) {
        const cat = data.categories[i];
        let positives = 0;
        for (const b of cat.items) {
          if (state.matrix[a][`${cat.name}:${b}`] === 1) positives++;
        }
        if (positives !== 1) return false;
      }
    }
    return true;
  },
  getHints(data, state) {
    const base = data.categories[0];
    for (let i = 1; i < data.categories.length; i++) {
      const cat = data.categories[i];
      for (const a of base.items) {
        const vals = cat.items.map((b) => state.matrix[a][`${cat.name}:${b}`]);
        const unknowns = vals.map((v, idx) => ({ v, idx })).filter((x) => x.v === 0);
        const yesCount = vals.filter((v) => v === 1).length;
        if (yesCount === 0 && unknowns.length === 1) {
          const b = cat.items[unknowns[0].idx];
          return [{ id: `single-${a}-${cat.name}`, title: `Single for ${a}`, body: `${a} must be ${cat.name}:${b}` }];
        }
      }
    }
    return [{ id: 'cycle', title: 'Tip', body: 'Click cells to cycle: unknown → yes → no' }];
  },
  explainStep() { return null; }
};

export default logicGridPlugin;



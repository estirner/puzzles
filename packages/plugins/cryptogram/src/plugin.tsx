import type { PuzzlePlugin } from '@repo/engine';
import { useMemo } from 'react';

export type CGData = { ciphertext: string; plaintext?: string; alphabet?: string };
export type CGState = { mapping: Record<string, string> };

const DEFAULT_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const CryptogramComponent = ({ data, state, onChange }: { data: CGData; state: CGState; onChange: (next: CGState) => void }) => {
  const alpha = data.alphabet ?? DEFAULT_ALPHA;
  const letters = useMemo(() => Array.from(new Set(data.ciphertext.toUpperCase().replace(/[^A-Z]/g, '').split(''))).sort(), [data.ciphertext]);
  const decoded = useMemo(() => data.ciphertext.split('').map((ch) => {
    const up = ch.toUpperCase();
    const m = state.mapping[up];
    // Preserve case of plaintext substitution to mirror ciphertext case
    if (/[A-Z]/.test(up)) {
      if (!m) return '_';
      return ch === up ? m : m.toLowerCase();
    }
    return ch;
  }).join(''), [data.ciphertext, state.mapping]);

  // Track used plaintext letters to warn on duplicates
  const usedPlain = useMemo(() => {
    const used = new Map<string, string>(); // plain -> cipher
    for (const [c, p] of Object.entries(state.mapping)) {
      if (p && /[A-Z]/.test(p)) used.set(p, c);
    }
    return used;
  }, [state.mapping]);

  return (
    <div className="p-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/60">Decoded</div>
        <div className="rounded-md border border-white/10 bg-black/30 p-3 font-mono whitespace-pre-wrap break-words">
          {decoded}
        </div>
        <div className="mt-3 text-xs text-white/60">Ciphertext</div>
        <div className="rounded-md border border-white/10 bg-black/20 p-3 font-mono whitespace-pre-wrap break-words opacity-80">
          {data.ciphertext}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-sm text-white/80">Letter mapping</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-sm">
          {letters.map((lc) => {
            const val = state.mapping[lc] || '';
            const isDup = val && usedPlain.has(val) && usedPlain.get(val) !== lc;
            return (
              <label key={lc} className={`flex items-center gap-2 rounded-md border px-2 py-1 ${isDup ? 'border-red-600 bg-red-900/20' : 'border-white/10 bg-white/[0.03]'}`}>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-white/10 text-neutral-200 font-semibold">{lc}</span>
                <input
                  aria-label={`Map ${lc} to`}
                  className="min-w-0 flex-1 rounded bg-black/30 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                  maxLength={1}
                  value={val}
                  onChange={(e) => {
                    const ch = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                    const next = { ...state.mapping };
                    next[lc] = ch;
                    onChange({ mapping: next });
                  }}
                  placeholder="_"
                />
              </label>
            );
          })}
        </div>
      </div>
      <div className="mt-4 text-xs text-neutral-400">Alphabet: {alpha}</div>
    </div>
  );
};

export const cryptogramPlugin: PuzzlePlugin<CGData, CGState> = {
  type: 'cryptogram',
  parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as CGData; },
  serialize(data) { return JSON.stringify(data); },
  createInitialState() { return { mapping: {} }; },
  render(data, state) { return function Bound({ onChange }: { onChange: (next: CGState) => void }) { return <CryptogramComponent data={data} state={state} onChange={onChange} />; }; },
  validateMove(_data, state) {
    // ensure one-to-one mapping (no duplicate plaintext letters)
    const vals = Object.values(state.mapping).filter(Boolean);
    const lettersOnly = vals.filter((v) => /[A-Z]/.test(v));
    const ok = new Set(lettersOnly).size === lettersOnly.length;
    return { ok };
  },
  isSolved(data, state) {
    if (!data.plaintext) return false;
    const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');
    const target = normalize(data.plaintext);
    const filled = data.ciphertext.split('').map((ch) => {
      const up = ch.toUpperCase();
      const m = state.mapping[up];
      return /[A-Z]/.test(up) ? (m || '') : '';
    }).join('');
    return normalize(filled) === target && target.length > 0;
  },
  getHints(data, state) {
    // Simple frequency hint
    const text = data.ciphertext.toUpperCase().replace(/[^A-Z]/g, '');
    const counts: Record<string, number> = {};
    for (const ch of text) counts[ch] = (counts[ch] || 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5).map(([ch, n]) => `${ch}:${n}`).join(', ');
    return [{ id: 'freq', title: 'Frequency hint', body: top }];
  },
  explainStep() { return null; }
};

export default cryptogramPlugin;



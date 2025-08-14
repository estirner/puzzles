"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { useMemo, useState } from 'react';

export type RiddleData = {
  prompt: string;
  answers: string[]; // acceptable answers (synonyms)
  answerType?: 'text' | 'number' | 'sequence' | 'set' | 'pair' | 'tuple' | 'mapping' | 'matrix' | 'multiline'; // optional: how to compare inputs
  category?: string; // free-form category label
  difficulty?: number; // 1..5
  hints?: string[]; // progressive hints
};

export type RiddleState = {
  answer: string;
  revealedHints: number;
  solved?: boolean;
};

function normalizeAnswer(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

function normalizeForType(s: string, type: RiddleData['answerType'] | undefined): string {
  const base = normalizeAnswer(s);
  switch (type) {
    case 'number': {
      const n = parseInt(base, 10);
      return Number.isFinite(n) ? String(n) : '';
    }
    case 'sequence': {
      const tokens = tokenize(base);
      return tokens.join(' ');
    }
    case 'set': {
      const tokens = Array.from(new Set(tokenize(base)));
      tokens.sort();
      return tokens.join(' ');
    }
    case 'pair': {
      const tokens = tokenize(base);
      if (tokens.length !== 2) return '';
      tokens.sort();
      return tokens.join(' ');
    }
    case 'tuple': {
      const tokens = tokenize(base);
      return tokens.join(',');
    }
    case 'mapping': {
      // Accept entries like a=1,b=2 or a:1, b:2 or a 1; order-insensitive by key
      const entries: Array<[string, string]> = [];
      for (const rawEntry of base.split(/[,;]+/g)) {
        const trimmed = rawEntry.trim();
        if (!trimmed) continue;
        const m = trimmed.split(/[:=\s]+/g).filter(Boolean);
        if (m.length >= 2) {
          const key = m[0];
          const val = m.slice(1).join(' ');
          entries.push([key, val]);
        }
      }
      entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      return entries.map(([k, v]) => `${k}=${v}`).join(',');
    }
    case 'matrix': {
      // Rows separated by ';' or newlines, columns by spaces
      const rows = base.split(/[;\n]+/g).map(r => r.trim()).filter(Boolean);
      const normRows = rows.map(r => tokenize(r).join(' '));
      return normRows.join(' | ');
    }
    case 'multiline': {
      return base; // same normalization, but UI will be textarea
    }
    default:
      return base;
  }
}

export const RiddleComponent = ({ data, state, onChange }: { data: RiddleData; state: RiddleState; onChange: (next: RiddleState) => void }) => {
  const [feedback, setFeedback] = useState<string | null>(null);
  const revealed = Math.max(0, Math.min(state.revealedHints || 0, (data.hints?.length || 0)));
  const normalizedAnswers = useMemo(() => (data.answers || []).map((a) => normalizeForType(a, data.answerType)), [data.answers, data.answerType]);
  const solved = useMemo(() => {
    if (!state.solved) return false;
    const got = normalizeForType(state.answer, data.answerType);
    return got.length > 0 && normalizedAnswers.includes(got);
  }, [state.solved, state.answer, normalizedAnswers, data.answerType]);

  const useTextarea = data.answerType === 'multiline' || data.answerType === 'matrix' || data.answerType === 'mapping';
  return (
    <div className="p-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/60">Prompt</div>
        <div className="rounded-md border border-white/10 bg-black/30 p-3 whitespace-pre-wrap text-[15px] leading-6 text-white/90">
          {data.prompt}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        {useTextarea ? (
          <textarea
            className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-sky-500/60 h-28"
            placeholder={
              data.answerType === 'mapping' ? 'Enter key=value pairs, comma- or newline-separated'
              : data.answerType === 'matrix' ? 'Enter rows on new lines; columns space-separated'
              : 'Type your answer...'
            }
            value={state.answer || ''}
            onChange={(e)=> onChange({ ...state, answer: e.target.value })}
          />
        ) : (
          <input
            className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
            placeholder={
              data.answerType === 'number' ? 'Type a number...'
              : data.answerType === 'sequence' ? 'Enter a sequence (e.g., 1 1 2 3 5)'
              : data.answerType === 'set' ? 'Enter a set (space-separated, any order)'
              : data.answerType === 'pair' ? 'Enter two values (order-insensitive)'
              : data.answerType === 'tuple' ? 'Enter values separated by spaces'
              : 'Type your answer...'
            }
            value={state.answer || ''}
            onChange={(e)=> onChange({ ...state, answer: e.target.value })}
            onKeyDown={(e)=> { if (e.key === 'Enter') {
              const got = normalizeForType((state.answer||''), data.answerType);
              if (got && normalizedAnswers.includes(got)) { onChange({ ...state, solved: true }); setFeedback('Correct!'); }
              else setFeedback('Not quite, try again.');
            }}}
          />
        )}
        <button
          className="rounded border border-white/15 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.09]"
          onClick={()=>{
            const got = normalizeForType((state.answer||''), data.answerType);
            if (got && normalizedAnswers.includes(got)) { onChange({ ...state, solved: true }); setFeedback('Correct!'); }
            else setFeedback('Not quite, try again.');
          }}
        >Check</button>
        <button
          className="rounded border border-white/15 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.09]"
          onClick={()=>{
            const n = Math.min((state.revealedHints||0) + 1, data.hints?.length || 0);
            onChange({ ...state, revealedHints: n });
          }}
          disabled={!data.hints || revealed >= (data.hints?.length||0)}
        >Reveal hint</button>
        <button
          className="rounded border border-white/15 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.09]"
          onClick={()=>{
            const best = data.answers?.[0] || '';
            onChange({ ...state, answer: best, solved: true });
            setFeedback('Revealed');
          }}
        >Reveal solution</button>
      </div>
      {feedback && (
        <div className={`mt-3 text-sm ${solved ? 'text-emerald-300' : 'text-white/80'}`}>{feedback}</div>
      )}
      {data.hints && revealed > 0 && (
        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="font-semibold">Hints</div>
          <ul className="mt-1 list-disc pl-5 text-sm text-neutral-300">
            {data.hints.slice(0, revealed).map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export const riddlesPlugin: PuzzlePlugin<RiddleData, RiddleState> = {
  type: 'riddles',
  parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as RiddleData; },
  serialize(data) { return JSON.stringify(data); },
  createInitialState() { return { answer: '', revealedHints: 0, solved: false }; },
  render(data, state) { return function Bound({ onChange }: { onChange: (next: RiddleState) => void }) { return <RiddleComponent data={data} state={state} onChange={onChange} />; }; },
  validateMove() { return { ok: true }; },
  isSolved(_data, state) { return Boolean(state?.solved); },
  getHints(data, state) {
    const n = Math.max(0, Math.min(state.revealedHints || 0, (data.hints?.length || 0)));
    if (!data.hints || n <= 0) return [];
    return [{ id: `hint-${n-1}`, title: 'Hint', body: data.hints[n-1] }];
  },
  explainStep() { return null; }
};

export default riddlesPlugin;



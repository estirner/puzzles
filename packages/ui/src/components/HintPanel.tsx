import React from 'react';

export type Hint = { id: string; title: string; body?: string };

export function HintPanel({ hint }: { hint?: Hint | null }) {
  if (!hint) return null;
  return (
    <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="font-semibold">{hint.title}</div>
      {hint.body && <div className="mt-1 text-sm text-neutral-300 whitespace-pre-wrap">{hint.body}</div>}
    </div>
  );
}



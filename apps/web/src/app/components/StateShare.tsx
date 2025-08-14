"use client";
import React from 'react';
import LZ from 'lz-string';

export function encodeState<T>(state: T): string {
  try { return LZ.compressToEncodedURIComponent(JSON.stringify(state)); } catch { return ''; }
}

export function decodeState<T>(hash: string): T | null {
  try { return JSON.parse(LZ.decompressFromEncodedURIComponent(hash) || 'null'); } catch { return null; }
}

export default function StateShare({ getState }: { getState: () => any }) {
  return (
    <button
      className="rounded border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-md hover:bg-white/[0.08]"
      onClick={() => {
        const s = encodeState(getState());
        const url = `${location.origin}${location.pathname}#${s}`;
        navigator.clipboard?.writeText(url).catch(() => {});
        alert('Share link copied to clipboard');
      }}
    >
      Share state
    </button>
  );
}



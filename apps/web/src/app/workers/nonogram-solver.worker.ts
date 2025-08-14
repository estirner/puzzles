/// <reference lib="webworker" />
import { solveNonogram, type NonogramsData } from '@repo/plugins-nonograms';

declare const self: DedicatedWorkerGlobalScope;

type Req = { reqId?: string; kind: 'solve'; data: NonogramsData };
type Res = { reqId?: string; kind: 'solve'; ok: boolean; solution?: number[][]; error?: string };

self.onmessage = (ev: MessageEvent<Req>) => {
  const msg = ev.data;
  if (!msg || msg.kind !== 'solve') return;
  try {
    // Yield to event loop for very large puzzles to keep worker responsive
    setTimeout(() => {
      try {
        const sol = solveNonogram(msg.data);
        const out: Res = { reqId: msg.reqId, kind: 'solve', ok: Boolean(sol), solution: sol || undefined };
        self.postMessage(out);
      } catch (e2) {
        const out: Res = { reqId: msg.reqId, kind: 'solve', ok: false, error: (e2 as Error)?.message || 'solve failed' };
        self.postMessage(out);
      }
    }, 0);
  } catch (e) {
    const out: Res = { reqId: msg.reqId, kind: 'solve', ok: false, error: (e as Error)?.message || 'solve failed' };
    self.postMessage(out);
  }
};



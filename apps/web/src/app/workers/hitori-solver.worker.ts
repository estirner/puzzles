/// <reference lib="webworker" />
import { generateHitori, solveHitori, type HitoriData } from '@repo/plugins-hitori';

declare const self: DedicatedWorkerGlobalScope;

type GenerateReq = { reqId?: string; kind: 'generate'; size?: number; density?: 'sparse' | 'normal' | 'dense' | number };
type SolveReq = { reqId?: string; kind: 'solve'; data: HitoriData; timeoutMs?: number };
type Req = GenerateReq | SolveReq;

type GenerateRes = { reqId?: string; kind: 'generate'; ok: boolean; data?: HitoriData; error?: string };
type SolveRes = { reqId?: string; kind: 'solve'; ok: boolean; solution?: number[][] | null; error?: string };

self.onmessage = (ev: MessageEvent<Req>) => {
  const msg = ev.data;
  if (!msg) return;
  try {
    if (msg.kind === 'generate') {
      // Yield to avoid blocking the worker event loop for setup
      setTimeout(() => {
        try {
          const size = typeof msg.size === 'number' ? msg.size : 8;
          const data = generateHitori(size, undefined, { density: (msg as any).density });
          const out: GenerateRes = { reqId: msg.reqId, kind: 'generate', ok: true, data };
          self.postMessage(out);
        } catch (e) {
          const out: GenerateRes = { reqId: msg.reqId, kind: 'generate', ok: false, error: (e as Error)?.message || 'generation failed' };
          self.postMessage(out);
        }
      }, 0);
    } else if (msg.kind === 'solve') {
      setTimeout(() => {
        try {
          // Scale timeout with grid size for larger puzzles
          const H = msg.data?.height || 8;
          const W = msg.data?.width || 8;
          const defaultMs = Math.max(8000, Math.min(90000, 6000 + H * W * 180));
          const timeoutMs = typeof msg.timeoutMs === 'number' ? msg.timeoutMs : defaultMs;
          const solution = solveHitori(msg.data, timeoutMs);
          const out: SolveRes = { reqId: msg.reqId, kind: 'solve', ok: true, solution };
          self.postMessage(out);
        } catch (e) {
          const out: SolveRes = { reqId: msg.reqId, kind: 'solve', ok: false, error: (e as Error)?.message || 'solve failed' };
          self.postMessage(out);
        }
      }, 0);
    }
  } catch (e) {
    // Best-effort; report a generic error
    const kind = (msg as any).kind;
    const out: any = { reqId: (msg as any)?.reqId, kind, ok: false, error: (e as Error)?.message || 'worker error' };
    self.postMessage(out);
  }
};



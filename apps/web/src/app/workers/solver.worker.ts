/// <reference lib="webworker" />
import { getPlugin, type WorkerRequest, type WorkerResponse } from '@repo/engine';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    const plugin = getPlugin(msg.plugin);
    if (!plugin) return;
    let out: WorkerResponse | null = null;
    if (msg.kind === 'validate') {
      out = { reqId: msg.reqId, kind: 'validate', result: plugin.validateMove(msg.data, msg.state, msg.move) };
    } else if (msg.kind === 'hint') {
      out = { reqId: msg.reqId, kind: 'hint', result: plugin.getHints(msg.data, msg.state) };
    } else if (msg.kind === 'explain') {
      out = { reqId: msg.reqId, kind: 'explain', result: plugin.explainStep(msg.data, msg.state) };
    }
    if (out) self.postMessage(out);
  } catch (e) {
    // workers are best-effort; fail silently in this scaffold
  }
};



export type Hint = { id: string; title: string; body?: string };
export type Explanation = { step: string; details?: string };

export interface PuzzlePlugin<TData = unknown, TState = unknown> {
  type: string;
  parse: (raw: ArrayBuffer | string) => TData;
  serialize: (data: TData) => ArrayBuffer | string;
  createInitialState: (data: TData) => TState;
  render: (data: TData, state: TState) => any;
  validateMove: (data: TData, state: TState, move: unknown) => { ok: boolean; errors?: string[] };
  isSolved: (data: TData, state: TState) => boolean;
  getHints: (data: TData, state: TState) => Hint[];
  explainStep: (data: TData, state: TState) => Explanation | null;
}

export interface RegisteredPlugin {
  type: string;
  plugin: PuzzlePlugin;
}

const registry: Map<string, PuzzlePlugin<any, any>> = new Map();

export function registerPlugin<TData = unknown, TState = unknown>(plugin: PuzzlePlugin<TData, TState>): void {
  registry.set(plugin.type, plugin as unknown as PuzzlePlugin<any, any>);
}

export function getPlugin<TData = unknown, TState = unknown>(type: string): PuzzlePlugin<TData, TState> | undefined {
  return registry.get(type) as unknown as PuzzlePlugin<TData, TState> | undefined;
}

// Worker message protocol (scaffold)
export type WorkerRequest =
  | { reqId?: string; kind: 'validate'; plugin: string; data: any; state: any; move: any }
  | { reqId?: string; kind: 'hint'; plugin: string; data: any; state: any }
  | { reqId?: string; kind: 'explain'; plugin: string; data: any; state: any };

export type WorkerResponse =
  | { reqId?: string; kind: 'validate'; result: { ok: boolean; errors?: string[] } }
  | { reqId?: string; kind: 'hint'; result: Hint[] }
  | { reqId?: string; kind: 'explain'; result: Explanation | null };



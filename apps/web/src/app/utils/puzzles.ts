import puzzles from '@repo/puzzles/index.json';

type Item = { id: string; type: string; title: string; data: any };

export function getAll(): Item[] {
  return (puzzles as any).puzzles as Item[];
}

export function byType(type: string): Item[] {
  return getAll().filter((p) => p.type === type);
}

export function getById(type: string, id: string): Item | undefined {
  return byType(type).find((p) => p.id === id);
}



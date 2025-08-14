"use client";
import { useEffect, useMemo, useState } from 'react';
import puzzles from '@repo/puzzles/index.json';
import InteractiveCard from "../components/InteractiveCard";

type Item = { id: string; type: string; title: string };

export default function ExplorePage() {
  const items = (puzzles as any).puzzles as Item[];
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<number | 'all'>('all');

  // FlexSearch client index (lazy)
  const [searchFn, setSearchFn] = useState<null | ((query: string) => string[])>(null);
  const [idToMeta, setIdToMeta] = useState<Record<string, { id: string; title: string; type: string; difficulty?: number }>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/puzzles/explore-index.json');
        if (!res.ok) return;
        const json = await res.json();
        const { Index } = (await import('flexsearch/dist/module/index.js')).default;
        const idx = new Index();
        await idx.import(json.flexsearch);
        if (!cancelled) {
          const meta: Record<string, { id: string; title: string; type: string; difficulty?: number }> = {};
          for (const r of json.ids as any[]) meta[r.id] = r;
          setIdToMeta(meta);
          setSearchFn(() => (query: string) => idx.search(query) as any);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let base = items.filter((it) => type === 'all' || it.type === type);
    if (difficulty !== 'all') base = base.filter((it) => (idToMeta[it.id]?.difficulty ?? 3) === difficulty);
    if (!q) return base;
    const lower = q.toLowerCase();
    if (searchFn) {
      const ids = new Set<string>(searchFn(lower) as any);
      return base.filter((it) => ids.has(it.id));
    }
    return base.filter((it) => it.title.toLowerCase().includes(lower));
  }, [items, q, type, searchFn, difficulty, idToMeta]);

  const typeTint: Record<string, string> = {
    sudoku: 'home-rose',
    nonograms: 'home-emerald',
    crosswords: 'home-violet',
    wordsearch: 'home-amber',
    cryptogram: 'home-cyan',
    skyscrapers: 'home-blue',
  };

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <section className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-4xl md:text-5xl font-extrabold gradient-text">Explore</h1>
        <div className="mt-6 flex gap-4">
          <input className="min-w-0 flex-1 rounded border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-md" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="rounded border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-md" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            <option value="sudoku">Sudoku</option>
            <option value="nonograms">Nonograms</option>
            <option value="crosswords">Crosswords</option>
            <option value="wordsearch">Wordsearch</option>
            <option value="cryptogram">Cryptogram</option>
            <option value="kakuro">Kakuro</option>
            <option value="akari">Akari</option>
            <option value="hitori">Hitori</option>
            <option value="hashi">Hashi</option>
            <option value="riddles">Riddles</option>
            <option value="nurikabe">Nurikabe</option>
            <option value="skyscrapers">Skyscrapers</option>
          </select>
          <select className="rounded border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-md" value={difficulty as any} onChange={(e) => setDifficulty((e.target.value as any) === 'all' ? 'all' : parseInt(e.target.value))}>
            <option value="all">All difficulty</option>
            {[1,2,3,4,5].map(d => <option key={d} value={d}>{`Difficulty ${d}`}</option>)}
          </select>
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((it) => (
            <InteractiveCard key={it.id} href={`/${it.type}/${it.id}`} className={`home-card ${typeTint[it.type] ?? 'home-blue'} p-4`}>
              <div className="text-xs uppercase opacity-80">{it.type}</div>
              <div className="text-lg font-semibold">{it.title}</div>
            </InteractiveCard>
          ))}
        </div>
      </section>
    </main>
  );
}



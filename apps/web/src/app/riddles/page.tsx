"use client";
import { useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import riddlesPlugin, { RiddleData, RiddleState, RiddleComponent } from '@repo/plugins-riddles';
import puzzles from '@repo/puzzles/index.json';
import { HintPanel } from '@repo/ui';
import { PuzzleLayout } from '../components/PuzzleLayout';

registerPlugin(riddlesPlugin);

export default function RiddlesPage() {
  const items = ((puzzles as any).puzzles as any[]).filter((p) => p.type === 'riddles');
  const filteredItems = items;
  const categories = Array.from(new Set(filteredItems.map((it) => (it?.data?.category || 'riddle')))).sort();
  // Fallback sample if none exists
  const initialData: RiddleData = items[0]?.data || {
    prompt: "What has keys but can't open locks?",
    answers: ['keyboard'],
    category: 'riddle',
    hints: ["It's on your desk", 'You type on it']
  };
  const saveKey = 'puzzle:riddles:autosave';
  const [category, setCategory] = useState<string>('all');
  const [data, setData] = useState<RiddleData>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (saved?.data) return saved.data as RiddleData; }
    } catch {}
    return initialData;
  });
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (typeof saved?.id === 'string') return saved.id as string; }
    } catch {}
    // best-effort: if saved without id, derive by matching prompt
    try {
      const match = items.find((it)=> it?.data?.prompt === (initialData as any).prompt);
      return match?.id || null;
    } catch {}
    return null;
  });
  const [state, setState] = useState<RiddleState>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (saved?.state) return saved.state as RiddleState; }
    } catch {}
    const plugin = getPlugin<RiddleData, RiddleState>('riddles')!;
    return plugin.createInitialState(data);
  });
  const [timerMs, setTimerMs] = useState<number>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); const t = saved?.timer; if (t) { const now = Date.now(); const base = Number(t.elapsedMs) || 0; return t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base; } }
    } catch {}
    return 0;
  });
  const [timerRunning, setTimerRunning] = useState<boolean>(() => {
    try { const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null; if (raw) { const saved = JSON.parse(raw); const t = saved?.timer; if (t && typeof t.running === 'boolean') return Boolean(t.running); } } catch {}
    return true;
  });
  const [hint, setHint] = useState<any | null>(null);
  const [seenIds, setSeenIds] = useState<string[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (raw) { const saved = JSON.parse(raw); if (Array.isArray(saved?.seen)) return saved.seen as string[]; }
    } catch {}
    return [];
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Helper: pick a random riddle from items with filters
  function pickRandomUnique(): { id: string; data: RiddleData } {
    const seen = new Set(seenIds);
    const base = filteredItems.filter((it) => {
      return category === 'all' ? true : (it?.data?.category || 'riddle') === category;
    });
    const uniquePool = base.filter((it)=> !seen.has(it.id));
    const list = uniquePool.length > 0 ? uniquePool : base;
    // If we exhausted the unique pool, reset seen for a fresh cycle
    if (uniquePool.length === 0) {
      setSeenIds([]);
      try { const raw = localStorage.getItem(saveKey); if (raw) { const saved = JSON.parse(raw); localStorage.setItem(saveKey, JSON.stringify({ ...saved, seen: [] })); } } catch {}
    }
    if (!list || list.length === 0) {
      return { id: currentId || (items[0]?.id ?? 'riddle-0'), data: initialData };
    }
    const idx = Math.floor(Math.random() * list.length);
    const picked = list[idx];
    const id = picked?.id as string;
    const d = (picked?.data || initialData) as RiddleData;
    return { id, data: d };
  }

  // If no saved game present, start with a challenging riddle by default
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
      if (!raw && filteredItems.length > 0) {
        const next = pickRandomUnique();
        setData(next.data);
        setCurrentId(next.id);
        setSeenIds((prev)=> prev.includes(next.id) ? prev : [...prev, next.id]);
        const plugin = getPlugin<RiddleData, RiddleState>('riddles')!;
        const fresh = plugin.createInitialState(next.data);
        setState(fresh);
        try { localStorage.setItem(saveKey, JSON.stringify({ id: next.id, data: next.data, state: fresh, seen: [next.id], timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(saveKey, JSON.stringify({ id: currentId, data, state, seen: seenIds, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {}
  }, [currentId, data, state, timerMs, timerRunning, seenIds]);
  useEffect(() => {
    const handler = () => { try { localStorage.setItem(saveKey, JSON.stringify({ id: currentId, data, state, seen: seenIds, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {} };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [currentId, data, state, timerMs, timerRunning, seenIds]);

  // Timer
  useEffect(() => { if (!timerRunning) return; const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000); return () => clearInterval(id); }, [timerRunning]);
  // Stop timer on solve
  useEffect(() => {
    const plugin = getPlugin<RiddleData, RiddleState>('riddles')!;
    const solved = plugin.isSolved(data, state);
    if (solved && timerRunning) setTimerRunning(false);
  }, [data, state, timerRunning]);

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000); const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60; const pad = (n: number) => n.toString().padStart(2, '0');
    return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  }

  const Comp = useMemo(() => RiddleComponent, []);
  if (!mounted) return null;
  return (
    <PuzzleLayout
      title="Riddles"
      toolbar={(
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 ml-2 text-xs text-white/90">
            <span suppressHydrationWarning>Time: {formatTime(timerMs)}</span>
            <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>{timerRunning ? 'Pause' : 'Resume'}</button>
          </div>
          <label className="ml-2 inline-flex items-center gap-2 text-xs text-white/80">
            <span>Category</span>
            <select className="rounded border border-white/15 bg-white/[0.06] px-2 py-1" value={category} onChange={(e)=> setCategory(e.target.value)}>
              <option value="all">All</option>
              {categories.map((c)=> <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>{
            const next = pickRandomUnique();
            setData(next.data);
            setCurrentId(next.id);
            setSeenIds((prev)=> prev.includes(next.id) ? prev : [...prev, next.id]);
            const plugin = getPlugin<RiddleData, RiddleState>('riddles')!;
            const fresh = plugin.createInitialState(next.data);
            setState(fresh);
            setTimerMs(0); setTimerRunning(true); setHint(null);
            try { localStorage.setItem(saveKey, JSON.stringify({ id: next.id, data: next.data, state: fresh, seen: [...new Set([...seenIds, next.id])], timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
          }}>New riddle</button>
        </div>
      )}
    >
      <Comp data={data} state={state} onChange={setState} />
      <HintPanel hint={hint} />
    </PuzzleLayout>
  );
}



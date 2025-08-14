"use client";
import { useEffect, useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import { slitherlinkPlugin, SlitherlinkData, SlitherlinkState, SlitherlinkComponent } from '@repo/plugins-slitherlink';
import { generateSlitherlink } from '@repo/plugins-slitherlink';
import { solveSlitherlink } from '@repo/plugins-slitherlink';
import { PuzzleLayout } from '../components/PuzzleLayout';
import StateShare from '../components/StateShare';

registerPlugin(slitherlinkPlugin);

export default function SlitherlinkPage() {
    // Bump storage key to invalidate older generated puzzles that embedded a trivial border loop
    const saveKey = 'puzzle:slitherlink:v2:autosave';

    // Avoid heavy sync work before the page paints: start with a lightweight blank puzzle,
    // then generate or load the actual puzzle in an effect below.
    const blankData: SlitherlinkData = useMemo(() => ({
        width: 15,
        height: 15,
        clues: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => -1))
    }), []);
    const [data, setData] = useState<SlitherlinkData>(blankData);
    const [state, setState] = useState<SlitherlinkState>(() => {
        const pluginLocal = getPlugin<SlitherlinkData, SlitherlinkState>('slitherlink')!;
        return pluginLocal.createInitialState(blankData);
    });
	const [hydrated, setHydrated] = useState(false);
	const [timerMs, setTimerMs] = useState(0);
	const [timerRunning, setTimerRunning] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const hydrate = () => {
            try {
                const raw = typeof window !== 'undefined' ? localStorage.getItem(saveKey) : null;
                if (raw) {
                    const saved = JSON.parse(raw);
                    if (!cancelled && saved?.data) setData(saved.data as SlitherlinkData);
                    if (!cancelled && saved?.state) setState(saved.state as SlitherlinkState);
                    const t = saved?.timer; if (t) {
                        const now = Date.now(); const base = Number(t.elapsedMs) || 0;
                        if (!cancelled) setTimerMs(t.running && typeof t.lastUpdateTs === 'number' ? base + Math.max(0, now - t.lastUpdateTs) : base);
                        if (!cancelled && typeof t.running === 'boolean') setTimerRunning(Boolean(t.running));
                    }
                } else {
                    // Generate after paint to avoid blocking navigation
                    setTimeout(() => {
                        if (cancelled) return;
                        const d = generateSlitherlink('15x15');
                        const pluginLocal = getPlugin<SlitherlinkData, SlitherlinkState>('slitherlink')!;
                        const fresh = pluginLocal.createInitialState(d);
                        setData(d); setState(fresh); setTimerMs(0); setTimerRunning(true);
                        try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
                    }, 0);
                }
            } catch {}
            finally { if (!cancelled) setHydrated(true); }
        };
        // Use requestIdleCallback when available
        if (typeof (window as any)?.requestIdleCallback === 'function') {
            (window as any).requestIdleCallback(hydrate, { timeout: 100 });
        } else {
            setTimeout(hydrate, 0);
        }
        return () => { cancelled = true; };
    }, []);

	useEffect(() => { if (!timerRunning) return; const id = setInterval(() => setTimerMs((ms) => ms + 1000), 1000); return () => clearInterval(id); }, [timerRunning]);
	useEffect(() => { if (!hydrated) return; try { localStorage.setItem(saveKey, JSON.stringify({ data, state, timer: { elapsedMs: timerMs, running: timerRunning, lastUpdateTs: Date.now() } })); } catch {} }, [hydrated, data, state, timerMs, timerRunning]);

	const plugin = getPlugin<SlitherlinkData, SlitherlinkState>('slitherlink')!;
	const solved = plugin.isSolved(data, state);
	useEffect(() => { if (solved && timerRunning) setTimerRunning(false); }, [solved, timerRunning]);

	function formatTime(ms: number): string { const s = Math.floor(ms/1000); const mm = Math.floor((s%3600)/60); const ss = s%60; const pad=(n:number)=>n.toString().padStart(2,'0'); return `${pad(mm)}:${pad(ss)}`; }

	return (
		<PuzzleLayout
			title="Slitherlink"
			toolbar={(
				<div className="flex items-center gap-3">
					<StateShare getState={() => state} />
					<div className="flex items-center gap-2 ml-2 text-xs text-white/90">
						<span suppressHydrationWarning>Time: {formatTime(timerMs)}</span>
						<button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 hover:bg-white/[0.09]" onClick={()=>setTimerRunning(v=>!v)}>
							<span suppressHydrationWarning>{timerRunning ? 'Pause' : 'Resume'}</span>
						</button>
					</div>
					<button className="rounded border border-white/15 bg-white/[0.06] px-2 py-1 text-sm hover:bg-white/[0.09]" onClick={()=>{
						const fresh = plugin.createInitialState(data);
						setState(fresh); setTimerMs(0); setTimerRunning(true);
					}}>Restart</button>
                    <button className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-sm hover:bg-emerald-500/25" onClick={()=>{
                        // Prefer the embedded solution when present (generator embeds the true loop)
                        if ((data as any).solutionH && (data as any).solutionV) {
                            setState({ ...state, edgeH: (data as any).solutionH, edgeV: (data as any).solutionV } as SlitherlinkState);
                            setTimerRunning(false);
                            return;
                        }
                        // Otherwise compute with escalating timeouts
                        const timeouts = [3000, 6000, 9000];
                        let solved: ReturnType<typeof solveSlitherlink> = null;
                        for (const ms of timeouts) { solved = solveSlitherlink(data, ms); if (solved) break; }
                        if (solved) { setState({ ...state, edgeH: solved.edgeH, edgeV: solved.edgeV }); setTimerRunning(false); }
                    }}>Show solution</button>
					<button className="rounded border border-white/15 bg-white/[0.06] px-3 py-1 text-sm hover:bg-white/[0.09]" onClick={()=>{
						const d = generateSlitherlink('15x15');
						const fresh = plugin.createInitialState(d);
						setData(d); setState(fresh); setTimerMs(0); setTimerRunning(true);
						try { localStorage.setItem(saveKey, JSON.stringify({ data: d, state: fresh, timer: { elapsedMs: 0, running: true, lastUpdateTs: Date.now() } })); } catch {}
					}}>New game</button>
				</div>
			)}
			sidebar={undefined}
		>
			<div className="w-full flex justify-center">
				<div className="w-fit">
					{hydrated ? (
						<SlitherlinkComponent data={data} state={state} onChange={setState} />
					) : (
						<div className="text-white/60 text-sm px-2 py-6">Loading saved game…</div>
					)}
					<div className="mt-2 h-8 flex items-center w-full justify-center">
						{solved ? (
							<span className="inline-block rounded bg-emerald-500/15 px-3 py-1 text-base font-semibold border border-emerald-400/30 text-emerald-400">Solved! 🎉</span>
						) : (
							<span className="text-sm text-white/70 max-w-[42ch] text-center">Draw a single loop that satisfies the numbered clues. The loop cannot branch or cross itself.</span>
						)}
					</div>
				</div>
			</div>
		</PuzzleLayout>
	);
}



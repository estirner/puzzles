"use client";
import type { PuzzlePlugin } from '@repo/engine';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';

export type SlitherlinkData = {
	width: number;
	height: number;
	// Clues on cells, -1 for empty
	clues: number[][]; // size height x width, values in {-1,0,1,2,3}
	// Optional embedded solution for reveal/fast-solve
	solutionH?: number[][]; // (height+1) x width with 0/1
	solutionV?: number[][]; // height x (width+1) with 0/1
};

// State encodes edges between grid dots. We use two boolean matrices for horizontal and vertical edges
export type SlitherlinkState = {
	edgeH: number[][]; // height+1 x width, 0 off, 1 on
	edgeV: number[][]; // height x width+1, 0 off, 1 on
	selected?: { r: number; c: number } | null;
};

function emptyState(w: number, h: number): SlitherlinkState {
	return {
		edgeH: Array.from({ length: h + 1 }, () => Array.from({ length: w }, () => 0)),
		edgeV: Array.from({ length: h }, () => Array.from({ length: w + 1 }, () => 0)),
		selected: null
	};
}

function validate(data: SlitherlinkData, st: SlitherlinkState): { ok: boolean; errors?: string[] } {
	const { width: W, height: H } = data;
	const errors: string[] = [];
	// 1) Clue compliance (no overfill)
	for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
		const clue = data.clues[r][c]; if (clue < 0) continue;
		let deg = 0;
		deg += st.edgeH[r][c]; // top
		deg += st.edgeH[r + 1][c]; // bottom
		deg += st.edgeV[r][c]; // left
		deg += st.edgeV[r][c + 1]; // right
		if (deg > clue) { errors.push('Clue overfilled'); return { ok: false, errors }; }
	}
  // 2) Vertex degree ≤ 2 at all dots (compute correctly from incident edges)
  for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) {
    let d = 0;
    if (c > 0) d += st.edgeH[r][c - 1]; // left
    if (c < W) d += st.edgeH[r][c];     // right
    if (r > 0) d += st.edgeV[r - 1][c]; // up
    if (r < H) d += st.edgeV[r][c];     // down
    if (d > 2) { errors.push('Node degree > 2'); return { ok: false, errors }; }
  }
	return { ok: true };
}

function isSolved(data: SlitherlinkData, st: SlitherlinkState): boolean {
	const { width: W, height: H } = data;
	// Check clues exact
	for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
		const clue = data.clues[r][c]; if (clue < 0) continue;
		let deg = 0;
		deg += st.edgeH[r][c];
		deg += st.edgeH[r + 1][c];
		deg += st.edgeV[r][c];
		deg += st.edgeV[r][c + 1];
		if (deg !== clue) return false;
	}
  // All used edges must form a single simple cycle: each vertex degree is 0 or 2; and one component
  const degV: number[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W + 1 }, () => 0));
  let usedEdges = 0;
  for (let r = 0; r <= H; r++) for (let c = 0; c < W; c++) if (st.edgeH[r][c]) { usedEdges++; degV[r][c]++; degV[r][c + 1]++; }
  for (let r = 0; r < H; r++) for (let c = 0; c <= W; c++) if (st.edgeV[r][c]) { usedEdges++; degV[r][c]++; degV[r + 1][c]++; }
  if (usedEdges === 0) return false;
  // all non-zero degrees must be exactly 2
  for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) if (degV[r][c] !== 0 && degV[r][c] !== 2) return false;
  // BFS over vertices
  let startR = -1, startC = -1, activeVertices = 0;
  for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) if (degV[r][c] > 0) { activeVertices++; if (startR === -1) { startR = r; startC = c; } }
  if (startR === -1) return false;
  const seenV: boolean[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W + 1 }, () => false));
  const q: Array<{ r: number; c: number }> = [{ r: startR, c: startC }];
  seenV[startR][startC] = true;
  const pushIf = (rr: number, cc: number) => { if (!seenV[rr][cc]) { seenV[rr][cc] = true; q.push({ r: rr, c: cc }); } };
  while (q.length) {
    const { r, c } = q.shift()!;
    // neighbors via on-edges
    if (c > 0 && st.edgeH[r][c - 1]) pushIf(r, c - 1);
    if (c < W && st.edgeH[r][c]) pushIf(r, c + 1);
    if (r > 0 && st.edgeV[r - 1][c]) pushIf(r - 1, c);
    if (r < H && st.edgeV[r][c]) pushIf(r + 1, c);
  }
  let visitedVertices = 0;
  for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) if (degV[r][c] > 0 && seenV[r][c]) visitedVertices++;
  return visitedVertices === activeVertices;
}

export const SlitherlinkComponent = ({ data, state, onChange, cellPx: cellPxProp }: { data: SlitherlinkData; state: SlitherlinkState; onChange: (next: SlitherlinkState) => void; cellPx?: number }) => {
	const [cellPx, setCellPx] = useState<number>(() => {
		try { if (typeof window !== 'undefined') { const raw = localStorage.getItem('slither:cellSizePx'); const n = raw ? parseInt(raw, 10) : NaN; if (!Number.isNaN(n) && n >= 20 && n <= 120) return n; } } catch {}
		return cellPxProp ?? 36;
	});
	useEffect(() => { try { if (typeof window !== 'undefined') localStorage.setItem('slither:cellSizePx', String(cellPx)); } catch {} }, [cellPx]);

	// Clamp cell size to new bounds [20, 80]
	useEffect(() => { if (cellPx > 80) setCellPx(80); if (cellPx < 20) setCellPx(20); }, []);

	// Derived visuals
	const thickness = Math.max(4, Math.floor(cellPx * 0.18));
	const nodeRadius = Math.max(2, Math.floor(cellPx * 0.08));
	const gridW = data.width * cellPx;
	const gridH = data.height * cellPx;
	const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

	// Hints toggle
	const [showHints, setShowHints] = useState<boolean>(false);

	// Drag-to-draw support
	const draggingRef = useRef(false);
	const dragSetToRef = useRef<null | 0 | 1>(null);
	useEffect(() => {
		const stop = () => { draggingRef.current = false; dragSetToRef.current = null; };
		window.addEventListener('pointerup', stop);
		window.addEventListener('mouseup', stop);
		return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('mouseup', stop); };
	}, []);

	const setH = (r: number, c: number, v: 0 | 1) => {
		if (state.edgeH[r][c] === v) return;
		const edgeH = state.edgeH.map((row, rr) => row.map((x, cc) => (rr === r && cc === c ? v : x)));
		onChange({ ...state, edgeH });
	};
	const setV = (r: number, c: number, v: 0 | 1) => {
		if (state.edgeV[r][c] === v) return;
		const edgeV = state.edgeV.map((row, rr) => row.map((x, cc) => (rr === r && cc === c ? v : x)));
		onChange({ ...state, edgeV });
	};

	const onHDown = (r: number, c: number) => {
		const v: 0 | 1 = state.edgeH[r][c] ? 0 : 1;
		draggingRef.current = true; dragSetToRef.current = v;
		setH(r, c, v);
	};
	const onHEnter = (r: number, c: number) => {
		if (!draggingRef.current || dragSetToRef.current === null) return;
		setH(r, c, dragSetToRef.current);
	};
	const onVDown = (r: number, c: number) => {
		const v: 0 | 1 = state.edgeV[r][c] ? 0 : 1;
		draggingRef.current = true; dragSetToRef.current = v;
		setV(r, c, v);
	};
	const onVEnter = (r: number, c: number) => {
		if (!draggingRef.current || dragSetToRef.current === null) return;
		setV(r, c, dragSetToRef.current);
	};

	// Diagnostics for highlighting
	const cellDeg = useMemo(() => {
		const out: number[][] = Array.from({ length: data.height }, () => Array.from({ length: data.width }, () => 0));
		for (let r = 0; r < data.height; r++) for (let c = 0; c < data.width; c++) {
			out[r][c] = state.edgeH[r][c] + state.edgeH[r + 1][c] + state.edgeV[r][c] + state.edgeV[r][c + 1];
		}
		return out;
	}, [data.height, data.width, state.edgeH, state.edgeV]);
	const vertexDeg = useMemo(() => {
		const out: number[][] = Array.from({ length: data.height + 1 }, () => Array.from({ length: data.width + 1 }, () => 0));
		for (let r = 0; r <= data.height; r++) for (let c = 0; c < data.width; c++) if (state.edgeH[r][c]) { out[r][c]++; out[r][c + 1]++; }
		for (let r = 0; r < data.height; r++) for (let c = 0; c <= data.width; c++) if (state.edgeV[r][c]) { out[r][c]++; out[r + 1][c]++; }
		return out;
	}, [data.height, data.width, state.edgeH, state.edgeV]);

	return (
		<div className="p-2 select-none">
			<div className="mb-2 flex items-center gap-3 text-xs text-white/80 min-h-6">
				<label className="flex items-center gap-2"><span>Cell size</span>
					<input type="range" min={20} max={80} step={1} value={cellPx} onChange={(e)=> setCellPx(parseInt(e.target.value, 10))} />
					<span className="w-10 text-right tabular-nums">{cellPx}px</span>
				</label>
				<span className="text-white/60">Click or drag to draw the loop</span>
				<button className={`rounded border px-2 py-1 ${showHints? 'border-sky-400/50 bg-sky-500/15 text-sky-300':'border-white/15 bg-white/[0.06] hover:bg-white/[0.09] text-white/80'}`} onClick={()=> setShowHints(v=>!v)}>{showHints? 'Hints: On':'Hints: Off'}</button>
			</div>
			<div className="inline-block rounded-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] bg-white/[0.02] overflow-auto max-w-full max-h-[78vh]">
				<div className="relative" style={{ width: data.width * cellPx, height: data.height * cellPx }}>
				{/* Grid */}
					<svg width={data.width * cellPx} height={data.height * cellPx} className="absolute inset-0">
						<g stroke="rgba(255,255,255,0.10)" strokeWidth="1">
							{Array.from({ length: data.height + 1 }).map((_, r) => (
								<line key={`r${r}`} x1={0} y1={r * cellPx} x2={data.width * cellPx} y2={r * cellPx} />
							))}
							{Array.from({ length: data.width + 1 }).map((_, c) => (
								<line key={`c${c}`} x1={c * cellPx} y1={0} x2={c * cellPx} y2={data.height * cellPx} />
							))}
						</g>
						{/* Vertices */}
						<g>
							{Array.from({ length: data.height + 1 }).map((_, r) => (
								Array.from({ length: data.width + 1 }).map((_, c) => {
									const d = vertexDeg[r][c];
									const fill = d > 2 ? 'rgba(239,68,68,0.95)' : d === 1 ? 'rgba(245,158,11,0.9)' : d === 2 ? 'rgba(16,185,129,0.95)' : 'rgba(255,255,255,0.25)';
									return <circle key={`p-${r}-${c}`} cx={c * cellPx} cy={r * cellPx} r={nodeRadius} fill={fill} />;
								})
							))}
						</g>
					</svg>
					{/* Clues with status coloring */}
					<div className="absolute inset-0">
						{data.clues.map((row, r) => row.map((v, c) => {
							if (v < 0) return null;
							const d = cellDeg[r][c];
							const color = d > v ? 'text-red-400' : d === v ? 'text-emerald-400' : 'text-white/90';
							const showBox = showHints && (v === 0 || v === 3 || d === v || d > v);
							return (
								<div key={`cl-${r}-${c}`} className={`absolute flex items-center justify-center ${color}`} style={{ left: c*cellPx, top: r*cellPx, width: cellPx, height: cellPx }}>
									<span className="font-semibold" style={{ fontSize: Math.max(12, Math.floor(cellPx*0.45)) }}>{v}</span>
									{showBox ? (
										<div className="pointer-events-none absolute inset-1 rounded border" style={{ borderColor: d > v ? 'rgba(239,68,68,0.65)' : d === v ? 'rgba(16,185,129,0.65)' : 'rgba(56,189,248,0.6)' }} />
									) : null}
								</div>
							);
						}))}
					</div>
					{/* Edges clickable */}
					<div className="absolute inset-0">
						{/* Horizontal edges */}
						{Array.from({ length: data.height + 1 }).map((_, r) => (
							Array.from({ length: data.width }).map((_, c) => {
								const on = state.edgeH[r][c] === 1;
								const x = c*cellPx; const y = r*cellPx;
								const top = clamp(y - thickness/2, 0, gridH - thickness);
								return (
									<div
										key={`h-${r}-${c}`}
										role="button"
										className={`absolute ${on? 'bg-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.25)]':'bg-white/15 hover:bg-emerald-300/70'} transition-colors`}
										style={{ left: x, top, width: cellPx, height: thickness, borderRadius: thickness/2 }}
										onPointerDown={()=> onHDown(r, c)}
										onPointerEnter={()=> onHEnter(r, c)}
									/>
								);
							})
						))}
						{/* Vertical edges */}
						{Array.from({ length: data.height }).map((_, r) => (
							Array.from({ length: data.width + 1 }).map((_, c) => {
								const on = state.edgeV[r][c] === 1;
								const x = c*cellPx; const y = r*cellPx;
								const left = clamp(x - thickness/2, 0, gridW - thickness);
								return (
									<div
										key={`v-${r}-${c}`}
										role="button"
										className={`absolute ${on? 'bg-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.25)]':'bg-white/15 hover:bg-emerald-300/70'} transition-colors`}
										style={{ left, top: y, width: thickness, height: cellPx, borderRadius: thickness/2 }}
										onPointerDown={()=> onVDown(r, c)}
										onPointerEnter={()=> onVEnter(r, c)}
									/>
								);
							})
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

export const slitherlinkPlugin: PuzzlePlugin<SlitherlinkData, SlitherlinkState> = {
	type: 'slitherlink',
	parse(raw) { const json = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer); return JSON.parse(json) as SlitherlinkData; },
	serialize(data) { return JSON.stringify(data); },
	createInitialState(data) { return emptyState(data.width, data.height); },
	render(data, state) {
		return function Bound({ onChange }: { onChange: (next: SlitherlinkState) => void }) {
			return <SlitherlinkComponent data={data} state={state} onChange={onChange} />;
		};
	},
	validateMove(data, state) { return validate(data, state); },
	isSolved(data, state) { return isSolved(data, state); },
	getHints() { return [
		{ id: '0', title: '0 rule', body: 'If a clue is 0, all its surrounding edges must be off.' },
		{ id: '3', title: '3 rule', body: 'If a clue is 3, all its surrounding edges except one are on; use vertex degree 2 to continue the loop.' }
	]; },
	explainStep() { return null; }
};

export default slitherlinkPlugin;



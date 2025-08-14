import type { SlitherlinkData } from './plugin';

// Return true if solved (complete and single loop), false if contradiction, null if undecided
function validatePartial(data: SlitherlinkData, edgeH: number[][], edgeV: number[][]): boolean | null {
    const { width: W, height: H } = data;
    let undecided = false;
    // 1) Clues: cannot exceed, and must be achievable
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const clue = data.clues[r][c]; if (clue < 0) continue;
        let on = 0, unknown = 0;
        const e = [edgeH[r][c], edgeH[r + 1][c], edgeV[r][c], edgeV[r][c + 1]];
        for (const v of e) { if (v === 1) on++; else if (v === -1) unknown++; }
        if (on > clue) return false;
        if (on + unknown < clue) return false;
        if (unknown > 0) undecided = true;
    }
    // 2) Vertex degree: must be ≤2, and final degree cannot be 1
    for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) {
        let on = 0, unknown = 0;
        const vals: number[] = [];
        if (c > 0) vals.push(edgeH[r][c - 1]); // left
        if (c < W) vals.push(edgeH[r][c]);     // right
        if (r > 0) vals.push(edgeV[r - 1][c]); // up
        if (r < H) vals.push(edgeV[r][c]);     // down
        for (const v of vals) { if (v === 1) on++; else if (v === -1) unknown++; }
        if (on > 2) return false;
        if (on === 1 && unknown === 0) return false; // a dangling end cannot be completed to a loop
        if (unknown > 0) undecided = true;
    }

    if (undecided) return null;

    // 3) If nothing undecided, ensure it's a single loop with exact clues
    // Compute vertex degrees
    const degV: number[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W + 1 }, () => 0));
    let usedEdges = 0;
    for (let r = 0; r <= H; r++) for (let c = 0; c < W; c++) if (edgeH[r][c] === 1) { usedEdges++; degV[r][c]++; degV[r][c + 1]++; }
    for (let r = 0; r < H; r++) for (let c = 0; c <= W; c++) if (edgeV[r][c] === 1) { usedEdges++; degV[r][c]++; degV[r + 1][c]++; }
    if (usedEdges === 0) return false;
    for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) if (degV[r][c] !== 0 && degV[r][c] !== 2) return false;
    // BFS over vertices with degree>0
    let startR = -1, startC = -1, activeV = 0;
    for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) if (degV[r][c] > 0) { activeV++; if (startR === -1) { startR = r; startC = c; } }
    if (startR === -1) return false;
    const seen: boolean[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W + 1 }, () => false));
    const q: Array<{ r: number; c: number }>= [{ r: startR, c: startC }];
    seen[startR][startC] = true;
    const pushIf = (rr: number, cc: number) => { if (!seen[rr][cc]) { seen[rr][cc] = true; q.push({ r: rr, c: cc }); } };
    while (q.length) {
        const { r, c } = q.shift()!;
        if (c > 0 && edgeH[r][c - 1] === 1) pushIf(r, c - 1);
        if (c < W && edgeH[r][c] === 1) pushIf(r, c + 1);
        if (r > 0 && edgeV[r - 1][c] === 1) pushIf(r - 1, c);
        if (r < H && edgeV[r][c] === 1) pushIf(r + 1, c);
    }
    let seenCount = 0;
    for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) if (degV[r][c] > 0 && seen[r][c]) seenCount++;
    return seenCount === activeV;
}

export function solveSlitherlink(puzzle: SlitherlinkData, timeoutMs = 1500): { edgeH: number[][]; edgeV: number[][] } | null {
	const { width: W, height: H } = puzzle;
	// -1 unknown, 0 off, 1 on
	const edgeH: number[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W }, () => -1));
	const edgeV: number[][] = Array.from({ length: H }, () => Array.from({ length: W + 1 }, () => -1));
	const start = Date.now();

    // Run local deductions. Returns { ok, changed } where
    // ok=false means a contradiction was found, and the caller must backtrack.
    function propagate(): { ok: boolean; changed: boolean } {
        let changed = false;
		// Clue rules
		for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
			const clue = puzzle.clues[r][c]; if (clue < 0) continue;
			const edges = [
				{ t: 'H' as const, r, c },
				{ t: 'H' as const, r: r + 1, c },
				{ t: 'V' as const, r, c },
				{ t: 'V' as const, r, c: c + 1 }
			];
			let on = 0, unk: Array<typeof edges[number]> = [];
			for (const e of edges) {
				const v = e.t === 'H' ? edgeH[e.r][e.c] : edgeV[e.r][e.c];
				if (v === 1) on++; else if (v === -1) unk.push(e);
			}
            if (on > clue) return { ok: false, changed };
            if (on + unk.length < clue) return { ok: false, changed };
			if (unk.length && on === clue) {
				for (const e of unk) { if (e.t === 'H') { if (edgeH[e.r][e.c] !== 0) { edgeH[e.r][e.c] = 0; changed = true; } } else { if (edgeV[e.r][e.c] !== 0) { edgeV[e.r][e.c] = 0; changed = true; } } }
			}
			if (unk.length && on + unk.length === clue) {
				for (const e of unk) { if (e.t === 'H') { if (edgeH[e.r][e.c] !== 1) { edgeH[e.r][e.c] = 1; changed = true; } } else { if (edgeV[e.r][e.c] !== 1) { edgeV[e.r][e.c] = 1; changed = true; } } }
			}
		}
        // Vertex degree rules (max 2; if two are on → others off; if one on and one unknown → force continuation)
        for (let r = 0; r <= H; r++) for (let c = 0; c <= W; c++) {
            const entries: Array<{ t:'H'|'V'; r:number; c:number }>= [];
            if (c > 0) entries.push({ t:'H', r, c: c-1 });
            if (c < W) entries.push({ t:'H', r, c });
            if (r > 0) entries.push({ t:'V', r: r-1, c });
            if (r < H) entries.push({ t:'V', r, c });
            let on = 0; const unk: Array<typeof entries[number]> = [];
            for (const e of entries) {
                const v = e.t==='H' ? edgeH[e.r][e.c] : edgeV[e.r][e.c];
                if (v === 1) on++; else if (v === -1) unk.push(e);
            }
            if (on > 2) return { ok: false, changed };
            if (on === 2) {
                for (const e of unk) { if (e.t==='H') { if (edgeH[e.r][e.c] !== 0) { edgeH[e.r][e.c] = 0; changed = true; } } else { if (edgeV[e.r][e.c] !== 0) { edgeV[e.r][e.c] = 0; changed = true; } } }
            }
            if (on === 1 && unk.length === 1) {
                const e = unk[0]; if (e.t==='H') { if (edgeH[e.r][e.c] !== 1) { edgeH[e.r][e.c] = 1; changed = true; } } else { if (edgeV[e.r][e.c] !== 1) { edgeV[e.r][e.c] = 1; changed = true; } }
            }
        }
        return { ok: true, changed };
	}

	function search(): boolean {
        while (true) {
			if (Date.now() - start > timeoutMs) return false;
        const res = validatePartial(puzzle, edgeH, edgeV);
			if (res === false) return false;
			if (res === true) return true;
            const step = propagate();
            if (!step.ok) return false;
            if (!step.changed) break;
		}
		// choose an unknown edge with the highest constraint impact (prefer near numbered cells)
		let best: { t:'H'|'V'; r:number; c:number } | null = null;
		let score = -1;
		for (let r=0;r<=H;r++) for (let c=0;c<W;c++) if (edgeH[r][c]===-1) {
			let s = 0; if (r>0 && puzzle.clues[r-1][c]>=0) s++; if (r<H && puzzle.clues[r][c]>=0) s++; if (s>score) { score=s; best={t:'H',r,c}; }
		}
		for (let r=0;r<H;r++) for (let c=0;c<=W;c++) if (edgeV[r][c]===-1) {
			let s = 0; if (c>0 && puzzle.clues[r][c-1]>=0) s++; if (c<W && puzzle.clues[r][c]>=0) s++; if (s>score) { score=s; best={t:'V',r,c}; }
		}
		if (!best) return false;
		// try ON then OFF
		const attempt = (val: 0|1): boolean => {
			const snapshotH = edgeH.map(r=>r.slice());
			const snapshotV = edgeV.map(r=>r.slice());
			if (best!.t==='H') edgeH[best!.r][best!.c] = val; else edgeV[best!.r][best!.c] = val;
			const ok = search();
			if (ok) return true;
			for (let i=0;i<edgeH.length;i++) edgeH[i] = snapshotH[i].slice();
			for (let i=0;i<edgeV.length;i++) edgeV[i] = snapshotV[i].slice();
			return false;
		};
		if (attempt(1)) return true;
		if (attempt(0)) return true;
		return false;
	}

	// Kick off search
    const done = search();
    if (!done) return null;
    return { edgeH, edgeV };
}



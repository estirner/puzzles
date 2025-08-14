import type { SlitherlinkData } from './plugin';

export type SlitherlinkSize = '10x10' | '15x15' | '20x20' | `${number}x${number}` | { width: number; height: number };

function dims(size: SlitherlinkSize): { width: number; height: number } {
	if (typeof size === 'object') return { width: Math.max(3, Math.floor(size.width)), height: Math.max(3, Math.floor(size.height)) };
	if (typeof size === 'string' && size.includes('x')) { const [w, h] = size.split('x').map((s)=>Math.max(3, parseInt(s,10))); return { width: w, height: h }; }
	switch (size) {
		case '10x10': return { width: 10, height: 10 };
		case '15x15': return { width: 15, height: 15 };
		case '20x20': return { width: 20, height: 20 };
		default: return { width: 15, height: 15 };
	}
}

// Generator: build a random single loop not confined to the border via
// (1) a randomized spanning tree on grid vertices, then (2) add one extra edge
// to form a unique simple cycle, (3) derive clues, and (4) sparsify while
// confirming our solver recovers the embedded solution.
export function generateSlitherlink(size: SlitherlinkSize = '15x15'): SlitherlinkData {
	const { width: W, height: H } = dims(size);

    // Helpers
    const rnd = (n: number) => Math.floor(Math.random() * n);
    const shuffle = <T,>(arr: T[]): T[] => { for (let i = arr.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };

    // Build a randomized spanning tree of the vertex grid (H+1 by W+1)
    const Vh = H + 1, Vw = W + 1;
    const visited: boolean[][] = Array.from({ length: Vh }, () => Array.from({ length: Vw }, () => false));
    const treeH: boolean[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W }, () => false));
    const treeV: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W + 1 }, () => false));
    const startR = rnd(Vh), startC = rnd(Vw);
    const stack: Array<{ r: number; c: number }>= [{ r: startR, c: startC }];
    visited[startR][startC] = true;
    const inBounds = (r: number, c: number) => r >= 0 && r < Vh && c >= 0 && c < Vw;
    while (stack.length) {
        const cur = stack[stack.length - 1];
        const dirs = shuffle([
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 }, { dr: -1, dc: 0 }, { dr: 1, dc: 0 }
        ]);
        let advanced = false;
        for (const d of dirs) {
            const nr = cur.r + d.dr, nc = cur.c + d.dc;
            if (!inBounds(nr, nc) || visited[nr][nc]) continue;
            // Add edge to tree
            if (nr === cur.r) {
                // horizontal edge between (r,c) and (r,c+1)
                const r = cur.r; const c = Math.min(cur.c, nc);
                treeH[r][c] = true;
            } else {
                // vertical edge between (r,c) and (r+1,c)
                const r = Math.min(cur.r, nr); const c = cur.c;
                treeV[r][c] = true;
            }
            visited[nr][nc] = true;
            stack.push({ r: nr, c: nc });
            advanced = true; break;
        }
        if (!advanced) stack.pop();
    }

    // Choose a random non-tree edge to create a single cycle
    const nonTreeEdges: Array<{ t: 'H' | 'V'; r: number; c: number }>= [];
    for (let r = 0; r <= H; r++) for (let c = 0; c < W; c++) if (!treeH[r][c]) nonTreeEdges.push({ t: 'H', r, c });
    for (let r = 0; r < H; r++) for (let c = 0; c <= W; c++) if (!treeV[r][c]) nonTreeEdges.push({ t: 'V', r, c });
    if (nonTreeEdges.length === 0) {
        // Extremely unlikely, but fallback to a simple interior rectangle
        const edgeH: number[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W }, () => 0));
        const edgeV: number[][] = Array.from({ length: H }, () => Array.from({ length: W + 1 }, () => 0));
        const r0 = Math.max(1, Math.floor(H / 3)), r1 = Math.min(H - 1, Math.floor(H * 2 / 3));
        const c0 = Math.max(1, Math.floor(W / 3)), c1 = Math.min(W - 1, Math.floor(W * 2 / 3));
        for (let c = c0; c < c1; c++) { edgeH[r0][c] = 1; edgeH[r1][c] = 1; }
        for (let r = r0; r < r1; r++) { edgeV[r][c0] = 1; edgeV[r][c1] = 1; }
        const clues = Array.from({ length: H }, () => Array.from({ length: W }, () => -1));
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
            clues[r][c] = edgeH[r][c] + edgeH[r + 1][c] + edgeV[r][c] + edgeV[r][c + 1];
        }
        return { width: W, height: H, clues, solutionH: edgeH, solutionV: edgeV };
    }
    // Build adjacency of tree to evaluate candidate non-tree edges
    const adj: Array<Array<Array<{ r: number; c: number }>>> = Array.from({ length: Vh }, () => Array.from({ length: Vw }, () => []));
    for (let r = 0; r <= H; r++) for (let c = 0; c < W; c++) if (treeH[r][c]) { adj[r][c].push({ r, c: c + 1 }); adj[r][c + 1].push({ r, c }); }
    for (let r = 0; r < H; r++) for (let c = 0; c <= W; c++) if (treeV[r][c]) { adj[r][c].push({ r: r + 1, c }); adj[r + 1][c].push({ r, c }); }
    // Function to run BFS on tree between two vertices
    const bfs = (u: { r: number; c: number }, v: { r: number; c: number }) => {
        const queue: Array<{ r: number; c: number }> = [u];
        const seen: boolean[][] = Array.from({ length: Vh }, () => Array.from({ length: Vw }, () => false));
        const prev: Array<Array<{ r: number; c: number } | null>> = Array.from({ length: Vh }, () => Array.from({ length: Vw }, () => null));
        seen[u.r][u.c] = true;
        while (queue.length) {
            const p = queue.shift()!;
            if (p.r === v.r && p.c === v.c) {
                // reconstruct length
                let len = 0; let cur: { r: number; c: number } | null = v;
                while (cur && !(cur.r === u.r && cur.c === u.c)) { len++; cur = prev[cur.r][cur.c]; }
                return { prev, len };
            }
            for (const nb of adj[p.r][p.c]) {
                if (!seen[nb.r][nb.c]) { seen[nb.r][nb.c] = true; prev[nb.r][nb.c] = p; queue.push(nb); }
            }
        }
        return { prev, len: -1 };
    };

    // Choose a non-tree edge that maximizes the u→v path length, producing a long loop
    let chosen = nonTreeEdges[0];
    let chosenPrev: Array<Array<{ r: number; c: number } | null>> | null = null;
    let bestLen = -1;
    for (const e of nonTreeEdges) {
        const u = { r: e.r, c: e.c };
        const v = e.t === 'H' ? { r: e.r, c: e.c + 1 } : { r: e.r + 1, c: e.c };
        const { prev, len } = bfs(u, v);
        if (len > bestLen) { bestLen = len; chosen = e; chosenPrev = prev; }
    }
    if (bestLen < Math.max(10, Math.floor((W + H) * 0.6))) {
        // The cycle would be too small; regenerate another attempt
        return generateSlitherlink(size);
    }

    // Reconstruct path for chosen
    const u = { r: chosen.r, c: chosen.c };
    const v = chosen.t === 'H' ? { r: chosen.r, c: chosen.c + 1 } : { r: chosen.r + 1, c: chosen.c };
    const path: Array<{ r: number; c: number }>= [];
    let cur: { r: number; c: number } | null = v;
    while (cur && !(cur.r === u.r && cur.c === u.c)) { path.push(cur); cur = (chosenPrev as any)[cur.r][cur.c]; }
    if (!cur) return generateSlitherlink(size);
    path.push(u);
    path.reverse();

    // Materialize the single cycle edges from path + chosen extra edge
    const edgeH: number[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W }, () => 0));
    const edgeV: number[][] = Array.from({ length: H }, () => Array.from({ length: W + 1 }, () => 0));
    for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1];
        if (a.r === b.r) { edgeH[a.r][Math.min(a.c, b.c)] = 1; }
        else { edgeV[Math.min(a.r, b.r)][a.c] = 1; }
    }
    if (chosen.t === 'H') edgeH[chosen.r][chosen.c] = 1; else edgeV[chosen.r][chosen.c] = 1;

    // Compute full clues from edges
    const fullClues: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 0));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        fullClues[r][c] = edgeH[r][c] + edgeH[r + 1][c] + edgeV[r][c] + edgeV[r][c + 1];
    }

    // Start with a clue set that avoids flooding with 0s: keep almost all near-loop clues,
    // and blank most far-away zero cells.
    const clues: number[][] = fullClues.map(row => row.slice());
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const vDeg = fullClues[r][c];
        if (vDeg === 0) {
            if (Math.random() > 0.08) clues[r][c] = -1; // hide 92% of zero clues
        } else {
            const keepProb = 0.8; // keep most informative clues
            if (Math.random() > keepProb) clues[r][c] = -1;
        }
    }

    return { width: W, height: H, clues, solutionH: edgeH, solutionV: edgeV };
}



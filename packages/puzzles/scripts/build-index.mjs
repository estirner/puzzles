import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import FlexSearch from 'flexsearch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const puzzlesPath = path.join(root, 'index.json');
const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });

const raw = fs.readFileSync(puzzlesPath, 'utf8');
const data = JSON.parse(raw);
const list = data.puzzles || [];

// Compute simple derived metadata and build a small index
function computeMeta(p) {
  const meta = { id: p.id, title: p.title, type: p.type, tags: [], difficulty: 3 };
  meta.tags.push(p.type);
  const d = p.data || {};
  try {
    switch (p.type) {
      case 'sudoku': {
        const size = d.size || 9;
        const givens = (d.givens || []).length;
        const density = givens / (size * size);
        meta.difficulty = density > 0.45 ? 1 : density > 0.35 ? 2 : density > 0.28 ? 3 : density > 0.22 ? 4 : 5;
        meta.tags.push('grid', 'numbers');
        break;
      }
      case 'nonograms': {
        const rows = (d.rows || []).length || 0; const cols = (d.cols || []).length || 0;
        const area = rows * cols;
        meta.difficulty = area <= 25 ? 1 : area <= 100 ? 2 : area <= 225 ? 3 : area <= 400 ? 4 : 5;
        meta.tags.push('grid', 'logic');
        break;
      }
      case 'crosswords': {
        const area = (d.width || 0) * (d.height || 0);
        meta.difficulty = area <= 25 ? 1 : area <= 81 ? 2 : area <= 225 ? 3 : area <= 400 ? 4 : 5;
        meta.tags.push('words');
        break;
      }
      case 'wordsearch': {
        const words = (d.words || []).length;
        meta.difficulty = words <= 8 ? 1 : words <= 14 ? 2 : words <= 20 ? 3 : words <= 30 ? 4 : 5;
        meta.tags.push('words');
        break;
      }
      case 'cryptogram': {
        const len = (d.ciphertext || '').length;
        meta.difficulty = len <= 40 ? 1 : len <= 80 ? 2 : len <= 150 ? 3 : len <= 250 ? 4 : 5;
        meta.tags.push('words');
        break;
      }
      case 'kakuro': {
        const area = (d.width || 0) * (d.height || 0);
        meta.difficulty = area <= 25 ? 1 : area <= 81 ? 2 : area <= 150 ? 3 : area <= 225 ? 4 : 5;
        meta.tags.push('grid', 'numbers');
        break;
      }
      case 'skyscrapers': {
        const n = d.size || 4;
        const clues = [...(d.top||[]), ...(d.bottom||[]), ...(d.left||[]), ...(d.right||[])];
        const filled = clues.filter((x)=>x>0).length;
        const density = filled / (4 * n);
        meta.difficulty = density > 0.8 ? 1 : density > 0.6 ? 2 : density > 0.45 ? 3 : density > 0.3 ? 4 : 5;
        meta.tags.push('grid','logic','latin');
        if (d.mode?.visibility === 'sum') meta.tags.push('sums');
        if (d.mode?.diagonals) meta.tags.push('diagonals');
        break;
      }
      case 'riddles': {
        const dd = Number(d.difficulty || 3);
        meta.difficulty = dd >= 1 && dd <= 5 ? dd : 3;
        meta.tags.push('words');
        break;
      }
      case 'logic-grid': {
        const cats = (d.categories || []).reduce((a,c)=>a+(c.items||[]).length,0);
        const clues = (d.clues || []).length;
        meta.difficulty = clues <= 2 ? 1 : clues <= 4 ? 2 : clues <= 6 ? 3 : clues <= 10 ? 4 : 5;
        meta.tags.push('logic');
        break;
      }
      default:
        meta.difficulty = 3;
    }
  } catch {}
  return meta;
}

const metas = list.map(computeMeta);
const index = new FlexSearch.Index({ tokenize: 'forward', preset: 'match', cache: true });
for (const m of metas) {
  index.add(m.id, `${m.title} ${m.type} ${(m.tags||[]).join(' ')}`);
}

// Export segments via handler; wait for idle to assume completion
const segments = {};
await new Promise((resolve) => {
  let t;
  index.export((key, data) => {
    segments[key] = data;
    clearTimeout(t);
    t = setTimeout(resolve, 20);
    return Promise.resolve();
  });
});
fs.writeFileSync(path.join(outDir, 'explore-index.json'), JSON.stringify({ flexsearch: segments, ids: metas }), 'utf8');



export type RandomEntry = { clue: string; answer: string };

// Read from public/crosswords.csv with header: Date,Word,Clue
export async function getRandomEntries(limit = 50000, minLen = 2, maxLen = 32): Promise<RandomEntry[]> {
  try {
    const res = await fetch('/crosswords.csv', { cache: 'no-store' });
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    const out: RandomEntry[] = [];
    const seen = new Set<string>();
    let isHeader = true;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (isHeader) { isHeader = false; if (/^date\s*,\s*word\s*,\s*clue/i.test(line)) continue; }
      const parts = parseCsvLine(line);
      if (parts.length < 3) continue;
      const word = (parts[1] || '').toUpperCase().replace(/[^A-Z]/g, '');
      const clue = parts[2] || '';
      if (!word) continue;
      if (word.length < minLen || word.length > maxLen) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      out.push({ clue, answer: word });
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

export async function getCluesForAnswers(answers: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!answers || answers.length === 0) return map;
  try {
    const res = await fetch('/crosswords.csv', { cache: 'no-store' });
    if (!res.ok) return map;
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    let isHeader = true;
    const set = new Set(answers.map((a) => a.toUpperCase().replace(/[^A-Z]/g, '')));
    for (const raw of lines) {
      const line = raw.trim(); if (!line) continue;
      if (isHeader) { isHeader = false; if (/^date\s*,\s*word\s*,\s*clue/i.test(line)) continue; }
      const parts = parseCsvLine(line);
      if (parts.length < 3) continue;
      const word = (parts[1] || '').toUpperCase().replace(/[^A-Z]/g, '');
      const clue = parts[2] || '';
      if (set.has(word) && !map[word]) map[word] = clue;
      if (Object.keys(map).length >= set.size) break;
    }
  } catch {}
  return map;
}

function parseCsvLine(line: string): string[] {
  const res: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === ',') { res.push(cur); cur = ''; }
      else if (ch === '"') { inQuotes = true; }
      else { cur += ch; }
    }
  }
  res.push(cur);
  return res;
}



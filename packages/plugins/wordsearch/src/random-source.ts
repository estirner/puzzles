export async function getWordList(limit = 20000, minLen = 2, maxLen = 32): Promise<string[]> {
  try {
    const res = await fetch('/words.txt', { cache: 'no-store' });
    if (!res.ok) return [];
    const text = await res.text();
    const seen = new Set<string>();
    const out: string[] = [];
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      let w = (raw || '').trim();
      if (!w) continue;
      w = w.toUpperCase().replace(/[^A-Z]/g, '');
      if (!w) continue;
      if (w.length < minLen || w.length > maxLen) continue;
      if (seen.has(w)) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}



import type { CGData } from './plugin';

const DEFAULT_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomSubstitution(alphabet: string = DEFAULT_ALPHA): Record<string, string> {
  const src = alphabet.split('');
  const dst = shuffle(alphabet.split(''));
  // Avoid fixed points when possible by simple repair pass
  for (let i = 0; i < src.length; i++) {
    if (dst[i] === src[i]) {
      const j = (i + 1) % dst.length;
      [dst[i], dst[j]] = [dst[j], dst[i]];
    }
  }
  const map: Record<string, string> = {};
  src.forEach((s, i) => { map[s] = dst[i]; });
  return map;
}

function encipher(plaintext: string, mapping: Record<string, string>, alphabet: string = DEFAULT_ALPHA): string {
  const set = new Set(alphabet.split(''));
  const out: string[] = [];
  for (const ch of plaintext) {
    const up = ch.toUpperCase();
    if (set.has(up)) {
      const sub = mapping[up] || up;
      out.push(ch === up ? sub : sub.toLowerCase());
    } else {
      out.push(ch);
    }
  }
  return out.join('');
}

const DEFAULT_QUOTES: string[] = [
  'What we think, we become.',
  'Simplicity is the ultimate sophistication.',
  'The only limit to our realization of tomorrow is our doubts of today.',
  'Imagination is more important than knowledge.',
  'The unexamined life is not worth living.',
  'To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.',
  'In the middle of difficulty lies opportunity.',
  'Stay hungry, stay foolish.',
  'Not everything that can be counted counts, and not everything that counts can be counted.',
  'You miss one hundred percent of the shots you never take.',
  'The future belongs to those who believe in the beauty of their dreams.',
  'It always seems impossible until it is done.',
  'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
  'Do not wait to strike till the iron is hot, but make it hot by striking.',
  'The best way to predict the future is to create it.',
  'Dreams do not work unless you do.',
  'Action is the foundational key to all success.',
  'If you want to go fast, go alone. If you want to go far, go together.',
  'Small deeds done are better than great deeds planned.',
  'Well begun is half done.',
  'There is no great genius without some touch of madness.',
  'He who has a why to live can bear almost any how.',
  'No one is useless in this world who lightens the burden of it to anyone else.',
  'Happiness is not by chance, but by choice.',
  'If you cannot do great things, do small things in a great way.',
  'We shape our tools and thereafter our tools shape us.',
  'Discipline is the bridge between goals and accomplishment.',
  'Creativity is intelligence having fun.',
  'Learning never exhausts the mind.',
  'Courage is resistance to fear, mastery of fear, not absence of it.',
  'The soul becomes dyed with the color of its thoughts.',
  'Wisdom begins in wonder.',
  'Science is the poetry of reality.',
  'The only way out is through.',
  'There is more to life than increasing its speed.',
  'Order and simplification are the first steps toward mastery of a subject.',
  'The man who moves a mountain begins by carrying away small stones.'
  , 'Knowledge speaks, but wisdom listens.'
  , 'The wound is the place where the light enters you.'
  , 'We are shaped by our thoughts; we become what we think.'
  , 'A journey of a thousand miles begins with a single step.'
  , 'The obstacle is the way.'
  , 'We are what we repeatedly do; excellence then is a habit.'
  , 'You are what you do, not what you say you will do.'
  , 'Sow a thought, reap an action; sow an action, reap a habit.'
  , 'What you do every day matters more than what you do once in a while.'
  , 'The quieter you become, the more you can hear.'
  , 'Change the way you look at things and the things you look at change.'
  , 'To live is the rarest thing in the world; most people exist, that is all.'
  , 'The best time to plant a tree was twenty years ago; the second best time is now.'
  , 'When nothing is sure, everything is possible.'
  , 'You cannot step into the same river twice.'
  , 'Be curious, not judgmental.'
  , 'Work hard in silence; let success make the noise.'
  , 'Do the best you can until you know better; then do better.'
  , 'How we spend our days is, of course, how we spend our lives.'
  , 'Great things are done by a series of small things brought together.'
  , 'Doubt kills more dreams than failure ever will.'
  , 'Direction is so much more important than speed.'
  , 'The only true wisdom is in knowing you know nothing.'
  , 'If you want to see the sunshine, you have to weather the storm.'
  , 'To improve is to change; to be perfect is to change often.'
  , 'Life is really simple, but we insist on making it complicated.'
  , 'Silence is a source of great strength.'
  , 'Beware the barrenness of a busy life.'
  , 'To understand is to perceive patterns.'
  , 'The way to get started is to quit talking and begin doing.'
  , 'Focus is the art of knowing what to ignore.'
  , 'We do not learn from experience; we learn from reflecting on experience.'
  , 'Time you enjoy wasting is not wasted time.'
  , 'Simplicity is about subtracting the obvious and adding the meaningful.'
  , 'Your future is decided by what you do today, not tomorrow.'
  , 'Distraction is the enemy of depth.'
  , 'Reading is to the mind what exercise is to the body.'
  , 'The secret of getting ahead is getting started.'
  , 'Success is the sum of small efforts repeated day in and day out.'
];

export type CryptogramDifficulty = 'short' | 'medium' | 'long';

function pickQuote(diff: CryptogramDifficulty): string {
  const pool = DEFAULT_QUOTES.filter((q) => {
    const letters = q.replace(/[^A-Za-z]/g, '').length;
    if (diff === 'short') return letters <= 40;
    if (diff === 'medium') return letters > 40 && letters <= 90;
    return letters > 90 || true;
  });
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : DEFAULT_QUOTES[Math.floor(Math.random() * DEFAULT_QUOTES.length)];
}

export function generateCryptogram(diff: CryptogramDifficulty = 'medium', alphabet: string = DEFAULT_ALPHA): CGData {
  let plaintext: string;
  if (diff === 'long') {
    // Compose multiple sentences for a richer cryptogram
    const pool = DEFAULT_QUOTES.slice();
    const k = Math.floor(Math.random() * 2) + 3; // 3-4 sentences
    const picks: string[] = [];
    for (let i = 0; i < k && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool[idx]);
      pool.splice(idx, 1);
    }
    plaintext = picks.join(' ');
  } else {
    plaintext = pickQuote(diff);
  }
  const map = randomSubstitution(alphabet);
  const ciphertext = encipher(plaintext, map, alphabet);
  return { ciphertext, plaintext, alphabet } as CGData;
}

export { encipher };



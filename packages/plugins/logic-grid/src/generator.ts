export type LGGenCategory = { name: string; items: string[] };
export type LGGenData = { categories: LGGenCategory[]; clues: string[]; solution: Record<string, Record<string, string>> };

function shuffle<T>(arr: T[]): T[] { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

export function generateLogicGrid(size = 3): LGGenData {
  // Simple 3-category generator with unique mapping: Owner, Pet, Color
  const categories: LGGenCategory[] = [
    { name: 'Owner', items: ['Alice', 'Bob', 'Cara'].slice(0, size) },
    { name: 'Pet', items: shuffle(['Cat', 'Dog', 'Fish'].slice(0, size)) },
    { name: 'Color', items: shuffle(['Red', 'Blue', 'Green'].slice(0, size)) }
  ];
  const base = categories[0].items;
  const solution: Record<string, Record<string, string>> = {};
  for (let i = 0; i < base.length; i++) {
    const a = base[i];
    solution[a] = { Pet: categories[1].items[i], Color: categories[2].items[i] } as any;
  }
  // Clues: generate a minimal set of positives/negatives
  const clues: string[] = [];
  for (const a of base) clues.push(`${a} owns the ${solution[a]['Pet']}.`);
  for (const a of base) clues.push(`${a} likes ${solution[a]['Color']}.`);
  // Add a couple of negatives for variety
  for (const a of base) {
    const wrongPet = categories[1].items.find((p) => p !== solution[a]['Pet']);
    if (wrongPet) clues.push(`${a} does not own the ${wrongPet}.`);
  }
  return { categories, clues, solution };
}



import Aurora from "./components/Aurora";
import ParallaxHero from "./components/ParallaxHero";
import InteractiveCard from "./components/InteractiveCard";
import Link from 'next/link';

export default function Home() {
  return (
    <main className="relative overflow-auto h-[calc(100vh-4rem)]">
      <Aurora className="pointer-events-none absolute inset-0 -z-10" />
      <section className="mx-auto max-w-7xl px-6 py-12 md:py-16 relative h-full flex flex-col">
        <ParallaxHero className="parallax">
          <div className="p-layer-1">
            <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight gradient-text drop-shadow-sm">Puzzles</h1>
            <p className="mt-4 max-w-xl text-[17px] text-[var(--color-hero-sub)]">An open source puzzle collection. Pick a puzzle to begin.</p>
          </div>
        </ParallaxHero>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          <InteractiveCard href="/explore" className="home-card home-blue">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Explore</div>
              <div className="text-sm opacity-80">Browse all puzzles</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/sudoku" className="home-card home-rose">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Sudoku</div>
              <div className="text-sm opacity-80">Classic and variants</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/nonograms" className="home-card home-emerald">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Nonograms</div>
              <div className="text-sm opacity-80">Picross puzzles</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/crosswords" className="home-card home-violet">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Crosswords</div>
              <div className="text-sm opacity-80">Find the hidden words</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/wordsearch" className="home-card home-amber">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Word Search</div>
              <div className="text-sm opacity-80">Find the hidden words</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/cryptogram" className="home-card home-cyan">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Cryptogram</div>
              <div className="text-sm opacity-80">Decode the message</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/kakuro" className="home-card home-orange">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Kakuro</div>
              <div className="text-sm opacity-80">Sum crossword</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/akari" className="home-card home-yellow">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Akari (Light Up)</div>
              <div className="text-sm opacity-80">Place bulbs to light the grid</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/kenken" className="home-card home-kenken">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">KenKen</div>
              <div className="text-sm opacity-80">Arithmetic cages + Latin rules</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/riddles" className="home-card home-indigo">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Riddles</div>
              <div className="text-sm opacity-80">Lateral thinking and wordplay</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/hitori" className="home-card home-teal">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Hitori</div>
              <div className="text-sm opacity-80">Black out cells; keep whites connected</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/hashi" className="home-card home-lime">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Hashi (Bridges)</div>
              <div className="text-sm opacity-80">Connect islands with 1–2 bridges, no crossings</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/slitherlink" className="home-card home-fuchsia">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Slitherlink</div>
              <div className="text-sm opacity-80">Draw a single loop to match clues</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/nurikabe" className="home-card home-pink">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Nurikabe</div>
              <div className="text-sm opacity-80">Build islands; keep the sea connected</div>
            </div>
          </InteractiveCard>
          <InteractiveCard href="/skyscrapers" className="home-card home-blue">
            <div className="flex flex-col gap-1 p-5">
              <div className="text-lg font-semibold">Skyscrapers</div>
              <div className="text-sm opacity-80">Latin rows/cols with edge visibility</div>
            </div>
          </InteractiveCard>
        </div>
        <div className="flex-1" />
      </section>
    </main>
  );
}

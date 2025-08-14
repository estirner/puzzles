export default function NotFound() {
  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight gradient-text">Page not found</h1>
        <p className="mt-4 text-white/80">The page you are looking for does not exist.</p>
        <a className="mt-8 inline-block rounded border border-white/15 bg-white/[0.06] px-4 py-2 hover:bg-white/[0.09]" href="/">Go home</a>
      </section>
    </main>
  );
}



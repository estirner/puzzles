## Puzzles

Privacy-first, offline-capable puzzle site.

### Structure
- `apps/web`: Next.js 14 app (App Router), static export (`out/`) for deployment
- `packages/engine`: Core puzzle engine utilities
- `packages/plugins/*`: Generators/renderers for puzzle types (sudoku, nonograms, crosswords, wordsearch, cryptogram, kakuro, logic-grid, riddles)
- `packages/puzzles`: Puzzle index and search data (FlexSearch)
- `packages/ui`: Shared UI components

### Getting started
```bash
npm install
npm run dev    # runs the web app
```

### Build
```bash
npm run build  # builds packages and exports static site for `apps/web`
```

Static assets for search live in `apps/web/public/puzzles/`. Generated artifacts (e.g., `packages/puzzles/dist`) are ignored.

### Principles
- No data collection or tracking
- Works offline via a service worker
- Open source by default

### License
MIT — see `LICENSE`.


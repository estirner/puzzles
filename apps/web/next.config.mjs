import path from 'node:path';
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  transpilePackages: ['@repo/engine', '@repo/plugins-sudoku', '@repo/plugins-nonograms', '@repo/plugins-crosswords', '@repo/plugins-wordsearch', '@repo/plugins-cryptogram', '@repo/plugins-kakuro', '@repo/plugins-logic-grid', '@repo/plugins-riddles', '@repo/ui'],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@repo/engine': path.resolve(process.cwd(), '../../packages/engine/src'),
      '@repo/plugins-sudoku': path.resolve(process.cwd(), '../../packages/plugins/sudoku/src'),
      '@repo/plugins-nonograms': path.resolve(process.cwd(), '../../packages/plugins/nonograms/src'),
      '@repo/plugins-crosswords': path.resolve(process.cwd(), '../../packages/plugins/crosswords/src'),
      '@repo/plugins-wordsearch': path.resolve(process.cwd(), '../../packages/plugins/wordsearch/src'),
      '@repo/plugins-cryptogram': path.resolve(process.cwd(), '../../packages/plugins/cryptogram/src'),
      '@repo/plugins-kakuro': path.resolve(process.cwd(), '../../packages/plugins/kakuro/src'),
      '@repo/plugins-logic-grid': path.resolve(process.cwd(), '../../packages/plugins/logic-grid/src'),
      '@repo/plugins-riddles': path.resolve(process.cwd(), '../../packages/plugins/riddles/src'),
      '@repo/ui': path.resolve(process.cwd(), '../../packages/ui/src'),
      '@repo/puzzles/index.json': path.resolve(process.cwd(), '../../packages/puzzles/index.json')
    };
    return config;
  },
  // Note: custom headers are not supported with output: 'export'
};

export default nextConfig;

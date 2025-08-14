/**
 * Expose the puzzles index dist folder at /puzzles for the web app.
 */
import path from 'node:path';

const config = {
  async rewrites() {
    return [
      {
        source: '/puzzles/:path*',
        destination: '/puzzles/:path*',
      },
    ];
  },
  webpack: (config) => {
    // no custom changes yet
    return config;
  },
};

export default config;



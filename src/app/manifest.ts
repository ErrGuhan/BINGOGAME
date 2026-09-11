import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BingoDuel — Real-time 1v1 Bingo',
    short_name: 'BingoDuel',
    description: 'Real-time 1v1 head-to-head Bingo duels on synchronized boards.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1222',
    theme_color: '#00f5d4',
    categories: ['games', 'entertainment'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

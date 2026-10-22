import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MediLens',
    short_name: 'MediLens',
    description: 'Blood test reports explained in Bangla',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f6f8',
    theme_color: '#0e6e8c',
    lang: 'bn',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

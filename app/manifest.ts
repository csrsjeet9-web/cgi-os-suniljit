import type { MetadataRoute } from 'next'

// PWA manifest. Next's App Router serves this at /manifest.webmanifest (NOT
// /manifest.json) — which is why proxy.ts excludes that exact path, so
// Add-to-Home-Screen can read it without the passcode. `display: standalone`
// makes the installed app open full-screen, like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CGI OS — Compliance, Governance & Integrity',
    short_name: 'CGI OS — Compliance, Governance & Integrity',
    description: 'Every governance register on one screen, with robots that ask before they act.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F7F9FC',
    theme_color: '#1E3A5F',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

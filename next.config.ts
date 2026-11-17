import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // How long the browser's router keeps a prefetched page (T88, ARCHITECTURE A40). Only the four
    // tab links prefetch (components/ui/TabBar.tsx), and their pages hold no data, just the frame
    // around client components, so a day-old copy is as good as a new one. At the default 5
    // minutes, the first tab switch after the app sat open waited on the server again.
    staleTimes: { static: 60 * 60 * 24 },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

// Sentry (ARCHITECTURE A28). Source maps are uploaded only when
// the build has SENTRY_AUTH_TOKEN (a Vercel secret; never in the repo); the release is the commit SHA
// Vercel provides. The runtime DSN comes from lib/config.ts.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !uploadSourceMaps },
  release: { create: uploadSourceMaps },
  silent: !uploadSourceMaps,
  telemetry: false,
  suppressOnRouterTransitionStartWarning: true,
})

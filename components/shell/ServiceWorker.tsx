'use client'

import { useEffect } from 'react'

/** Registers /sw.js, which caches the app shell (ARCHITECTURE §7.7). */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Not fatal: the app works online without it.
    })
  }, [])
  return null
}

'use client'
// THROWAWAY (E2 Sentry check, never merged).
import { useState } from 'react'
import { caughtActionError, uncaughtActionError } from './actions'

export default function SentryCheckPage() {
  const [done, setDone] = useState<string[]>([])
  const mark = (s: string) => setDone((d) => [...d, s])
  const button = 'rounded-xl border px-4 py-3 text-left'
  return (
    <main className="mx-auto grid max-w-[430px] gap-3 p-4">
      <h1 className="text-xl font-bold">Sentry check</h1>
      <button
        className={button}
        onClick={() => {
          setTimeout(() => {
            throw new Error('Sentry check (browser): bait e2-bait@example.com /join/e2-bait-token')
          })
          mark('browser')
        }}
      >
        1. Browser error
      </button>
      <button
        className={button}
        onClick={async () => {
          await caughtActionError()
          mark('server action, caught')
        }}
      >
        2. Server action error (caught)
      </button>
      <button
        className={button}
        onClick={async () => {
          await uncaughtActionError().catch(() => undefined)
          mark('server action, uncaught')
        }}
      >
        3. Server action error (uncaught)
      </button>
      <button
        className={button}
        onClick={async () => {
          await fetch('/api/sentry-check', { method: 'POST' })
          mark('cron')
        }}
      >
        4. Cron job error
      </button>
      <p>Sent: {done.length ? done.join(', ') : 'nothing yet'}</p>
    </main>
  )
}

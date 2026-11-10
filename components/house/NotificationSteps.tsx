'use client'

import { useEffect, useState } from 'react'
import { allowSteps, platformOf, unsupportedSteps, type Platform } from '@/lib/client/install'

const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * Step-by-step help for this phone or browser (T95): how to allow notifications once they're
 * blocked, or what to do where this browser can't show them.
 */
export function NotificationSteps({ kind }: { kind: 'blocked' | 'unsupported' }) {
  const [platform, setPlatform] = useState<Platform | null>(null)
  useEffect(() => {
    // Decided after mount: the server can't know the device.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(platformOf(navigator.userAgent, isStandalone()))
  }, [])
  if (!platform) return null
  const steps = kind === 'blocked' ? allowSteps[platform] : unsupportedSteps(platform)
  return (
    <ol aria-label="How to turn them on" className="m-0 grid list-none gap-2 p-0">
      {steps.map((text, i) => (
        <li
          key={text}
          className="flex items-start gap-3 rounded-2xl bg-paper px-3.5 py-3 leading-snug font-semibold"
        >
          <span
            aria-hidden
            className="grid size-7 flex-none place-items-center rounded-full bg-neutral-fill text-sm font-bold text-neutral-ink"
          >
            {i + 1}
          </span>
          <span>
            <span className="sr-only">Step {i + 1}: </span>
            {text}
          </span>
        </li>
      ))}
    </ol>
  )
}

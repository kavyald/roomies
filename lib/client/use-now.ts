'use client'

import { useEffect, useState } from 'react'
import { instant, type Instant } from '../domain/time'

/** The current time, refreshed every minute so "5m ago" stays true. Read once per render. */
export const useNow = (everyMs = 60_000): Instant => {
  const [now, setNow] = useState(() => instant(Date.now()))
  useEffect(() => {
    const t = setInterval(() => setNow(instant(Date.now())), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

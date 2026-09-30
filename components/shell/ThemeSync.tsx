'use client'

import { useEffect } from 'react'
import { useProfiles } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { HouseId } from '@/lib/domain/ids'

/**
 * Applies my theme to the whole page (FRONTEND §3.1: Auto follows the system; Light and Dark
 * override it through data-theme on <html>).
 */
export function ThemeSync({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const profiles = useProfiles(houseId)
  const theme = profiles.data?.find((p) => p.id === me)?.theme
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme
    else delete root.dataset.theme
  }, [theme])
  return null
}

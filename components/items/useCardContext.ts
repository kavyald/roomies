'use client'

import { useMemo } from 'react'
import { runLabel } from '@/components/runs/meta'
import { useContacts, useMembers, useProfiles, useRooms, useRuns } from '@/lib/client/hooks'
import type { HouseId } from '@/lib/domain/ids'
import type { CardContext } from './ItemCard'

/** Names, rooms, and contacts that item cards point at, looked up once per screen. */
export const useCardContext = (houseId: HouseId): CardContext => {
  const rooms = useRooms(houseId)
  const contacts = useContacts(houseId)
  const profiles = useProfiles(houseId)
  const members = useMembers(houseId)
  const runs = useRuns(houseId)
  return useMemo(() => {
    const roomMap = new Map((rooms.data ?? []).map((r) => [r.id as string, r]))
    const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
    const memberRoom = new Map((members.data ?? []).map((m) => [m.userId as string, m.roomId]))
    const contactMap = new Map((contacts.data ?? []).map((c) => [c.id as string, c]))
    const runMap = new Map((runs.data ?? []).map((r) => [r.id as string, r]))
    const labels = {
      person: (id: string) => names.get(id),
      contact: (id: string) => contactMap.get(id)?.name,
    }
    return {
      rooms: roomMap,
      contacts: contactMap,
      run: (id) => {
        const r = runMap.get(id)
        return r && { run: r, label: runLabel(r, labels) }
      },
      person: (id) => {
        const name = names.get(id)
        if (!name) return undefined
        const roomId = memberRoom.get(id)
        return { name, element: roomId ? roomMap.get(roomId)?.element : undefined }
      },
    }
  }, [rooms.data, contacts.data, profiles.data, members.data, runs.data])
}

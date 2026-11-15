'use client'

import { BedroomPicker, type BedroomOption } from '@/components/house/BedroomPicker'
import { useToast } from '@/components/ui/Toast'
import { useChangeMyRoom, useMembers, useProfiles, useRooms } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { HouseId, RoomId } from '@/lib/domain/ids'

const PROBLEMS: Record<string, string> = {
  room_taken: 'Someone just took that room. Pick another?',
}

/**
 * Your room on You (T109; Roommates → your sheet before, T93): the house's bedrooms, yours
 * checked, the others showing whose they are, and "Not yet". House → Roommates still shows
 * everyone's room.
 */
export function YourRoom({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const rooms = useRooms(houseId)
  const changeRoom = useChangeMyRoom(houseId)
  const toast = useToast()

  const active = (members.data ?? []).filter((m) => m.status.active)
  const mine = active.find((m) => m.userId === me)
  const nameOf = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
  const bedrooms: BedroomOption[] = (rooms.data ?? [])
    .filter((r) => r.kind === 'bedroom' && !r.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => {
      const holder = active.find((m) => m.roomId === r.id && m.userId !== me)
      const takenBy = holder && (nameOf.get(holder.userId) ?? 'Former roommate')
      return {
        key: r.id,
        name: r.name,
        ...(r.element && { element: r.element }),
        ...(takenBy && { takenBy }),
      }
    })

  if (!mine || bedrooms.length === 0) return null

  const pick = async (key: string | null) => {
    if (changeRoom.isPending || key === (mine.roomId ?? null)) return
    const r = await changeRoom.mutateAsync({ roomId: key as RoomId | null })
    if (!r.ok) return toast(PROBLEMS[r.error] ?? "Couldn't do that. Try again.")
    const room = bedrooms.find((b) => b.key === key)
    toast(room ? `Your room is ${room.name} now.` : 'No bedroom for now.')
  }

  return (
    <section aria-labelledby="your-room" className="grid gap-2">
      <h2
        id="your-room"
        className="m-0 text-sm font-extrabold tracking-[.02em] text-ink-soft uppercase"
      >
        Your room
      </h2>
      <BedroomPicker
        options={bedrooms}
        value={mine.roomId ?? null}
        onChange={pick}
        noneLabel="Not yet"
      />
    </section>
  )
}

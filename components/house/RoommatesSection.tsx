'use client'

import { Users } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/components/auth/fields'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { elementName } from '@/components/ui/elements'
import {
  useChangeMyRoom,
  useIsAdmin,
  useMembers,
  useMoveOut,
  useProfiles,
  useRooms,
  useSetRole,
} from '@/lib/client/hooks'
import { BedroomPicker, type BedroomOption } from '@/components/house/BedroomPicker'
import { useAppClient } from '@/lib/client/provider'
import type { Member } from '@/lib/domain/house'
import type { HouseId, RoomId } from '@/lib/domain/ids'

const PROBLEMS: Record<string, string> = {
  last_admin: 'The house needs an organizer. Make someone else an organizer first.',
  not_allowed: 'Only organizers can do that.',
  room_taken: 'Someone just took that room. Pick another?',
}

export function RoommatesSection({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const rooms = useRooms(houseId)
  const isAdmin = useIsAdmin(houseId)
  const [open, setOpen] = useState<Member | null>(null)

  const nameOf = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
  const roomOf = new Map((rooms.data ?? []).map((r) => [r.id as string, r]))
  const active = (members.data ?? []).filter((m) => m.status.active)
  const describe = (m: Member) => {
    const room = m.roomId ? roomOf.get(m.roomId) : undefined
    // No role label on the row (owner, 2026-11-10): just the room.
    return (room?.element ? `${elementName[room.element]} room` : room?.name) || undefined
  }

  // Your own sheet offers the bedrooms: yours, open ones, and whose the others are (T93).
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

  if (active.length === 0) {
    return <EmptyState icon={Users}>Your roommates will show up here once they join.</EmptyState>
  }
  return (
    <>
      <ListGroup label="Roommates">
        {active.map((m) => {
          const name = nameOf.get(m.userId) ?? 'Former roommate'
          const room = m.roomId ? roomOf.get(m.roomId) : undefined
          const canManage = m.userId === me || isAdmin
          return (
            <ListRow
              key={m.userId}
              leading={<Avatar name={name} element={room?.element} />}
              title={m.userId === me ? `${name} (you)` : name}
              subtitle={describe(m)}
              {...(canManage && { onClick: () => setOpen(m) })}
            />
          )
        })}
      </ListGroup>
      {open && (
        <MemberSheet
          houseId={houseId}
          member={active.find((m) => m.userId === open.userId) ?? open}
          name={nameOf.get(open.userId) ?? 'Former roommate'}
          isMe={open.userId === me}
          isAdmin={isAdmin}
          bedrooms={bedrooms}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

function MemberSheet({
  houseId,
  member,
  name,
  isMe,
  isAdmin,
  bedrooms,
  onClose,
}: {
  houseId: HouseId
  member: Member
  name: string
  isMe: boolean
  isAdmin: boolean
  bedrooms: readonly BedroomOption[]
  onClose: () => void
}) {
  const moveOut = useMoveOut(houseId)
  const setRole = useSetRole(houseId)
  const changeRoom = useChangeMyRoom(houseId)
  const toast = useToast()
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  const leave = async () => {
    const r = await moveOut.mutateAsync({ userId: member.userId, ...(note.trim() && { note }) })
    if (!r.ok) return toast(PROBLEMS[r.error] ?? "Couldn't do that. Try again.")
    toast(isMe ? 'Moved out. Thanks for being a roomie. 💛' : `${name} is no longer in the house.`)
    onClose()
  }

  const toggleAdmin = async () => {
    const r = await setRole.mutateAsync({
      userId: member.userId,
      role: member.role === 'admin' ? 'member' : 'admin',
    })
    if (!r.ok) return toast(PROBLEMS[r.error] ?? "Couldn't do that. Try again.")
    toast(member.role === 'admin' ? `${name} is a member now.` : `${name} is an organizer now.`)
    onClose()
  }

  const pickRoom = async (key: string | null) => {
    if (changeRoom.isPending || key === (member.roomId ?? null)) return
    const r = await changeRoom.mutateAsync({ roomId: key as RoomId | null })
    if (!r.ok) return toast(PROBLEMS[r.error] ?? "Couldn't do that. Try again.")
    const room = bedrooms.find((b) => b.key === key)
    toast(room ? `Your room is ${room.name} now.` : 'No bedroom for now.')
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={isMe ? 'You' : name}>
      {isMe && bedrooms.length > 0 && (
        <section aria-labelledby="your-room" className="grid gap-2">
          <h3 id="your-room" className="m-0 font-bold">
            Which room is yours?
          </h3>
          <BedroomPicker
            options={bedrooms}
            value={member.roomId ?? null}
            onChange={pickRoom}
            noneLabel="Not yet"
          />
        </section>
      )}
      {isAdmin && (
        <Button variant="secondary" block disabled={setRole.isPending} onClick={toggleAdmin}>
          {member.role === 'admin'
            ? isMe
              ? 'Stop being an organizer'
              : 'Make a member'
            : 'Make an organizer'}
        </Button>
      )}
      {!confirming ? (
        <Button variant="secondary" block onClick={() => setConfirming(true)}>
          {isMe ? 'I moved out' : 'Remove from the house'}
        </Button>
      ) : (
        <div className="grid gap-3">
          <p className="m-0 leading-snug">
            {isMe
              ? "You'll lose access to the house. Your name stays on past items."
              : `${name} will lose access to the house. Their name stays on past items.`}
          </p>
          <Field
            id="note"
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button block disabled={moveOut.isPending} onClick={leave}>
            {isMe ? 'Yes, I moved out' : `Remove ${name}`}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

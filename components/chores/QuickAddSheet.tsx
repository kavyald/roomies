'use client'

import { useId, useState, type FormEvent } from 'react'
import { inputClass } from '@/components/auth/fields'
import { itemProblem } from '@/components/items/ItemSheets'
import { RoomSelect } from '@/components/items/RoomSelect'
import { ChoreIconPicker } from '@/components/ui/ChoreIconPicker'
import { Sheet, SheetSave } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useCreateItem } from '@/lib/client/hooks'
import type { Room } from '@/lib/domain/house'
import type { HouseId, RoomId } from '@/lib/domain/ids'

const labelClass = 'text-[0.8rem] font-extrabold text-ink-soft'

/**
 * Adding a chore from the Chores tab (FRONTEND §5.6): a name and an icon. From a room it's that
 * room's Deep clean, so the kind and room are settled; from Upkeep, a room is optional.
 * Tap + Add, tap an icon if you like, tap the check: three taps and the name.
 */
export function QuickAddSheet({
  houseId,
  room,
  rooms,
  onClose,
}: {
  houseId: HouseId
  /** The room whose + Add this is: a Deep clean chore there. Absent: an Upkeep chore. */
  room?: Room
  /** The rooms an Upkeep chore can pick from. */
  rooms: readonly Room[]
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('')
  const [roomId, setRoomId] = useState<RoomId | ''>('')
  const create = useCreateItem(houseId)
  const toast = useToast()
  const formId = useId()
  const nameId = useId()
  const roomFieldId = useId()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const inRoom = room?.id ?? roomId
    const r = await create.mutateAsync({
      category: 'chore',
      title,
      kind: room ? 'deep_clean' : 'upkeep',
      ...(icon && { icon }),
      ...(inRoom && { rooms: [inRoom] }),
    })
    if (!r.ok) return toast(itemProblem(r.error))
    toast('Added.')
    onClose()
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={room ? `Add to ${room.name}` : 'Add to Upkeep'}
      description={room ? 'Deep clean' : undefined}
    >
      <form id={formId} onSubmit={submit} className="grid gap-3.5">
        <div className="grid gap-1.5">
          <label htmlFor={nameId} className={labelClass}>
            What needs doing?
          </label>
          <input
            id={nameId}
            className={inputClass}
            autoFocus
            enterKeyHint="done"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {!room && (
          <div className="grid gap-1.5">
            <label htmlFor={roomFieldId} className={labelClass}>
              Room
            </label>
            <RoomSelect id={roomFieldId} rooms={rooms} value={roomId} onChange={setRoomId} />
          </div>
        )}
        <ChoreIconPicker label="Icon" value={icon} onChange={setIcon} />
        <SheetSave form={formId} label="Add" busy={create.isPending} disabled={!title.trim()} />
      </form>
    </Sheet>
  )
}

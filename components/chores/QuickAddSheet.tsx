'use client'

import { useId, useState, type FormEvent } from 'react'
import { inputClass } from '@/components/auth/fields'
import { itemProblem } from '@/components/items/ItemSheets'
import { RoomSelect } from '@/components/items/RoomSelect'
import { ChoreIconPicker, iconFor } from '@/components/ui/ChoreIconPicker'
import { Sheet, SheetSave } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useCreateItem } from '@/lib/client/hooks'
import type { Room } from '@/lib/domain/house'
import type { HouseId, RoomId } from '@/lib/domain/ids'

const labelClass = 'text-[0.8rem] font-extrabold text-ink-soft'

/**
 * Adding an Upkeep chore from the Chores tab (FRONTEND §5.6): a name, a room if you like, and an
 * icon, which the name suggests. A room's Deep clean chores are set up in Admin → Rooms (T101).
 * Tap + Add, type the name, tap the check.
 */
export function QuickAddSheet({
  houseId,
  rooms,
  onClose,
}: {
  houseId: HouseId
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
  const shownIcon = iconFor(icon, title)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const r = await create.mutateAsync({
      category: 'chore',
      title,
      kind: 'upkeep',
      ...(shownIcon && { icon: shownIcon }),
      ...(roomId && { rooms: [roomId] }),
    })
    if (!r.ok) return toast(itemProblem(r.error))
    toast('Added.')
    onClose()
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Add to Upkeep">
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
        <div className="grid gap-1.5">
          <label htmlFor={roomFieldId} className={labelClass}>
            Room
          </label>
          <RoomSelect id={roomFieldId} rooms={rooms} value={roomId} onChange={setRoomId} />
        </div>
        <ChoreIconPicker label="Icon" title={title} value={shownIcon} onChange={setIcon} />
        <SheetSave form={formId} label="Add" busy={create.isPending} disabled={!title.trim()} />
      </form>
    </Sheet>
  )
}

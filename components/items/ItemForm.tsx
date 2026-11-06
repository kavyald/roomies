'use client'

import { ChevronDown } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { inputClass } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { ChoreIconPicker } from '@/components/ui/ChoreIconPicker'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SheetSave } from '@/components/ui/Sheet'
import { useContacts, useMembers, useProfiles, useRooms } from '@/lib/client/hooks'
import type { ContactId, HouseId, RoomId, UserId } from '@/lib/domain/ids'
import type { Category, ChoreKind, Item, NewItem, Priority } from '@/lib/domain/items'
import type { LocalDate, LocalTime } from '@/lib/domain/time'
import { useWhoseChoice, WhoseToggle } from '@/components/needs/Whose'
import { CHORE_KIND_LABEL } from './meta'
import { RoomSelect } from './RoomSelect'
import { RoomsSelect } from './RoomsSelect'

export type ItemFormValues = {
  title: string
  note: string
  /** Needs and tasks. */
  roomId: RoomId | ''
  /** Chores: any number of rooms, an icon and a kind instead of a room and a person. */
  rooms: readonly RoomId[]
  icon: string
  kind: ChoreKind
  assignee: UserId | ''
  date: string
  time: string
  priority: Priority
  contactId: ContactId | ''
  /** Needs, when adding: just for me, not the house (T45). */
  forMe: boolean
}

export const valuesFrom = (item?: Item): ItemFormValues => ({
  title: item?.title ?? '',
  note: item?.note ?? '',
  roomId: (item?.category === 'chore' ? undefined : item?.roomId) ?? '',
  rooms: item?.category === 'chore' ? item.rooms : [],
  icon: (item?.category === 'chore' ? item.icon : undefined) ?? '',
  kind: item?.category === 'chore' ? item.kind : 'upkeep',
  assignee: item?.assignee ?? '',
  date: item?.when?.date ?? '',
  time: item?.when?.time ?? '',
  priority: item?.priority ?? 'normal',
  contactId: item?.category === 'task' ? (item.contactId ?? '') : '',
  forMe: false,
})

/** The form's values as a new item (optional fields left out when empty). */
export const toNewItem = (category: Category, v: ItemFormValues): NewItem => ({
  category,
  title: v.title,
  ...(v.note.trim() && { note: v.note }),
  ...(category === 'chore'
    ? {
        kind: v.kind,
        ...(v.icon && { icon: v.icon }),
        ...(v.rooms.length > 0 && { rooms: v.rooms }),
      }
    : v.roomId && { roomId: v.roomId }),
  ...(v.assignee && category !== 'chore' && { assignee: v.assignee }),
  ...(category !== 'chore' &&
    v.date && {
      when: { date: v.date as LocalDate, ...(v.time && { time: v.time as LocalTime }) },
    }),
  ...(v.priority !== 'normal' && { priority: v.priority }),
  ...(category === 'task' && v.contactId && { contactId: v.contactId }),
  ...(category === 'need' && v.forMe && { forMe: true }),
})

const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="text-[0.8rem] font-extrabold text-ink-soft">
    {children}
  </label>
)

/**
 * Title first (FRONTEND §5.3): a title and "Add" is enough. The optional fields sit behind "More
 * options" when adding, and are all shown when editing.
 * It lives in a Sheet: the header check (SheetSave, named by `submitLabel`) submits it (T80).
 * "Add another" (when adding) keeps the sheet open: it clears the title and note for the next one
 * and keeps the rest (room, date, who).
 */
export function ItemForm({
  houseId,
  category,
  initial,
  submitLabel,
  busy,
  expanded: startExpanded = false,
  onSubmit,
  onAddAnother,
  askWhose,
}: {
  houseId: HouseId
  category: Category
  initial: ItemFormValues
  submitLabel: string
  busy: boolean
  expanded?: boolean
  onSubmit: (v: ItemFormValues) => void
  /** Adds this one and keeps the form open; resolves true once the house has it. */
  onAddAnother?: (v: ItemFormValues) => Promise<boolean>
  /** Adding a need: show House / Me (remembered on this device). Editing uses the detail. */
  askWhose?: boolean
}) {
  const [v, setV] = useState(initial)
  const [whose, setWhose] = useWhoseChoice()
  const showWhose = askWhose && category === 'need'
  const withWhose = (x: ItemFormValues) => (showWhose ? { ...x, forMe: whose === 'me' } : x)
  const titleRef = useRef<HTMLInputElement>(null)
  const formId = useId()
  const [expanded, setExpanded] = useState(startExpanded)
  const rooms = useRooms(houseId)
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const contacts = useContacts(houseId)
  const set = <K extends keyof ItemFormValues>(k: K, value: ItemFormValues[K]) =>
    setV((p) => ({ ...p, [k]: value }))
  const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
  const people = (members.data ?? []).filter((m) => m.status.active)
  const titleLabel = {
    need: 'What do we need?',
    chore: 'What needs doing?',
    task: 'What needs doing?',
  }[category]

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (v.title.trim()) onSubmit(withWhose(v))
  }
  const another = async () => {
    if (!v.title.trim() || !onAddAnother) return
    if (await onAddAnother(withWhose(v))) {
      setV((p) => ({ ...p, title: '', note: '' }))
      titleRef.current?.focus()
    }
  }

  return (
    <form id={formId} onSubmit={submit} className="grid gap-3.5">
      <div className="grid gap-1.5">
        <Label htmlFor="item-title">{titleLabel}</Label>
        <input
          ref={titleRef}
          id="item-title"
          className={inputClass}
          autoFocus
          enterKeyHint="done"
          maxLength={120}
          value={v.title}
          onChange={(e) => set('title', e.target.value)}
        />
      </div>

      {showWhose && <WhoseToggle value={whose} onChange={setWhose} />}

      {!expanded && (
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 justify-self-start text-sm font-bold text-accent-ink"
          onClick={() => setExpanded(true)}
        >
          More options <ChevronDown aria-hidden className="size-4" />
        </button>
      )}

      {expanded && (
        <>
          {category !== 'chore' && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="item-date">{category === 'need' ? 'Needed by' : 'Date'}</Label>
                <input
                  id="item-date"
                  type="date"
                  className={inputClass}
                  value={v.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              </div>
              {category === 'task' && (
                <div className="grid gap-1.5">
                  <Label htmlFor="item-time">Time</Label>
                  <input
                    id="item-time"
                    type="time"
                    className={`${inputClass} w-32`}
                    disabled={!v.date}
                    value={v.time}
                    onChange={(e) => set('time', e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {category === 'chore' ? (
            <>
              <SegmentedControl
                wide
                label="What kind of chore?"
                value={v.kind}
                onChange={(k) => set('kind', k)}
                options={[
                  { value: 'deep_clean', label: CHORE_KIND_LABEL.deep_clean },
                  { value: 'upkeep', label: CHORE_KIND_LABEL.upkeep },
                ]}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="item-rooms">Rooms</Label>
                <RoomsSelect
                  id="item-rooms"
                  rooms={rooms.data ?? []}
                  value={v.rooms}
                  onChange={(r) => set('rooms', r)}
                />
              </div>
              <ChoreIconPicker label="Icon" value={v.icon} onChange={(i) => set('icon', i)} />
            </>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="item-room">Room</Label>
              <RoomSelect
                id="item-room"
                rooms={rooms.data ?? []}
                value={v.roomId}
                onChange={(r) => set('roomId', r)}
              />
            </div>
          )}

          {category === 'task' && (
            <div className="grid gap-1.5">
              <Label htmlFor="item-assignee">Who&apos;s on it</Label>
              <select
                id="item-assignee"
                className={inputClass}
                value={v.assignee}
                onChange={(e) => set('assignee', e.target.value as UserId | '')}
              >
                <option value="">Anyone</option>
                {people.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {names.get(m.userId) ?? 'Roommate'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category !== 'need' && (
            <div className="grid gap-1.5">
              <Label htmlFor="item-priority">Priority</Label>
              <select
                id="item-priority"
                className={inputClass}
                value={v.priority}
                onChange={(e) => set('priority', e.target.value as Priority)}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          )}

          {category === 'task' && (
            <div className="grid gap-1.5">
              <Label htmlFor="item-contact">Handled by</Label>
              <select
                id="item-contact"
                className={inputClass}
                value={v.contactId}
                onChange={(e) => set('contactId', e.target.value as ContactId | '')}
              >
                <option value="">One of us</option>
                {(contacts.data ?? [])
                  .filter((c) => !c.archivedAt)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="item-note">Note</Label>
            <textarea
              id="item-note"
              rows={2}
              className={`${inputClass} resize-none`}
              value={v.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </div>
        </>
      )}

      <SheetSave form={formId} label={submitLabel} busy={busy} disabled={!v.title.trim()} />
      {onAddAnother && (
        <Button variant="secondary" block disabled={busy || !v.title.trim()} onClick={another}>
          Add another
        </Button>
      )}
    </form>
  )
}

'use client'

import { ChevronDown } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { inputClass } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useContacts, useMembers, useProfiles, useRooms } from '@/lib/client/hooks'
import type { ContactId, HouseId, RoomId, UserId } from '@/lib/domain/ids'
import type { Category, Item, NewItem, Priority } from '@/lib/domain/items'
import type { LocalDate, LocalTime } from '@/lib/domain/time'
import { useWhoseChoice, WhoseToggle } from '@/components/needs/Whose'
import { RoomSelect } from './RoomSelect'

export type ItemFormValues = {
  title: string
  note: string
  roomId: RoomId | ''
  assignee: UserId | ''
  date: string
  time: string
  priority: Priority
  repeat: 'as_needed' | 'every'
  repeatDays: number
  contactId: ContactId | ''
  /** Needs, when adding: just for me, not the house (T45). */
  forMe: boolean
}

export const valuesFrom = (item?: Item): ItemFormValues => ({
  title: item?.title ?? '',
  note: item?.note ?? '',
  roomId: item?.roomId ?? '',
  assignee: item?.assignee ?? '',
  date: item?.when?.date ?? '',
  time: item?.when?.time ?? '',
  priority: item?.priority ?? 'normal',
  repeat: item?.category === 'chore' && item.repeatDays ? 'every' : 'as_needed',
  repeatDays: item?.category === 'chore' && item.repeatDays ? item.repeatDays : 7,
  contactId: item?.category === 'task' ? (item.contactId ?? '') : '',
  forMe: false,
})

/** The form's values as a new item (optional fields left out when empty). */
export const toNewItem = (category: Category, v: ItemFormValues): NewItem => ({
  category,
  title: v.title,
  ...(v.note.trim() && { note: v.note }),
  ...(v.roomId && { roomId: v.roomId }),
  ...(v.assignee && { assignee: v.assignee }),
  ...(v.date && {
    when: { date: v.date as LocalDate, ...(v.time && { time: v.time as LocalTime }) },
  }),
  ...(v.priority !== 'normal' && { priority: v.priority }),
  ...(category === 'chore' && { repeatDays: v.repeat === 'every' ? v.repeatDays : null }),
  ...(category === 'task' && v.contactId && { contactId: v.contactId }),
  ...(category === 'need' && v.forMe && { forMe: true }),
})

const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="text-[0.8rem] font-extrabold text-ink-soft">
    {children}
  </label>
)

/**
 * Title first (FRONTEND §5.3): a title and "Add" is enough. A chore's "How often?" always shows;
 * the other optional fields sit behind "More options" when adding, and are all shown when editing.
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
    <form onSubmit={submit} className="grid gap-3.5">
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

      {category === 'chore' && (
        <div className="grid gap-1.5">
          <span className="text-[0.8rem] font-extrabold text-ink-soft">How often?</span>
          <SegmentedControl
            wide
            label="How often"
            value={v.repeat}
            onChange={(r) => set('repeat', r)}
            options={[
              { value: 'as_needed', label: 'As needed' },
              { value: 'every', label: 'About every…' },
            ]}
          />
          {v.repeat === 'every' && (
            <div className="flex items-center gap-2">
              <input
                id="repeat-days"
                aria-label="Days between"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                className={`${inputClass} w-24`}
                value={v.repeatDays}
                onChange={(e) =>
                  set('repeatDays', Math.max(1, Math.min(365, Number(e.target.value) || 1)))
                }
              />
              <span className="font-semibold">days</span>
            </div>
          )}
        </div>
      )}

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

          <div className="grid gap-1.5">
            <Label htmlFor="item-room">Room</Label>
            <RoomSelect
              id="item-room"
              rooms={rooms.data ?? []}
              value={v.roomId}
              onChange={(r) => set('roomId', r)}
            />
          </div>

          {category !== 'need' && (
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

      {onAddAnother ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" disabled={busy || !v.title.trim()}>
            {submitLabel}
          </Button>
          <Button variant="secondary" disabled={busy || !v.title.trim()} onClick={another}>
            Add another
          </Button>
        </div>
      ) : (
        <Button type="submit" block disabled={busy || !v.title.trim()}>
          {submitLabel}
        </Button>
      )}
    </form>
  )
}

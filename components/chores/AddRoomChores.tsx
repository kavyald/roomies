'use client'

import { Plus, Search } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { inputClass } from '@/components/auth/fields'
import { itemProblem } from '@/components/items/ItemSheets'
import { ChoreIcon } from '@/components/ui/ChoreIcon'
import { ChoreIconPicker, iconFor } from '@/components/ui/ChoreIconPicker'
import { SheetSave } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { useAddRoomChores } from '@/lib/client/hooks'
import type { Room } from '@/lib/domain/house'
import type { HouseId } from '@/lib/domain/ids'
import { choreKey, type ChorePick, type Item } from '@/lib/domain/items'
import { choreNames } from '@/lib/domain/lists'

export const pickHeadingClass =
  'm-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase'

/**
 * Giving a room Deep clean chores (T101): every chore name in the house as one-tap picks (minus the
 * ones it has), a search that narrows them whatever the case, and **New chore** for a name that
 * isn't there yet. The sheet's header check adds them all as one action, a copy each. Used in
 * Admin → Rooms and on the Chores tab; it must sit inside a `Sheet`.
 */
export function AddRoomChores({
  houseId,
  room,
  items,
  onAdded,
}: {
  houseId: HouseId
  room: Room
  items: readonly Item[]
  /** After adding; absent, the sheet stays open on the room's new list. */
  onAdded?: () => void
}) {
  const add = useAddRoomChores(houseId)
  const toast = useToast()
  const formId = useId()
  const newId = useId()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<readonly string[]>([])
  const [writing, setWriting] = useState(false)
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('')

  const has = new Set(
    items
      .filter(
        (i) =>
          i.category === 'chore' &&
          !i.archivedAt &&
          i.kind === 'deep_clean' &&
          i.rooms.includes(room.id),
      )
      .map((c) => choreKey(c.title)),
  )
  const options = choreNames(items).filter((o) => !has.has(choreKey(o.title)))
  const q = choreKey(query)
  // Picked ones stay in view while searching, so a pick never hides.
  const matches = q ? options.filter((o) => choreKey(o.title).includes(q)) : options
  const shown = q
    ? options.filter((o) => matches.includes(o) || picked.includes(choreKey(o.title)))
    : options
  const typed = title.trim()
  const picks: ChorePick[] = [
    ...options.filter((o) => picked.includes(choreKey(o.title))),
    ...(writing && typed
      ? [{ title: typed, ...(iconFor(icon, typed) && { icon: iconFor(icon, typed) }) }]
      : []),
  ]

  const toggle = (key: string) =>
    setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]))

  const startWriting = () => {
    // A search with no match is most likely the new chore's name.
    if (!writing && !title && query.trim()) setTitle(query.trim())
    setWriting((w) => !w)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (picks.length === 0) return
    const r = await add.mutateAsync({ roomId: room.id, chores: picks })
    if (!r.ok) return toast(itemProblem(r.error))
    toast(r.value.length > 0 ? 'Added.' : `${room.name} already has those.`)
    setPicked([])
    setQuery('')
    setWriting(false)
    setTitle('')
    setIcon('')
    onAdded?.()
  }

  return (
    <form id={formId} onSubmit={submit} className="grid gap-1.5">
      <h3 className={pickHeadingClass}>Add chores</h3>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft"
        />
        <input
          type="search"
          aria-label="Search chores"
          placeholder="Search chores"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter here searches; it never adds.
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          className="w-full rounded-[14px] border-[1.5px] border-line bg-paper py-2.5 pr-3 pl-9 text-base text-ink placeholder:text-ink-soft"
        />
      </div>
      {q && matches.length === 0 && (
        <p className="m-0 text-sm text-ink-soft">
          No chore by that name yet. Tap New chore to add it.
        </p>
      )}
      <ul aria-label="Chores to add" className="m-0 flex list-none flex-wrap gap-x-1.5 p-0">
        {shown.map((o) => {
          const key = choreKey(o.title)
          return (
            <li key={key}>
              <PickChip on={picked.includes(key)} icon={o.icon} onClick={() => toggle(key)}>
                {o.title}
              </PickChip>
            </li>
          )
        })}
        <li>
          <PickChip on={writing} plus onClick={startWriting}>
            New chore
          </PickChip>
        </li>
      </ul>
      {writing && (
        <div className="grid gap-2.5 rounded-2xl bg-card p-3">
          <div className="grid gap-1.5">
            <label htmlFor={newId} className="text-[0.8rem] font-extrabold text-ink-soft">
              What needs doing?
            </label>
            <input
              id={newId}
              className={inputClass}
              autoFocus
              enterKeyHint="done"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <ChoreIconPicker
            label="Icon"
            title={title}
            value={iconFor(icon, title)}
            onChange={setIcon}
          />
        </div>
      )}
      <SheetSave form={formId} label="Add" busy={add.isPending} disabled={picks.length === 0} />
    </form>
  )
}

/** A chore to pick: tap to select it, tap again to drop it. */
function PickChip({
  on,
  icon,
  plus,
  onClick,
  children,
}: {
  on: boolean
  icon?: string
  /** New chore: a plus in place of an icon. */
  plus?: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex min-h-11 items-center"
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-[0.85rem] font-bold',
          on ? 'bg-accent text-on-accent' : 'bg-neutral-fill text-neutral-ink',
        )}
      >
        {plus ? (
          <Plus aria-hidden className="size-4" />
        ) : (
          <ChoreIcon name={icon} className="size-4" />
        )}
        {children}
      </span>
    </button>
  )
}

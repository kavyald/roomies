'use client'

import { BarChart3, Copy, ShoppingCart } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Chip, RoomChip } from '@/components/ui/Chip'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { useCopy } from '@/components/house/useCopy'
import {
  useArchiveItem,
  useContacts,
  useCreateItem,
  useDoChore,
  useEditItem,
  useHouse,
  useItem,
  useMarkDone,
  useMembers,
  useProfiles,
  useReopenItem,
  useRestoreItem,
  useRooms,
} from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { relativeTime } from '@/lib/domain/format'
import type { HouseId, ItemId } from '@/lib/domain/ids'
import type { Category, Item, ItemPatch } from '@/lib/domain/items'
import type { LocalDate, LocalTime } from '@/lib/domain/time'
import { HouseFeels } from './Feelings'
import { HandledByPicker } from './HandledByPicker'
import { ItemForm, toNewItem, valuesFrom, type ItemFormValues } from './ItemForm'
import { CATEGORY, scheduleLabel, whenLabel } from './meta'

type Sheets = { openAdd(category?: Category): void; openItem(id: ItemId): void }
const SheetsContext = createContext<Sheets>({ openAdd: () => {}, openItem: () => {} })

/** Opens the "+" sheet or an item's detail sheet from anywhere in the house. */
export const useItemSheets = (): Sheets => useContext(SheetsContext)

const PROBLEM: Record<string, string> = {
  empty_title: 'Give it a title.',
  title_too_long: 'That title is a bit long. Keep it under 120 characters.',
  unknown_member: "That roommate isn't in the house anymore.",
  unknown_room: "That room isn't there anymore.",
  unknown_contact: "That contact isn't there anymore.",
  bad_repeat: 'Pick between 1 and 365 days.',
}
const oops = "Couldn't reach the house. Check your connection and try again."

export function ItemSheetsProvider({
  houseId,
  children,
}: {
  houseId: HouseId
  children: ReactNode
}) {
  const [adding, setAdding] = useState<{ category?: Category } | null>(null)
  const [openId, setOpenId] = useState<ItemId | null>(null)
  const sheets = useMemo<Sheets>(
    () => ({ openAdd: (category) => setAdding({ category }), openItem: (id) => setOpenId(id) }),
    [],
  )
  return (
    <SheetsContext.Provider value={sheets}>
      {children}
      {adding && (
        <AddSheet
          houseId={houseId}
          initialCategory={adding.category}
          onClose={() => setAdding(null)}
          onOpen={(id) => {
            setAdding(null)
            setOpenId(id)
          }}
        />
      )}
      {openId && <ItemDetailSheet houseId={houseId} id={openId} onClose={() => setOpenId(null)} />}
    </SheetsContext.Provider>
  )
}

// ---- the "+" sheet ------------------------------------------------------------------------------

function AddSheet({
  houseId,
  initialCategory,
  onClose,
  onOpen,
}: {
  houseId: HouseId
  initialCategory?: Category
  onClose: () => void
  onOpen: (id: ItemId) => void
}) {
  const [category, setCategory] = useState<Category | null>(initialCategory ?? null)
  const create = useCreateItem(houseId)
  const toast = useToast()

  const add = async (v: ItemFormValues) => {
    if (!category) return
    const r = await create.mutateAsync(toNewItem(category, v))
    if (r.ok) {
      toast('Added.', { label: 'Open', onClick: () => onOpen(r.value.id) })
      return onClose()
    }
    if (r.error === 'duplicate_need' && r.detail?.existingId) {
      toast("That's already on the list.", {
        label: 'Open',
        onClick: () => onOpen(r.detail!.existingId as ItemId),
      })
      return onClose()
    }
    toast(PROBLEM[r.error] ?? oops)
  }

  if (!category) {
    const tiles: {
      key: Category | 'poll' | 'run'
      label: string
      blurb: string
      icon: typeof ShoppingCart
      soon?: boolean
    }[] = [
      { key: 'need', label: 'A need', blurb: 'Something to buy', icon: CATEGORY.need.icon },
      { key: 'chore', label: 'A chore', blurb: 'Ongoing upkeep', icon: CATEGORY.chore.icon },
      { key: 'task', label: 'A task', blurb: 'A one-off', icon: CATEGORY.task.icon },
      { key: 'poll', label: 'A poll', blurb: 'Coming soon', icon: BarChart3, soon: true },
      { key: 'run', label: 'A run', blurb: 'Coming soon', icon: ShoppingCart, soon: true },
    ]
    return (
      <Sheet open onOpenChange={(o) => !o && onClose()} title="Add something">
        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={t.soon}
              onClick={() => setCategory(t.key as Category)}
              className="sticker grid gap-2 rounded-[20px] bg-paper px-3.5 py-4 text-left font-extrabold shadow-[inset_0_0_0_1.5px_var(--line),0_2px_0_var(--line)] disabled:opacity-50"
            >
              <t.icon aria-hidden className="size-[26px] text-accent-ink" />
              {t.label}
              <small className="text-[0.78rem] font-semibold text-ink-soft">{t.blurb}</small>
            </button>
          ))}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={CATEGORY[category].article}>
      <ItemForm
        houseId={houseId}
        category={category}
        initial={valuesFrom()}
        submitLabel="Add"
        busy={create.isPending}
        onSubmit={add}
      />
    </Sheet>
  )
}

// ---- the detail sheet -----------------------------------------------------------------------------

/** What changed between the item and the form, as a patch (null clears a field). */
const patchFrom = (item: Item, v: ItemFormValues): ItemPatch => {
  const before = valuesFrom(item)
  const p: Record<string, unknown> = {}
  if (v.title.trim() !== item.title) p.title = v.title
  if (v.note !== before.note) p.note = v.note.trim() ? v.note : null
  if (v.roomId !== before.roomId) p.roomId = v.roomId || null
  if (v.assignee !== before.assignee) p.assignee = v.assignee || null
  if (v.date !== before.date || v.time !== before.time) {
    p.when = v.date
      ? { date: v.date as LocalDate, ...(v.time && { time: v.time as LocalTime }) }
      : null
  }
  if (v.priority !== before.priority) p.priority = v.priority
  if (item.category === 'chore') {
    const next = v.repeat === 'every' ? v.repeatDays : null
    if (next !== item.repeatDays) p.repeatDays = next
  }
  if (item.category === 'task' && v.contactId !== before.contactId)
    p.contactId = v.contactId || null
  return p as ItemPatch
}

function ItemDetailSheet({
  houseId,
  id,
  onClose,
}: {
  houseId: HouseId
  id: ItemId
  onClose: () => void
}) {
  const item = useItem(houseId, id)
  const house = useHouse(houseId)
  const rooms = useRooms(houseId)
  const profiles = useProfiles(houseId)
  const members = useMembers(houseId)
  const contacts = useContacts(houseId)
  const now = useNow()
  const toast = useToast()
  const copy = useCopy()
  const [editing, setEditing] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pickingHandler, setPickingHandler] = useState(false)
  const edit = useEditItem(houseId)
  const done = useMarkDone(houseId)
  const reopen = useReopenItem(houseId)
  const did = useDoChore(houseId)
  const archive = useArchiveItem(houseId)
  const restore = useRestoreItem(houseId)
  const busy =
    edit.isPending ||
    done.isPending ||
    reopen.isPending ||
    did.isPending ||
    archive.isPending ||
    restore.isPending

  const nameOf = useCallback(
    (u?: string) =>
      u ? (profiles.data?.find((p) => p.id === u)?.displayName ?? 'Former roommate') : undefined,
    [profiles.data],
  )
  const elementOf = (u?: string) => {
    const m = members.data?.find((x) => x.userId === u)
    return m?.roomId ? rooms.data?.find((r) => r.id === m.roomId)?.element : undefined
  }

  if (!item) {
    return (
      <Sheet open onOpenChange={(o) => !o && onClose()} title="Loading…">
        <p className="m-0 text-ink-soft">One moment.</p>
      </Sheet>
    )
  }

  const tz = house.data?.settings.timezone ?? 'UTC'
  const room = item.roomId ? rooms.data?.find((r) => r.id === item.roomId) : undefined
  const contact =
    item.category === 'task' && item.contactId
      ? contacts.data?.find((c) => c.id === item.contactId)
      : undefined
  const isDone = item.category !== 'chore' && !!item.done
  const say = (r: { ok: boolean; error?: string }, success: string, undo?: () => void) =>
    r.ok
      ? toast(success, undo && { label: 'Undo', onClick: undo })
      : toast(PROBLEM[r.error ?? ''] ?? oops)

  if (editing) {
    return (
      <Sheet
        open
        onOpenChange={(o) => !o && onClose()}
        title={`Edit ${CATEGORY[item.category].label.toLowerCase()}`}
      >
        <ItemForm
          houseId={houseId}
          category={item.category}
          initial={valuesFrom(item)}
          expanded
          submitLabel="Save"
          busy={busy}
          onSubmit={async (v) => {
            const r = await edit.mutateAsync({ id: item.id, patch: patchFrom(item, v) })
            if (r.ok || r.error === 'no_change') {
              setEditing(false)
              if (r.ok) toast('Saved.')
            } else if (r.error === 'duplicate_need')
              toast("There's already an open need with that name.")
            else toast(PROBLEM[r.error] ?? oops)
          }}
        />
      </Sheet>
    )
  }

  const rows: [string, React.ReactNode][] = []
  if (item.category === 'chore') {
    rows.push(['How often', scheduleLabel(item)])
    rows.push([
      'Last done',
      item.lastDone
        ? `${relativeTime(item.lastDone.at, now, tz)} · ${nameOf(item.lastDone.by)}`
        : 'Not yet',
    ])
  }
  const when = whenLabel(item, now, tz)
  if (when)
    rows.push([item.category === 'need' ? 'Needed by' : 'When', when.replace(/^Needed by /, '')])
  if (item.category !== 'need') {
    rows.push([
      "Who's on it",
      item.assignee ? (
        <span className="flex items-center gap-2">
          <Avatar name={nameOf(item.assignee)!} element={elementOf(item.assignee)} size={20} />
          {nameOf(item.assignee)}
        </span>
      ) : (
        'Anyone'
      ),
    ])
  }
  if (item.category === 'task') {
    const change = (label: string) => (
      <button
        type="button"
        className="min-h-11 text-sm font-extrabold text-accent-ink"
        onClick={() => setPickingHandler((p) => !p)}
      >
        {label}
      </button>
    )
    rows.push([
      'Handled by',
      contact ? (
        <span className="flex flex-wrap items-center gap-x-2">
          {contact.name}
          {contact.phone && (
            <>
              <span className="tabular-nums">{contact.phone}</span>
              <button
                type="button"
                className="flex min-h-11 items-center gap-1 text-sm font-extrabold text-accent-ink"
                onClick={() => copy(contact.phone!, 'Number copied.')}
              >
                <Copy aria-hidden className="size-4" /> Copy
              </button>
            </>
          )}
          {change('Change')}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-2">
          One of us {!item.archivedAt && change('Needs outside help?')}
        </span>
      ),
    ])
  }
  if (item.category !== 'chore' && item.done) {
    rows.push([
      item.category === 'need' ? 'Got it' : 'Done',
      `${relativeTime(item.done.at, now, tz)} · ${nameOf(item.done.by)}`,
    ])
  }

  const primary = item.archivedAt
    ? null
    : item.category === 'chore'
      ? {
          label: 'Did it',
          run: async () => say(await did.mutateAsync(item.id), 'Nice. Marked as done today.'),
        }
      : isDone
        ? {
            label: 'Not done after all',
            run: async () => say(await reopen.mutateAsync(item.id), 'Back on the list.'),
          }
        : {
            label: item.category === 'need' ? 'Got it' : 'Done',
            run: async () =>
              say(
                await done.mutateAsync(item.id),
                item.category === 'need' ? 'Got it. 💛' : 'Done. 💛',
                () => reopen.mutate(item.id),
              ),
          }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={item.title}>
      <div className="flex flex-wrap gap-1.5">
        <Chip icon={CATEGORY[item.category].icon}>
          {item.category === 'chore' ? scheduleLabel(item) : CATEGORY[item.category].label}
        </Chip>
        {room && <RoomChip name={room.name} element={room.element} />}
        {item.archivedAt && <Chip>Archived</Chip>}
      </div>
      {rows.length > 0 && (
        <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2.5">
          {rows.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-[0.8rem] font-bold text-ink-soft">{k}</dt>
              <dd className="m-0 font-semibold">{val}</dd>
            </div>
          ))}
        </dl>
      )}
      {item.note && (
        <p className="m-0 rounded-2xl bg-paper px-3.5 py-3 leading-snug">{item.note}</p>
      )}
      {pickingHandler && item.category === 'task' && (
        <HandledByPicker houseId={houseId} task={item} onDone={() => setPickingHandler(false)} />
      )}
      <HouseFeels
        houseId={houseId}
        itemId={item.id}
        person={(u) => {
          const name = nameOf(u)
          return name ? { name, element: elementOf(u) } : undefined
        }}
      />

      {primary && (
        <Button block disabled={busy} onClick={primary.run}>
          {primary.label}
        </Button>
      )}
      {!item.archivedAt && (
        <Button variant="secondary" block disabled={busy} onClick={() => setEditing(true)}>
          Edit
        </Button>
      )}
      {item.archivedAt ? (
        <Button
          block
          disabled={busy}
          onClick={async () => say(await restore.mutateAsync(item.id), 'Brought back.')}
        >
          Bring it back
        </Button>
      ) : confirmArchive ? (
        <div className={cn('grid gap-2 rounded-2xl bg-paper p-3.5')}>
          <p className="m-0 font-semibold">Archive this? You can bring it back for 30 days.</p>
          <Button
            variant="secondary"
            block
            disabled={busy}
            onClick={async () => {
              const r = await archive.mutateAsync(item.id)
              say(r, 'Archived.', () => restore.mutate(item.id))
              if (r.ok) onClose()
            }}
          >
            Archive
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="min-h-11 text-sm font-bold text-ink-soft underline"
          onClick={() => setConfirmArchive(true)}
        >
          Archive
        </button>
      )}
    </Sheet>
  )
}

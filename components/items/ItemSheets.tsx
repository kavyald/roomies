'use client'

import { BarChart3, Copy, Pencil, Send, ShoppingCart, Trash2 } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { RoomChip } from '@/components/ui/Chip'
import { DisclosureGroup } from '@/components/ui/Disclosure'
import { IconButton } from '@/components/ui/IconButton'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { iconFor } from '@/components/ui/ChoreIconPicker'
import { Sheet } from '@/components/ui/Sheet'
import { useCelebrate, useToast } from '@/components/ui/Toast'
import { useCopy } from '@/components/house/useCopy'
import {
  useAddToRequest,
  useArchiveItem,
  useContacts,
  useCreateItem,
  useEditItem,
  useHouse,
  useItem,
  useMarkDone,
  useMembers,
  useProfiles,
  useReopenItem,
  useRestoreItem,
  useRooms,
  CHANGED_MEANWHILE,
} from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { useAppClient } from '@/lib/client/provider'
import { relativeTime } from '@/lib/domain/format'
import type { HouseId, ItemId, PollId, RunId, UserId } from '@/lib/domain/ids'
import { ItemCosts, useItemCosts } from '@/components/costs/ItemCosts'
import { ItemPolls } from '@/components/polls/ItemPolls'
import { NewPollSheet } from '@/components/polls/NewPollSheet'
import { PollSheet } from '@/components/polls/PollSheet'
import { NewRunSheet } from '@/components/runs/NewRunSheet'
import { RunSheet } from '@/components/runs/RunSheet'
import { StartRunSheet } from '@/components/runs/StartRunSheet'
import { ItemRunPath } from '@/components/runs/ItemRunPath'
import { useCardContext } from './useCardContext'
import { useDidIt } from './useDidIt'
import { isOpen, type Category, type Item, type ItemPatch } from '@/lib/domain/items'
import type { LocalDate, LocalTime } from '@/lib/domain/time'
import { HouseFeels } from './Feelings'
import { HandledByPicker } from './HandledByPicker'
import { ItemForm, toNewItem, valuesFrom, type ItemFormValues } from './ItemForm'
import { CATEGORY, CHORE_KIND_LABEL, finishWord, TOOK_CARE, whenLabel } from './meta'
import { WhyHere } from './WhyHere'

type Sheets = {
  /** The "+" sheet: the picker, or straight to one kind's form. */
  openAdd(category?: Category): void
  /** An item's detail sheet; `note` opens it on the note editor for my feeling. */
  openItem(id: ItemId, opts?: { note?: boolean }): void
  openRun(id: RunId): void
  startRun(): void
  openPoll(id: PollId): void
  newPoll(about?: { id: ItemId; title: string }): void
}
const SheetsContext = createContext<Sheets>({
  openAdd: () => {},
  openItem: () => {},
  openRun: () => {},
  startRun: () => {},
  openPoll: () => {},
  newPoll: () => {},
})

/** Opens the "+" sheet or an item's detail sheet from anywhere in the house. */
export const useItemSheets = (): Sheets => useContext(SheetsContext)

const PROBLEM: Record<string, string> = {
  empty_title: 'Give it a title.',
  title_too_long: 'That title is a bit long. Keep it under 120 characters.',
  unknown_member: "That roommate isn't in the house anymore.",
  unknown_room: "That room isn't there anymore.",
  unknown_contact: "That contact isn't there anymore.",
  bad_icon: 'Pick one of the icons.',
  on_a_run: "It's on a request or visit. Move it there to change who's handling it.",
  // Someone saved it first (ARCHITECTURE §7.5); the house's data refetches with this.
  conflict: CHANGED_MEANWHILE,
}
const oops = "Couldn't reach the house. Check your connection and try again."

/** What to say when an item can't be saved. */
export const itemProblem = (error: string): string => PROBLEM[error] ?? oops

export function ItemSheetsProvider({
  houseId,
  children,
}: {
  houseId: HouseId
  children: ReactNode
}) {
  const [adding, setAdding] = useState<{ category?: Category } | null>(null)
  const [open, setOpen] = useState<{ id: ItemId; note?: boolean } | null>(null)
  const [runId, setRunId] = useState<RunId | null>(null)
  const [starting, setStarting] = useState(false)
  // New request or visit, from the + sheet's tile (T108: Tasks has no New button of its own).
  const [asking, setAsking] = useState(false)
  const [pollId, setPollId] = useState<PollId | null>(null)
  const [newPoll, setNewPoll] = useState<{ about?: { id: ItemId; title: string } } | null>(null)
  const sheets = useMemo<Sheets>(
    () => ({
      openAdd: (category) => setAdding({ category }),
      openItem: (id, opts) => {
        setRunId(null)
        setOpen({ id, note: opts?.note })
      },
      openRun: (id) => {
        setOpen(null)
        setRunId(id)
      },
      startRun: () => setStarting(true),
      openPoll: (id) => {
        setOpen(null)
        setPollId(id)
      },
      newPoll: (about) => {
        setOpen(null)
        setNewPoll({ about })
      },
    }),
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
            setOpen({ id })
          }}
          onPoll={() => {
            setAdding(null)
            setNewPoll({})
          }}
          onRun={() => {
            setAdding(null)
            setStarting(true)
          }}
          onRequest={() => {
            setAdding(null)
            setAsking(true)
          }}
        />
      )}
      {asking && (
        <NewRunSheet
          houseId={houseId}
          onClose={() => setAsking(false)}
          onCreated={(id) => {
            setAsking(false)
            setRunId(id)
          }}
        />
      )}
      {open && (
        <ItemDetailSheet
          key={open.id}
          houseId={houseId}
          id={open.id}
          noteFirst={open.note}
          onClose={() => setOpen(null)}
        />
      )}
      {runId && <RunSheet houseId={houseId} runId={runId} onClose={() => setRunId(null)} />}
      {pollId && (
        <PollSheet
          houseId={houseId}
          pollId={pollId}
          onClose={() => setPollId(null)}
          onOpenItem={(id) => {
            setPollId(null)
            setOpen({ id })
          }}
        />
      )}
      {newPoll && (
        <NewPollSheet
          houseId={houseId}
          about={newPoll.about}
          onClose={() => setNewPoll(null)}
          onCreated={(id) => {
            setNewPoll(null)
            setPollId(id)
          }}
        />
      )}
      {starting && (
        <StartRunSheet
          houseId={houseId}
          onClose={() => setStarting(false)}
          onStarted={(id) => {
            setStarting(false)
            setRunId(id)
          }}
        />
      )}
    </SheetsContext.Provider>
  )
}

// ---- the "+" sheet ------------------------------------------------------------------------------

function AddSheet({
  houseId,
  initialCategory,
  onClose,
  onOpen,
  onPoll,
  onRun,
  onRequest,
}: {
  houseId: HouseId
  initialCategory?: Category
  onClose: () => void
  onOpen: (id: ItemId) => void
  onPoll: () => void
  onRun: () => void
  onRequest: () => void
}) {
  const [category, setCategory] = useState<Category | null>(initialCategory ?? null)
  // Picked on the chooser: the form doesn't ask Need / Chore / Task again (T111). From a tab's +,
  // the kind was a guess from the tab, so the form still offers the other two.
  const [picked, setPicked] = useState(false)
  const create = useCreateItem(houseId)
  const toast = useToast()

  /** Adds it; true once the house has it (added, or pointed at the one already there). */
  const save = async (v: ItemFormValues): Promise<boolean> => {
    if (!category) return false
    const r = await create.mutateAsync(toNewItem(category, v))
    if (r.ok) {
      toast(`Added to ${CATEGORY[category].label}s.`, {
        label: 'Open',
        onClick: () => onOpen(r.value.id),
      })
      return true
    }
    if (r.error === 'duplicate_need' && r.detail?.existingId) {
      toast("That's already on the list.", {
        label: 'Open',
        onClick: () => onOpen(r.detail!.existingId as ItemId),
      })
      return true
    }
    toast(PROBLEM[r.error] ?? oops)
    return false
  }

  const pick = (c: Category) => {
    setPicked(true)
    setCategory(c)
  }

  if (!category) {
    const tiles: {
      key: Category | 'poll' | 'run' | 'request'
      label: string
      blurb: string
      icon: typeof ShoppingCart
      soon?: boolean
    }[] = [
      { key: 'need', label: 'A need', blurb: 'Something to buy', icon: CATEGORY.need.icon },
      { key: 'chore', label: 'A chore', blurb: 'Ongoing upkeep', icon: CATEGORY.chore.icon },
      { key: 'task', label: 'A task', blurb: 'A one-off', icon: CATEGORY.task.icon },
      { key: 'poll', label: 'A poll', blurb: 'A question', icon: BarChart3 },
      { key: 'run', label: 'A run', blurb: 'A shopping trip', icon: ShoppingCart },
      { key: 'request', label: 'A request', blurb: 'Or a visit', icon: Send },
    ]
    return (
      <Sheet open onOpenChange={(o) => !o && onClose()} title="Add something">
        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={t.soon}
              onClick={() =>
                t.key === 'poll'
                  ? onPoll()
                  : t.key === 'run'
                    ? onRun()
                    : t.key === 'request'
                      ? onRequest()
                      : pick(t.key)
              }
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
      {!picked && (
        <SegmentedControl
          wide
          label="What are you adding?"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'need', label: 'Need' },
            { value: 'chore', label: 'Chore' },
            { value: 'task', label: 'Task' },
          ]}
        />
      )}
      <ItemForm
        houseId={houseId}
        category={category}
        initial={valuesFrom()}
        submitLabel="Add"
        busy={create.isPending}
        onSubmit={async (v) => {
          if (await save(v)) onClose()
        }}
        onAddAnother={save}
        askWhose
      />
      <button
        type="button"
        onClick={() => setCategory(null)}
        className="min-h-11 justify-self-center text-sm font-bold text-accent-ink"
      >
        A poll or a run instead?
      </button>
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
  if (item.category === 'chore') {
    const moved =
      v.rooms.length !== before.rooms.length || v.rooms.some((r) => !before.rooms.includes(r))
    if (moved) p.rooms = v.rooms
    if (v.kind !== before.kind) p.kind = v.kind
    // Shown chosen in the picker when none was picked, so saved too (T101).
    const icon = iconFor(v.icon, v.title)
    if (icon !== before.icon) p.icon = icon || null
  } else if (v.roomId !== before.roomId) p.roomId = v.roomId || null
  if (v.assignee !== before.assignee) p.assignee = v.assignee || null
  if (v.date !== before.date || v.time !== before.time) {
    p.when = v.date
      ? { date: v.date as LocalDate, ...(v.time && { time: v.time as LocalTime }) }
      : null
  }
  if (v.priority !== before.priority) p.priority = v.priority
  if (item.category === 'task' && v.contactId !== before.contactId)
    p.contactId = v.contactId || null
  return p as ItemPatch
}

function ItemDetailSheet({
  houseId,
  id,
  noteFirst,
  onClose,
}: {
  houseId: HouseId
  id: ItemId
  /** Opened from "Add a note" after a one-tap feeling. */
  noteFirst?: boolean
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
  const celebrate = useCelebrate()
  const copy = useCopy()
  const { me } = useAppClient()
  // The item as it was when Edit was tapped: the form starts from it and saves against its
  // version, so a change someone makes meanwhile is never quietly undone (§7.5).
  const [editing, setEditing] = useState<Item | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickingHandler, setPickingHandler] = useState(false)
  const edit = useEditItem(houseId)
  const done = useMarkDone(houseId)
  const reopen = useReopenItem(houseId)
  const did = useDidIt(houseId)
  const archive = useArchiveItem(houseId)
  const restore = useRestoreItem(houseId)
  const cardCtx = useCardContext(houseId)
  const addToRequest = useAddToRequest(houseId)
  const { openRun } = useItemSheets()
  // With costs, Costs sits under the main button; without, Add cost is a link low down (T111).
  const hasCosts = useItemCosts(houseId, id).length > 0
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
  const itemRooms = (rooms.data ?? [])
    .filter((r) =>
      item.category === 'chore' ? item.rooms.includes(r.id) && !r.archivedAt : r.id === item.roomId,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const contact =
    item.category === 'task' && item.contactId
      ? contacts.data?.find((c) => c.id === item.contactId)
      : undefined
  const isDone = item.category !== 'chore' && !!item.done
  const say = (r: { ok: boolean; error?: string }, success: string, undo?: () => void) =>
    r.ok
      ? toast(success, undo && { label: 'Undo', onClick: undo })
      : toast(PROBLEM[r.error ?? ''] ?? oops)
  /** "I'll do it": a task is yours in one tap (T111). */
  const claim = async () =>
    say(
      await edit.mutateAsync({ id: item.id, patch: { assignee: me }, version: item.version }),
      "It's yours. Thanks! 💛",
      () => edit.mutate({ id: item.id, patch: { assignee: null } }),
    )

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
          initial={valuesFrom(editing)}
          expanded
          submitLabel="Save"
          busy={busy}
          onSubmit={async (v) => {
            const r = await edit.mutateAsync({
              id: item.id,
              patch: patchFrom(editing, v),
              version: editing.version,
            })
            if (r.ok || r.error === 'no_change' || r.error === 'conflict') {
              setEditing(null)
              if (r.ok) toast('Saved.')
              else if (r.error === 'conflict') toast(CHANGED_MEANWHILE)
            } else if (r.error === 'duplicate_need')
              toast("There's already an open need with that name.")
            else toast(PROBLEM[r.error] ?? oops)
          }}
        />
        <ItemCosts houseId={houseId} item={item} />
      </Sheet>
    )
  }

  const rows: [string, React.ReactNode][] = []
  if (item.category === 'need') {
    // Whose it is (T45): changeable while it's open, by anyone; recorded as an edit.
    const owner = item.forMember
    const whose = !owner ? 'house' : owner === me ? 'me' : 'other'
    const setWhose = async (w: typeof whose) => {
      if (w === whose || w === 'other') return
      const r = await edit.mutateAsync({
        id: item.id,
        patch: { forMember: w === 'me' ? me : null },
        version: item.version,
      })
      if (r.ok) toast(w === 'me' ? 'Just for you now.' : 'For the house now.')
      else if (r.error === 'duplicate_need')
        toast(
          w === 'me'
            ? 'You already have that on the list.'
            : 'The house already has that on the list.',
        )
      else toast(PROBLEM[r.error] ?? oops)
    }
    rows.push([
      'For',
      isOpen(item) ? (
        <SegmentedControl
          key="for"
          compact
          label="Who it's for"
          value={whose}
          onChange={setWhose}
          options={[
            { value: 'house', label: 'House' },
            { value: 'me', label: 'Me' },
            ...(whose === 'other' ? [{ value: 'other' as const, label: nameOf(owner)! }] : []),
          ]}
        />
      ) : owner ? (
        nameOf(owner)
      ) : (
        'The house'
      ),
    ])
  }
  if (itemRooms.length > 0) {
    rows.push([
      itemRooms.length > 1 ? 'Rooms' : 'Room',
      <span key="room" className="flex flex-wrap gap-1.5">
        {itemRooms.map((r) => (
          <RoomChip key={r.id} name={r.name} element={r.element} />
        ))}
      </span>,
    ])
  }
  if (item.category === 'chore') {
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
  if (item.category === 'task') {
    // One field for who does it (T111): any of us, a roommate, or a contact from outside. The
    // Pencil opens the picker, like every other edit (T68).
    const changeWho = (
      <IconButton
        icon={Pencil}
        label="Change who's doing it"
        aria-expanded={pickingHandler}
        onClick={() => setPickingHandler((p) => !p)}
      />
    )
    const person = (u: UserId) => (
      <span className="flex items-center gap-2">
        <Avatar name={nameOf(u)!} element={elementOf(u)} size={20} />
        {u === me ? 'You' : nameOf(u)}
      </span>
    )
    const canClaim = !item.archivedAt && !item.done && !item.assignee && !contact
    rows.push([
      "Who's doing it",
      contact ? (
        <span className="grid">
          <span className="flex flex-wrap items-center gap-x-2">
            {contact.name}
            {contact.phone && (
              <>
                <span className="tabular-nums">{contact.phone}</span>
                <IconButton
                  icon={Copy}
                  label={`Copy ${contact.name}'s number`}
                  onClick={() => copy(contact.phone!, 'Number copied.')}
                />
              </>
            )}
            {!item.archivedAt && changeWho}
          </span>
          {item.assignee && (
            <span className="text-sm text-ink-soft">
              {item.assignee === me ? "You're" : `${nameOf(item.assignee)}'s`} arranging it
            </span>
          )}
        </span>
      ) : item.assignee ? (
        <span className="flex flex-wrap items-center gap-x-2">
          {person(item.assignee)}
          {!item.archivedAt && changeWho}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-2">
          Any of us
          {canClaim && (
            <Button size="small" disabled={busy} onClick={claim}>
              I&apos;ll do it
            </Button>
          )}
          {!item.archivedAt && changeWho}
        </span>
      ),
    ])
  }
  const onRun = item.run ? cardCtx.run(item.run.id) : undefined
  if (item.category === 'task' && contact && !item.run && !item.done && !item.archivedAt) {
    rows.push([
      'Ask them',
      <button
        key="list"
        type="button"
        className="min-h-11 text-left text-sm font-extrabold text-accent-ink"
        disabled={addToRequest.isPending}
        onClick={async () => {
          const r = await addToRequest.mutateAsync({ taskId: item.id })
          toast(r.ok ? `Added to the ${contact.name} list.` : "Couldn't add it. Try again.")
        }}
      >
        Add to {contact.name} list
      </button>,
    ])
  }
  if (onRun) {
    rows.push([
      'On a run',
      <span key="run" className="flex flex-wrap items-center gap-x-2">
        {onRun.label}
        <button
          type="button"
          className="min-h-11 text-sm font-extrabold text-accent-ink"
          onClick={() => openRun(onRun.run.id)}
        >
          Open
        </button>
      </span>,
    ])
  }
  if (item.category !== 'chore' && item.done) {
    rows.push([
      item.category === 'need' ? 'Got it' : 'Done',
      `${relativeTime(item.done.at, now, tz)} · ${nameOf(item.done.by)}`,
    ])
  }

  const primary: { label: string; quiet?: boolean; run: () => Promise<unknown> } = item.archivedAt
    ? {
        label: 'Bring it back',
        run: async () => say(await restore.mutateAsync(item.id), 'Brought back.'),
      }
    : item.category === 'chore'
      ? {
          label: finishWord(item),
          run: () =>
            did.didIt(item.id, item.kind === 'upkeep' ? TOOK_CARE : 'Nice. Marked as done today.'),
        }
      : isDone
        ? {
            label: 'Not done after all',
            quiet: true,
            run: async () => say(await reopen.mutateAsync(item.id), 'Back on the list.'),
          }
        : {
            label: item.category === 'need' ? 'Got it' : 'Done',
            run: async () =>
              say(
                await done.mutateAsync(item.id).then((r) => {
                  if (r.ok) celebrate()
                  return r
                }),
                item.category === 'need' ? 'Got it. 💛' : 'Done. 💛',
                () => reopen.mutate(item.id),
              ),
          }

  const kind =
    item.category === 'chore'
      ? `Chore · ${CHORE_KIND_LABEL[item.kind]}`
      : CATEGORY[item.category].label

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.title}
      description={item.archivedAt ? `${kind} · Deleted` : kind}
      actions={
        // Edit is the header's Pencil (T68); Delete sits apart, at the bottom (T111). A deleted
        // item has neither.
        !item.archivedAt && (
          <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(item)} />
        )
      }
    >
      <Button
        block
        variant={primary.quiet ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={primary.run}
      >
        {primary.label}
      </Button>
      {hasCosts && <ItemCosts houseId={houseId} item={item} />}
      {rows.length > 0 && (
        <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2">
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
        <HandledByPicker
          houseId={houseId}
          task={item}
          onDone={() => setPickingHandler(false)}
          onOpenRun={openRun}
        />
      )}
      <HouseFeels
        houseId={houseId}
        itemId={item.id}
        startWithNote={noteFirst}
        person={(u) => {
          const name = nameOf(u)
          return name ? { name, element: elementOf(u) } : undefined
        }}
      />
      <DisclosureGroup>
        {isOpen(item) && (
          <WhyHere
            houseId={houseId}
            item={item}
            name={(u) => nameOf(u) ?? 'Former roommate'}
            onLeave={onClose}
          />
        )}
        <ItemPolls houseId={houseId} item={item} />
        <ItemRunPath houseId={houseId} itemId={item.id} />
      </DisclosureGroup>
      {!hasCosts && !item.archivedAt && <ItemCosts houseId={houseId} item={item} />}
      {!item.archivedAt &&
        (confirmDelete ? (
          <DeleteConfirm
            busy={busy}
            onKeep={() => setConfirmDelete(false)}
            onDelete={async () => {
              // Deleting keeps the row (archived_at) so history still points at it; Undo restores.
              const r = await archive.mutateAsync(item.id)
              say(r, 'Deleted.', () => restore.mutate(item.id))
              if (r.ok) onClose()
            }}
          />
        ) : (
          <button
            type="button"
            className="flex min-h-[44px] items-center gap-1.5 justify-self-start text-sm font-bold text-ink-soft"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden className="size-4" />
            Delete
          </button>
        ))}
    </Sheet>
  )
}

/** "Delete this?" in place of the Delete link at the bottom of the sheet (PRD D30, T111). */
function DeleteConfirm({
  busy,
  onKeep,
  onDelete,
}: {
  busy: boolean
  onKeep: () => void
  onDelete: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  return (
    <div role="group" aria-label="Delete this?" className="grid gap-2 rounded-2xl bg-paper p-3.5">
      <p className="m-0 font-semibold">Delete this? You can undo it right after.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button ref={first} variant="secondary" disabled={busy} onClick={onKeep}>
          Keep it
        </Button>
        <Button disabled={busy} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  )
}

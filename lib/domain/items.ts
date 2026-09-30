// Items: needs (to buy), chores (ongoing), tasks (one-off) (PRD §5–6, ARCHITECTURE §6.3).
// A discriminated union, so invalid states can't be written down: a need has no repeat, a chore
// is never "done" (only "last done"), only tasks have a "handled by" contact.

import type { DomainEvent, FieldChanges } from './events'
import type { ActionId, ContactId, HouseId, ItemId, RoomId, RunId, UserId } from './ids'
import { err, ok, type Result } from './result'
import type { Instant, When } from './time'

export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type RunKind = 'batch' | 'request' | 'visit'
export type Done = { readonly at: Instant; readonly by: UserId }

type ItemBase = {
  readonly id: ItemId
  readonly houseId: HouseId
  readonly title: string
  readonly note?: string
  readonly roomId?: RoomId
  /** Who's on it; absent means anyone. */
  readonly assignee?: UserId
  readonly when?: When
  readonly priority: Priority
  /** The run it's on right now; absent means it's in the pool. */
  readonly run?: { readonly id: RunId; readonly kind: RunKind }
  readonly createdBy: UserId
  readonly createdAt: Instant
  readonly archivedAt?: Instant
}

export type Need = ItemBase & { readonly category: 'need'; readonly done?: Done }
/** `repeatDays: null` means "as needed". */
export type Chore = ItemBase & {
  readonly category: 'chore'
  readonly repeatDays: number | null
  readonly lastDone?: Done
}
export type Task = ItemBase & {
  readonly category: 'task'
  /** "Handled by": someone outside the house who should do it. */
  readonly contactId?: ContactId
  readonly done?: Done
}
export type Item = Need | Chore | Task
export type Category = Item['category']

export const MAX_TITLE = 120

const clean = (s: string | undefined): string | undefined => {
  const t = s?.trim()
  return t ? t : undefined
}

/** How two need titles compare for "that's already on the list". */
export const sameNeed = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

export const isOpen = (i: Item): boolean => !i.archivedAt && (i.category === 'chore' || !i.done)

// ---- creating ------------------------------------------------------------------------------

export type NewItem = {
  readonly category: Category
  readonly title: string
  readonly note?: string
  readonly roomId?: RoomId
  readonly assignee?: UserId
  readonly when?: When
  readonly priority?: Priority
  /** Chores only: about every N days, or null/absent for "as needed". */
  readonly repeatDays?: number | null
  /** Tasks only. */
  readonly contactId?: ContactId
}

export type ItemError = 'empty_title' | 'title_too_long' | 'invalid_for_category' | 'bad_repeat'

const checkTitle = (title: string): Result<string, 'empty_title' | 'title_too_long'> => {
  const t = title.trim()
  if (!t) return err('empty_title')
  if (t.length > MAX_TITLE) return err('title_too_long')
  return ok(t)
}

const checkRepeat = (n: number | null | undefined): n is number | null | undefined =>
  n === null || n === undefined || (Number.isInteger(n) && n >= 1 && n <= 365)

/**
 * A new item. Adding a need that's already open returns `duplicate_need`, with the existing
 * need's id in `detail.existingId` so the UI can point to it.
 */
export const createItem = (
  input: NewItem,
  ctx: {
    by: UserId
    now: Instant
    id: ItemId
    houseId: HouseId
    actionId: ActionId
    openNeeds: readonly Need[]
  },
): Result<{ item: Item; events: DomainEvent[] }, ItemError | 'duplicate_need'> => {
  const title = checkTitle(input.title)
  if (!title.ok) return title
  if (input.category !== 'chore' && input.repeatDays != null) return err('invalid_for_category')
  if (input.category !== 'task' && input.contactId) return err('invalid_for_category')
  if (!checkRepeat(input.repeatDays)) return err('bad_repeat')
  if (input.category === 'need') {
    const existing = ctx.openNeeds.find((n) => sameNeed(n.title, title.value))
    if (existing) return err('duplicate_need', { existingId: existing.id })
  }

  const note = clean(input.note)
  const base = {
    id: ctx.id,
    houseId: ctx.houseId,
    title: title.value,
    ...(note && { note }),
    ...(input.roomId && { roomId: input.roomId }),
    ...(input.assignee && { assignee: input.assignee }),
    ...(input.when && { when: input.when }),
    priority: input.priority ?? 'normal',
    createdBy: ctx.by,
    createdAt: ctx.now,
  } as const
  const item: Item =
    input.category === 'chore'
      ? { ...base, category: 'chore', repeatDays: input.repeatDays ?? null }
      : input.category === 'task'
        ? { ...base, category: 'task', ...(input.contactId && { contactId: input.contactId }) }
        : { ...base, category: 'need' }
  return ok({
    item,
    events: [
      { kind: 'item.created', itemId: item.id, actionId: ctx.actionId, by: ctx.by },
      // Handing it to someone as you add it is an assignment too (they hear about it, PRD §11).
      ...(input.assignee && input.assignee !== ctx.by
        ? [
            {
              kind: 'item.assigned' as const,
              itemId: item.id,
              memberId: input.assignee,
              changes: { assignee: [null, input.assignee] as const },
              actionId: ctx.actionId,
              by: ctx.by,
            },
          ]
        : []),
    ],
  })
}

// ---- editing --------------------------------------------------------------------------------

/** What can change. `null` clears an optional field; absent leaves it alone. */
export type ItemPatch = {
  readonly title?: string
  readonly note?: string | null
  readonly roomId?: RoomId | null
  readonly assignee?: UserId | null
  readonly when?: When | null
  readonly priority?: Priority
  readonly repeatDays?: number | null
  readonly contactId?: ContactId | null
}

const sameWhen = (a?: When, b?: When) => a?.date === b?.date && a?.time === b?.time

/**
 * Edits an item. The category never changes. Assignee and "handled by" changes get their own
 * events (they notify / show differently); everything else is one `item.edited` with the diff.
 */
export const editItem = (
  item: Item,
  patch: ItemPatch,
  ctx: { by: UserId; actionId: ActionId; openNeeds: readonly Need[] },
): Result<{ item: Item; events: DomainEvent[] }, ItemError | 'duplicate_need' | 'no_change'> => {
  if (item.category !== 'chore' && patch.repeatDays !== undefined)
    return err('invalid_for_category')
  if (item.category !== 'task' && patch.contactId) return err('invalid_for_category')
  if (!checkRepeat(patch.repeatDays)) return err('bad_repeat')

  let title = item.title
  if (patch.title !== undefined) {
    const t = checkTitle(patch.title)
    if (!t.ok) return t
    title = t.value
    if (item.category === 'need' && !sameNeed(title, item.title)) {
      const clash = ctx.openNeeds.find((n) => n.id !== item.id && sameNeed(n.title, title))
      if (clash) return err('duplicate_need', { existingId: clash.id })
    }
  }

  const pick = <T>(v: T | null | undefined, current: T | undefined): T | undefined =>
    v === undefined ? current : v === null ? undefined : v
  const note = patch.note === undefined ? item.note : clean(patch.note ?? undefined)
  const next = {
    ...item,
    title,
    note,
    roomId: pick(patch.roomId, item.roomId),
    assignee: pick(patch.assignee, item.assignee),
    when: pick(patch.when, item.when),
    priority: patch.priority ?? item.priority,
    ...(item.category === 'chore' && {
      repeatDays: patch.repeatDays === undefined ? item.repeatDays : patch.repeatDays,
    }),
    ...(item.category === 'task' && { contactId: pick(patch.contactId, item.contactId) }),
  } as Item

  const changes: Record<string, readonly [unknown, unknown]> = {}
  const diff = (field: string, a: unknown, b: unknown) => {
    if (a !== b) changes[field] = [a ?? null, b ?? null]
  }
  diff('title', item.title, next.title)
  diff('note', item.note, next.note)
  diff('room', item.roomId, next.roomId)
  if (!sameWhen(item.when, next.when)) changes.when = [item.when ?? null, next.when ?? null]
  diff('priority', item.priority, next.priority)
  if (item.category === 'chore' && next.category === 'chore')
    diff('repeat_days', item.repeatDays, next.repeatDays)

  const events: DomainEvent[] = []
  if (Object.keys(changes).length > 0) {
    events.push({
      kind: 'item.edited',
      itemId: item.id,
      changes: changes as FieldChanges,
      actionId: ctx.actionId,
      by: ctx.by,
    })
  }
  if (item.assignee !== next.assignee) {
    events.push({
      kind: 'item.assigned',
      itemId: item.id,
      memberId: next.assignee ?? null,
      changes: { assignee: [item.assignee ?? null, next.assignee ?? null] },
      actionId: ctx.actionId,
      by: ctx.by,
    })
  }
  if (item.category === 'task' && next.category === 'task' && item.contactId !== next.contactId) {
    events.push({
      kind: 'item.handled_by_changed',
      itemId: item.id,
      contactId: next.contactId ?? null,
      changes: { contact: [item.contactId ?? null, next.contactId ?? null] },
      actionId: ctx.actionId,
      by: ctx.by,
    })
  }
  if (events.length === 0) return err('no_change')
  return ok({ item: stripUndefined(next), events })
}

const stripUndefined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

// ---- done, reopened, archived -----------------------------------------------------------------

/** Got it / Done, for a need or a task. If it was on a run, it leaves the run. */
export const markDone = (
  item: Need | Task,
  by: UserId,
  now: Instant,
  actionId: ActionId,
): Result<{ item: Need | Task; events: DomainEvent[] }, 'already_done' | 'archived'> => {
  if (item.archivedAt) return err('archived')
  if (item.done) return err('already_done')
  const { run, ...rest } = item
  return ok({
    item: { ...rest, done: { at: now, by } },
    events: [{ kind: 'item.done', itemId: item.id, ...(run && { runId: run.id }), actionId, by }],
  })
}

/** Undo for "Got it": the item is open again (PRD §9: undo adds an event). */
export const reopenItem = (
  item: Need | Task,
  by: UserId,
  actionId: ActionId,
  openNeeds: readonly Need[],
): Result<{ item: Need | Task; events: DomainEvent[] }, 'not_done' | 'duplicate_need'> => {
  if (!item.done) return err('not_done')
  if (item.category === 'need') {
    const clash = openNeeds.find((n) => n.id !== item.id && sameNeed(n.title, item.title))
    if (clash) return err('duplicate_need', { existingId: clash.id })
  }
  const { done: _done, ...rest } = item
  return ok({ item: rest, events: [{ kind: 'item.reopened', itemId: item.id, actionId, by }] })
}

/** "Did it": a chore is never done, it's last done (PRD §6.2). */
export const doChore = (
  chore: Chore,
  by: UserId,
  now: Instant,
  actionId: ActionId,
): Result<{ chore: Chore; events: DomainEvent[] }, 'archived'> => {
  if (chore.archivedAt) return err('archived')
  const { run, ...rest } = chore
  return ok({
    chore: { ...rest, lastDone: { at: now, by } },
    events: [{ kind: 'chore.done', itemId: chore.id, ...(run && { runId: run.id }), actionId, by }],
  })
}

/** Deleting is archiving (PRD §5); restorable. Leaves any run it was on. */
export const archiveItem = (
  item: Item,
  by: UserId,
  now: Instant,
  actionId: ActionId,
): Result<{ item: Item; events: DomainEvent[] }, 'already_archived'> => {
  if (item.archivedAt) return err('already_archived')
  const { run, ...rest } = item
  return ok({
    item: { ...rest, archivedAt: now } as Item,
    events: [
      { kind: 'item.archived', itemId: item.id, ...(run && { runId: run.id }), actionId, by },
    ],
  })
}

export const restoreItem = (
  item: Item,
  by: UserId,
  actionId: ActionId,
  openNeeds: readonly Need[],
): Result<{ item: Item; events: DomainEvent[] }, 'not_archived' | 'duplicate_need'> => {
  if (!item.archivedAt) return err('not_archived')
  if (item.category === 'need' && !item.done) {
    const clash = openNeeds.find((n) => n.id !== item.id && sameNeed(n.title, item.title))
    if (clash) return err('duplicate_need', { existingId: clash.id })
  }
  const { archivedAt: _a, ...rest } = item
  return ok({
    item: rest as Item,
    events: [{ kind: 'item.restored', itemId: item.id, actionId, by }],
  })
}

// Runs: a batch of items handled together (PRD §6.5, ARCHITECTURE §6.3, §7.2). Items point at the
// run they're on now (`item.run`); everything that happened on a run is an event, read back by
// `runSteps` / `itemPath` / `runLedger`. Pure: ids, time and the actor come in as arguments.

import type { DomainEvent, StoredActivityRow } from './events'
import type { ActionId, ContactId, HouseId, ItemId, RunId, UserId } from './ids'
import type { Item } from './items'
import { err, ok, type Result } from './result'
import type { Instant, When } from './time'

export type SentVia = 'text' | 'email' | 'call' | 'portal' | 'in_person'

type RunBase = {
  readonly id: RunId
  readonly houseId: HouseId
  /** Absent: shown as "Kavya's run" / "Landlord visit". */
  readonly title?: string
  /** Batch: who's doing it. Request / visit: the house's point person. */
  readonly runner: UserId
  readonly createdBy: UserId
  readonly createdAt: Instant
}

type OpenOrFinished =
  { readonly open: true } | { readonly open: false; readonly finishedAt: Instant }

export type Batch = RunBase & {
  readonly kind: 'batch'
  readonly when?: When
  readonly state: OpenOrFinished
}
export type Request = RunBase & {
  readonly kind: 'request'
  readonly contactId: ContactId
  readonly state:
    | { readonly at: 'gathering' }
    | { readonly at: 'sent'; readonly sentAt: Instant; readonly via: SentVia }
    | { readonly at: 'closed'; readonly closedAt: Instant }
}
export type Visit = RunBase & {
  readonly kind: 'visit'
  readonly contactId: ContactId
  readonly when?: When
  readonly state: OpenOrFinished
}
export type Run = Batch | Request | Visit

export const MAX_RUN_TITLE = 80
export const NOT_DONE_THIS_TIME = 'Not done this time'

type Ctx = { readonly by: UserId; readonly now: Instant; readonly actionId: ActionId }
type Changed = { items: Item[]; events: DomainEvent[] }

/** Still going: an open batch or visit, or a request that isn't closed. */
export const isRunOpen = (r: Run): boolean =>
  r.kind === 'request' ? r.state.at !== 'closed' : r.state.open

/** Why a run can't take more items right now, if it can't. */
const closedTo = (r: Run): 'finished' | 'request_sent' | null => {
  if (!isRunOpen(r)) return 'finished'
  if (r.kind === 'request' && r.state.at === 'sent') return 'request_sent'
  return null
}

/** Why an item can't join a run, if it can't. */
const cantJoin = (r: Run, item: Item): 'done_item' | 'already_on_a_run' | 'tasks_only' | null => {
  if (item.archivedAt || (item.category !== 'chore' && item.done)) return 'done_item'
  if (item.run) return 'already_on_a_run'
  if (r.kind !== 'batch' && item.category !== 'task') return 'tasks_only'
  return null
}

/** Points an item at a run (a request or visit also makes its contact "Handled by"). */
const putOn = (item: Item, r: Run): Item => {
  const run = { id: r.id, kind: r.kind }
  if (item.category === 'task' && r.kind !== 'batch')
    return { ...item, run, contactId: r.contactId }
  return { ...item, run } as Item
}

const offRun = (item: Item): Item => {
  const { run: _run, ...rest } = item
  return rest as Item
}

// ---- starting and adding --------------------------------------------------------------------

export type NewRun = { readonly title?: string; readonly when?: When; readonly runner?: UserId }

/** Start a batch ("Start a run" on Needs): the selected items go on it (PRD §6.5). */
export const startRun = (
  input: NewRun,
  items: readonly Item[],
  ctx: Ctx & { readonly id: RunId; readonly houseId: HouseId },
): Result<
  { run: Batch; items: Item[]; events: DomainEvent[] },
  'nothing_selected' | 'already_on_a_run' | 'done_item' | 'title_too_long'
> => {
  if (items.length === 0) return err('nothing_selected')
  const title = input.title?.trim() || undefined
  if (title && title.length > MAX_RUN_TITLE) return err('title_too_long')
  const run: Batch = {
    id: ctx.id,
    houseId: ctx.houseId,
    kind: 'batch',
    ...(title && { title }),
    ...(input.when && { when: input.when }),
    runner: input.runner ?? ctx.by,
    createdBy: ctx.by,
    createdAt: ctx.now,
    state: { open: true },
  }
  const added = addToRun(run, items, ctx)
  if (!added.ok) return added as Result<never, 'already_on_a_run' | 'done_item'>
  return ok({
    run,
    items: added.value.items,
    events: [
      { kind: 'run.created', runId: run.id, actionId: ctx.actionId, by: ctx.by },
      ...added.value.events,
    ],
  })
}

/** Add items to an open run. A sent request takes no more (PRD §6.5). */
export const addToRun = (
  r: Run,
  items: readonly Item[],
  ctx: Ctx,
): Result<
  Changed,
  'nothing_selected' | 'finished' | 'request_sent' | 'already_on_a_run' | 'done_item' | 'tasks_only'
> => {
  if (items.length === 0) return err('nothing_selected')
  const closed = closedTo(r)
  if (closed) return err(closed)
  for (const item of items) {
    const why = cantJoin(r, item)
    if (why) return err(why, { itemId: item.id })
  }
  return ok({
    items: items.map((i) => putOn(i, r)),
    events: items.map((i) => ({
      kind: 'run.item_added' as const,
      runId: r.id,
      itemId: i.id,
      actionId: ctx.actionId,
      by: ctx.by,
    })),
  })
}

// ---- actions on a selection -----------------------------------------------------------------

const allOn = (r: Run, items: readonly Item[]): boolean => items.every((i) => i.run?.id === r.id)

/** A request with nothing left on it closes itself (PRD §6.5). */
const closeIfEmpty = (r: Run, left: number, ctx: Ctx): { run: Run; events: DomainEvent[] } =>
  r.kind === 'request' && left <= 0 && r.state.at !== 'closed'
    ? {
        run: { ...r, state: { at: 'closed', closedAt: ctx.now } },
        events: [
          {
            kind: 'request.closed',
            runId: r.id,
            contactId: r.contactId,
            actionId: ctx.actionId,
            by: ctx.by,
          },
        ],
      }
    : { run: r, events: [] }

/** Done / Fixed / Got it on the selected items: they're done (chores: last done) and leave the run. */
export const markRunItemsDone = (
  r: Run,
  items: readonly Item[],
  ctx: Ctx & { readonly remainingOnRun: number },
): Result<Changed & { run: Run }, 'nothing_selected' | 'not_on_run'> => {
  if (items.length === 0) return err('nothing_selected')
  if (!allOn(r, items)) return err('not_on_run')
  const done = { at: ctx.now, by: ctx.by }
  const closed = closeIfEmpty(r, ctx.remainingOnRun - items.length, ctx)
  return ok({
    run: closed.run,
    items: items.map((i) =>
      offRun(i.category === 'chore' ? { ...i, lastDone: done } : ({ ...i, done } as Item)),
    ),
    events: [
      ...items.map((i) => ({
        kind: 'run.item_done' as const,
        runId: r.id,
        itemId: i.id,
        actionId: ctx.actionId,
        by: ctx.by,
      })),
      ...closed.events,
    ],
  })
}

/** Move the selected items to another open run, with an optional note. */
export const moveRunItems = (
  from: Run,
  to: Run,
  items: readonly Item[],
  ctx: Ctx & { readonly note?: string; readonly remainingOnFrom: number },
): Result<
  Changed & { from: Run },
  'nothing_selected' | 'not_on_run' | 'same_run' | 'target_closed' | 'tasks_only'
> => {
  if (items.length === 0) return err('nothing_selected')
  if (from.id === to.id) return err('same_run')
  if (!allOn(from, items)) return err('not_on_run')
  if (closedTo(to)) return err('target_closed')
  if (to.kind !== 'batch' && items.some((i) => i.category !== 'task')) return err('tasks_only')
  const note = ctx.note?.trim() || undefined
  const closed = closeIfEmpty(from, ctx.remainingOnFrom - items.length, ctx)
  return ok({
    from: closed.run,
    items: items.map((i) => putOn(offRun(i), to)),
    events: [
      ...items.map((i) => ({
        kind: 'run.item_moved' as const,
        runId: from.id,
        toRunId: to.id,
        itemId: i.id,
        ...(note && { note }),
        actionId: ctx.actionId,
        by: ctx.by,
      })),
      ...closed.events,
    ],
  })
}

/**
 * Back to the pool: the selected items leave the run with a note. For tasks, "Handled by" can go
 * back to One of us (PRD §6.5).
 */
export const returnToPool = (
  from: Run,
  items: readonly Item[],
  ctx: Ctx & {
    readonly note?: string
    readonly clearContact: boolean
    readonly remainingOnFrom: number
  },
): Result<Changed & { from: Run }, 'nothing_selected' | 'not_on_run'> => {
  if (items.length === 0) return err('nothing_selected')
  if (!allOn(from, items)) return err('not_on_run')
  const note = ctx.note?.trim() || NOT_DONE_THIS_TIME
  const closed = closeIfEmpty(from, ctx.remainingOnFrom - items.length, ctx)
  return ok({
    from: closed.run,
    items: items.map((i) => {
      const off = offRun(i)
      if (off.category !== 'task' || !ctx.clearContact) return off
      const { contactId: _c, ...rest } = off
      return rest
    }),
    events: [
      ...items.map((i) => ({
        kind: 'run.item_returned' as const,
        runId: from.id,
        itemId: i.id,
        note,
        actionId: ctx.actionId,
        by: ctx.by,
      })),
      ...closed.events,
    ],
  })
}

/** Finish a batch or visit: whatever's left goes back to the pool, "Not done this time". */
export const finishRun = (
  r: Run,
  stillOn: readonly Item[],
  ctx: Ctx & { readonly doneOnRun: number },
): Result<Changed & { run: Batch | Visit }, 'finished' | 'not_finishable'> => {
  if (r.kind === 'request') return err('not_finishable')
  if (!r.state.open) return err('finished')
  const run = { ...r, state: { open: false, finishedAt: ctx.now } } as Batch | Visit
  return ok({
    run,
    items: stillOn.map(offRun),
    events: [
      ...stillOn.map((i) => ({
        kind: 'run.item_returned' as const,
        runId: r.id,
        itemId: i.id,
        note: NOT_DONE_THIS_TIME,
        actionId: ctx.actionId,
        by: ctx.by,
      })),
      {
        kind: 'run.finished',
        runId: r.id,
        payload: { done: ctx.doneOnRun, returned: stillOn.length },
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

// ---- reading history back (ARCHITECTURE §6.4) ------------------------------------------------

export type RunStep = {
  readonly id: number
  readonly at: Instant
  readonly by: UserId | null
  readonly itemId: ItemId
  readonly runId: RunId
  readonly note?: string
  readonly what: 'added' | 'done' | 'returned' | { readonly movedTo: RunId }
}

/**
 * The steps items took through runs, oldest first. Checking an item off while it's on a run
 * (item.done / chore.done with a run) counts as done there; archiving it takes it off.
 */
export const runSteps = (rows: readonly StoredActivityRow[]): RunStep[] =>
  [...rows]
    .sort((a, b) => a.id - b.id)
    .flatMap((r): RunStep[] => {
      if (!r.itemId || !r.runId) return []
      const base = { id: r.id, at: r.at, by: r.actorId, itemId: r.itemId, runId: r.runId }
      switch (r.kind) {
        case 'run.item_added':
          return [{ ...base, what: 'added' }]
        case 'run.item_done':
        case 'item.done':
        case 'chore.done':
          return [{ ...base, what: 'done' }]
        case 'run.item_returned':
          return [{ ...base, what: 'returned', ...(r.note && { note: r.note }) }]
        case 'item.archived':
          return [{ ...base, what: 'returned', note: 'Archived' }]
        case 'run.item_moved':
          return r.toRunId
            ? [{ ...base, what: { movedTo: r.toRunId }, ...(r.note && { note: r.note }) }]
            : []
        default:
          return []
      }
    })

/** One item's path through runs, from its activity rows. */
export const itemPath = (rows: readonly StoredActivityRow[], itemId: ItemId): RunStep[] =>
  runSteps(rows).filter((s) => s.itemId === itemId)

export type LedgerEntry = {
  readonly itemId: ItemId
  readonly state:
    | { readonly at: 'pending' }
    | { readonly at: 'done'; readonly when: Instant }
    | { readonly at: 'returned'; readonly note?: string }
    | { readonly at: 'moved'; readonly to: RunId; readonly note?: string }
}

/**
 * Every item that's been on this run and where it stands (the run sheet's rows, FRONTEND §5.9),
 * in the order they arrived. Items still on the run are pending.
 */
export const runLedger = (
  runId: RunId,
  steps: readonly RunStep[],
  onRunNow: readonly Item[],
): LedgerEntry[] => {
  const state = new Map<ItemId, LedgerEntry['state']>()
  for (const s of steps) {
    const arrived = s.runId === runId && s.what === 'added'
    const movedIn = typeof s.what === 'object' && s.what.movedTo === runId
    if (arrived || movedIn) {
      state.set(s.itemId, { at: 'pending' })
      continue
    }
    if (s.runId !== runId) continue
    if (s.what === 'done') state.set(s.itemId, { at: 'done', when: s.at })
    else if (s.what === 'returned') state.set(s.itemId, { at: 'returned', note: s.note })
    else if (typeof s.what === 'object')
      state.set(s.itemId, { at: 'moved', to: s.what.movedTo, note: s.note })
  }
  for (const i of onRunNow) if (i.run?.id === runId) state.set(i.id, { at: 'pending' })
  return [...state].map(([itemId, s]) => ({ itemId, state: s }))
}

/** Items in the order they came onto the run (what a request's numbered list follows). */
export const inArrivalOrder = <I extends Item>(
  items: readonly I[],
  ledger: readonly LedgerEntry[],
): I[] => {
  const at = new Map(ledger.map((e, i) => [e.itemId as string, i]))
  return [...items].sort(
    (a, b) => (at.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (at.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  )
}

/** "1/3": how many of the items that came on the run are done. */
export const runProgress = (ledger: readonly LedgerEntry[]): { done: number; total: number } => ({
  done: ledger.filter((e) => e.state.at === 'done').length,
  total: ledger.length,
})

// ---- requests and visits (T30, PRD §6.5) -----------------------------------------------------

type StartCtx = Ctx & { readonly id: RunId; readonly houseId: HouseId }
export type NewRequest = {
  readonly contactId: ContactId
  readonly title?: string
  readonly runner?: UserId
}
export type NewVisit = NewRequest & { readonly when?: When }

const newRunBase = (input: NewRequest, ctx: StartCtx) => {
  const title = input.title?.trim() || undefined
  return {
    id: ctx.id,
    houseId: ctx.houseId,
    ...(title && { title }),
    runner: input.runner ?? ctx.by,
    createdBy: ctx.by,
    createdAt: ctx.now,
    contactId: input.contactId,
  }
}

/** Starts a run and puts the items on it (a request or a visit may start empty). */
const startWith = <R extends Request | Visit>(
  run: R,
  tasks: readonly Item[],
  ctx: StartCtx,
): Result<
  { run: R; items: Item[]; events: DomainEvent[] },
  'already_on_a_run' | 'done_item' | 'tasks_only' | 'title_too_long'
> => {
  if (run.title && run.title.length > MAX_RUN_TITLE) return err('title_too_long')
  const created: DomainEvent = {
    kind: 'run.created',
    runId: run.id,
    contactId: run.contactId,
    actionId: ctx.actionId,
    by: ctx.by,
  }
  if (tasks.length === 0) return ok({ run, items: [], events: [created] })
  const added = addToRun(run, tasks, ctx)
  if (!added.ok) return added as Result<never, 'already_on_a_run' | 'done_item' | 'tasks_only'>
  return ok({ run, items: added.value.items, events: [created, ...added.value.events] })
}

/** Ask someone (request): the house asks a contact to take these on. It may start empty. */
export const startRequest = (input: NewRequest, tasks: readonly Item[], ctx: StartCtx) =>
  startWith<Request>(
    { ...newRunBase(input, ctx), kind: 'request', state: { at: 'gathering' } },
    tasks,
    ctx,
  )

/** They've agreed (visit): a contact has taken these on; the date is optional. */
export const planVisit = (input: NewVisit, tasks: readonly Item[], ctx: StartCtx) =>
  startWith<Visit>(
    {
      ...newRunBase(input, ctx),
      kind: 'visit',
      ...(input.when && { when: input.when }),
      state: { open: true },
    },
    tasks,
    ctx,
  )

/** The contact's list that's still gathering, if there is one. */
export const gatheringRequestFor = (
  runs: readonly Run[],
  contactId: ContactId,
): Request | undefined =>
  runs.find(
    (r): r is Request =>
      r.kind === 'request' && r.contactId === contactId && r.state.at === 'gathering',
  )

/**
 * "Add to Landlord list": the task joins its contact's gathering request, or starts one (PRD §6.5).
 */
export const addToRequest = (
  task: Item,
  runs: readonly Run[],
  ctx: StartCtx,
): Result<
  { run: Request; created: boolean; items: Item[]; events: DomainEvent[] },
  'no_contact' | 'already_on_a_run' | 'done_item' | 'tasks_only' | 'title_too_long'
> => {
  if (task.category !== 'task') return err('tasks_only')
  if (!task.contactId) return err('no_contact')
  const open = gatheringRequestFor(runs, task.contactId)
  if (open) {
    const r = addToRun(open, [task], ctx)
    if (!r.ok) return r as Result<never, 'already_on_a_run' | 'done_item' | 'tasks_only'>
    return ok({ run: open, created: false, ...r.value })
  }
  const r = startRequest({ contactId: task.contactId }, [task], ctx)
  return r.ok ? ok({ ...r.value, created: true }) : r
}

export type MessageLine = { readonly title: string; readonly room?: string; readonly note?: string }

/**
 * The request to copy and send (PRD §6.5): a greeting, a numbered list with rooms and notes, and
 * the address. Roomies never sends it; people do.
 */
export const requestMessage = (
  contactName: string,
  lines: readonly MessageLine[],
  place?: { readonly address?: string; readonly unit?: string },
): string => {
  const where = [place?.address, place?.unit && `Unit ${place.unit}`].filter(Boolean).join(', ')
  const list = lines
    .map((l, i) => {
      const room = l.room ? ` (${l.room})` : ''
      const note = l.note ? ` — ${l.note}` : ''
      return `${i + 1}. ${l.title}${room}${note}`
    })
    .join('\n')
  const intro =
    lines.length === 1 ? 'could you take a look at this' : 'could you take a look at these'
  return `Hi ${contactName}, ${intro}${where ? ` at ${where}` : ''}?\n\n${list}\n\nThank you!`
}

/** "Mark as sent": the request waits on a reply; it takes no more additions. */
export const sendRequest = (
  r: Run,
  via: SentVia,
  message: string,
  tasksOnIt: number,
  ctx: Ctx,
): Result<{ run: Request; events: DomainEvent[] }, 'not_a_request' | 'not_gathering' | 'empty'> => {
  if (r.kind !== 'request') return err('not_a_request')
  if (r.state.at !== 'gathering') return err('not_gathering')
  if (tasksOnIt === 0) return err('empty')
  return ok({
    run: { ...r, state: { at: 'sent', sentAt: ctx.now, via } },
    events: [
      {
        kind: 'request.sent',
        runId: r.id,
        contactId: r.contactId,
        payload: { via, message },
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/**
 * "Hand to…": the tasks move to another contact's unsent list (new if there isn't one), and that
 * contact becomes "Handled by" (PRD §6.5).
 */
export const handToContact = (
  from: Run,
  tasks: readonly Item[],
  contactId: ContactId,
  runs: readonly Run[],
  ctx: StartCtx & { readonly note?: string; readonly remainingOnFrom: number },
): Result<
  { to: Request; created: boolean; from: Run; items: Item[]; events: DomainEvent[] },
  'nothing_selected' | 'not_on_run' | 'tasks_only' | 'same_run' | 'target_closed'
> => {
  if (tasks.some((t) => t.category !== 'task')) return err('tasks_only')
  const existing = gatheringRequestFor(runs, contactId)
  const to: Request = existing ?? {
    ...newRunBase({ contactId }, ctx),
    kind: 'request',
    state: { at: 'gathering' },
  }
  const moved = moveRunItems(from, to, tasks, ctx)
  if (!moved.ok) return moved
  const created: DomainEvent[] = existing
    ? []
    : [{ kind: 'run.created', runId: to.id, contactId, actionId: ctx.actionId, by: ctx.by }]
  return ok({ to, created: !existing, ...moved.value, events: [...created, ...moved.value.events] })
}

/** A visit's date: set, changed, or cleared ("date TBD"). */
export const setVisitDate = (
  r: Run,
  when: When | null,
  ctx: Ctx,
): Result<{ run: Visit; events: DomainEvent[] }, 'not_a_visit' | 'no_change'> => {
  if (r.kind !== 'visit') return err('not_a_visit')
  const before = r.when ?? null
  if (before?.date === when?.date && before?.time === when?.time) return err('no_change')
  const { when: _old, ...rest } = r
  return ok({
    run: when ? { ...rest, when } : rest,
    events: [
      {
        kind: 'run.date_set',
        runId: r.id,
        changes: { when: [before, when] },
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/** Tasks on a visit come back to the feed when the visit is within 3 days (PRD §8.1). */
export const visitDateOf = (
  item: Item,
  runs: ReadonlyMap<string, Run>,
): When['date'] | undefined => {
  if (item.run?.kind !== 'visit') return undefined
  const r = runs.get(item.run.id)
  return r?.kind === 'visit' ? r.when?.date : undefined
}

/** "Groceries", "Kavya's run", "Landlord visit", "Landlord request" (FRONTEND §3.4). */
export const runLabel = (
  run: Run,
  names: { person(id: string): string | undefined; contact(id: string): string | undefined },
): string => {
  if (run.title) return run.title
  if (run.kind === 'batch') return `${names.person(run.runner) ?? 'Someone'}'s run`
  const who = names.contact(run.contactId) ?? 'Contact'
  return run.kind === 'visit' ? `${who} visit` : `${who} request`
}

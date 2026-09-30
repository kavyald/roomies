// Run use cases (ARCHITECTURE §7.2 table): load the run and the selected items → pure domain
// function → save → record events, in one transaction, acting as the member (RLS applies).

import { checkCostRefs } from './costs'
import type { AppDeps, Repos } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import { addCost, type Cost } from '../domain/costs'
import type { DomainEvent } from '../domain/events'
import type { ActionId, ContactId, ItemId, RunId, UserId } from '../domain/ids'
import type { Item } from '../domain/items'
import type { Cents } from '../domain/money'
import { err, ok, type Result } from '../domain/result'
import {
  addToRequest,
  addToRun,
  finishRun,
  handToContact,
  inArrivalOrder,
  markRunItemsDone,
  moveRunItems,
  planVisit,
  requestMessage,
  returnToPool,
  sendRequest,
  setVisitDate,
  startRequest,
  runLedger,
  runProgress,
  runSteps,
  startRun,
  type NewRun,
  type Run,
  type SentVia,
} from '../domain/runs'
import type { Instant, When } from '../domain/time'

type Deps = Pick<AppDeps, 'uow' | 'clock' | 'ids'>
type Ctx = { by: UserId; now: Instant; actionId: ActionId; repos: Repos }

/** The house's items with these ids, or 'not_found' if any isn't one. */
const loadItems = async (
  repos: Repos,
  actor: HouseActor,
  ids: readonly ItemId[],
): Promise<Item[] | null> => {
  const items = await Promise.all([...new Set(ids)].map((id) => repos.items.get(id)))
  return items.every((i): i is Item => i?.houseId === actor.houseId) ? items : null
}

const loadRun = async (repos: Repos, actor: HouseActor, id: RunId): Promise<Run | null> => {
  const run = await repos.runs.get(id)
  return run?.houseId === actor.houseId ? run : null
}

const saveAll = async (
  repos: Repos,
  actor: HouseActor,
  now: Instant,
  out: { items?: readonly Item[]; runs?: readonly Run[]; events: readonly DomainEvent[] },
) => {
  for (const run of out.runs ?? []) await repos.runs.save(run)
  for (const item of out.items ?? []) await repos.items.save(item)
  await repos.events.record(actor.houseId, out.events, now)
}

/** Runs `fn` as the member, with the clock's now and a fresh action id, in one transaction. */
const inTx =
  <I, O, E extends string>(
    { uow, clock, ids }: Deps,
    fn: (actor: HouseActor, input: I, ctx: Ctx) => Promise<Result<O, E>>,
  ) =>
  (actor: HouseActor, input: I): Promise<Result<O, E | 'not_found'>> =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      if (!by) return err('not_found')
      const actionId = ids.newId<'action'>() as ActionId
      return fn(actor, input, { by, now: clock.now(), actionId, repos })
    })

/** Loads a run of this house and a selection of its items. */
const selection = async (
  repos: Repos,
  actor: HouseActor,
  runId: RunId,
  itemIds: readonly ItemId[],
) => {
  const run = await loadRun(repos, actor, runId)
  const items = run && (await loadItems(repos, actor, itemIds))
  if (!run || !items) return null
  return { run, items, remaining: (await repos.items.onRun(run.id)).length }
}

/** "Start a run" (from Needs): a batch with the selected items on it. */
export const makeStartRun = (deps: Deps) =>
  inTx(deps, async (actor, input: NewRun & { itemIds: ItemId[] }, ctx) => {
    const items = await loadItems(ctx.repos, actor, input.itemIds)
    if (!items) return err('not_found')
    if (input.runner) {
      const m = await ctx.repos.members.get(actor.houseId, input.runner)
      if (!m?.status.active) return err('unknown_member')
    }
    const id = deps.ids.newId<'run'>() as RunId
    const r = startRun(input, items, { ...ctx, id, houseId: actor.houseId })
    if (!r.ok) return r
    await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.run], ...r.value })
    return ok(r.value.run as Run)
  })

export const makeAddToRun = (deps: Deps) =>
  inTx(deps, async (actor, input: { runId: RunId; itemIds: ItemId[] }, ctx) => {
    const run = await loadRun(ctx.repos, actor, input.runId)
    const items = run && (await loadItems(ctx.repos, actor, input.itemIds))
    if (!run || !items) return err('not_found')
    const r = addToRun(run, items, ctx)
    if (!r.ok) return r
    await saveAll(ctx.repos, actor, ctx.now, r.value)
    return ok(run)
  })

/** Done / Fixed / Got it on the selected items of a run. */
export const makeMarkRunItemsDone = (deps: Deps) =>
  inTx(deps, async (actor, input: { runId: RunId; itemIds: ItemId[] }, ctx) => {
    const s = await selection(ctx.repos, actor, input.runId, input.itemIds)
    if (!s) return err('not_found')
    const r = markRunItemsDone(s.run, s.items, { ...ctx, remainingOnRun: s.remaining })
    if (!r.ok) return r
    await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.run], ...r.value })
    return ok(r.value.run)
  })

/** Move to…: the selected items go to another open run of this house. */
export const makeMoveRunItems = (deps: Deps) =>
  inTx(
    deps,
    async (
      actor,
      input: { fromRunId: RunId; toRunId: RunId; itemIds: ItemId[]; note?: string },
      ctx,
    ) => {
      const s = await selection(ctx.repos, actor, input.fromRunId, input.itemIds)
      const to = await loadRun(ctx.repos, actor, input.toRunId)
      if (!s || !to) return err('not_found')
      const r = moveRunItems(s.run, to, s.items, {
        ...ctx,
        note: input.note,
        remainingOnFrom: s.remaining,
      })
      if (!r.ok) return r
      await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.from], ...r.value })
      return ok([r.value.from, to])
    },
  )

/** Back to the pool…: the selected items leave the run with a note. */
export const makeReturnToPool = (deps: Deps) =>
  inTx(
    deps,
    async (
      actor,
      input: { runId: RunId; itemIds: ItemId[]; note?: string; clearContact: boolean },
      ctx,
    ) => {
      const s = await selection(ctx.repos, actor, input.runId, input.itemIds)
      if (!s) return err('not_found')
      const r = returnToPool(s.run, s.items, {
        ...ctx,
        note: input.note,
        clearContact: input.clearContact,
        remainingOnFrom: s.remaining,
      })
      if (!r.ok) return r
      await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.from], ...r.value })
      return ok(r.value.from)
    },
  )

/**
 * Finish a batch or visit: whatever's left goes back to the pool. A batch can say what was spent
 * ("Did you spend money?"), which records one cost on the run.
 */
export const makeFinishRun = (deps: Deps) =>
  inTx(
    deps,
    async (actor, input: { runId: RunId; spent?: Cents; paidBy?: UserId; note?: string }, ctx) => {
      const run = await loadRun(ctx.repos, actor, input.runId)
      if (!run) return err('not_found')
      const stillOn = await ctx.repos.items.onRun(run.id)
      const history = await ctx.repos.events.forRun(actor.houseId, run.id)
      const { done } = runProgress(runLedger(run.id, runSteps(history), stillOn))
      const r = finishRun(run, stillOn, { ...ctx, doneOnRun: done })
      if (!r.ok) return r
      let cost: Cost | undefined
      const events = [...r.value.events]
      if (input.spent) {
        const bad = await checkCostRefs(ctx.repos, actor, { paidBy: input.paidBy })
        if (bad) return err(bad)
        const c = addCost(
          { amount: input.spent, paidBy: input.paidBy, note: input.note, for: { run: run.id } },
          { ...ctx, id: deps.ids.newId(), houseId: actor.houseId },
        )
        if (!c.ok) return c
        cost = c.value.cost
        events.push(...c.value.events)
      }
      for (const run of [r.value.run]) await ctx.repos.runs.save(run)
      for (const item of r.value.items) await ctx.repos.items.save(item)
      if (cost) await ctx.repos.costs.add(cost)
      await ctx.repos.events.record(actor.houseId, events, ctx.now)
      return ok({ run: r.value.run as Run, ...(cost && { cost }) })
    },
  )

// ---- requests and visits (T30) ----------------------------------------------------------------

/** A contact of this house that hasn't been removed. */
const liveContact = async (repos: Repos, actor: HouseActor, id: ContactId) => {
  const c = await repos.contacts.get(id)
  return c?.houseId === actor.houseId && !c.archivedAt ? c : null
}

/** Ask someone (request): a contact and any tasks (it may start empty). */
export const makeStartRequest = (deps: Deps) =>
  inTx(deps, async (actor, input: { contactId: ContactId; itemIds: ItemId[] }, ctx) => {
    const items = await loadItems(ctx.repos, actor, input.itemIds)
    if (!items || !(await liveContact(ctx.repos, actor, input.contactId))) return err('not_found')
    const id = deps.ids.newId<'run'>() as RunId
    const r = startRequest({ contactId: input.contactId }, items, {
      ...ctx,
      id,
      houseId: actor.houseId,
    })
    if (!r.ok) return r
    await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.run], ...r.value })
    return ok(r.value.run as Run)
  })

/** They've agreed (visit): a contact, any tasks, and an optional date. */
export const makePlanVisit = (deps: Deps) =>
  inTx(
    deps,
    async (actor, input: { contactId: ContactId; itemIds: ItemId[]; when?: When }, ctx) => {
      const items = await loadItems(ctx.repos, actor, input.itemIds)
      if (!items || !(await liveContact(ctx.repos, actor, input.contactId))) return err('not_found')
      const id = deps.ids.newId<'run'>() as RunId
      const r = planVisit({ contactId: input.contactId, when: input.when }, items, {
        ...ctx,
        id,
        houseId: actor.houseId,
      })
      if (!r.ok) return r
      await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.run], ...r.value })
      return ok(r.value.run as Run)
    },
  )

/** "Add to Landlord list" on a task. */
export const makeAddToRequest = (deps: Deps) =>
  inTx(deps, async (actor, input: { taskId: ItemId }, ctx) => {
    const [task] = (await loadItems(ctx.repos, actor, [input.taskId])) ?? []
    if (!task) return err('not_found')
    const runs = await ctx.repos.runs.listByHouse(actor.houseId)
    const id = deps.ids.newId<'run'>() as RunId
    const r = addToRequest(task, runs, { ...ctx, id, houseId: actor.houseId })
    if (!r.ok) return r
    await saveAll(ctx.repos, actor, ctx.now, {
      runs: r.value.created ? [r.value.run] : [],
      ...r.value,
    })
    return ok(r.value.run as Run)
  })

/** The message a request sends, built from what's on it now. */
const composeMessage = async (
  repos: Repos,
  actor: HouseActor,
  run: Run,
  tasks: readonly Item[],
) => {
  const house = await repos.houses.get(actor.houseId)
  const contact = run.kind === 'batch' ? null : await repos.contacts.get(run.contactId)
  const rooms = new Map((await repos.rooms.listByHouse(actor.houseId)).map((r) => [r.id, r.name]))
  return requestMessage(
    contact?.name ?? 'there',
    tasks.map((t) => ({
      title: t.title,
      ...(t.roomId && rooms.get(t.roomId) && { room: rooms.get(t.roomId) }),
      ...(t.note && { note: t.note }),
    })),
    house,
  )
}

/** "Mark as sent": records how it went out, and the message, and the request waits. */
export const makeSendRequest = (deps: Deps) =>
  inTx(deps, async (actor, input: { runId: RunId; via: SentVia }, ctx) => {
    const run = await loadRun(ctx.repos, actor, input.runId)
    if (!run) return err('not_found')
    const onRun = await ctx.repos.items.onRun(run.id)
    const history = await ctx.repos.events.forRun(actor.houseId, run.id)
    const tasks = inArrivalOrder(onRun, runLedger(run.id, runSteps(history), onRun))
    const message = await composeMessage(ctx.repos, actor, run, tasks)
    const r = sendRequest(run, input.via, message, tasks.length, ctx)
    if (!r.ok) return r
    await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.run], ...r.value })
    return ok({ run: r.value.run as Run, message })
  })

/** "Hand to…": the selected tasks go to another contact's unsent list. */
export const makeHandToContact = (deps: Deps) =>
  inTx(
    deps,
    async (
      actor,
      input: { runId: RunId; itemIds: ItemId[]; contactId: ContactId; note?: string },
      ctx,
    ) => {
      const s = await selection(ctx.repos, actor, input.runId, input.itemIds)
      if (!s || !(await liveContact(ctx.repos, actor, input.contactId))) return err('not_found')
      const runs = await ctx.repos.runs.listByHouse(actor.houseId)
      const id = deps.ids.newId<'run'>() as RunId
      const r = handToContact(s.run, s.items, input.contactId, runs, {
        ...ctx,
        id,
        houseId: actor.houseId,
        note: input.note,
        remainingOnFrom: s.remaining,
      })
      if (!r.ok) return r
      await saveAll(ctx.repos, actor, ctx.now, {
        runs: [...(r.value.created ? [r.value.to] : []), r.value.from],
        ...r.value,
      })
      return ok([r.value.from, r.value.to as Run])
    },
  )

/** "Move to a visit… → New visit": a new visit with the run's contact (optional date). */
export const makeMoveToNewVisit = (deps: Deps) =>
  inTx(
    deps,
    async (
      actor,
      input: {
        fromRunId: RunId
        itemIds: ItemId[]
        when?: When
        contactId?: ContactId
        note?: string
      },
      ctx,
    ) => {
      const s = await selection(ctx.repos, actor, input.fromRunId, input.itemIds)
      if (!s) return err('not_found')
      const contactId = input.contactId ?? (s.run.kind === 'batch' ? undefined : s.run.contactId)
      if (!contactId || !(await liveContact(ctx.repos, actor, contactId))) return err('no_contact')
      const id = deps.ids.newId<'run'>() as RunId
      const v = planVisit({ contactId, when: input.when }, [], {
        ...ctx,
        id,
        houseId: actor.houseId,
      })
      if (!v.ok) return v
      const r = moveRunItems(s.run, v.value.run, s.items, {
        ...ctx,
        note: input.note,
        remainingOnFrom: s.remaining,
      })
      if (!r.ok) return r
      await saveAll(ctx.repos, actor, ctx.now, {
        runs: [v.value.run, r.value.from],
        items: r.value.items,
        events: [...v.value.events, ...r.value.events],
      })
      return ok([r.value.from, v.value.run as Run])
    },
  )

/** A visit's date: set, change, or clear. */
export const makeSetVisitDate = (deps: Deps) =>
  inTx(deps, async (actor, input: { runId: RunId; when: When | null }, ctx) => {
    const run = await loadRun(ctx.repos, actor, input.runId)
    if (!run) return err('not_found')
    const r = setVisitDate(run, input.when, ctx)
    if (!r.ok) return r
    await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.run], ...r.value })
    return ok(r.value.run as Run)
  })

// Run use cases (ARCHITECTURE §7.2 table): load the run and the selected items → pure domain
// function → save → record events, in one transaction, acting as the member (RLS applies).

import type { AppDeps, Repos } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import type { DomainEvent } from '../domain/events'
import type { ActionId, ItemId, RunId, UserId } from '../domain/ids'
import type { Item } from '../domain/items'
import { err, ok, type Result } from '../domain/result'
import {
  addToRun,
  finishRun,
  markRunItemsDone,
  moveRunItems,
  returnToPool,
  runLedger,
  runProgress,
  runSteps,
  startRun,
  type NewRun,
  type Run,
} from '../domain/runs'
import type { Instant } from '../domain/time'

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

/** Finish a batch or visit: whatever's left goes back to the pool. */
export const makeFinishRun = (deps: Deps) =>
  inTx(deps, async (actor, input: { runId: RunId }, ctx) => {
    const run = await loadRun(ctx.repos, actor, input.runId)
    if (!run) return err('not_found')
    const stillOn = await ctx.repos.items.onRun(run.id)
    const history = await ctx.repos.events.forRun(actor.houseId, run.id)
    const { done } = runProgress(runLedger(run.id, runSteps(history), stillOn))
    const r = finishRun(run, stillOn, { ...ctx, doneOnRun: done })
    if (!r.ok) return r
    await saveAll(ctx.repos, actor, ctx.now, { runs: [r.value.run], ...r.value })
    return ok(r.value.run as Run)
  })

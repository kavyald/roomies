// Item use cases (ARCHITECTURE §7.2 table): load → pure domain function → save → record events,
// in one transaction, acting as the member (RLS applies).

import type { AppDeps, Repos } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import type { ActionId, ItemId, UserId } from '../domain/ids'
import {
  archiveItem,
  createItem,
  doChore,
  editItem,
  markDone,
  reopenItem,
  restoreItem,
  type Item,
  type ItemError,
  type ItemPatch,
  type NewItem,
} from '../domain/items'
import { err, ok, type Result } from '../domain/result'
import type { Instant } from '../domain/time'

type Deps = Pick<AppDeps, 'uow' | 'clock' | 'ids'>
export type ReferenceError = 'unknown_member' | 'unknown_room' | 'unknown_contact'

/** The people, room, and contact an item points at must belong to this house. */
const checkReferences = async (
  repos: Repos,
  actor: HouseActor,
  refs: { assignee?: UserId | null; roomId?: Item['roomId'] | null; contactId?: string | null },
): Promise<ReferenceError | null> => {
  if (refs.assignee) {
    const m = await repos.members.get(actor.houseId, refs.assignee)
    if (!m?.status.active) return 'unknown_member'
  }
  if (refs.roomId) {
    const room = await repos.rooms.get(refs.roomId)
    if (room?.houseId !== actor.houseId || room.archivedAt) return 'unknown_room'
  }
  if (refs.contactId) {
    const c = await repos.contacts.get(refs.contactId as never)
    if (c?.houseId !== actor.houseId || c.archivedAt) return 'unknown_contact'
  }
  return null
}

export const makeCreateItem =
  ({ uow, clock, ids }: Deps) =>
  (
    actor: HouseActor,
    input: NewItem,
  ): Promise<Result<Item, ItemError | ReferenceError | 'duplicate_need' | 'not_found'>> =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      if (!by) return err('not_found')
      const bad = await checkReferences(repos, actor, input)
      if (bad) return err(bad)
      const now = clock.now()
      const r = createItem(input, {
        by,
        now,
        id: ids.newId(),
        houseId: actor.houseId,
        actionId: ids.newId(),
        openNeeds: input.category === 'need' ? await repos.items.openNeeds(actor.houseId) : [],
      })
      if (!r.ok) return r
      await repos.items.save(r.value.item)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.item)
    })

/** Loads an item of this house, runs a change on it, and saves it with its events. */
const change =
  <E extends string>(
    { uow, clock, ids }: Deps,
    apply: (
      item: Item,
      ctx: {
        by: UserId
        now: Instant
        actionId: ActionId
        repos: Repos
      },
    ) => Promise<Result<{ item: Item; events: Parameters<Repos['events']['record']>[1] }, E>>,
  ) =>
  (actor: HouseActor, id: ItemId): Promise<Result<Item, E | 'not_found'>> =>
    uow.run(actor, async (repos) => {
      const item = await repos.items.get(id)
      const by = actorUser(actor)
      if (!item || item.houseId !== actor.houseId || !by) return err('not_found')
      const now = clock.now()
      const r = await apply(item, { by, now, actionId: ids.newId<'action'>() as ActionId, repos })
      if (!r.ok) return r
      await repos.items.save(r.value.item)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.item)
    })

export const makeEditItem = (deps: Deps) => {
  return (actor: HouseActor, input: { id: ItemId; patch: ItemPatch }) =>
    change<ItemError | ReferenceError | 'duplicate_need' | 'no_change'>(
      deps,
      async (item, { by, actionId, repos }) => {
        const bad = await checkReferences(repos, actor, input.patch)
        if (bad) return err(bad)
        const openNeeds = item.category === 'need' ? await repos.items.openNeeds(item.houseId) : []
        return editItem(item, input.patch, { by, actionId, openNeeds })
      },
    )(actor, input.id)
}

/** Got it (needs) / Done (tasks). */
export const makeMarkDone = (deps: Deps) =>
  change<'already_done' | 'archived' | 'not_for_chores'>(
    deps,
    async (item, { by, now, actionId }) =>
      item.category === 'chore' ? err('not_for_chores') : markDone(item, by, now, actionId),
  )

/** Undo for Got it / Done. */
export const makeReopenItem = (deps: Deps) =>
  change<'not_done' | 'duplicate_need' | 'not_for_chores'>(
    deps,
    async (item, { by, actionId, repos }) =>
      item.category === 'chore'
        ? err('not_for_chores')
        : reopenItem(
            item,
            by,
            actionId,
            item.category === 'need' ? await repos.items.openNeeds(item.houseId) : [],
          ),
  )

/** Did it (chores). */
export const makeDoChore = (deps: Deps) =>
  change<'archived' | 'not_a_chore'>(deps, async (item, { by, now, actionId }) => {
    if (item.category !== 'chore') return err('not_a_chore')
    const r = doChore(item, by, now, actionId)
    return r.ok ? ok({ item: r.value.chore, events: r.value.events }) : r
  })

export const makeArchiveItem = (deps: Deps) =>
  change<'already_archived'>(deps, async (item, { by, now, actionId }) =>
    archiveItem(item, by, now, actionId),
  )

export const makeRestoreItem = (deps: Deps) =>
  change<'not_archived' | 'duplicate_need'>(deps, async (item, { by, actionId, repos }) =>
    restoreItem(
      item,
      by,
      actionId,
      item.category === 'need' ? await repos.items.openNeeds(item.houseId) : [],
    ),
  )

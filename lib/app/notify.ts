// The transactional outbox (ARCHITECTURE §7.1, A14): whenever a use case records events, the
// messages they cause are written in the same transaction. It wraps the UnitOfWork, so use cases
// stay unaware of it; compose applies it to every unit of work.

import type { Repos, UnitOfWork } from './ports'
import type { DomainEvent } from '../domain/events'
import type { UserId } from '../domain/ids'
import {
  DEFAULT_QUIET_HOURS,
  notificationsFor,
  type NotificationContext,
  type OutboxMessage,
  type Recipient,
} from '../domain/notifications'
import { resultOf, resultLine } from '../domain/polls'
import { runLabel } from '../domain/runs'
import { describeWhen } from '../domain/format'
import type { Instant } from '../domain/time'

/** Only these kinds can notify anyone; everything else skips the lookups. */
const NOTIFYING = new Set<DomainEvent['kind']>([
  'item.assigned',
  'feeling.set',
  'poll.created',
  'poll.closed',
  'poll.option_added',
  'run.created',
  'run.date_set',
  'run.point_person_changed',
  'run.item_moved',
  'settings.feeling_weights_changed',
  'member.joined',
  'member.moved_out',
  'member.removed',
  'member.role_changed',
])

/**
 * The house's current members as notification recipients (their names, time zones, quiet
 * hours, and turned-off categories), plus names for labelling runs.
 */
export const houseAudience = async (repos: Repos, houseId: NotificationContext['houseId']) => {
  const house = await repos.houses.get(houseId)
  if (!house) return null
  const members = (await repos.members.listByHouse(houseId)).filter((m) => m.status.active)
  const userIds = members.map((m) => m.userId)
  const [profiles, off, contacts] = await Promise.all([
    Promise.all(userIds.map((u) => repos.profiles.get(u))),
    repos.notifications.offFor(userIds),
    repos.contacts.listByHouse(houseId),
  ])
  const names = new Map(profiles.flatMap((p) => (p ? [[p.id as string, p.displayName]] : [])))
  const people: Recipient[] = members.map((m, i) => {
    const p = profiles[i]
    return {
      userId: m.userId,
      name: p?.displayName ?? 'Someone',
      ...(p?.timezone && { timezone: p.timezone }),
      quietHours: p?.quietHours ?? DEFAULT_QUIET_HOURS,
      off: off.get(m.userId as UserId) ?? new Set(),
    }
  })
  const labels = {
    person: (id: string) => names.get(id),
    contact: (id: string) => contacts.find((c) => c.id === id)?.name,
  }
  return { house, tz: house.settings.timezone, people, labels }
}

/** Looks up what the events are about and who's in the house, then asks the domain. */
export const outboxFor = async (
  repos: Repos,
  houseId: NotificationContext['houseId'],
  events: readonly DomainEvent[],
  now: Instant,
): Promise<OutboxMessage[]> => {
  const relevant = events.filter((e) => NOTIFYING.has(e.kind))
  if (relevant.length === 0) return []
  const house = await houseAudience(repos, houseId)
  if (!house) return []
  const { tz, people, labels } = house

  const items: NotificationContext['items'] = new Map(
    (
      await Promise.all(
        [...new Set(relevant.flatMap((e) => ('itemId' in e && e.itemId ? [e.itemId] : [])))].map(
          (id) => repos.items.get(id),
        ),
      )
    ).flatMap((i) =>
      i ? [[i.id as string, { title: i.title, ...(i.assignee && { assignee: i.assignee }) }]] : [],
    ),
  )
  const polls: NotificationContext['polls'] = new Map(
    (
      await Promise.all(
        [...new Set(relevant.flatMap((e) => ('pollId' in e ? [e.pollId] : [])))].map((id) =>
          repos.polls.get(id),
        ),
      )
    ).flatMap((p) =>
      p
        ? [
            [
              p.id as string,
              {
                question: p.question,
                ...(!p.state.open && { result: resultLine(p, resultOf(p)) }),
                options: new Map(p.options.map((o) => [o.id as string, o.label])),
                voters: p.votes.map((v) => v.user),
              },
            ],
          ]
        : [],
    ),
  )
  const runs: NotificationContext['runs'] = new Map(
    (
      await Promise.all(
        [
          ...new Set(
            relevant.flatMap((e) => [
              ...('runId' in e && e.runId ? [e.runId] : []),
              ...('toRunId' in e ? [e.toRunId] : []),
            ]),
          ),
        ].map((id) => repos.runs.get(id)),
      )
    ).flatMap((r) =>
      r
        ? [
            [
              r.id as string,
              {
                label: runLabel(r, labels),
                kind: r.kind,
                runner: r.runner,
                ...(r.title && { title: r.title }),
                ...(r.kind !== 'request' && r.when && { date: describeWhen(r.when, now, tz) }),
              },
            ],
          ]
        : [],
    ),
  )
  return notificationsFor(relevant, { houseId, houseTz: tz, now, people, items, polls, runs })
}

/**
 * Every `events.record` also enqueues the notifications those events cause, in the same
 * transaction. The wrapper delegates everything else to the unit of work it wraps (tests still
 * reach the memory adapter's state through it).
 */
export const withNotifications = <U extends UnitOfWork>(uow: U): U => {
  const wrapped = Object.create(uow) as U
  wrapped.run = (actor, fn) =>
    uow.run(actor, (repos) =>
      fn({
        ...repos,
        events: {
          ...repos.events,
          record: async (houseId, events, at) => {
            await repos.events.record(houseId, events, at)
            const messages = await outboxFor(repos, houseId, events, at)
            if (messages.length) await repos.notifications.enqueue(messages)
          },
        },
      }),
    )
  return wrapped
}

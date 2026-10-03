// Notifications (PRD §11, ARCHITECTURE §6.4 Notify column, A23): which events tell whom, in what words, and when
// (quiet hours hold a message until they end). Pure: the people, their settings, the things the
// events are about, and `now` are all passed in. Copy follows FRONTEND §7: about items, never
// blaming a person.

import type { DomainEvent, FieldChanges } from './events'
import { DEFAULT_FEELING_WEIGHTS, FEELING_META, type Feeling, type FeelingKind } from './feelings'
import type { HouseId, ItemId, PollId, RunId, UserId } from './ids'
import { addDays, instantAt, localDateOf, localTimeOf, type Instant, type LocalTime } from './time'

export type NotificationCategory = 'assigned' | 'due' | 'feelings' | 'polls' | 'runs' | 'people'

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'assigned',
  'due',
  'feelings',
  'polls',
  'runs',
  'people',
]

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  assigned: 'Something is handed to me',
  due: 'My tasks and chores are coming due',
  feelings: 'Someone feels 😰 or 😤 about something of mine, or changes the feeling weights',
  polls: 'New polls, new options, and polls closing',
  runs: 'Runs starting or handed to me, and runs with a date tomorrow',
  people: 'People joining or leaving',
}

export type QuietHours = { readonly start: LocalTime; readonly end: LocalTime }

/** PRD §11: 10pm to 8am unless someone changes it. */
export const DEFAULT_QUIET_HOURS: QuietHours = {
  start: '22:00' as LocalTime,
  end: '08:00' as LocalTime,
}

export type OutboxMessage = {
  readonly userId: UserId
  readonly houseId: HouseId
  readonly category: NotificationCategory
  readonly title: string
  readonly body: string
  readonly url: string
  readonly sendAfter: Instant
  /** Reminders carry one, so a job run twice doesn't send twice. */
  readonly dedupeKey?: string
}

/** Someone in the house, as far as notifications go. */
export type Recipient = {
  readonly userId: UserId
  readonly name: string
  /** Their own time zone, if they set one; otherwise the house's. */
  readonly timezone?: string
  readonly quietHours?: QuietHours
  /** Categories they turned off. */
  readonly off: ReadonlySet<NotificationCategory>
}

/** Whether `t` falls in [start, end), where the window may wrap past midnight. */
const inWindow = (t: LocalTime, q: QuietHours): boolean =>
  q.start === q.end
    ? false
    : q.start < q.end
      ? t >= q.start && t < q.end
      : t >= q.start || t < q.end

/** Whether it's quiet hours for them right now. */
export const isQuiet = (now: Instant, tz: string, quiet: QuietHours): boolean =>
  inWindow(localTimeOf(now, tz), quiet)

/** When a message may go out: now, or the end of their quiet hours. */
export const sendAfter = (now: Instant, tz: string, quiet: QuietHours): Instant => {
  if (!isQuiet(now, tz, quiet)) return now
  const today = localDateOf(now, tz)
  const endToday = instantAt(today, quiet.end, tz)
  return endToday.epochMs > now.epochMs ? endToday : instantAt(addDays(today, 1), quiet.end, tz)
}

/** What the events are about, looked up by whoever records them. */
export type NotificationContext = {
  readonly houseId: HouseId
  readonly houseTz: string
  readonly now: Instant
  readonly people: readonly Recipient[]
  readonly items: ReadonlyMap<string, { readonly title: string; readonly assignee?: UserId }>
  readonly polls: ReadonlyMap<
    string,
    {
      readonly question: string
      readonly result?: string
      /** Option labels by id. */
      readonly options?: ReadonlyMap<string, string>
      /** Who has a vote in. */
      readonly voters?: readonly UserId[]
    }
  >
  readonly runs: ReadonlyMap<
    string,
    {
      readonly label: string
      readonly kind: string
      readonly date?: string
      /** The point person (who's doing a batch). */
      readonly runner?: UserId
      /** Its own name, if someone gave it one. */
      readonly title?: string
    }
  >
}

export type Draft = Omit<OutboxMessage, 'houseId' | 'sendAfter'>

const ANXIOUS_OR_FRUSTRATED = new Set(['anxious', 'frustrated'])

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

/** A weights change in push words, feelings as their emoji: "set 😰 to +30". */
const weightsChange = (changes: FieldChanges): string => {
  const entries = Object.entries(changes).filter(([k]) => k in FEELING_META) as [
    FeelingKind,
    readonly [unknown, unknown],
  ][]
  if (entries.length === 1) {
    const [kind, [, after]] = entries[0]!
    return `set ${FEELING_META[kind].emoji} to ${signed(Number(after))}`
  }
  if (entries.length > 1 && entries.every(([k, [, after]]) => after === DEFAULT_FEELING_WEIGHTS[k]))
    return 'reset the feeling weights'
  return 'changed the feeling weights'
}

/**
 * The messages one event sends, before settings and quiet hours. `batch` is every event of the
 * same record call, so a bulk move tells the point person once.
 */
const draftsFor = (
  e: DomainEvent,
  ctx: NotificationContext,
  batch: readonly DomainEvent[],
): Draft[] => {
  const nameOf = (u: UserId | null) =>
    (u && ctx.people.find((p) => p.userId === u)?.name) || 'Someone'
  const actor = nameOf(e.by)
  const home = `/h/${ctx.houseId}`
  const itemUrl = (id: ItemId) => `${home}/i/${id}`
  const pollUrl = (id: PollId) => `${home}/p/${id}`
  const runUrl = (id: RunId) => `${home}/r/${id}`
  const everyoneBut = (skip: UserId | null) =>
    ctx.people.filter((p) => p.userId !== skip).map((p) => p.userId)
  const to = (users: readonly UserId[], d: Omit<Draft, 'userId'>): Draft[] =>
    users.map((userId) => ({ userId, ...d }))

  switch (e.kind) {
    case 'item.assigned': {
      if (!e.memberId || e.memberId === e.by) return []
      const item = ctx.items.get(e.itemId)
      return to([e.memberId], {
        category: 'assigned',
        title: `For you: ${item?.title ?? 'something new'}`,
        body: `${actor} asked you to take this on.`,
        url: itemUrl(e.itemId),
      })
    }
    case 'feeling.set': {
      const next = e.changes.next as Feeling | null
      if (!next || !ANXIOUS_OR_FRUSTRATED.has(next.kind)) return []
      const item = ctx.items.get(e.itemId)
      if (!item?.assignee || item.assignee === e.by) return []
      const { emoji, label } = FEELING_META[next.kind]
      return to([item.assignee], {
        category: 'feelings',
        title: `${emoji} ${actor} feels ${label.toLowerCase()} about ${item.title}`,
        body: next.note ?? "It's on you, so they wanted you to know.",
        url: itemUrl(e.itemId),
      })
    }
    case 'poll.created': {
      const q = ctx.polls.get(e.pollId as PollId)?.question ?? 'a new poll'
      return to(everyoneBut(e.by), {
        category: 'polls',
        title: `New poll: ${q}`,
        body: `${actor} wants to know. Tap to vote.`,
        url: pollUrl(e.pollId as PollId),
      })
    }
    case 'poll.closed': {
      const p = ctx.polls.get(e.pollId as PollId)
      return to(everyoneBut(e.by), {
        category: 'polls',
        title: `Poll closed: ${p?.question ?? 'a poll'}`,
        body: p?.result ?? 'See how it came out.',
        url: pollUrl(e.pollId as PollId),
      })
    }
    case 'run.created': {
      const r = ctx.runs.get(e.runId as RunId)
      if (r?.kind !== 'batch') return []
      return to(everyoneBut(e.by), {
        category: 'runs',
        title: `${actor} is starting ${r.label}`,
        body: 'Add anything?',
        url: runUrl(e.runId as RunId),
      })
    }
    case 'poll.option_added': {
      const p = ctx.polls.get(e.pollId)
      const voters = (p?.voters ?? []).filter((u) => u !== e.by)
      return to([...new Set(voters)], {
        category: 'polls',
        title: `New option on ${p?.question ?? 'a poll'}: ${p?.options?.get(e.optionId) ?? 'something new'}`,
        body: `${actor} added it. Want to switch your vote?`,
        url: pollUrl(e.pollId),
      })
    }
    case 'run.point_person_changed': {
      if (e.memberId === e.by) return []
      const r = ctx.runs.get(e.runId)
      if (!r) return []
      if (r.kind === 'batch') {
        const before = (e.changes.runner as readonly [unknown, unknown] | undefined)?.[0]
        const whose = before === e.by ? 'their run' : `${nameOf((before as UserId) ?? null)}'s run`
        return to([e.memberId], {
          category: 'runs',
          title: `${actor} handed you ${r.title ?? whose}`,
          body: "It's yours now. Tap to see what's on it.",
          url: runUrl(e.runId),
        })
      }
      return to([e.memberId], {
        category: 'runs',
        title: `You're the point person for ${r.label}`,
        body: `${actor} asked you to take this on.`,
        url: runUrl(e.runId),
      })
    }
    case 'run.item_moved': {
      const r = ctx.runs.get(e.toRunId)
      if (r?.kind !== 'visit' || !r.runner || r.runner === e.by) return []
      const same = batch.filter(
        (o): o is typeof e =>
          o.kind === 'run.item_moved' && o.actionId === e.actionId && o.toRunId === e.toRunId,
      )
      if (same[0] !== e) return [] // one message per action
      const n = new Set(same.map((o) => o.itemId)).size
      const what = n === 1 ? (ctx.items.get(e.itemId)?.title ?? 'A task') : `${n} tasks`
      return to([r.runner], {
        category: 'runs',
        title: `${what} moved to ${r.label}`,
        body: `${actor} added ${n === 1 ? 'it' : 'them'} to your visit.`,
        url: runUrl(e.toRunId),
      })
    }
    case 'settings.feeling_weights_changed':
      return to(everyoneBut(e.by), {
        category: 'feelings',
        title: `${actor} ${weightsChange(e.changes)}`,
        body: 'Home is ranked with the new weights.',
        url: home,
      })
    case 'run.date_set': {
      const r = ctx.runs.get(e.runId as RunId)
      if (!r?.date) return []
      return to(everyoneBut(e.by), {
        category: 'runs',
        title: `${r.label} is set for ${r.date}`,
        body: `${actor} picked the date.`,
        url: runUrl(e.runId as RunId),
      })
    }
    case 'member.joined':
      return to(everyoneBut(e.memberId), {
        category: 'people',
        title: `${nameOf(e.memberId)} joined the house 🏠`,
        body: 'Say hi!',
        url: `${home}/house`,
      })
    case 'member.moved_out':
    case 'member.removed':
      return to(
        everyoneBut(e.memberId).filter((u) => u !== e.by),
        {
          category: 'people',
          title: `${nameOf(e.memberId)} moved out`,
          body: 'The house list is up to date.',
          url: `${home}/house`,
        },
      )
    case 'member.role_changed': {
      if (e.memberId === e.by) return []
      const role = (e.changes?.role as readonly [unknown, unknown] | undefined)?.[1]
      return to([e.memberId], {
        category: 'people',
        title: role === 'admin' ? "You're now an admin" : "You're now a member",
        body: `${actor} changed your role.`,
        url: `${home}/house`,
      })
    }
    default:
      return []
  }
}

/**
 * Drafts to outbox rows: only to current members, not for categories they turned off, and held
 * until their quiet hours end.
 */
export const deliver = (
  drafts: readonly Draft[],
  ctx: Pick<NotificationContext, 'houseId' | 'houseTz' | 'now' | 'people'>,
): OutboxMessage[] =>
  drafts.flatMap((d) => {
    const person = ctx.people.find((p) => p.userId === d.userId)
    if (!person || person.off.has(d.category)) return []
    const tz = person.timezone ?? ctx.houseTz
    return [
      {
        ...d,
        houseId: ctx.houseId,
        sendAfter: sendAfter(ctx.now, tz, person.quietHours ?? DEFAULT_QUIET_HOURS),
      },
    ]
  })

/** The outbox messages for a batch of events (one use case's worth). */
export const notificationsFor = (
  events: readonly DomainEvent[],
  ctx: NotificationContext,
): OutboxMessage[] =>
  deliver(
    events.flatMap((e) => draftsFor(e, ctx, events)),
    ctx,
  )

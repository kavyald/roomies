// Routines (PRD §6.2, T96): who looks after a set of rooms, and how often that changes hands. Pure:
// `today` is the house's calendar day, passed in. Who has a routine is arithmetic from starts_on and
// starts_with over the house's active members, so nothing is written at handover.

import type { DomainEvent } from './events'
import type { Member, Room } from './house'
import { isChoreIcon } from './icons'
import type { ActionId, HouseId, RoomId, RoutineId, UserId } from './ids'
import type { Chore, Version } from './items'
import { err, ok, type Result } from './result'
import { addDays, dayOfWeek, daysBetween, startOfDay, type Instant, type LocalDate } from './time'

export type Resets = 'weekly' | 'biweekly' | 'monthly'

export const RESETS: readonly Resets[] = ['weekly', 'biweekly', 'monthly']

export type Routine = {
  readonly id: RoutineId
  readonly houseId: HouseId
  readonly name: string
  /** A name from CHORE_ICONS. */
  readonly icon: string
  /** When the checklist starts fresh, and (if it takes turns) when it changes hands. */
  readonly resets: Resets
  readonly startsOn: LocalDate
  /** Who has it in the period starting `startsOn`, when it takes turns. */
  readonly startsWith?: UserId
  /** Always this person; absent means it takes turns among everyone. */
  readonly fixedMember?: UserId
  readonly sortOrder: number
  readonly createdAt: Instant
  readonly removedAt?: Instant
  readonly version?: Version
}

export const MAX_ROUTINE_NAME = 60

// ---- periods --------------------------------------------------------------------------------

const mondayOf = (d: LocalDate): LocalDate => addDays(d, -((dayOfWeek(d) + 6) % 7))

const firstOfMonth = (d: LocalDate): LocalDate => `${d.slice(0, 7)}-01` as LocalDate

const nextMonth = (first: LocalDate): LocalDate => firstOfMonth(addDays(first, 31))

const monthIndex = (d: LocalDate): number => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1

/**
 * The first day of the period `today` is in: Monday for weekly, every other Monday counted from
 * `startsOn` for biweekly, the 1st for monthly.
 */
export const periodStart = (
  r: Pick<Routine, 'resets' | 'startsOn'>,
  today: LocalDate,
): LocalDate => {
  switch (r.resets) {
    case 'weekly':
      return mondayOf(today)
    case 'biweekly': {
      const anchor = mondayOf(r.startsOn)
      return addDays(anchor, Math.floor(daysBetween(anchor, today) / 14) * 14)
    }
    case 'monthly':
      return firstOfMonth(today)
  }
}

/** A period in words, for "You have the kitchen this week". */
export const PERIOD_WORDS: Record<Resets, string> = {
  weekly: 'this week',
  biweekly: 'these two weeks',
  monthly: 'this month',
}

/** "kitchen", "kitchen and dining", "kitchen, dining and garden". */
export const listOf = (words: readonly string[]): string =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

/** The first day of the next period. */
export const nextPeriodStart = (
  r: Pick<Routine, 'resets' | 'startsOn'>,
  today: LocalDate,
): LocalDate => {
  const start = periodStart(r, today)
  return r.resets === 'weekly'
    ? addDays(start, 7)
    : r.resets === 'biweekly'
      ? addDays(start, 14)
      : nextMonth(start)
}

/** How many periods `today` is past the one holding `startsOn` (negative if it's before it). */
const periodsElapsed = (r: Pick<Routine, 'resets' | 'startsOn'>, today: LocalDate): number => {
  switch (r.resets) {
    case 'weekly':
      return Math.round(daysBetween(mondayOf(r.startsOn), mondayOf(today)) / 7)
    case 'biweekly':
      return Math.floor(daysBetween(mondayOf(r.startsOn), today) / 14)
    case 'monthly':
      return monthIndex(today) - monthIndex(r.startsOn)
  }
}

// ---- who has it -----------------------------------------------------------------------------

/** Everyone who takes turns: active members, longest here first. */
export const rotationOrder = (members: readonly Member[]): UserId[] =>
  members
    .filter((m) => m.status.active)
    .sort(
      (a, b) =>
        a.joinedAt.epochMs - b.joinedAt.epochMs ||
        (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
    )
    .map((m) => m.userId)

const rotated = (r: Routine, order: readonly UserId[], periods: number): UserId | undefined => {
  if (order.length === 0) return undefined
  const from = r.startsWith ? Math.max(0, order.indexOf(r.startsWith)) : 0
  const i = (from + periods) % order.length
  return order[i < 0 ? i + order.length : i]
}

/** Who has the routine in the period `today` is in. */
export const routineHolder = (
  r: Routine,
  members: readonly Member[],
  today: LocalDate,
): UserId | undefined =>
  r.fixedMember ?? rotated(r, rotationOrder(members), periodsElapsed(r, today))

/** Who has it in the period after that one. */
export const nextHolder = (
  r: Routine,
  members: readonly Member[],
  today: LocalDate,
): UserId | undefined =>
  r.fixedMember ?? rotated(r, rotationOrder(members), periodsElapsed(r, today) + 1)

/**
 * The routine a chore belongs to: its first room in house order, that room's routine. Upkeep has no
 * owner, and neither does a chore with no room or whose first room is in no routine.
 */
export const choreOwner = (
  chore: Chore,
  rooms: readonly Room[],
  routines: readonly Routine[],
): Routine | undefined => {
  if (chore.kind !== 'deep_clean') return undefined
  const first = rooms
    .filter((r) => chore.rooms.includes(r.id) && !r.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))[0]
  if (!first?.routineId) return undefined
  return routines.find((r) => r.id === first.routineId && !r.removedAt)
}

/** Done in this period: it resets at handover, and nothing is marked for what wasn't. */
export const doneThisPeriod = (
  chore: Chore,
  routine: Routine,
  today: LocalDate,
  tz: string,
): boolean =>
  !!chore.lastDone &&
  chore.lastDone.at.epochMs >= startOfDay(periodStart(routine, today), tz).epochMs

/** Which of a routine's chores are done (never a count: PRD §6.2 keeps no numbers). */
export const routineProgress = (
  routine: Routine,
  chores: readonly Chore[],
  today: LocalDate,
  tz: string,
): { readonly chore: Chore; readonly done: boolean }[] =>
  chores.map((chore) => ({ chore, done: doneThisPeriod(chore, routine, today, tz) }))

// ---- changing routines ----------------------------------------------------------------------

export type RoutineError = 'empty_name' | 'name_too_long' | 'bad_icon' | 'unknown_member'

/** Takes turns starting with someone this period, or is always one person. */
export type RoutineWho =
  | { readonly takesTurns: true; readonly startsWith: UserId }
  | { readonly takesTurns: false; readonly fixedMember: UserId }

const checkName = (name: string): Result<string, 'empty_name' | 'name_too_long'> => {
  const n = name.trim()
  if (!n) return err('empty_name')
  if (n.length > MAX_ROUTINE_NAME) return err('name_too_long')
  return ok(n)
}

const isActive = (members: readonly Member[], user: UserId) =>
  members.some((m) => m.userId === user && m.status.active)

const whoFields = (who: RoutineWho, resets: Resets, today: LocalDate) => ({
  startsOn: periodStart({ resets, startsOn: today }, today),
  startsWith: who.takesTurns ? who.startsWith : undefined,
  fixedMember: who.takesTurns ? undefined : who.fixedMember,
})

export const createRoutine = (
  input: { name: string; icon: string; resets: Resets; who: RoutineWho },
  ctx: {
    id: RoutineId
    houseId: HouseId
    by: UserId
    now: Instant
    today: LocalDate
    actionId: ActionId
    members: readonly Member[]
    sortOrder: number
  },
): Result<{ routine: Routine; events: DomainEvent[] }, RoutineError> => {
  const name = checkName(input.name)
  if (!name.ok) return name
  if (!isChoreIcon(input.icon)) return err('bad_icon')
  const user = input.who.takesTurns ? input.who.startsWith : input.who.fixedMember
  if (!isActive(ctx.members, user)) return err('unknown_member')
  const { startsOn, startsWith, fixedMember } = whoFields(input.who, input.resets, ctx.today)
  return ok({
    routine: {
      id: ctx.id,
      houseId: ctx.houseId,
      name: name.value,
      icon: input.icon,
      resets: input.resets,
      startsOn,
      ...(startsWith && { startsWith }),
      ...(fixedMember && { fixedMember }),
      sortOrder: ctx.sortOrder,
      createdAt: ctx.now,
    },
    events: [{ kind: 'routine.created', routineId: ctx.id, actionId: ctx.actionId, by: ctx.by }],
  })
}

export type RoutinePatch = {
  readonly name?: string
  readonly icon?: string
  readonly resets?: Resets
  readonly who?: RoutineWho
}

/**
 * Edits a routine. Changing how often it resets keeps this period's holder: the rotation restarts
 * from them on the new schedule.
 */
export const editRoutine = (
  routine: Routine,
  patch: RoutinePatch,
  ctx: {
    by: UserId
    today: LocalDate
    actionId: ActionId
    members: readonly Member[]
  },
): Result<{ routine: Routine; events: DomainEvent[] }, RoutineError | 'no_change' | 'removed'> => {
  if (routine.removedAt) return err('removed')
  let name = routine.name
  if (patch.name !== undefined) {
    const n = checkName(patch.name)
    if (!n.ok) return n
    name = n.value
  }
  const icon = patch.icon ?? routine.icon
  if (!isChoreIcon(icon)) return err('bad_icon')
  const resets = patch.resets ?? routine.resets

  const holderNow = routineHolder(routine, ctx.members, ctx.today)
  if (patch.who) {
    const user = patch.who.takesTurns ? patch.who.startsWith : patch.who.fixedMember
    if (!isActive(ctx.members, user)) return err('unknown_member')
  }
  const whoChanged =
    !!patch.who &&
    (patch.who.takesTurns
      ? !!routine.fixedMember || holderNow !== patch.who.startsWith
      : routine.fixedMember !== patch.who.fixedMember)
  const who: RoutineWho | undefined =
    patch.who ??
    (routine.fixedMember
      ? { takesTurns: false, fixedMember: routine.fixedMember }
      : holderNow && { takesTurns: true, startsWith: holderNow })

  const { version, startsWith: _s, fixedMember: _f, ...rest } = routine
  const anchor =
    who && (whoChanged || resets !== routine.resets)
      ? whoFields(who, resets, ctx.today)
      : {
          startsOn: routine.startsOn,
          startsWith: routine.startsWith,
          fixedMember: routine.fixedMember,
        }
  const next: Routine = {
    ...rest,
    ...(version && { version }),
    name,
    icon,
    resets,
    startsOn: anchor.startsOn,
    ...(anchor.startsWith && { startsWith: anchor.startsWith }),
    ...(anchor.fixedMember && { fixedMember: anchor.fixedMember }),
  }

  const changes: Record<string, readonly [unknown, unknown]> = {}
  if (name !== routine.name) changes.name = [routine.name, name]
  if (icon !== routine.icon) changes.icon = [routine.icon, icon]
  if (resets !== routine.resets) changes.resets = [routine.resets, resets]
  if (whoChanged) {
    const after = patch.who!.takesTurns ? patch.who!.startsWith : patch.who!.fixedMember
    changes.holder = [holderNow ?? null, after]
  }
  if (Object.keys(changes).length === 0) return err('no_change')
  return ok({
    routine: next,
    events: [
      {
        kind: 'routine.updated',
        routineId: routine.id,
        changes,
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/** Removes a routine; the use case also takes its rooms out, so their chores have no owner. */
export const removeRoutine = (
  routine: Routine,
  ctx: { by: UserId; now: Instant; actionId: ActionId },
): Result<{ routine: Routine; events: DomainEvent[] }, 'removed'> => {
  if (routine.removedAt) return err('removed')
  return ok({
    routine: { ...routine, removedAt: ctx.now },
    events: [
      { kind: 'routine.removed', routineId: routine.id, actionId: ctx.actionId, by: ctx.by },
    ],
  })
}

/**
 * Makes `roomIds` the routine's rooms: a room in another routine moves here, and one left out is in
 * no routine. Returns only the rooms that changed. Removing a routine passes no rooms.
 */
export const setRoutineRooms = (
  rooms: readonly Room[],
  routineId: RoutineId,
  roomIds: readonly RoomId[],
  ctx: { by: UserId; actionId: ActionId },
): { rooms: Room[]; events: DomainEvent[] } => {
  const changed: Room[] = []
  const events: DomainEvent[] = []
  for (const room of rooms) {
    const wanted = roomIds.includes(room.id) && !room.archivedAt
    const before = room.routineId ?? null
    const after = wanted ? routineId : before === routineId ? null : before
    if (after === before) continue
    const { routineId: _old, ...rest } = room
    changed.push(after ? { ...rest, routineId: after } : rest)
    events.push({
      kind: 'room.routine_changed',
      roomId: room.id,
      // What the activity line names: where it went, or where it left.
      routineId: (after ?? before)!,
      changes: { routine: [before, after] },
      actionId: ctx.actionId,
      by: ctx.by,
    })
  }
  return { rooms: changed, events }
}

// ---- when someone joins or moves out ----------------------------------------------------------

/**
 * Keeps this period's holders in place when the rotation's people change: each routine that takes
 * turns restarts from its current holder, this period. If that holder is leaving, the next person
 * in turn takes over. A routine fixed on someone who left falls back to taking turns, and that one
 * records `routine.updated`. Returns only the routines that changed.
 */
export const reanchorRoutines = (
  routines: readonly Routine[],
  ctx: {
    /** Members before the change, and after it. */
    before: readonly Member[]
    after: readonly Member[]
    today: LocalDate
    by: UserId | null
    actionId: ActionId
  },
): { routines: Routine[]; events: DomainEvent[] } => {
  const stillHere = new Set(rotationOrder(ctx.after))
  const order = rotationOrder(ctx.before)
  /** `user`, or the next person after them who's staying. */
  const staying = (user: UserId | undefined): UserId | undefined => {
    if (user && stillHere.has(user)) return user
    const from = user ? order.indexOf(user) : -1
    for (let step = 1; step <= order.length; step++) {
      const candidate = order[(from + step + order.length) % order.length]!
      if (stillHere.has(candidate)) return candidate
    }
    return rotationOrder(ctx.after)[0]
  }

  const changed: Routine[] = []
  const events: DomainEvent[] = []
  for (const r of routines) {
    if (r.removedAt) continue
    if (r.fixedMember && stillHere.has(r.fixedMember)) continue
    const startsWith = staying(routineHolder(r, ctx.before, ctx.today))
    if (!startsWith) continue // nobody left in the house to take it
    const startsOn = periodStart(r, ctx.today)
    if (!r.fixedMember && r.startsOn === startsOn && r.startsWith === startsWith) continue
    const { fixedMember, ...rest } = r
    changed.push({ ...rest, startsOn, startsWith })
    if (fixedMember) {
      events.push({
        kind: 'routine.updated',
        routineId: r.id,
        changes: { holder: [fixedMember, startsWith] },
        actionId: ctx.actionId,
        by: ctx.by,
      })
    }
  }
  return { routines: changed, events }
}

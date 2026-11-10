import { describe, expect, it } from 'vitest'
import type { Member, Room } from './house'
import { asId, type ActionId, type HouseId, type RoomId, type RoutineId, type UserId } from './ids'
import type { Chore } from './items'
import {
  choreOwner,
  createRoutine,
  doneThisPeriod,
  editRoutine,
  nextHolder,
  nextPeriodStart,
  periodStart,
  reanchorRoutines,
  removeRoutine,
  rotationOrder,
  routineHolder,
  routineProgress,
  setRoutineRooms,
  type Routine,
} from './routines'
import { instant, instantAt, plusMs, type LocalDate, type LocalTime } from './time'

const NY = 'America/New_York'
const d = (s: string) => s as LocalDate
const house = asId<'house'>('h') as HouseId
const a = asId<'action'>('a') as ActionId
const [alex, jamie, rio, sam] = (['alex', 'jamie', 'rio', 'sam'] as const).map(
  (u) => asId<'user'>(u) as UserId,
) as [UserId, UserId, UserId, UserId]
const member = (userId: UserId, joined: number, active = true): Member => ({
  houseId: house,
  userId,
  role: 'member',
  joinedAt: instant(joined),
  status: active ? { active: true } : { active: false, leftAt: instant(joined + 1) },
})
const people = [member(alex, 1), member(jamie, 2), member(rio, 3)]
const routine = (o: Partial<Routine> = {}): Routine => ({
  id: asId<'routine'>('r1') as RoutineId,
  houseId: house,
  name: 'Kitchen and dining',
  icon: 'utensils',
  resets: 'weekly',
  startsOn: d('2026-11-02'), // a Monday
  startsWith: alex,
  sortOrder: 0,
  createdAt: instant(0),
  ...o,
})
const room = (name: string, sortOrder: number, routineId?: RoutineId): Room => ({
  id: asId<'room'>(name) as RoomId,
  houseId: house,
  name,
  floor: 'first',
  kind: 'common',
  sortOrder,
  ...(routineId && { routineId }),
})
const chore = (o: Partial<Chore> = {}): Chore => ({
  id: asId<'item'>('c') as Chore['id'],
  houseId: house,
  title: 'Sink',
  priority: 'normal',
  createdBy: alex,
  createdAt: instant(0),
  category: 'chore',
  kind: 'deep_clean',
  rooms: [],
  ...o,
})

describe('periodStart', () => {
  it('weekly: the Monday on or before today, across a month end and a year end', () => {
    const r = routine()
    expect(periodStart(r, d('2026-11-02'))).toBe('2026-11-02') // Monday itself
    expect(periodStart(r, d('2026-11-08'))).toBe('2026-11-02') // Sunday
    expect(periodStart(r, d('2026-11-01'))).toBe('2026-10-26') // Sunday, a month back
    expect(periodStart(r, d('2027-01-01'))).toBe('2026-12-28')
  })

  it('every 2 weeks: counted from starts_on, on either side of it', () => {
    const r = routine({ resets: 'biweekly' })
    expect(periodStart(r, d('2026-11-08'))).toBe('2026-11-02')
    expect(periodStart(r, d('2026-11-15'))).toBe('2026-11-02')
    expect(periodStart(r, d('2026-11-16'))).toBe('2026-11-16')
    expect(periodStart(r, d('2026-11-01'))).toBe('2026-10-19')
  })

  it('monthly: the 1st, in months of any length', () => {
    const r = routine({ resets: 'monthly' })
    expect(periodStart(r, d('2027-02-28'))).toBe('2027-02-01')
    expect(periodStart(r, d('2026-12-31'))).toBe('2026-12-01')
  })

  it('the next period starts where this one ends', () => {
    expect(nextPeriodStart(routine(), d('2026-11-08'))).toBe('2026-11-09')
    expect(nextPeriodStart(routine({ resets: 'biweekly' }), d('2026-11-08'))).toBe('2026-11-16')
    expect(nextPeriodStart(routine({ resets: 'monthly' }), d('2027-01-31'))).toBe('2027-02-01')
    expect(nextPeriodStart(routine({ resets: 'monthly' }), d('2026-12-05'))).toBe('2027-01-01')
  })
})

describe('routineHolder', () => {
  it('goes round everyone by joined_at, one step a period', () => {
    const r = routine()
    expect(
      ['2026-11-02', '2026-11-08', '2026-11-09', '2026-11-16', '2026-11-23'].map((x) =>
        routineHolder(r, people, d(x)),
      ),
    ).toEqual([alex, alex, jamie, rio, alex])
    expect(nextHolder(r, people, d('2026-11-02'))).toBe(jamie)
  })

  it('keeps working before the start, across DST and from any starting person', () => {
    const r = routine({ startsWith: jamie })
    expect(routineHolder(r, people, d('2026-10-26'))).toBe(alex)
    expect(routineHolder(r, people, d('2026-10-19'))).toBe(rio)
    // The clocks go back on Nov 1 2026 and forward on Mar 14 2027: days are calendar days.
    const spanning = routine({ startsOn: d('2026-10-26') })
    expect(routineHolder(spanning, people, d('2026-11-02'))).toBe(jamie)
    expect(routineHolder(routine({ startsOn: d('2027-03-08') }), people, d('2027-03-15'))).toBe(
      jamie,
    )
  })

  it('every 2 weeks and monthly change hands on their own period', () => {
    const two = routine({ resets: 'biweekly' })
    expect(routineHolder(two, people, d('2026-11-15'))).toBe(alex)
    expect(routineHolder(two, people, d('2026-11-16'))).toBe(jamie)
    const month = routine({ resets: 'monthly', startsOn: d('2026-11-01') })
    expect(routineHolder(month, people, d('2026-11-30'))).toBe(alex)
    expect(routineHolder(month, people, d('2026-12-01'))).toBe(jamie)
    expect(routineHolder(month, people, d('2027-02-28'))).toBe(alex)
  })

  it('a fixed person keeps it; moved-out people are not in the rotation', () => {
    const fixed = routine({ startsWith: undefined, fixedMember: rio })
    expect(routineHolder(fixed, people, d('2026-12-25'))).toBe(rio)
    expect(nextHolder(fixed, people, d('2026-12-25'))).toBe(rio)
    expect(rotationOrder([member(rio, 3), member(alex, 1), member(sam, 2, false)])).toEqual([
      alex,
      rio,
    ])
    expect(routineHolder(routine(), [], d('2026-11-02'))).toBeUndefined()
  })
})

describe('choreOwner', () => {
  const r1 = routine()
  const rooms = [room('Dining', 2, r1.id), room('Kitchen', 1), room('Old', 0, r1.id)]
  const ids = (...names: string[]) => names.map((n) => asId<'room'>(n) as RoomId)

  it("is the routine of the chore's first room in house order", () => {
    const dining = chore({ rooms: ids('Dining') })
    expect(choreOwner(dining, rooms, [r1])).toBe(r1)
    // Kitchen comes first and is in no routine, so nobody's on it, though Dining has one.
    expect(choreOwner(chore({ rooms: ids('Dining', 'Kitchen') }), rooms, [r1])).toBeUndefined()
  })

  it('nobody is on upkeep, a chore with no room, or a removed routine', () => {
    expect(choreOwner(chore({ kind: 'upkeep', rooms: ids('Dining') }), rooms, [r1])).toBeUndefined()
    expect(choreOwner(chore(), rooms, [r1])).toBeUndefined()
    expect(
      choreOwner(chore({ rooms: ids('Dining') }), rooms, [routine({ removedAt: instant(1) })]),
    ).toBeUndefined()
  })

  it('skips an archived first room', () => {
    const withArchived = [{ ...room('Old', 0), archivedAt: instant(1) }, room('Dining', 2, r1.id)]
    expect(choreOwner(chore({ rooms: ids('Old', 'Dining') }), withArchived, [r1])).toBe(r1)
  })
})

describe('doneThisPeriod', () => {
  const at = (date: string, time: string) => instantAt(d(date), time as LocalTime, NY)
  const doneAt = (date: string, time: string) =>
    chore({ lastDone: { at: at(date, time), by: alex } })

  it('resets at midnight on the first day of the period, in the house time zone', () => {
    const r = routine()
    expect(doneThisPeriod(doneAt('2026-11-02', '00:00'), r, d('2026-11-08'), NY)).toBe(true)
    expect(doneThisPeriod(doneAt('2026-11-01', '23:59'), r, d('2026-11-02'), NY)).toBe(false)
    expect(doneThisPeriod(chore(), r, d('2026-11-02'), NY)).toBe(false)
  })

  it('holds across the fall-back Sunday, and on the 1st for monthly', () => {
    const r = routine({ startsOn: d('2026-10-26') })
    expect(doneThisPeriod(doneAt('2026-11-01', '01:30'), r, d('2026-11-01'), NY)).toBe(true)
    const month = routine({ resets: 'monthly' })
    expect(doneThisPeriod(doneAt('2026-12-01', '00:00'), month, d('2026-12-31'), NY)).toBe(true)
    expect(doneThisPeriod(doneAt('2026-11-30', '23:00'), month, d('2026-12-01'), NY)).toBe(false)
  })

  it('progress says which are done', () => {
    const [done, not] = [doneAt('2026-11-03', '10:00'), chore({ title: 'Stove' })]
    expect(routineProgress(routine(), [done, not], d('2026-11-04'), NY)).toEqual([
      { chore: done, done: true },
      { chore: not, done: false },
    ])
  })
})

describe('creating, editing and removing', () => {
  const ctx = {
    id: asId<'routine'>('new') as RoutineId,
    houseId: house,
    by: alex,
    now: instant(5),
    today: d('2026-11-04'),
    actionId: a,
    members: people,
    sortOrder: 3,
  }
  const edit = { by: alex, today: d('2026-11-04'), actionId: a, members: people }

  it('creates one that starts this period with the person picked', () => {
    const r = createRoutine(
      {
        name: ' Garden ',
        icon: 'leaf',
        resets: 'weekly',
        who: { takesTurns: true, startsWith: jamie },
      },
      ctx,
    )
    expect(r.ok && r.value.routine).toMatchObject({
      name: 'Garden',
      startsOn: '2026-11-02',
      startsWith: jamie,
      sortOrder: 3,
    })
    expect(r.ok && r.value.events[0]).toMatchObject({ kind: 'routine.created', routineId: ctx.id })
    const fixed = createRoutine(
      {
        name: 'Garden',
        icon: 'leaf',
        resets: 'monthly',
        who: { takesTurns: false, fixedMember: rio },
      },
      ctx,
    )
    expect(fixed.ok && fixed.value.routine).toMatchObject({
      fixedMember: rio,
      startsOn: '2026-11-01',
    })
    expect(fixed.ok && fixed.value.routine.startsWith).toBeUndefined()
  })

  it.each([
    [{ name: ' ' }, 'empty_name'],
    [{ name: 'x'.repeat(61) }, 'name_too_long'],
    [{ icon: 'wind' }, 'bad_icon'],
    [{ who: { takesTurns: true, startsWith: sam } }, 'unknown_member'],
    [{ who: { takesTurns: false, fixedMember: sam } }, 'unknown_member'],
  ] as const)('refuses a bad routine %#', (o, error) => {
    const who = { takesTurns: true, startsWith: alex } as const
    expect(
      createRoutine({ name: 'Garden', icon: 'leaf', resets: 'weekly', who, ...o }, ctx),
    ).toEqual({ ok: false, error })
  })

  it('edits only what changed, and refuses no change', () => {
    const r = editRoutine(routine(), { name: 'Kitchen' }, edit)
    expect(r.ok && r.value.routine.startsOn).toBe('2026-11-02')
    expect(r.ok && r.value.events[0]).toMatchObject({
      kind: 'routine.updated',
      changes: { name: ['Kitchen and dining', 'Kitchen'] },
    })
    expect(editRoutine(routine(), { name: 'Kitchen and dining' }, edit)).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(editRoutine(routine(), { icon: 'wind' }, edit)).toEqual({
      ok: false,
      error: 'bad_icon',
    })
    expect(editRoutine(routine({ removedAt: instant(1) }), { name: 'x' }, edit)).toEqual({
      ok: false,
      error: 'removed',
    })
  })

  it('changing how often it resets keeps this period’s holder', () => {
    const later = { ...edit, today: d('2026-11-10') } // Jamie's week
    const r = editRoutine(routine(), { resets: 'monthly' }, later)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.routine).toMatchObject({ startsOn: '2026-11-01', startsWith: jamie })
    expect(routineHolder(r.value.routine, people, d('2026-11-10'))).toBe(jamie)
  })

  it('changes who has it, either way round', () => {
    const toFixed = editRoutine(routine(), { who: { takesTurns: false, fixedMember: rio } }, edit)
    if (!toFixed.ok) throw new Error(toFixed.error)
    expect(toFixed.value.routine.fixedMember).toBe(rio)
    expect(toFixed.value.routine.startsWith).toBeUndefined()
    expect(toFixed.value.events[0]).toMatchObject({ changes: { holder: [alex, rio] } })

    const toTurns = editRoutine(
      toFixed.value.routine,
      { who: { takesTurns: true, startsWith: jamie } },
      edit,
    )
    if (!toTurns.ok) throw new Error(toTurns.error)
    expect(toTurns.value.routine.fixedMember).toBeUndefined()
    expect(routineHolder(toTurns.value.routine, people, d('2026-11-04'))).toBe(jamie)
    expect(editRoutine(routine(), { who: { takesTurns: true, startsWith: alex } }, edit)).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(editRoutine(routine(), { who: { takesTurns: true, startsWith: sam } }, edit)).toEqual({
      ok: false,
      error: 'unknown_member',
    })
  })

  it('removing marks it removed, once', () => {
    const r = removeRoutine(routine(), { by: alex, now: instant(9), actionId: a })
    expect(r.ok && r.value.routine.removedAt).toEqual(instant(9))
    expect(
      removeRoutine(routine({ removedAt: instant(1) }), { by: alex, now: instant(9), actionId: a }),
    ).toEqual({
      ok: false,
      error: 'removed',
    })
  })
})

describe('setRoutineRooms', () => {
  const r1 = asId<'routine'>('r1') as RoutineId
  const r2 = asId<'routine'>('r2') as RoutineId
  const id = (n: string) => asId<'room'>(n) as RoomId

  it('adds, moves from another routine, and drops, recording each room that changed', () => {
    const rooms = [
      room('A', 0),
      room('B', 1, r2),
      room('C', 2, r1),
      room('D', 3, r2),
      room('E', 4, r1),
    ]
    const r = setRoutineRooms(rooms, r1, [id('A'), id('B'), id('E')], { by: alex, actionId: a })
    expect(r.rooms.map((x) => [x.name, x.routineId])).toEqual([
      ['A', r1],
      ['B', r1],
      ['C', undefined],
    ])
    expect(r.events).toEqual([
      expect.objectContaining({ roomId: id('A'), routineId: r1, changes: { routine: [null, r1] } }),
      expect.objectContaining({ roomId: id('B'), routineId: r1, changes: { routine: [r2, r1] } }),
      expect.objectContaining({ roomId: id('C'), routineId: r1, changes: { routine: [r1, null] } }),
    ])
  })

  it('leaves archived rooms out, and no rooms empties it', () => {
    const rooms = [{ ...room('A', 0), archivedAt: instant(1) }, room('B', 1, r1)]
    const r = setRoutineRooms(rooms, r1, [id('A')], { by: alex, actionId: a })
    expect(r.rooms.map((x) => x.name)).toEqual(['B'])
    expect(r.rooms[0]!.routineId).toBeUndefined()
  })
})

describe('reanchorRoutines', () => {
  const today = d('2026-11-10') // Jamie's week on the default routine
  const ctx = { today, by: alex, actionId: a }

  it('someone joining leaves this period’s holder in place', () => {
    const after = [...people, member(sam, 4)]
    const r = reanchorRoutines([routine()], { ...ctx, before: people, after })
    expect(r.routines[0]).toMatchObject({ startsOn: '2026-11-09', startsWith: jamie })
    expect(r.events).toEqual([])
    expect(routineHolder(r.routines[0]!, after, today)).toBe(jamie)
    expect(routineHolder(r.routines[0]!, after, plusDays(today, 7))).toBe(rio)
    expect(routineHolder(r.routines[0]!, after, plusDays(today, 14))).toBe(sam)
  })

  it('someone else moving out leaves it in place too', () => {
    const after = [people[0]!, people[1]!, member(rio, 3, false)]
    const r = reanchorRoutines([routine()], { ...ctx, before: people, after })
    expect(routineHolder(r.routines[0]!, after, today)).toBe(jamie)
    expect(routineHolder(r.routines[0]!, after, plusDays(today, 7))).toBe(alex)
  })

  it('when the holder moves out, the next person in turn takes over', () => {
    const after = [people[0]!, member(jamie, 2, false), people[2]!]
    const r = reanchorRoutines([routine()], { ...ctx, before: people, after })
    expect(r.routines[0]).toMatchObject({ startsOn: '2026-11-09', startsWith: rio })
    expect(r.events).toEqual([])
    const last = reanchorRoutines([routine({ startsWith: rio, startsOn: d('2026-11-09') })], {
      ...ctx,
      before: people,
      after: [people[0]!, people[1]!, member(rio, 3, false)],
    })
    expect(last.routines[0]!.startsWith).toBe(alex)
  })

  it('a fixed person leaving means taking turns, recorded; otherwise fixed stays', () => {
    const fixed = routine({ startsWith: undefined, fixedMember: rio })
    const after = [people[0]!, people[1]!, member(rio, 3, false)]
    const r = reanchorRoutines([fixed], { ...ctx, before: people, after })
    expect(r.routines[0]!.fixedMember).toBeUndefined()
    expect(r.routines[0]).toMatchObject({ startsWith: alex, startsOn: '2026-11-09' })
    expect(r.events).toEqual([
      expect.objectContaining({ kind: 'routine.updated', changes: { holder: [rio, alex] } }),
    ])
    const stays = reanchorRoutines([fixed], {
      ...ctx,
      before: people,
      after: [...people, member(sam, 4)],
    })
    expect(stays).toEqual({ routines: [], events: [] })
  })

  it('skips removed routines, ones already anchored, and a house with nobody left', () => {
    expect(
      reanchorRoutines([routine({ removedAt: instant(1) })], {
        ...ctx,
        before: people,
        after: people,
      }),
    ).toEqual({ routines: [], events: [] })
    expect(
      reanchorRoutines([routine({ startsOn: d('2026-11-09'), startsWith: alex })], {
        ...ctx,
        before: people,
        after: people,
      }).routines,
    ).toEqual([])
    expect(
      reanchorRoutines([routine()], {
        ...ctx,
        before: [people[0]!],
        after: [member(alex, 1, false)],
      }).routines,
    ).toEqual([])
  })
})

const plusDays = (date: LocalDate, n: number): LocalDate =>
  new Date(plusMs(instant(Date.parse(`${date}T12:00:00Z`)), n * 86_400_000).epochMs)
    .toISOString()
    .slice(0, 10) as LocalDate

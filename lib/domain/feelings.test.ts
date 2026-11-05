import { describe, expect, it } from 'vitest'
import type { StoredActivityRow } from './events'
import {
  activeFeelings,
  feelingWeightsFrom,
  DEFAULT_FEELING_WEIGHTS,
  earlierFeelings,
  feelingCounts,
  feelingScore,
  setFeeling,
  type Feeling,
} from './feelings'
import { asId, type ActionId, type HouseId, type ItemId, type UserId } from './ids'
import type { Item } from './items'
import { instant } from './time'

const itemId = asId<'item'>('radiator') as ItemId
const maya = asId<'user'>('maya') as UserId
const wren = asId<'user'>('wren') as UserId
const a = asId<'action'>('a') as ActionId
const ctx = (t: number) => ({ itemId, by: maya, now: instant(t), actionId: a })

describe('setFeeling', () => {
  it('shares a feeling, with the previous one (none) on the event', () => {
    const r = setFeeling(null, { kind: 'anxious', note: ' It keeps banging at 3am ' }, ctx(1))
    expect(r.ok && r.value.feeling).toEqual({
      itemId,
      by: maya,
      kind: 'anxious',
      note: 'It keeps banging at 3am',
      at: instant(1),
    })
    expect(r.ok && r.value.events).toEqual([
      {
        kind: 'feeling.set',
        itemId,
        changes: { previous: null, next: r.ok && r.value.feeling },
        actionId: a,
        by: maya,
      },
    ])
  })

  it('changing it carries the old one, and removing it too', () => {
    const first = { itemId, by: maya, kind: 'anxious', at: instant(1) } as Feeling
    const changed = setFeeling(first, { kind: 'thanks' }, ctx(2))
    expect(changed.ok && changed.value.events[0]).toMatchObject({ changes: { previous: first } })
    const removed = setFeeling(first, null, ctx(3))
    expect(removed.ok && removed.value).toEqual({
      feeling: null,
      events: [
        { kind: 'feeling.removed', itemId, changes: { previous: first }, actionId: a, by: maya },
      ],
    })
  })

  it('refuses no-ops and long notes', () => {
    const f = { itemId, by: maya, kind: 'fine', note: 'ok', at: instant(1) } as Feeling
    expect(setFeeling(f, { kind: 'fine', note: 'ok ' }, ctx(2))).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(setFeeling(null, null, ctx(2))).toEqual({ ok: false, error: 'no_change' })
    expect(setFeeling(null, { kind: 'fine', note: 'x'.repeat(281) }, ctx(2))).toEqual({
      ok: false,
      error: 'note_too_long',
    })
  })
})

describe('activeFeelings (T99)', () => {
  const base = {
    id: itemId,
    houseId: asId<'house'>('h') as HouseId,
    title: 'Dishes',
    priority: 'normal' as const,
    createdBy: maya,
    createdAt: instant(0),
  }
  const felt = (t: number, by: UserId = maya): Feeling => ({
    itemId,
    by,
    kind: 'frustrated',
    at: instant(t),
  })
  const elsewhere: Feeling = { ...felt(50), itemId: asId<'item'>('other') as ItemId }
  const chore = (lastDoneAt?: number): Item => ({
    ...base,
    category: 'chore',
    repeatDays: null,
    ...(lastDoneAt !== undefined && { lastDone: { at: instant(lastDoneAt), by: wren } }),
  })

  it('a chore counts only feelings shared after it was last done', () => {
    const feelings = [felt(10), felt(30, wren), elsewhere]
    expect(activeFeelings(chore(), feelings)).toEqual([felt(10), felt(30, wren)])
    expect(activeFeelings(chore(20), feelings)).toEqual([felt(30, wren)])
    expect(activeFeelings(chore(40), feelings)).toEqual([])
    // Shared in the same instant as the Did it: not after it.
    expect(activeFeelings(chore(30), feelings)).toEqual([])
  })

  it('counts every feeling on an open need or task, including a reopened one', () => {
    const feelings = [felt(10), elsewhere]
    for (const category of ['need', 'task'] as const) {
      expect(activeFeelings({ ...base, category }, feelings)).toEqual([felt(10)])
    }
  })

  it('sharing the same feeling again counts once the old one has gone quiet', () => {
    const old = felt(10)
    expect(setFeeling(old, { kind: 'frustrated' }, ctx(30))).toEqual({
      ok: false,
      error: 'no_change',
    })
    const r = setFeeling(old, { kind: 'frustrated' }, { ...ctx(30), stale: true })
    expect(r.ok && r.value.feeling?.at).toEqual(instant(30))
  })
})

describe('earlierFeelings', () => {
  const row = (
    id: number,
    kind: StoredActivityRow['kind'],
    previous: Feeling | null,
  ): StoredActivityRow => ({
    id,
    houseId: asId<'house'>('h') as HouseId,
    at: instant(id),
    actorId: maya,
    actionId: a,
    kind,
    itemId,
    changes: { previous, next: null },
    payload: { v: 1 },
  })

  it('lists replaced and removed feelings, newest first', () => {
    const anxious = { itemId, by: maya, kind: 'anxious', at: instant(1) } as Feeling
    const frustrated = { itemId, by: maya, kind: 'frustrated', at: instant(2) } as Feeling
    const rows = [
      row(1, 'feeling.set', null),
      row(2, 'feeling.set', anxious),
      row(3, 'item.edited', null),
      row(4, 'feeling.removed', frustrated),
    ]
    expect(earlierFeelings(rows)).toEqual([frustrated, anxious])
  })

  it('leaves out a version whose note was added or edited on the same feeling', () => {
    const plain = { itemId, by: maya, kind: 'anxious', at: instant(1) } as Feeling
    const noted = { ...plain, note: 'Last roll', at: instant(2) } as Feeling
    const rows: StoredActivityRow[] = [
      row(1, 'feeling.set', null),
      { ...row(2, 'feeling.set', plain), changes: { previous: plain, next: noted } },
      row(3, 'feeling.removed', noted),
    ]
    expect(earlierFeelings(rows)).toEqual([noted])
  })
})

describe('scores and counts', () => {
  const fs = [
    { itemId, by: maya, kind: 'anxious', at: instant(1) },
    { itemId, by: wren, kind: 'anxious', at: instant(1) },
    { itemId, by: asId<'user'>('jo') as UserId, kind: 'meh', at: instant(1) },
  ] as Feeling[]
  it('adds the house weights', () => {
    expect(feelingScore(fs, DEFAULT_FEELING_WEIGHTS)).toBe(35)
    expect(feelingScore(fs, { ...DEFAULT_FEELING_WEIGHTS, anxious: 40 })).toBe(75)
  })
  it('counts by kind', () => {
    expect(feelingCounts(fs)).toEqual([
      { kind: 'anxious', count: 2 },
      { kind: 'meh', count: 1 },
    ])
  })
})

describe('feelingWeightsFrom', () => {
  it('keeps stored weights and fills in the defaults for missing or malformed ones', () => {
    expect(feelingWeightsFrom({})).toEqual(DEFAULT_FEELING_WEIGHTS)
    expect(feelingWeightsFrom({ anxious: 40, meh: 'x', fine: null, extra: 3 })).toEqual({
      ...DEFAULT_FEELING_WEIGHTS,
      anxious: 40,
    })
  })
})

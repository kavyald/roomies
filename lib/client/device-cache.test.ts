import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { asMember } from '@/lib/adapters/contracts/unit-of-work.contract'
import { memoryHouseQueries } from '@/lib/adapters/memory/queries'
import { makeAddCost } from '@/lib/app/costs'
import { makeCreateItem, makeDoChore, makeSetFeeling } from '@/lib/app/items'
import { makeCreatePoll, makeVote } from '@/lib/app/polls'
import { makeCreateRoutine } from '@/lib/app/routines'
import { makeStartRun } from '@/lib/app/runs'
import { depsForTest } from '@/lib/compose'
import type { HouseId, UserId } from '@/lib/domain/ids'
import type { Cents } from '@/lib/domain/money'
import { sampleHouse } from '@/lib/testing/sample-house'
import {
  cacheKey,
  forgetHouseData,
  isKeptQuery,
  KEPT,
  MAX_AGE_MS,
  restoreHouseData,
  saveHouseData,
  type CacheScope,
} from './device-cache'
import { keys } from './query-keys'

/** localStorage's interface over a Map, with switches for a full or refusing storage. */
class FakeStorage implements Storage {
  readonly map = new Map<string, string>()
  refuseReads = false
  refuseWrites = false
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    if (this.refuseReads) throw new Error('SecurityError')
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.refuseWrites) throw new Error('QuotaExceededError')
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

const HOUSE = 'h1' as HouseId
const KAVYA = 'kavya' as UserId
const scope: CacheScope = { userId: KAVYA, houseId: HOUSE, build: 'abc1234' }
const NOW = 1_800_000_000_000

/** A client whose lists have loaded, as after a visit to the house. */
const loaded = () => {
  const qc = new QueryClient()
  qc.setQueryData(keys.items(HOUSE), [{ id: 'milk', title: 'Milk' }], { updatedAt: NOW - 5_000 })
  qc.setQueryData(keys.members(HOUSE), [{ userId: KAVYA }], { updatedAt: NOW - 5_000 })
  qc.setQueryData(keys.activity(HOUSE), { pages: [] })
  qc.setQueryData(keys.invites(HOUSE), [{ id: 'invite' }])
  qc.setQueryData(keys.splitwiseCopied(HOUSE), new Set(['cost']))
  qc.setQueryData(keys.items('other' as HouseId), [{ id: 'theirs' }])
  return qc
}

describe("the house's lists kept on this device (T114)", () => {
  it('keeps only the kept lists that have loaded, and puts them back as stale copies', () => {
    const storage = new FakeStorage()
    expect(saveHouseData(loaded(), scope, storage, NOW)).toBe(true)
    const saved = JSON.parse(storage.getItem(cacheKey(scope))!)
    expect(saved.lists.map((l: { name: string }) => l.name)).toEqual(['members', 'items'])

    const later = new QueryClient()
    expect(restoreHouseData(later, scope, storage, NOW + 60_000)).toBe(2)
    expect(later.getQueryData(keys.items(HOUSE))).toEqual([{ id: 'milk', title: 'Milk' }])
    // With the time it was fetched, and stale however recent, so a screen fetches it again.
    expect(later.getQueryState(keys.items(HOUSE))?.dataUpdatedAt).toBe(NOW - 5_000)
    expect(later.getQueryState(keys.items(HOUSE))?.isInvalidated).toBe(true)
    expect(later.getQueryData(keys.invites(HOUSE))).toBeUndefined()
  })

  it('never goes over what the network has already brought', () => {
    const storage = new FakeStorage()
    saveHouseData(loaded(), scope, storage, NOW)
    const fresh = new QueryClient()
    fresh.setQueryData(keys.items(HOUSE), [{ id: 'milk', title: 'Oat milk' }])
    expect(restoreHouseData(fresh, scope, storage, NOW)).toBe(1)
    expect(fresh.getQueryData(keys.items(HOUSE))).toEqual([{ id: 'milk', title: 'Oat milk' }])
  })

  it('another person, house or build reads nothing, and a new copy removes the old one', () => {
    const storage = new FakeStorage()
    saveHouseData(loaded(), scope, storage, NOW)
    for (const other of [
      { ...scope, userId: 'sam' as UserId },
      { ...scope, houseId: 'h2' as HouseId },
      { ...scope, build: 'def5678' },
    ])
      expect(restoreHouseData(new QueryClient(), other, storage, NOW)).toBe(0)

    const sams = { ...scope, userId: 'sam' as UserId }
    saveHouseData(loaded(), sams, storage, NOW)
    expect([...storage.map.keys()]).toEqual([cacheKey(sams)])
  })

  it('a copy older than a day, from the future, or unreadable is removed, not read', () => {
    const storage = new FakeStorage()
    saveHouseData(loaded(), scope, storage, NOW)
    expect(restoreHouseData(new QueryClient(), scope, storage, NOW + MAX_AGE_MS + 1)).toBe(0)
    expect(storage.length).toBe(0)

    saveHouseData(loaded(), scope, storage, NOW)
    expect(restoreHouseData(new QueryClient(), scope, storage, NOW - 1)).toBe(0)
    expect(storage.length).toBe(0)

    storage.setItem(cacheKey(scope), '{"savedAt":')
    expect(restoreHouseData(new QueryClient(), scope, storage, NOW)).toBe(0)
    storage.setItem(cacheKey(scope), JSON.stringify({ lists: 'nope' }))
    expect(restoreHouseData(new QueryClient(), scope, storage, NOW)).toBe(0)
    expect(storage.length).toBe(0)
  })

  it("a list it doesn't keep, or one with no data, is skipped on the way back", () => {
    const storage = new FakeStorage()
    storage.setItem(
      cacheKey(scope),
      JSON.stringify({
        savedAt: NOW,
        lists: [
          { name: 'invites', data: [{ id: 'x' }], updatedAt: NOW },
          { name: 'house', data: null, updatedAt: NOW },
          { name: 'polls', data: [], updatedAt: NOW },
        ],
      }),
    )
    const qc = new QueryClient()
    expect(restoreHouseData(qc, scope, storage, NOW)).toBe(1)
    expect(qc.getQueryData(keys.invites(HOUSE))).toBeUndefined()
    expect(qc.getQueryData(keys.polls(HOUSE))).toEqual([])
  })

  it('a storage that refuses or is full never breaks the app, and leaves no half copy', () => {
    const storage = new FakeStorage()
    storage.refuseWrites = true
    expect(saveHouseData(loaded(), scope, storage, NOW)).toBe(false)
    expect(storage.length).toBe(0)

    storage.refuseWrites = false
    saveHouseData(loaded(), scope, storage, NOW)
    storage.refuseReads = true
    expect(restoreHouseData(new QueryClient(), scope, storage, NOW)).toBe(0)

    expect(saveHouseData(loaded(), scope, null, NOW)).toBe(false)
    expect(restoreHouseData(new QueryClient(), scope, null, NOW)).toBe(0)
    expect(() => forgetHouseData(null)).not.toThrow()
  })

  it("forgetting removes every house's copy and leaves the device's other settings", () => {
    const storage = new FakeStorage()
    saveHouseData(loaded(), scope, storage, NOW)
    storage.map.set(cacheKey({ ...scope, houseId: 'h2' as HouseId }), '{}')
    storage.map.set('roomies.pushPromptDone', '1')
    forgetHouseData(storage)
    expect([...storage.map.keys()]).toEqual(['roomies.pushPromptDone'])
  })

  it('names the kept queries: three-part house keys, this house only', () => {
    expect(isKeptQuery(keys.items(HOUSE), HOUSE)).toBe(true)
    expect(isKeptQuery(keys.items(HOUSE), 'h2' as HouseId)).toBe(false)
    expect(isKeptQuery(keys.activity(HOUSE), HOUSE)).toBe(false)
    expect(isKeptQuery(keys.weightsChange(HOUSE), HOUSE)).toBe(false)
    expect(isKeptQuery(keys.notificationsOff(HOUSE), HOUSE)).toBe(false)
  })

  it('every kept list comes back from JSON exactly as it went in', async () => {
    const deps = depsForTest()
    const sample = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId() as UserId)
    const houseId = sample.house.id
    const me = asMember(houseId, sample.people.Kavya)
    const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
      if (!r.ok) throw new Error(r.error)
      return r.value
    }
    const need = must(await makeCreateItem(deps)(me, { category: 'need', title: 'Milk' }))
    must(
      await makeCreateItem(deps)(me, {
        category: 'task',
        title: 'Fix the tap',
        when: { date: '2026-10-01', time: '09:30' },
        contactId: sample.contacts.super.id,
      } as never),
    )
    const chore = must(
      await makeCreateItem(deps)(me, { category: 'chore', title: 'Sink', kind: 'upkeep' }),
    )
    must(await makeDoChore(deps)(me, chore.id))
    must(await makeSetFeeling(deps)(me, { itemId: need.id, kind: 'anxious', note: 'Out' }))
    const poll = must(
      await makeCreatePoll(deps)(me, {
        question: 'House name?',
        options: [{ label: 'The Nest' }, { label: 'Burrow' }],
      }),
    )
    must(await makeVote(deps)(me, { pollId: poll.id, optionId: poll.options[0]!.id }))
    must(await makeStartRun(deps)(me, { itemIds: [need.id] }))
    must(await makeAddCost(deps)(me, { amount: 1250 as Cents, for: { item: need.id } }))
    must(
      await makeCreateRoutine(deps)(me, {
        name: 'Kitchen',
        icon: 'broom',
        resets: 'weekly',
        who: { takesTurns: false, fixedMember: sample.people.Kavya },
        roomIds: [sample.rooms.Kitchen!.id],
      }),
    )

    const q = memoryHouseQueries(deps.uow, me)
    for (const name of KEPT) {
      const data = await q[name](houseId)
      expect(data, name).toBeDefined()
      if (Array.isArray(data)) expect(data.length, name).toBeGreaterThan(0)
      expect(JSON.parse(JSON.stringify(data)), name).toEqual(data)
    }
  })
})

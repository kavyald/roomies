import { describe, expect, it } from 'vitest'
import { actorUser, type Actor } from './actor'
import { asId, isUuid, type HouseId, type UserId } from './ids'
import { err, mapResult, ok } from './result'

describe('result', () => {
  it('maps only successes', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual(ok(4))
    expect(mapResult(err('nope'), (n: number) => n * 2)).toEqual(err('nope'))
  })
})

describe('ids', () => {
  it('recognizes uuids', () => {
    expect(isUuid('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe(true)
    expect(isUuid('7c9e6679')).toBe(false)
  })
})

describe('actor', () => {
  const houseId = asId<'house'>('h1') as HouseId
  it('names the member, or nobody for jobs', () => {
    const member: Actor = { kind: 'member', userId: asId<'user'>('u1') as UserId, houseId }
    expect(actorUser(member)).toBe('u1')
    expect(actorUser({ kind: 'system', houseId })).toBeNull()
  })
})

import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { makeOwnChanges, ownChanges } from './own-changes'

const items = ['house', 'h1', 'items'] as const
const polls = ['house', 'h1', 'polls'] as const

describe("skipping the echo of this browser's own change", () => {
  it('covers a query while a command that refreshes it is saving, and for 5 s after', () => {
    let now = 0
    const mine = makeOwnChanges(() => now)
    expect(mine.covers(items)).toBe(false)

    mine.started([items])
    now = 60_000 // however long the save takes
    expect(mine.covers(items)).toBe(true)
    expect(mine.covers(polls)).toBe(false)

    mine.settled([items])
    now += 4_999
    expect(mine.covers(items)).toBe(true)
    now += 1
    expect(mine.covers(items)).toBe(false)
  })

  it('stays covered until the last of two overlapping commands settles', () => {
    let now = 0
    const mine = makeOwnChanges(() => now)
    mine.started([items])
    mine.started([items])
    mine.settled([items])
    now = 10_000
    expect(mine.covers(items)).toBe(true)
    mine.settled([items])
    now = 15_000
    expect(mine.covers(items)).toBe(false)
  })

  it('is kept per QueryClient', () => {
    const a = new QueryClient()
    expect(ownChanges(a)).toBe(ownChanges(a))
    expect(ownChanges(a)).not.toBe(ownChanges(new QueryClient()))
  })
})

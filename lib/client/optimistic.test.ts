import { describe, expect, it } from 'vitest'
import type { Feeling } from '../domain/feelings'
import type { ItemId, OptionId, PollId, UserId } from '../domain/ids'
import type { Chore, Item, Need } from '../domain/items'
import type { Poll } from '../domain/polls'
import { instant } from '../domain/time'
import * as tap from './optimistic'

const me = 'me' as UserId
const sam = 'sam' as UserId
const now = instant(1_000)
const ctx = { me, now }
const earlier = instant(10)

const need = (id: string, o: Partial<Need> = {}) =>
  ({ id, category: 'need', title: id, priority: 'normal', ...o }) as Need
const chore = (id: string, o: Partial<Chore> = {}) =>
  ({ id, category: 'chore', kind: 'deep_clean', title: id, rooms: [], ...o }) as Chore
const id = (s: string) => s as ItemId

describe('what a tap shows before the server answers', () => {
  it('Got it marks that need done by me now, and leaves the rest alone', () => {
    const items: Item[] = [need('milk'), need('eggs')]
    const shown = tap.markDone(items, id('milk'), ctx)
    expect(shown[0]).toMatchObject({ id: 'milk', done: { at: now, by: me } })
    expect(shown[1]).toBe(items[1])
    expect(items[0]).not.toHaveProperty('done') // the cached list isn't changed in place
  })

  it("Got it doesn't touch a need that's already done, or a chore", () => {
    const done = need('milk', { done: { at: earlier, by: sam } })
    const sink = chore('sink')
    expect(tap.markDone([done, sink], id('milk'), ctx)[0]).toBe(done)
    expect(tap.markDone([done, sink], id('sink'), ctx)[1]).toBe(sink)
  })

  it('reopening takes done off', () => {
    const shown = tap.reopen([need('milk', { done: { at: earlier, by: me } })], id('milk'))
    expect(shown[0]).not.toHaveProperty('done')
  })

  it('Did it sets last done to me now; undoing it shows none until the server answers', () => {
    const ticked = tap.doChore(
      [chore('sink', { lastDone: { at: earlier, by: sam } })],
      id('sink'),
      ctx,
    )
    expect(ticked[0]).toMatchObject({ lastDone: { at: now, by: me } })
    expect(tap.undoChore(ticked, { id: id('sink') })[0]).not.toHaveProperty('lastDone')
    expect(tap.doChore([need('milk')], id('milk'), ctx)[0]).not.toHaveProperty('lastDone')
  })

  it('a feeling replaces mine on that item, keeps everyone else, and null removes it', () => {
    const feelings: Feeling[] = [
      { itemId: id('milk'), by: me, kind: 'fine', at: earlier },
      { itemId: id('milk'), by: sam, kind: 'anxious', at: earlier },
      { itemId: id('eggs'), by: me, kind: 'meh', at: earlier },
    ]
    const shown = tap.setFeeling(
      feelings,
      { itemId: id('milk'), kind: 'frustrated', note: ' again ' },
      ctx,
    )
    expect(shown).toHaveLength(3)
    expect(shown.find((f) => f.itemId === 'milk' && f.by === me)).toEqual({
      itemId: 'milk',
      by: me,
      kind: 'frustrated',
      note: 'again',
      at: now,
    })
    const removed = tap.setFeeling(feelings, { itemId: id('milk'), kind: null }, ctx)
    expect(removed.map((f) => `${f.itemId}:${f.by}`)).toEqual(['milk:sam', 'eggs:me'])
  })

  const poll = (o: Partial<Poll> = {}) =>
    ({
      id: 'p1' as PollId,
      options: [{ id: 'a' }, { id: 'b' }],
      votes: [
        { user: me, option: 'a' as OptionId, at: earlier },
        { user: sam, option: 'a' as OptionId, at: earlier },
      ],
      state: { open: true },
      ...o,
    }) as Poll

  it('a vote replaces mine and keeps the others; withdrawing takes mine out', () => {
    const voted = tap.vote([poll()], { pollId: 'p1' as PollId, optionId: 'b' as OptionId }, ctx)
    expect(voted[0]!.votes).toEqual([
      { user: sam, option: 'a', at: earlier },
      { user: me, option: 'b', at: now },
    ])
    const withdrawn = tap.withdrawVote(voted, { pollId: 'p1' as PollId }, ctx)
    expect(withdrawn[0]!.votes).toEqual([{ user: sam, option: 'a', at: earlier }])
  })

  it("a closed poll, or an option it doesn't have, shows no change", () => {
    const closed = poll({ state: { open: false, closedAt: earlier } })
    const input = { pollId: 'p1' as PollId, optionId: 'b' as OptionId }
    expect(tap.vote([closed], input, ctx)[0]).toBe(closed)
    expect(tap.withdrawVote([closed], input, ctx)[0]).toBe(closed)
    const open = poll()
    expect(tap.vote([open], { ...input, optionId: 'zzz' as OptionId }, ctx)[0]).toBe(open)
  })
})

describe('when the server has answered', () => {
  it('its item replaces the one shown, by id', () => {
    const saved = need('milk', { done: { at: instant(999), by: me } })
    const landed = tap.landItem([need('milk', { done: { at: now, by: me } }), need('eggs')], saved)
    expect(landed[0]).toBe(saved)
    expect(landed[1]).toMatchObject({ id: 'eggs' })
  })

  it('its poll replaces the one shown, and its feeling (or none) replaces mine', () => {
    const saved = { id: 'p1', votes: [] } as unknown as Poll
    expect(tap.landPoll([{ id: 'p1', votes: [1] } as unknown as Poll], saved)[0]).toBe(saved)

    const shown: Feeling[] = [
      { itemId: id('milk'), by: sam, kind: 'anxious', at: earlier },
      { itemId: id('milk'), by: me, kind: 'fine', at: now },
    ]
    const mine: Feeling = { itemId: id('milk'), by: me, kind: 'fine', at: instant(999) }
    expect(tap.landFeeling(shown, mine, { itemId: id('milk') }, ctx)).toEqual([shown[0], mine])
    expect(tap.landFeeling(shown, null, { itemId: id('milk') }, ctx)).toEqual([shown[0]])
  })
})

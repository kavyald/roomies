// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { asMember, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { makeCreateItem } from '@/lib/app/items'
import { makeCreatePoll } from '@/lib/app/polls'
import { makeStartRun } from '@/lib/app/runs'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import { depsForTest } from '@/lib/compose'
import type { DomainEvent } from '@/lib/domain/events'
import type { UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { sampleHouse } from '@/lib/testing/sample-house'
import { ActivityScreen } from './ActivityScreen'

afterEach(cleanup)

/** Each line's sentence (its first text block), top to bottom across the day sections. */
const lineTexts = () =>
  screen
    .getAllByRole('listitem')
    .map((li) => li.querySelector('[data-line-text]')?.textContent ?? '')

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const record = (events: DomainEvent[]) =>
    deps.uow.run(system(s.house.id), (r) => r.events.record(s.house.id, events, deps.clock.now()))
  const renderAs = (userId: UserId) =>
    render(
      <AppClientProvider
        client={fakeAppClient(deps.uow, asMember(s.house.id, userId))}
        queryClient={makeQueryClient()}
      >
        <ActivityScreen houseId={s.house.id} />
      </AppClientProvider>,
    )
  return { deps, s, record, renderAs }
}

describe('ActivityScreen', () => {
  it('shows one line per action, newest first, with invites for admins only', async () => {
    const { deps, s, record, renderAs } = await setup()
    const { Kavya, Sam, Wren } = s.people
    await record([{ kind: 'house.created', actionId: deps.ids.newId(), by: Kavya }])
    const joined = deps.ids.newId<'action'>()
    await record([
      { kind: 'member.joined', memberId: Sam, actionId: joined as never, by: Sam },
      {
        kind: 'member.room_changed',
        memberId: Sam,
        roomId: s.rooms.Fire!.id,
        actionId: joined as never,
        by: Sam,
      },
    ])
    await record([
      { kind: 'invite.created', payload: { maxUses: 2 }, actionId: deps.ids.newId(), by: Kavya },
    ])
    await record([
      {
        kind: 'contact.created',
        contactId: s.contacts.super.id,
        actionId: deps.ids.newId(),
        by: Wren,
      },
    ])

    renderAs(Kavya) // an admin
    expect(await screen.findAllByRole('heading', { level: 2 })).toBeTruthy()
    expect(lineTexts()).toEqual([
      'Wren added Super to contacts',
      'Kavya made an invite link',
      'Sam joined the house',
      'Kavya set up the house',
    ])
    cleanup()

    renderAs(Wren) // not an admin
    await screen.findAllByRole('heading', { level: 2 })
    expect(lineTexts()).not.toContain('Kavya made an invite link')
  })

  it('loads earlier pages on request', async () => {
    const { deps, s, record, renderAs } = await setup()
    for (let i = 0; i < 35; i++) {
      await record([
        {
          kind: 'contact.edited',
          contactId: s.contacts.super.id,
          actionId: deps.ids.newId(),
          by: s.people.Jo,
        },
      ])
    }
    await record([{ kind: 'house.created', actionId: deps.ids.newId(), by: s.people.Kavya }])
    renderAs(s.people.Jo)
    await screen.findAllByRole('heading', { level: 2 })
    expect(lineTexts()).toHaveLength(30)
    await userEvent.click(screen.getByRole('button', { name: 'Show earlier' }))
    expect(await screen.findByText('Kavya set up the house')).toBeTruthy()
    expect(lineTexts()).toHaveLength(36)
    expect(screen.queryByRole('button', { name: 'Show earlier' })).toBeNull()
  })

  it('names items, runs and polls, offers them to open, and filters by topic (T40)', async () => {
    const { deps, s, renderAs } = await setup()
    const as = asMember(s.house.id, s.people.Wren)
    const milk = await makeCreateItem(deps)(as, { category: 'need', title: 'Milk' })
    if (!milk.ok) throw new Error(milk.error)
    const run = await makeStartRun(deps)(as, { itemIds: [milk.value.id] })
    if (!run.ok) throw new Error(run.error)
    const poll = await makeCreatePoll(deps)(as, {
      question: 'Which vacuum?',
      options: [{ label: 'Dyson' }, { label: 'Shark' }],
    })
    if (!poll.ok) throw new Error(poll.error)

    renderAs(s.people.Kavya)
    await screen.findAllByRole('heading', { level: 2 })
    const texts = lineTexts()
    expect(texts).toContain('Wren asked “Which vacuum?”')
    expect(texts).toContain('Wren added Milk')
    expect(texts.join(' ')).not.toMatch(/something|a run\b|a poll\b/)
    // Lines about a thing are buttons named by their words; the icon row says what it is.
    expect(screen.getByRole('button', { name: /Wren added Milk/ }).textContent).toContain('Need')
    expect(screen.getByRole('button', { name: /Wren asked “Which vacuum\?”/ })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Polls & runs' }))
    expect(lineTexts().every((t) => !t.includes('Milk') || t.includes('run'))).toBe(true)
    expect(lineTexts()).toContain('Wren asked “Which vacuum?”')
    await userEvent.click(screen.getByRole('button', { name: 'Money' }))
    expect(screen.getByText('Nothing like that yet.')).toBeTruthy()
  })

  it('has a friendly empty state', async () => {
    const { s, renderAs } = await setup()
    renderAs(s.people.Kavya)
    expect(await screen.findByText('Nothing has happened yet. It all starts here.')).toBeTruthy()
  })
})

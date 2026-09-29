// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { asMember, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import { depsForTest } from '@/lib/compose'
import type { DomainEvent } from '@/lib/domain/events'
import type { UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { sampleHouse } from '@/lib/testing/sample-house'
import { ActivityScreen } from './ActivityScreen'

afterEach(cleanup)

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
    const feed = await screen.findByRole('list', { name: 'Activity' })
    expect(
      within(feed)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('p')!.textContent),
    ).toEqual([
      'Wren added Super to contacts',
      'Kavya made an invite link',
      'Sam joined the house',
      'Kavya set up the house',
    ])
    cleanup()

    renderAs(Wren) // not an admin
    const theirs = await screen.findByRole('list', { name: 'Activity' })
    expect(within(theirs).queryByText('Kavya made an invite link')).toBeNull()
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
    const feed = await screen.findByRole('list', { name: 'Activity' })
    expect(within(feed).getAllByRole('listitem')).toHaveLength(30)
    await userEvent.click(screen.getByRole('button', { name: 'Show earlier' }))
    expect(await screen.findByText('Kavya set up the house')).toBeTruthy()
    expect(within(feed).getAllByRole('listitem')).toHaveLength(36)
    expect(screen.queryByRole('button', { name: 'Show earlier' })).toBeNull()
  })

  it('has a friendly empty state', async () => {
    const { s, renderAs } = await setup()
    renderAs(s.people.Kavya)
    expect(await screen.findByText('Nothing has happened yet. It all starts here.')).toBeTruthy()
  })
})

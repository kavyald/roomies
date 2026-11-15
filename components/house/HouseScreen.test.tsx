// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { asMember, seedHouse, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { HouseId, UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { HouseScreen } from './HouseScreen'
import { ContactsScreen, RoommatesScreen } from './SetupScreens'

afterEach(cleanup)

const setup = async () => {
  const deps = depsForTest()
  const seeded = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  return { deps, ...seeded }
}

const renderAs = (
  deps: Awaited<ReturnType<typeof setup>>['deps'],
  houseId: HouseId,
  userId: UserId,
  ui: React.ReactNode,
) =>
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, asMember(houseId, userId))}
      queryClient={makeQueryClient()}
    >
      {ui}
    </AppClientProvider>,
  )

describe('HouseScreen (T107)', () => {
  it('has Polls, Calendar and Activity up top, then People, Chores, Money and Priority', async () => {
    const { deps, house, member } = await setup()
    renderAs(deps, house.id, member, <HouseScreen houseId={house.id} />)

    const polls = await screen.findByRole('heading', { name: 'Polls' })
    const calendar = screen.getByRole('link', { name: /^Calendar/ })
    expect(calendar.getAttribute('href')).toBe(`/h/${house.id}/calendar`)
    expect(calendar.textContent).toContain('Nothing this week')
    const activity = screen.getByRole('link', { name: /^Activity/ })
    expect(activity.getAttribute('href')).toBe(`/h/${house.id}/activity`)

    const groups = ['People', 'Chores', 'Money', 'Priority'].map((name) =>
      screen.getByRole('list', { name }),
    )
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(polls, calendar)).toBe(true)
    expect(follows(calendar, activity)).toBe(true)
    expect(follows(activity, groups[0]!)).toBe(true)
    groups.slice(1).forEach((g, i) => expect(follows(groups[i]!, g)).toBe(true))

    const [people, chores, money, priority] = groups.map((g) => within(g!))
    expect(people!.getByRole('link', { name: /^Roommates/ }).getAttribute('href')).toBe(
      `/h/${house.id}/house/roommates`,
    )
    expect(people!.getByRole('link', { name: /^Contacts/ }).getAttribute('href')).toBe(
      `/h/${house.id}/house/contacts`,
    )
    expect(chores!.getByRole('link', { name: /^Routines/ })).toBeTruthy()
    expect(chores!.getByRole('button', { name: /^Rooms/ })).toBeTruthy()
    expect(await money!.findByRole('button', { name: /^Splitwise/ })).toBeTruthy()
    expect(priority!.getByRole('button', { name: /^How feelings raise priority/ })).toBeTruthy()

    // Nothing personal: those live on You.
    expect(screen.queryByRole('button', { name: /Sign out|Delete my account/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Notifications' })).toBeNull()
  })

  it('names the roommates row for invites only for organizers', async () => {
    const { deps, house, admin } = await setup()
    renderAs(deps, house.id, admin, <HouseScreen houseId={house.id} />)
    expect(await screen.findByRole('link', { name: /^Roommates and invites/ })).toBeTruthy()
  })
})

describe('the People pages (reads through useX hooks with a fake AppClient)', () => {
  it('lists roommates with their room colors, and the house contacts', async () => {
    const { deps, house, admin, member } = await setup()
    const waterId = deps.ids.newId<'room'>()
    await deps.uow.run(system(house.id), async (r) => {
      await r.rooms.save({
        id: waterId as never,
        houseId: house.id,
        name: 'Water',
        floor: 'first',
        kind: 'bedroom',
        element: 'water',
        sortOrder: 1,
      })
      const m = await r.members.get(house.id, member)
      await r.members.save({ ...m!, roomId: waterId as never })
      await r.contacts.save({
        id: deps.ids.newId(),
        houseId: house.id,
        name: 'Super',
        phone: '(555) 010-2231',
      })
    })

    renderAs(deps, house.id, admin, <RoommatesScreen houseId={house.id} />)
    const roommates = await screen.findByRole('list', { name: 'Roommates' })
    // Organizers can manage each roommate, so rows are buttons; the avatar's label is part of the name.
    expect(await within(roommates).findByRole('button', { name: /Wren, Water room/ })).toBeTruthy()
    expect(within(roommates).getByText('Kavya (you)')).toBeTruthy()
    expect(within(roommates).queryByText('Organizer')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Invite a roommate' })).toBeTruthy()
    cleanup()

    renderAs(deps, house.id, admin, <ContactsScreen houseId={house.id} />)
    const contacts = await screen.findByRole('list', { name: 'Contacts' })
    expect(within(contacts).getByText('Super')).toBeTruthy()
    expect(within(contacts).getByText('(555) 010-2231')).toBeTruthy()
  })

  it('shows the empty state when there are no contacts', async () => {
    const { deps, house, member } = await setup()
    renderAs(deps, house.id, member, <ContactsScreen houseId={house.id} />)
    expect(await screen.findByText('No contacts yet. Add the super or the landlord.')).toBeTruthy()
  })

  it("shows nothing of a house you're not in", async () => {
    const { deps, house } = await setup()
    const stranger = deps.ids.newId<'user'>() as UserId
    renderAs(deps, house.id, stranger, <RoommatesScreen houseId={house.id} />)
    expect(await screen.findByText('Your roommates will show up here once they join.')).toBeTruthy()
  })
})

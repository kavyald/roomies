// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { asMember, seedHouse, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { HouseScreen } from './HouseScreen'

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
  houseId: Parameters<typeof HouseScreen>[0]['houseId'],
  userId: UserId,
) =>
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, asMember(houseId, userId))}
      queryClient={makeQueryClient()}
    >
      <HouseScreen houseId={houseId} />
    </AppClientProvider>,
  )

describe('HouseScreen (reads through useX hooks with a fake AppClient)', () => {
  it('lists roommates with their room colors and the house contacts', async () => {
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

    renderAs(deps, house.id, admin)

    const roommates = await screen.findByRole('list', { name: 'Roommates' })
    // Admins can manage each roommate, so rows are buttons; the avatar's label is part of the name.
    expect(await within(roommates).findByRole('button', { name: /Wren, Water room/ })).toBeTruthy()
    expect(within(roommates).getByText('Kavya (you)')).toBeTruthy()
    expect(within(roommates).getByText('Admin')).toBeTruthy()
    const contacts = screen.getByRole('list', { name: 'Contacts' })
    expect(within(contacts).getByText('Super')).toBeTruthy()
    expect(within(contacts).getByText('(555) 010-2231')).toBeTruthy()
  })

  it('shows the empty state when there are no contacts', async () => {
    const { deps, house, member } = await setup()
    renderAs(deps, house.id, member)
    expect(await screen.findByText('No contacts yet. Add the super or the landlord.')).toBeTruthy()
  })

  it("shows nothing of a house you're not in", async () => {
    const { deps, house } = await setup()
    const stranger = deps.ids.newId<'user'>() as UserId
    renderAs(deps, house.id, stranger)
    expect(await screen.findByText('Your roommates will show up here once they join.')).toBeTruthy()
    expect(screen.getByText('No contacts yet. Add the super or the landlord.')).toBeTruthy()
  })
})

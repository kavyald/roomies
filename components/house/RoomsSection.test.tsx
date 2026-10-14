// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeMoveRoom, makeRenameRoom } from '@/lib/app/house'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { RoomId, UserId } from '@/lib/domain/ids'
import type { Room } from '@/lib/domain/house'
import { fakeAppClient } from '@/lib/testing/app-client'
import { ToastProvider } from '@/components/ui/Toast'
import { RoomsSection } from './RoomsSection'

afterEach(cleanup)
beforeAll(() => {
  // Vaul (the sheet) asks for these; jsdom has neither.
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

const setup = async () => {
  const deps = depsForTest()
  const { house, admin } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const room = (name: string, sortOrder: number, extra: Partial<Room>): Room => ({
    id: deps.ids.newId<'room'>() as RoomId,
    houseId: house.id,
    name,
    floor: 'first',
    kind: 'common',
    sortOrder,
    ...extra,
  })
  await deps.uow.run(system(house.id), async (r) => {
    await r.rooms.save(room('Fire', 1, { kind: 'bedroom', element: 'fire' }))
    await r.rooms.save(room('Water', 2, { kind: 'bedroom', element: 'water' }))
    await r.rooms.save(room('Craft room', 3, {}))
  })
  const me = asMember(house.id, admin)
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, me, {
        renameRoom: (i) => makeRenameRoom(deps)(me, i),
        moveRoom: (i) => makeMoveRoom(deps)(me, i),
      })}
      queryClient={makeQueryClient()}
    >
      <ToastProvider>
        <RoomsSection houseId={house.id} />
      </ToastProvider>
    </AppClientProvider>,
  )
  return { deps }
}

describe('House → Rooms (T66)', () => {
  it('is one row that opens the rooms by group as plain names, renamed in place', async () => {
    const { deps } = await setup()
    const user = userEvent.setup()
    const row = within(screen.getByRole('list', { name: 'Rooms' })).getByRole('button')
    await waitFor(() => expect(row.textContent).toContain('3 rooms'))
    await user.click(row)

    const sheet = await screen.findByRole('dialog', { name: 'Rooms' })
    const bedrooms = within(sheet).getByRole('list', { name: 'Bedrooms' })
    expect(
      within(bedrooms)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Fire', 'Water'])
    expect(within(sheet).queryByRole('list', { name: 'Bathrooms' })).toBeNull()
    // Plain names: no element icons, only the edit Pencil each row ends with (T68).
    for (const list of within(sheet).getAllByRole('list'))
      for (const svg of list.querySelectorAll('svg'))
        expect(svg.classList.contains('lucide-pencil')).toBe(true)

    const spaces = within(sheet).getByRole('list', { name: 'Spaces' })
    await user.click(within(spaces).getByRole('button', { name: 'Craft room, shared space' }))
    const edit = within(spaces).getByRole('group', { name: 'Edit Craft room, shared space' })
    const name = within(edit).getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Studio{Enter}')
    expect(await within(spaces).findByRole('button', { name: 'Studio, shared space' })).toBeTruthy()
    expect([...deps.uow.state.rooms.values()].some((r) => r.name === 'Studio')).toBe(true)

    // Move a bedroom later; at the edge it says so.
    await user.click(within(bedrooms).getByRole('button', { name: 'Fire, bedroom' }))
    const fire = within(bedrooms).getByRole('group', { name: 'Edit Fire, bedroom' })
    await user.click(within(fire).getByRole('button', { name: /Move later/ }))
    await waitFor(() =>
      expect(within(bedrooms).getAllByRole('listitem')[1]?.textContent).toContain('Move later'),
    )
    await user.click(within(fire).getByRole('button', { name: /Move later/ }))
    expect(await screen.findByText("It's already last in bedrooms.")).toBeTruthy()
    await user.click(within(fire).getByRole('button', { name: 'Cancel' }))
    expect(
      within(bedrooms)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Water', 'Fire'])
  })
})

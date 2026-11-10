// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeMoveRoom, makeRenameRoom } from '@/lib/app/house'
import {
  makeAddRoomChores,
  makeArchiveItem,
  makeCreateItem,
  makeRestoreItem,
} from '@/lib/app/items'
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
  Element.prototype.hasPointerCapture ??= () => false
})

const setup = async () => {
  const deps = depsForTest()
  const { house, admin } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const room = (name: string, sortOrder: number, extra: Partial<Room> = {}): Room => ({
    id: deps.ids.newId<'room'>() as RoomId,
    houseId: house.id,
    name,
    floor: 'first',
    kind: 'common',
    sortOrder,
    ...extra,
  })
  const rooms = {
    fire: room('Fire', 1, { kind: 'bedroom', element: 'fire' }),
    water: room('Water', 2, { kind: 'bedroom', element: 'water' }),
    kitchen: room('Kitchen', 3),
    hallway: room('Hallway', 4),
  }
  await deps.uow.run(system(house.id), async (r) => {
    for (const x of Object.values(rooms)) await r.rooms.save(x)
  })
  const me = asMember(house.id, admin)
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, me, {
        renameRoom: (i) => makeRenameRoom(deps)(me, i),
        moveRoom: (i) => makeMoveRoom(deps)(me, i),
        addRoomChores: (i) => makeAddRoomChores(deps)(me, i) as never,
        archiveItem: (id) => makeArchiveItem(deps)(me, id) as never,
        restoreItem: (id) => makeRestoreItem(deps)(me, id) as never,
      })}
      queryClient={makeQueryClient()}
    >
      <ToastProvider>
        <RoomsSection houseId={house.id} />
      </ToastProvider>
    </AppClientProvider>,
  )
  const chores = (roomId: RoomId) =>
    [...deps.uow.state.items.values()].filter(
      (i) => i.category === 'chore' && !i.archivedAt && i.rooms.includes(roomId),
    )
  const openRoom = async (label: string, title: string) => {
    if (!screen.queryByRole('dialog', { name: 'Rooms' }))
      await userEvent.click(within(screen.getByRole('list', { name: 'Rooms' })).getByRole('button'))
    await userEvent.click(await screen.findByRole('button', { name: label }))
    return screen.findByRole('dialog', { name: title })
  }
  return { deps, me, rooms, chores, openRoom }
}

describe('Admin → Rooms (T66, T101)', { timeout: 20_000 }, () => {
  it('is one row that opens the rooms by group; a room opens its own sheet to rename or move', async () => {
    const { deps } = await setup()
    const user = userEvent.setup()
    const row = within(screen.getByRole('list', { name: 'Rooms' })).getByRole('button')
    await waitFor(() => expect(row.textContent).toContain('4 rooms'))
    await user.click(row)

    const sheet = await screen.findByRole('dialog', { name: 'Rooms' })
    const bedroomNames = () =>
      within(screen.getByRole('list', { name: 'Bedrooms' }))
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'))
    expect(bedroomNames()).toEqual(['Fire, bedroom', 'Water, bedroom'])
    expect(within(sheet).queryByRole('list', { name: 'Bathrooms' })).toBeNull()
    // Plain names: no element icons, only the chevron each row ends with.
    for (const list of within(sheet).getAllByRole('list'))
      for (const svg of list.querySelectorAll('svg'))
        expect(svg.classList.contains('lucide-chevron-right')).toBe(true)
    expect(sheet.textContent).toContain('No chores yet')

    await user.click(within(sheet).getByRole('button', { name: 'Kitchen, shared space' }))
    const kitchen = await screen.findByRole('dialog', { name: 'Kitchen' })
    await user.click(within(kitchen).getByRole('button', { name: 'Rename or move' }))
    const edit = within(kitchen).getByRole('group', { name: 'Edit Kitchen, shared space' })
    const name = within(edit).getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Galley{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Galley' })).toBeTruthy()
    expect([...deps.uow.state.rooms.values()].some((r) => r.name === 'Galley')).toBe(true)
    await user.keyboard('{Escape}')

    // Move a bedroom later; at the edge it says so.
    await user.click(await screen.findByRole('button', { name: 'Fire, bedroom' }))
    const fireSheet = await screen.findByRole('dialog', { name: 'Fire' })
    await user.click(within(fireSheet).getByRole('button', { name: 'Rename or move' }))
    const fire = within(fireSheet).getByRole('group', { name: 'Edit Fire, bedroom' })
    await user.click(within(fire).getByRole('button', { name: /Move later/ }))
    await user.click(within(fire).getByRole('button', { name: /Move later/ }))
    expect(await screen.findByText("It's already last in bedrooms.")).toBeTruthy()
    await user.click(within(fire).getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(bedroomNames()).toEqual(['Water, bedroom', 'Fire, bedroom']))
  })

  it('picks chores by name, adds several at once, and offers the same names for the next room', async () => {
    const { rooms, chores, openRoom } = await setup()
    const sheet = await openRoom('Kitchen, shared space', 'Kitchen')
    expect(sheet.textContent).toContain('No chores here yet.')
    expect(sheet.textContent).toContain('isn’t in a routine yet')

    const picks = within(sheet).getByRole('list', { name: 'Chores to add' })
    await userEvent.click(within(picks).getByRole('button', { name: 'Vacuum' }))
    await userEvent.click(within(picks).getByRole('button', { name: 'Swiffer' }))
    await userEvent.click(within(picks).getByRole('button', { name: 'New chore' }))
    await userEvent.type(within(sheet).getByLabelText('What needs doing?'), 'Descale kettle')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))

    const list = await within(sheet).findByRole('list', { name: 'Kitchen chores' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Descale kettle', 'Swiffer', 'Vacuum'])
    expect(
      chores(rooms.kitchen.id).map((c) => c.category === 'chore' && [c.title, c.kind, c.icon]),
    ).toEqual(
      expect.arrayContaining([
        ['Vacuum', 'deep_clean', 'robot-vacuum'],
        ['Swiffer', 'deep_clean', 'mop'],
        ['Descale kettle', 'deep_clean', 'coffee'],
      ]),
    )
    // The kitchen has them now, so they aren't offered again here.
    expect(within(picks).queryByRole('button', { name: 'Vacuum' })).toBeNull()

    // The hallway is offered the kitchen's own names, its new one included.
    await userEvent.keyboard('{Escape}')
    const hall = await openRoom('Hallway, shared space', 'Hallway')
    const hallPicks = within(hall).getByRole('list', { name: 'Chores to add' })
    await userEvent.click(within(hallPicks).getByRole('button', { name: 'Descale kettle' }))
    await userEvent.click(within(hallPicks).getByRole('button', { name: 'Vacuum' }))
    await userEvent.click(within(hall).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(chores(rooms.hallway.id)).toHaveLength(2))
    // Each room has its own copy.
    expect(chores(rooms.kitchen.id)).toHaveLength(3)
  })

  it('searches the picks whatever the case', async () => {
    const { openRoom } = await setup()
    const sheet = await openRoom('Kitchen, shared space', 'Kitchen')
    const search = within(sheet).getByRole('searchbox', { name: 'Search chores' })
    const picks = within(sheet).getByRole('list', { name: 'Chores to add' })
    const names = () =>
      within(picks)
        .getAllByRole('button')
        .map((b) => b.textContent)
    await userEvent.type(search, 'cLeAn')
    expect(names()).toEqual([
      'Clean sink',
      'Clean mirror',
      'Clean shower',
      'Clean fridge',
      'New chore',
    ])
    await userEvent.clear(search)
    await userEvent.type(search, 'wipe{Enter}')
    expect(names()).toEqual(['Wipe counters', 'Wipe stove', 'New chore'])
    expect(screen.getByRole('dialog', { name: 'Kitchen' })).toBeTruthy()
  })

  it('removes a chore from the room, with Undo', async () => {
    const { deps, me, rooms, chores, openRoom } = await setup()
    await makeCreateItem(deps)(me, {
      category: 'chore',
      title: 'Wipe stove',
      kind: 'deep_clean',
      rooms: [rooms.kitchen.id],
    })
    const sheet = await openRoom('Kitchen, shared space', 'Kitchen')
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Remove Wipe stove' }))
    await waitFor(() => expect(chores(rooms.kitchen.id)).toHaveLength(0))
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(chores(rooms.kitchen.id)).toHaveLength(1))
  })
})

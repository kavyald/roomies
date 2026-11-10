// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import {
  makeAddRoomChores,
  makeCreateItem,
  makeDoChore,
  makeSetFeeling,
  makeUndoChore,
} from '@/lib/app/items'
import { makeCreateRoutine } from '@/lib/app/routines'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { Room } from '@/lib/domain/house'
import type { RoomId, UserId } from '@/lib/domain/ids'
import { instant } from '@/lib/domain/time'
import { fakeAppClient } from '@/lib/testing/app-client'
import { fixedClock } from '@/lib/testing/clock'
import { ToastProvider } from '@/components/ui/Toast'
import { ItemSheetsProvider } from '@/components/items/ItemSheets'
import { ChoresScreen } from './ChoresScreen'

afterEach(cleanup)
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
})

const setup = async () => {
  // The screen reads the real time (useNow), and a tick only counts in the current period.
  const deps = depsForTest({ clock: fixedClock(instant(Date.now())) })
  const { house, admin, member } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const me = asMember(house.id, admin)
  const wren = asMember(house.id, member)
  const room = (name: string, sortOrder: number): Room => ({
    id: deps.ids.newId() as RoomId,
    houseId: house.id,
    name,
    floor: 'first',
    kind: 'common',
    sortOrder,
  })
  const [kitchen, dining, garden] = [room('Kitchen', 1), room('Dining', 2), room('Garden', 3)]
  await deps.uow.run(asMember(house.id, admin), async (r) => {
    for (const x of [kitchen, dining, garden]) await r.rooms.save(x)
  })
  const routine = async (name: string, who: UserId, roomIds: RoomId[]) => {
    const made = await makeCreateRoutine(deps)(me, {
      name,
      icon: 'broom',
      resets: 'weekly',
      who: { takesTurns: false, fixedMember: who },
      roomIds,
    })
    if (!made.ok) throw new Error(made.error)
  }
  await routine('Kitchen and dining', admin, [kitchen.id, dining.id])
  await routine('Garden', member, [garden.id])

  const add = async (input: Parameters<ReturnType<typeof makeCreateItem>>[1]) => {
    const made = await makeCreateItem(deps)(me, input)
    if (!made.ok) throw new Error(made.error)
    return made.value
  }
  const client = fakeAppClient(deps.uow, me, {
    createItem: (i) => makeCreateItem(deps)(me, i) as never,
    doChore: (id) => makeDoChore(deps)(me, id) as never,
    undoChore: (i) => makeUndoChore(deps)(me, { id: i.id, doneAt: instant(i.doneAt) }) as never,
    setFeeling: (i) => makeSetFeeling(deps)(me, i) as never,
    addRoomChores: (i) => makeAddRoomChores(deps)(me, i) as never,
  })
  const show = () =>
    render(
      <AppClientProvider client={client} queryClient={makeQueryClient()}>
        <ToastProvider>
          <ItemSheetsProvider houseId={house.id}>
            <ChoresScreen houseId={house.id} />
          </ItemSheetsProvider>
        </ToastProvider>
      </AppClientProvider>,
    )
  return { deps, me, wren, add, show, kitchen, dining, garden }
}

const lastDone = (deps: ReturnType<typeof depsForTest>, title: string) => {
  const c = [...deps.uow.state.items.values()].find((i) => i.title === title)
  return c?.category === 'chore' ? c.lastDone : undefined
}

describe('the Chores tab (FRONTEND §5.6, T101)', { timeout: 20_000 }, () => {
  it("says what you have, puts your rooms first as boxes, and keeps housemates' progress out", async () => {
    const { add, show, kitchen, garden } = await setup()
    await add({ category: 'chore', title: 'Sink', kind: 'deep_clean', rooms: [kitchen.id] })
    await add({ category: 'chore', title: 'Weeds', kind: 'deep_clean', rooms: [garden.id] })
    show()

    const mine = await screen.findByRole('group', { name: 'Kitchen and dining, Kavya' })
    const theirs = screen.getByRole('group', { name: 'Garden, Wren' })
    expect(mine.compareDocumentPosition(theirs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Your room ticks right there; the dining room has no chores, so it has no box.
    const kitchenBox = within(mine).getByRole('region', { name: 'Kitchen, Kavya' })
    expect(within(kitchenBox).getByRole('button', { name: 'Did it: Sink' })).toBeTruthy()
    expect(within(mine).queryByRole('region', { name: /^Dining/ })).toBeNull()
    // A housemate's room is one button with its chores' icons and no ticks.
    const garden_ = within(theirs).getByRole('button', { name: 'Garden, Wren' })
    expect(within(theirs).queryByRole('button', { name: /^Did it/ })).toBeNull()
    expect(garden_.querySelectorAll('svg').length).toBe(1)
    expect(screen.getByText(/you have the kitchen and dining · through/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/routine/i)
  })

  it('ticks in your box with Undo, and tapping a ticked chore undoes it', async () => {
    const { add, show, kitchen, deps } = await setup()
    await add({ category: 'chore', title: 'Sink', kind: 'deep_clean', rooms: [kitchen.id] })
    show()
    const box = await screen.findByRole('region', { name: 'Kitchen, Kavya' })

    await userEvent.click(within(box).getByRole('button', { name: 'Did it: Sink' }))
    await waitFor(() => expect(lastDone(deps, 'Sink')).toBeDefined())
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(lastDone(deps, 'Sink')).toBeUndefined())

    const tick = within(box).getByRole('button', { name: 'Did it: Sink' })
    await userEvent.click(tick)
    await waitFor(() => expect(tick.getAttribute('aria-pressed')).toBe('true'))
    expect(box.textContent).toContain('✨')
    await userEvent.click(tick)
    await waitFor(() => expect(tick.getAttribute('aria-pressed')).toBe('false'))
    expect(lastDone(deps, 'Sink')).toBeUndefined()
  })

  it("won't undo a housemate's tick", async () => {
    const { add, show, kitchen, deps, wren } = await setup()
    const sink = await add({
      category: 'chore',
      title: 'Sink',
      kind: 'deep_clean',
      rooms: [kitchen.id],
    })
    await makeDoChore(deps)(wren, sink.id)
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Did it: Sink' }))
    expect(await screen.findByText(/Only they can undo it/)).toBeTruthy()
    expect(lastDone(deps, 'Sink')).toBeDefined()
  })

  it("opens a housemate's room, where anyone can tick and see what's done", async () => {
    const { add, show, garden, deps } = await setup()
    await add({ category: 'chore', title: 'Weeds', kind: 'deep_clean', rooms: [garden.id] })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Garden, Wren' }))
    const sheet = await screen.findByRole('dialog', { name: 'Garden' })
    // The toast sits outside the open sheet; jsdom doesn't load its pointer-events-auto.
    await userEvent.click(within(sheet).getByRole('button', { name: 'Did it: Weeds' }))
    await waitFor(() => expect(lastDone(deps, 'Weeds')).toBeDefined())
    expect(
      within(sheet).getByRole('button', { name: 'Did it: Weeds' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('+ Add on a group gives any of its rooms chores, searched whatever the case', async () => {
    const { show, deps, dining } = await setup()
    show()
    // No chores yet: the groups still show, each with + Add.
    const mine = await screen.findByRole('group', { name: 'Kitchen and dining, Kavya' })
    expect(mine.textContent).toContain('No chores here yet.')
    await userEvent.click(
      within(mine).getByRole('button', { name: 'Add chores: Kitchen and dining' }),
    )
    const sheet = await screen.findByRole('dialog', { name: 'Add chores' })
    await userEvent.selectOptions(within(sheet).getByLabelText('Room'), 'Dining')
    await userEvent.type(within(sheet).getByRole('searchbox', { name: 'Search chores' }), 'SWIF')
    const picks = within(sheet).getByRole('list', { name: 'Chores to add' })
    expect(
      within(picks)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Swiffer', 'New chore'])
    await userEvent.click(within(picks).getByRole('button', { name: 'Swiffer' }))
    // A search with no match becomes the new chore's name.
    await userEvent.clear(within(sheet).getByRole('searchbox', { name: 'Search chores' }))
    await userEvent.type(
      within(sheet).getByRole('searchbox', { name: 'Search chores' }),
      'polish table',
    )
    expect(sheet.textContent).toContain('No chore by that name yet.')
    // The pick stays in view while searching.
    expect(within(picks).getByRole('button', { name: 'Swiffer' })).toBeTruthy()
    await userEvent.click(within(picks).getByRole('button', { name: 'New chore' }))
    expect(within(sheet).getByLabelText<HTMLInputElement>('What needs doing?').value).toBe(
      'polish table',
    )
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))

    const box = await screen.findByRole('region', { name: 'Dining, Kavya' })
    expect(within(box).getByRole('button', { name: 'Did it: Swiffer' })).toBeTruthy()
    expect(within(box).getByRole('button', { name: 'Did it: polish table' })).toBeTruthy()
    const added = [...deps.uow.state.items.values()].filter(
      (i) => i.category === 'chore' && i.rooms.includes(dining.id),
    )
    expect(added.map((c) => c.category === 'chore' && c.kind)).toEqual(['deep_clean', 'deep_clean'])
  })

  it("adds more chores from a room's sheet", async () => {
    const { add, show, garden, deps } = await setup()
    await add({ category: 'chore', title: 'Weeds', kind: 'deep_clean', rooms: [garden.id] })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Garden, Wren' }))
    const sheet = await screen.findByRole('dialog', { name: 'Garden' })
    const picks = within(sheet).getByRole('list', { name: 'Chores to add' })
    expect(within(picks).queryByRole('button', { name: 'Weeds' })).toBeNull()
    await userEvent.click(within(picks).getByRole('button', { name: 'Water plants' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))
    expect(await within(sheet).findByRole('button', { name: 'Did it: Water plants' })).toBeTruthy()
    expect(
      [...deps.uow.state.items.values()].filter(
        (i) => i.category === 'chore' && i.rooms.includes(garden.id),
      ),
    ).toHaveLength(2)
  })

  it('+ Add in Upkeep adds Upkeep, with the icon its name suggests', async () => {
    const { add, show, deps } = await setup()
    await add({ category: 'chore', title: 'Dishes' })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Upkeep' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add to Upkeep' })
    await userEvent.type(within(sheet).getByLabelText('What needs doing?'), 'Take out trash')
    const suggested = within(sheet).getByRole('group', { name: 'Suggested icons' })
    expect(
      within(suggested).getByRole('button', { name: 'Trash' }).getAttribute('aria-pressed'),
    ).toBe('true')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))
    await screen.findByRole('button', { name: 'Share a feeling: Take out trash' })
    const trash = [...deps.uow.state.items.values()].find((i) => i.title === 'Take out trash')
    expect(trash).toMatchObject({ kind: 'upkeep', rooms: [], icon: 'trash-2' })
  })

  it('Upkeep: all calm, a chip opens the tray, and Took care of it quiets the feeling', async () => {
    const { add, show } = await setup()
    await add({ category: 'chore', title: 'Trash' })
    show()
    const upkeep = await screen.findByRole('region', { name: 'Upkeep' })
    expect(within(upkeep).getByText('All calm')).toBeTruthy()

    await userEvent.click(
      await within(upkeep).findByRole('button', { name: 'Share a feeling: Trash' }),
    )
    await userEvent.click(within(upkeep).getByRole('button', { name: 'Frustrated' }))
    const took = await within(upkeep).findByRole('button', { name: 'Took care of it: Trash' })
    expect(within(upkeep).queryByText('All calm')).toBeNull()
    expect(upkeep.textContent).toContain('😤')

    await userEvent.click(took)
    await within(upkeep).findByText('All calm')
    await within(upkeep).findByRole('button', { name: 'Share a feeling: Trash' })
  })
})

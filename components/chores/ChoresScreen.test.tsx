// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeCreateItem, makeDoChore, makeSetFeeling, makeUndoChore } from '@/lib/app/items'
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

describe('the Chores tab (FRONTEND §5.6)', { timeout: 20_000 }, () => {
  it("says what you have, puts your card first, and shows only yours' progress", async () => {
    const { add, show, kitchen, garden } = await setup()
    await add({ category: 'chore', title: 'Sink', kind: 'deep_clean', rooms: [kitchen.id] })
    await add({ category: 'chore', title: 'Weeds', kind: 'deep_clean', rooms: [garden.id] })
    show()

    const cards = await screen.findByRole('list', { name: 'Who has what' })
    const [first, second] = within(cards).getAllByRole('button')
    expect(first!.getAttribute('aria-label')).toBe('Kitchen and dining, Kavya')
    expect(second!.getAttribute('aria-label')).toBe('Garden, Wren')
    expect(first!.querySelectorAll('svg').length).toBe(2) // its icon + its chore's
    expect(second!.querySelectorAll('svg').length).toBe(1) // its icon: no progress
    expect(screen.getByText(/you have the kitchen and dining · through/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/routine/i)
  })

  it('ticks with Undo, and tapping a ticked chore undoes it', async () => {
    const { add, show, kitchen, deps } = await setup()
    await add({ category: 'chore', title: 'Sink', kind: 'deep_clean', rooms: [kitchen.id] })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Kitchen and dining, Kavya' }))
    const sheet = await screen.findByRole('dialog', { name: 'Kitchen and dining' })

    await userEvent.click(within(sheet).getByRole('button', { name: 'Did it: Sink' }))
    await waitFor(() => expect(lastDone(deps, 'Sink')).toBeDefined())
    // The toast sits outside the open sheet; jsdom doesn't load its pointer-events-auto.
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(lastDone(deps, 'Sink')).toBeUndefined())

    const tick = within(sheet).getByRole('button', { name: 'Did it: Sink' })
    await userEvent.click(tick)
    await waitFor(() => expect(tick.getAttribute('aria-pressed')).toBe('true'))
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
    await userEvent.click(await screen.findByRole('button', { name: 'Kitchen and dining, Kavya' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Did it: Sink' }))
    expect(await screen.findByText(/Only they can undo it/)).toBeTruthy()
    expect(lastDone(deps, 'Sink')).toBeDefined()
  })

  it('shows a multi-room chore once, under its first room, naming its rooms', async () => {
    const { add, show, kitchen, dining } = await setup()
    await add({
      category: 'chore',
      title: 'Vacuum',
      kind: 'deep_clean',
      rooms: [dining.id, kitchen.id],
    })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Kitchen and dining, Kavya' }))
    const sheet = await screen.findByRole('dialog', { name: 'Kitchen and dining' })
    const inKitchen = within(sheet).getByRole('region', { name: 'Kitchen' })
    expect(inKitchen.textContent).toContain('Vacuum · kitchen, dining')
    expect(within(sheet).getByRole('region', { name: 'Dining' }).textContent).not.toContain(
      'Vacuum',
    )
  })

  it('+ Add in a room adds its Deep clean; + Add in Upkeep adds Upkeep', async () => {
    const { show, deps, kitchen } = await setup()
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Kitchen and dining, Kavya' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Kitchen' }))
    const add = await screen.findByRole('dialog', { name: 'Add to Kitchen' })
    await userEvent.type(within(add).getByLabelText('What needs doing?'), 'Oven')
    await userEvent.click(within(add).getByRole('button', { name: 'Spray can' }))
    await userEvent.click(within(add).getByRole('button', { name: 'Add' }))
    const back = await screen.findByRole('dialog', { name: 'Kitchen and dining' })
    expect(within(back).getByRole('button', { name: 'Did it: Oven' })).toBeTruthy()
    const oven = [...deps.uow.state.items.values()].find((i) => i.title === 'Oven')
    expect(oven).toMatchObject({ kind: 'deep_clean', icon: 'spray-can', rooms: [kitchen.id] })

    await userEvent.keyboard('{Escape}')
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Upkeep' }))
    const upkeep = await screen.findByRole('dialog', { name: 'Add to Upkeep' })
    await userEvent.type(within(upkeep).getByLabelText('What needs doing?'), 'Trash')
    await userEvent.click(within(upkeep).getByRole('button', { name: 'Add' }))
    await screen.findByRole('button', { name: 'Share a feeling: Trash' })
    const trash = [...deps.uow.state.items.values()].find((i) => i.title === 'Trash')
    expect(trash).toMatchObject({ kind: 'upkeep', rooms: [] })
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

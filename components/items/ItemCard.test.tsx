// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeCreateItem, makeMarkDone, makeReopenItem, makeSetFeeling } from '@/lib/app/items'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { NeedsScreen } from '@/components/needs/NeedsScreen'
import { TasksScreen } from '@/components/tasks/TasksScreen'
import { ToastProvider } from '@/components/ui/Toast'
import { SWIPE_THRESHOLD } from '@/components/ui/Swipeable'
import { ItemSheetsProvider } from './ItemSheets'

afterEach(cleanup)
// jsdom has no pointer capture; Vaul (the sheets) and Swipeable both ask for it.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
})

/** A house with one item, rendered on its tab with real use cases behind the commands. */
const setup = async (category: 'task' | 'need', title: string) => {
  const deps = depsForTest()
  const { house, admin } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const me = asMember(house.id, admin)
  const made = await makeCreateItem(deps)(me, { category, title })
  if (!made.ok) throw new Error(made.error)
  const client = fakeAppClient(deps.uow, me, {
    markDone: (id) => makeMarkDone(deps)(me, id) as never,
    reopenItem: (id) => makeReopenItem(deps)(me, id) as never,
    setFeeling: (i) => makeSetFeeling(deps)(me, i) as never,
  })
  const Screen = category === 'task' ? TasksScreen : NeedsScreen
  render(
    <AppClientProvider client={client} queryClient={makeQueryClient()}>
      <ToastProvider>
        <ItemSheetsProvider houseId={house.id}>
          <Screen houseId={house.id} />
        </ItemSheetsProvider>
      </ToastProvider>
    </AppClientProvider>,
  )
  return { deps, house, admin, id: made.value.id }
}

/** A finger drag across `el`'s swipe surface. */
const drag = (el: Element, dx: number, dy = 0) => {
  const surface = el.closest('[data-swipe]')!
  const at = { pointerId: 1, pointerType: 'touch', button: 0 }
  fireEvent.pointerDown(surface, { ...at, clientX: 200, clientY: 100 })
  for (let i = 1; i <= 4; i++)
    fireEvent.pointerMove(surface, {
      ...at,
      clientX: 200 + (dx * i) / 4,
      clientY: 100 + (dy * i) / 4,
    })
  fireEvent.pointerUp(surface, { ...at, clientX: 200 + dx, clientY: 100 + dy })
  fireEvent.click(surface)
}

describe('swipe on a card (FRONTEND §5.1)', { timeout: 20_000 }, () => {
  it('right finishes it, with Undo; a short or up-and-down drag does nothing', async () => {
    await setup('task', 'Fix the latch')
    const card = await screen.findByRole('button', { name: 'Fix the latch' })

    drag(card, SWIPE_THRESHOLD - 20) // not far enough
    drag(card, 20, 160) // a scroll
    expect(screen.queryByRole('dialog')).toBeNull() // and neither counted as a tap
    expect(screen.getByRole('button', { name: 'Fix the latch' })).toBeTruthy()

    drag(card, SWIPE_THRESHOLD + 30)
    const toast = await screen.findByText('Done. 💛')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Fix the latch' })).toBeNull())
    await userEvent.click(within(toast.parentElement!).getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('button', { name: 'Fix the latch' })).toBeTruthy()
  })

  it('left opens the emoji tray: one tap shares, tapping it again removes it', async () => {
    await setup('task', 'Fix the latch')
    const card = await screen.findByRole('button', { name: 'Fix the latch' })
    drag(card, -(SWIPE_THRESHOLD + 30))

    const tray = await screen.findByRole('group', { name: 'How do you feel about this?' })
    await waitFor(() =>
      expect(document.activeElement).toBe(within(tray).getByRole('button', { name: 'Anxious' })),
    )
    await userEvent.click(within(tray).getByRole('button', { name: 'Anxious' }))
    expect(await screen.findByText('Shared. The house can see how you feel. 💛')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a note' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'How do you feel about this?' })).toBeNull()
    expect(await screen.findByLabelText('Feelings: 1 anxious')).toBeTruthy()

    // 🙂+ opens it again with mine pressed; tapping it removes it.
    const feel = screen.getByRole('button', { name: 'Share a feeling: Fix the latch' })
    expect(document.activeElement).toBe(feel)
    await userEvent.click(feel)
    expect(feel.getAttribute('aria-expanded')).toBe('true')
    const anxious = screen.getByRole('button', { name: 'Anxious' })
    expect(anxious.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(anxious)
    expect(await screen.findByText('Removed your feeling.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByLabelText(/^Feelings:/)).toBeNull())
  })

  it('"Add a note" opens the item on a note for my feeling; Escape closes the tray', async () => {
    await setup('task', 'Fix the latch')
    const feel = await screen.findByRole('button', { name: 'Share a feeling: Fix the latch' })
    await userEvent.click(feel)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'How do you feel about this?' })).toBeNull()
    expect(document.activeElement).toBe(feel)

    await userEvent.click(feel)
    await userEvent.click(screen.getByRole('button', { name: 'Frustrated' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add a note' }))
    const detail = await screen.findByRole('dialog', { name: 'Fix the latch' })
    const note = await within(detail).findByLabelText('Add a note to your 😤')
    await userEvent.type(note, 'Third time this month')
    await userEvent.click(within(detail).getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Saved your note.')).toBeTruthy()
    const feels = within(detail).getByRole('region', { name: 'How the house feels' })
    expect(await within(feels).findByText('Third time this month')).toBeTruthy()
    // Adding the note kept it the same feeling: nothing moved to Earlier.
    expect(within(feels).queryByRole('button', { name: /Earlier/ })).toBeNull()
  })
})

describe('swipe on a Needs row (FRONTEND §5.5)', { timeout: 20_000 }, () => {
  it('right is Got it, with Undo', async () => {
    await setup('need', 'Olive oil')
    const row = await screen.findByRole('button', { name: 'Got it: Olive oil' })
    drag(row, SWIPE_THRESHOLD + 10)
    expect(await screen.findByText('Got Olive oil.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Needs' })).toBeNull())
  })
})

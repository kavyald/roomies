// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeCreateItem, makeReopenItem } from '@/lib/app/items'
import { makeAddToRun, makeFinishRun, makeMarkRunItemsDone, makeStartRun } from '@/lib/app/runs'
import type { AppCommands } from '@/lib/client/app-client'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { HouseId, RunId, UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { ToastProvider } from '@/components/ui/Toast'
import { RunSheet } from './RunSheet'
import { StartRunSheet } from './StartRunSheet'

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

/** Start a run → the run's sheet, as Needs wires them. */
function Flow({ houseId }: { houseId: HouseId }) {
  const [runId, setRunId] = useState<RunId | null>(null)
  return runId ? (
    <RunSheet houseId={houseId} runId={runId} onClose={() => {}} />
  ) : (
    <StartRunSheet houseId={houseId} onClose={() => {}} onStarted={setRunId} />
  )
}

const setup = async () => {
  const deps = depsForTest()
  const { house, admin } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const me = asMember(house.id, admin)
  for (const title of ['Milk', 'Eggs', 'Bread', 'Soap'])
    await makeCreateItem(deps)(me, { category: 'need', title })
  const commands: Partial<AppCommands> = {
    startRun: (i) => makeStartRun(deps)(me, i),
    markRunItemsDone: (i) => makeMarkRunItemsDone(deps)(me, i),
    reopenItem: (id) => makeReopenItem(deps)(me, id),
    addToRun: (i) => makeAddToRun(deps)(me, i),
    finishRun: (i) => makeFinishRun(deps)(me, i),
  }
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, me, commands)}
      queryClient={makeQueryClient()}
    >
      <ToastProvider>
        <Flow houseId={house.id} />
      </ToastProvider>
    </AppClientProvider>,
  )
  return { deps, admin }
}

describe('A grocery run in few taps (T44)', () => {
  it('starts with every need checked, marks rows done with one tap each (tap again puts one back), and finishes with an amount', async () => {
    const { deps, admin } = await setup()
    const user = userEvent.setup()

    // Every open need starts checked; uncheck what you won't get. Title and date wait behind More options.
    const start = await screen.findByRole('dialog', { name: 'Start a run' })
    const needs = await within(start).findByRole('list', { name: 'Open needs' })
    await waitFor(() => expect(within(needs).getAllByRole('checkbox')).toHaveLength(4))
    for (const box of within(needs).getAllByRole('checkbox'))
      expect((box as HTMLInputElement).checked).toBe(true)
    expect(within(start).queryByLabelText('Title (optional)')).toBeNull()
    await user.click(within(needs).getByRole('checkbox', { name: 'Soap' }))
    await user.click(within(start).getByRole('button', { name: 'Start run · 3 things' }))

    // The batch: a tap is done; a mis-tap is undone by tapping again.
    const run = await screen.findByRole('dialog', { name: "Kavya's run" })
    const rows = within(run).getByRole('list', { name: 'On this run' })
    const box = (name: string) => within(rows).getByRole('checkbox', { name: new RegExp(name) })
    await waitFor(() => expect(within(rows).getAllByRole('checkbox')).toHaveLength(3))
    for (const t of ['Milk', 'Eggs', 'Bread']) {
      await user.click(box(t))
      await waitFor(() => expect((box(t) as HTMLInputElement).checked).toBe(true))
    }
    await waitFor(() => expect(run.textContent).toContain('3 of 3 done'))
    await user.click(box('Bread'))
    await waitFor(() => expect((box('Bread') as HTMLInputElement).checked).toBe(false))
    await waitFor(() => expect(run.textContent).toContain('2 of 3 done'))
    await user.click(box('Bread'))
    await waitFor(() => expect(run.textContent).toContain('3 of 3 done'))

    // Finish with an amount: one cost on the run, paid by me; the toast offers Open Splitwise.
    await user.type(within(run).getByLabelText('Spent (optional)'), '40')
    expect((within(run).getByLabelText('Who paid') as HTMLSelectElement).value).toBe(admin)
    await user.click(within(run).getByRole('button', { name: 'Finish' }))
    const toast = await screen.findByText('Finished. $40.00 noted.')
    expect(
      within(toast.parentElement!).getByRole('button', { name: 'Open Splitwise' }),
    ).toBeTruthy()

    const { costs, items } = deps.uow.state
    expect(costs).toHaveLength(1)
    expect(costs[0]).toMatchObject({
      amount: 4000,
      paidBy: admin,
      for: { run: expect.any(String) },
    })
    const done = [...items.values()].filter((i) => i.category === 'need' && i.done)
    expect(done.map((i) => i.title).sort()).toEqual(['Bread', 'Eggs', 'Milk'])
  })

  it('finishes with no cost when the amount is empty, and holds Finish on something that is not an amount', async () => {
    const { deps } = await setup()
    const user = userEvent.setup()
    const start = await screen.findByRole('dialog', { name: 'Start a run' })
    await waitFor(() =>
      expect(within(start).getByRole('button', { name: 'Start run · 4 things' })).toBeTruthy(),
    )
    await user.click(within(start).getByRole('button', { name: 'More options' }))
    await user.type(within(start).getByLabelText('Title (optional)'), 'Groceries')
    await user.click(within(start).getByRole('button', { name: 'Start run · 4 things' }))

    const run = await screen.findByRole('dialog', { name: 'Groceries' })
    const spent = within(run).getByLabelText('Spent (optional)')
    await user.type(spent, 'forty')
    expect(
      (within(run).getByRole('button', { name: 'Finish' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await user.clear(spent)
    await user.click(within(run).getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('Finished. 4 things went back to the pool.')).toBeTruthy()
    expect(deps.uow.state.costs).toHaveLength(0)
  })
})

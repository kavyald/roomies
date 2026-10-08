// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeCreateItem } from '@/lib/app/items'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import type { Category } from '@/lib/domain/items'
import { fakeAppClient } from '@/lib/testing/app-client'
import { addKindFor } from '@/components/shell/tabs'
import { ToastProvider } from '@/components/ui/Toast'
import { ItemSheetsProvider, useItemSheets } from './ItemSheets'

afterEach(cleanup)
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
})

function Plus({ kind }: { kind?: Category }) {
  const { openAdd } = useItemSheets()
  return (
    <button type="button" onClick={() => openAdd(kind)}>
      Add
    </button>
  )
}

const setup = async (kind?: Category) => {
  const deps = depsForTest()
  const { house, admin } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const me = asMember(house.id, admin)
  const client = fakeAppClient(deps.uow, me, {
    createItem: (i) => makeCreateItem(deps)(me, i) as never,
  })
  render(
    <AppClientProvider client={client} queryClient={makeQueryClient()}>
      <ToastProvider>
        <ItemSheetsProvider houseId={house.id}>
          <Plus kind={kind} />
        </ItemSheetsProvider>
      </ToastProvider>
    </AppClientProvider>,
  )
  const titles = () => [...deps.uow.state.items.values()].map((i) => `${i.category}:${i.title}`)
  return { titles }
}

describe('the + sheet (FRONTEND §5.3)', { timeout: 20_000 }, () => {
  it('on a tab, + opens that kind: three needs in a row with "Add another", in one sheet', async () => {
    const { titles } = await setup('need')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    const sheet = await screen.findByRole('dialog', { name: 'A need' })
    const title = within(sheet).getByLabelText('What do we need?')
    for (const t of ['Lemons', 'Rice']) {
      await userEvent.type(title, t)
      await userEvent.click(within(sheet).getByRole('button', { name: 'Add another' }))
      await waitFor(() => expect((title as HTMLInputElement).value).toBe(''))
      expect(document.activeElement).toBe(title)
    }
    await userEvent.type(title, 'Foil')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(titles().sort()).toEqual(['need:Foil', 'need:Lemons', 'need:Rice'])
  })

  it("can switch kinds, and a chore's rhythm shows without More options", async () => {
    const { titles } = await setup('need')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    let sheet = await screen.findByRole('dialog', { name: 'A need' })
    await userEvent.type(within(sheet).getByLabelText('What do we need?'), 'Water the plants')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Chore' }))
    sheet = await screen.findByRole('dialog', { name: 'A chore' })
    expect(within(sheet).getByLabelText<HTMLInputElement>('What needs doing?').value).toBe(
      'Water the plants',
    )
    await userEvent.click(within(sheet).getByRole('button', { name: 'About every…' }))
    const days = within(sheet).getByLabelText('Days between')
    await userEvent.clear(days)
    await userEvent.type(days, '3')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(titles()).toEqual(['chore:Water the plants']))
  })

  it('Home keeps the picker, and the form can go back to it for a poll or a run', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    const picker = await screen.findByRole('dialog', { name: 'Add something' })
    await userEvent.click(within(picker).getByRole('button', { name: /^A task/ }))
    const form = await screen.findByRole('dialog', { name: 'A task' })
    await userEvent.click(within(form).getByRole('button', { name: 'A poll or a run instead?' }))
    expect(await screen.findByRole('dialog', { name: 'Add something' })).toBeTruthy()
  })

  it('addKindFor maps Needs, Chores and Tasks to their kind', () => {
    const base = '/h/1'
    expect(addKindFor(base, `${base}/needs`)).toBe('need')
    expect(addKindFor(base, `${base}/chores`)).toBe('chore')
    expect(addKindFor(base, `${base}/tasks`)).toBe('task')
    expect(addKindFor(base, base)).toBeUndefined()
    expect(addKindFor(base, `${base}/house`)).toBeUndefined()
  })
})

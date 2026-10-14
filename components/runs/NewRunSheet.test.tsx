// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeCreateContact } from '@/lib/app/contacts'
import { makeCreateItem } from '@/lib/app/items'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { ContactId, UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { ToastProvider } from '@/components/ui/Toast'
import { NewRunSheet } from './NewRunSheet'

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
  const me = asMember(house.id, admin)
  const contact = async (name: string) => {
    const r = await makeCreateContact(deps)(me, { name })
    if (!r.ok) throw new Error(r.error)
    return r.value.id
  }
  const landlord = await contact('Landlord')
  const sup = await contact('Super')
  const task = (title: string, contactId?: ContactId) =>
    makeCreateItem(deps)(me, { category: 'task', title, ...(contactId && { contactId }) })
  await task('Leak under the sink', landlord)
  await task('Radiator clanks', sup)
  await task('Hang the shelf')
  await task('Paint the hall')
  render(
    <AppClientProvider client={fakeAppClient(deps.uow, me)} queryClient={makeQueryClient()}>
      <ToastProvider>
        <NewRunSheet houseId={house.id} onClose={() => {}} onCreated={() => {}} />
      </ToastProvider>
    </AppClientProvider>,
  )
  return { landlord, sup }
}

describe('New request or visit (T87)', () => {
  it('keeps the ticked tasks when "Who" changes, and adds the new contact\'s own tasks', async () => {
    const { landlord, sup } = await setup()
    const user = userEvent.setup()
    const sheet = await screen.findByRole('dialog', { name: 'New request or visit' })
    const box = (name: string) => within(sheet).getByRole('checkbox', { name }) as HTMLInputElement
    const ticked = () =>
      within(sheet)
        .getAllByRole<HTMLInputElement>('checkbox')
        .filter((b) => b.checked)
        .map((b) => b.labels?.[0]?.textContent)
        .sort()
    await waitFor(() => expect(within(sheet).getAllByRole('checkbox')).toHaveLength(4))
    const who = within(sheet).getByLabelText('Who')
    await waitFor(() => expect(within(who).getAllByRole('option')).toHaveLength(4))

    // Pick the landlord: their task is ticked; then tick two more by hand.
    await user.selectOptions(who, landlord)
    await waitFor(() => expect(box('Leak under the sink').checked).toBe(true))
    await user.click(box('Hang the shelf'))
    await user.click(box('Paint the hall'))
    expect(ticked()).toEqual(['Hang the shelf', 'Leak under the sink', 'Paint the hall'])

    // Change "Who": every tick stays and the super's own task joins them.
    await user.selectOptions(who, sup)
    await waitFor(() => expect(box('Radiator clanks').checked).toBe(true))
    expect(ticked()).toEqual([
      'Hang the shelf',
      'Leak under the sink',
      'Paint the hall',
      'Radiator clanks',
    ])

    // An untick by hand sticks through another change.
    await user.click(box('Paint the hall'))
    await user.selectOptions(who, landlord)
    expect(box('Paint the hall').checked).toBe(false)
    expect(ticked()).toEqual(['Hang the shelf', 'Leak under the sink', 'Radiator clanks'])
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { asMember, seedHouse, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeCreateItem } from '@/lib/app/items'
import { useLiveUpdates } from '@/lib/client/hooks'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { addDays, instant, localDateOf } from '@/lib/domain/time'
import { fakeAppClient } from '@/lib/testing/app-client'
import { T0 } from '@/lib/testing/builders'
import { HomeScreen } from './HomeScreen'

afterEach(cleanup)

describe('HomeScreen: Needs attention', () => {
  it('ranks by priority with tier chips, leaves out what needs no attention, and filters to Mine', async () => {
    const deps = depsForTest()
    const { house, admin, member } = await seedHouse({
      uow: deps.uow,
      ids: deps.ids,
      createUser: async () => deps.ids.newId<'user'>() as UserId,
      activity: async () => [],
    })
    const item = (title: string, o: Partial<Item> & Pick<Item, 'category'>): Item =>
      ({
        id: deps.ids.newId(),
        houseId: house.id,
        title,
        priority: 'normal',
        createdBy: admin,
        createdAt: T0,
        ...(o.category === 'chore' && { repeatDays: null }),
        ...o,
      }) as Item
    const paper = item('Toilet paper', { category: 'need' })
    const items = [
      item('Fix the leak', { category: 'task', priority: 'urgent', assignee: admin }),
      item('Buy a plunger', { category: 'task' }),
      paper,
      item('Olive oil', { category: 'need' }),
      item('Descale the kettle', { category: 'chore' }),
    ]
    await deps.uow.run(system(house.id), async (r) => {
      for (const i of items) await r.items.save(i)
    })
    await deps.uow.run(asMember(house.id, member), (r) =>
      r.feelings.save(house.id, { itemId: paper.id, by: member, kind: 'anxious', at: T0 }),
    )

    render(
      <AppClientProvider
        client={fakeAppClient(deps.uow, asMember(house.id, admin))}
        queryClient={makeQueryClient()}
      >
        <HomeScreen houseId={house.id} />
      </AppClientProvider>,
    )

    const feed = await screen.findByRole('list', { name: 'Needs attention' })
    const cards = await within(feed).findAllByRole('listitem')
    expect(cards.map((c) => c.textContent)).toEqual([
      // Tier and category on one line with the feelings, then the title.
      expect.stringMatching(/^●● TopTaskFix the leak/),
      expect.stringMatching(/^HighNeed😰1Toilet paper/),
      expect.stringMatching(/^NormalTaskBuy a plunger/),
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Mine' }))
    expect(
      within(feed)
        .getAllByRole('listitem')
        .map((c) => c.textContent),
    ).toEqual([expect.stringMatching(/Fix the leak/)])
  })
})

describe('live updates', () => {
  it("a roommate's new task shows up on Home without a reload", async () => {
    const deps = depsForTest()
    const { house, admin, member } = await seedHouse({
      uow: deps.uow,
      ids: deps.ids,
      createUser: async () => deps.ids.newId<'user'>() as UserId,
      activity: async () => [],
    })
    function Live() {
      useLiveUpdates(house.id)
      return null
    }
    render(
      <AppClientProvider
        client={fakeAppClient(deps.uow, asMember(house.id, admin))}
        queryClient={makeQueryClient()}
      >
        <Live />
        <HomeScreen houseId={house.id} />
      </AppClientProvider>,
    )
    expect(
      await screen.findByText('Nothing needs attention right now. Enjoy the quiet.'),
    ).toBeTruthy()

    const r = await makeCreateItem(deps)(asMember(house.id, member), {
      category: 'task',
      title: 'Bleed the radiators',
    })
    expect(r.ok).toBe(true)
    const feed = await screen.findByRole('list', { name: 'Needs attention' })
    expect(within(feed).getByText('Bleed the radiators')).toBeTruthy()
  })
})

describe('the visit rule (PRD §8.1)', () => {
  it('a task on a visit stays off Home until the visit is within 3 days', async () => {
    const deps = depsForTest()
    const { house, admin } = await seedHouse({
      uow: deps.uow,
      ids: deps.ids,
      createUser: async () => deps.ids.newId<'user'>() as UserId,
      activity: async () => [],
    })
    const contact = { id: deps.ids.newId(), houseId: house.id, name: 'Landlord' } as never
    const today = localDateOf(instant(Date.now()), house.settings.timezone)
    const visit = (id: string, days: number) => ({
      id: id as never,
      houseId: house.id,
      kind: 'visit' as const,
      contactId: (contact as { id: string }).id as never,
      runner: admin,
      createdBy: admin,
      createdAt: T0,
      when: { date: addDays(today, days) },
      state: { open: true as const },
    })
    const soon = visit(deps.ids.newId(), 2)
    const later = visit(deps.ids.newId(), 10)
    const task = (title: string, run: { id: string }) =>
      ({
        id: deps.ids.newId(),
        houseId: house.id,
        category: 'task',
        title,
        priority: 'normal',
        createdBy: admin,
        createdAt: T0,
        contactId: (contact as { id: string }).id,
        run: { id: run.id, kind: 'visit' },
      }) as Item
    await deps.uow.run(system(house.id), async (r) => {
      await r.contacts.save(contact)
      await r.runs.save(soon)
      await r.runs.save(later)
      await r.items.save(task('Fix the leak', soon))
      await r.items.save(task('Paint the hall', later))
    })
    render(
      <AppClientProvider
        client={fakeAppClient(deps.uow, asMember(house.id, admin))}
        queryClient={makeQueryClient()}
      >
        <HomeScreen houseId={house.id} />
      </AppClientProvider>,
    )
    const feed = await screen.findByRole('list', { name: 'Needs attention' })
    expect(await within(feed).findByText('Fix the leak')).toBeTruthy()
    expect(within(feed).queryByText('Paint the hall')).toBeNull()
  })
})

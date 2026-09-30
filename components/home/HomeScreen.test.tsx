// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { asMember, seedHouse, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
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
      expect.stringMatching(/^●● TopFix the leak/),
      expect.stringMatching(/^High😰1Toilet paper/),
      expect.stringMatching(/^NormalBuy a plunger/),
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Mine' }))
    expect(
      within(feed)
        .getAllByRole('listitem')
        .map((c) => c.textContent),
    ).toEqual([expect.stringMatching(/Fix the leak/)])
  })
})

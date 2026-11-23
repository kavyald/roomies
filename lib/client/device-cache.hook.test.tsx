// @vitest-environment jsdom
// T114: the house opens with the lists kept on this device, the network's answer replaces them,
// and a new copy is written once they change, never while a tap is still being saved.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { makeCreateItem, makeMarkDone } from '@/lib/app/items'
import { depsForTest } from '@/lib/compose'
import type { UserId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { fakeAppClient } from '@/lib/testing/app-client'
import { cacheKey, forgetHouseData, useKeepHouseData, type CacheScope } from './device-cache'
import { useItems, useMarkDone } from './hooks'
import { AppClientProvider, makeQueryClient } from './provider'

afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
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
  const made = await makeCreateItem(deps)(me, { category: 'need', title: 'Milk' })
  if (!made.ok) throw new Error(made.error)
  const milk = made.value

  // The network: item lists wait here until the test lets them through.
  let open = true
  const waiting: (() => void)[] = []
  const network = {
    hold: () => void (open = false),
    answer: () => {
      open = true
      waiting.splice(0).forEach((go) => go())
    },
  }
  let markDoneHeld = false
  const heldDone: (() => void)[] = []
  const client = fakeAppClient(deps.uow, me, {
    markDone: async (id) => {
      if (markDoneHeld) await new Promise<void>((go) => heldDone.push(go))
      return makeMarkDone(deps)(me, id) as never
    },
  })
  const items = client.queries.items
  client.queries.items = (h) =>
    open ? items(h) : new Promise<void>((go) => waiting.push(go)).then(() => items(h))

  const scope: CacheScope = { userId: admin, houseId: house.id, build: 'test' }
  const queryClient = makeQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppClientProvider client={client} queryClient={queryClient}>
      {children}
    </AppClientProvider>
  )
  const render = () =>
    renderHook(
      () => {
        useKeepHouseData(scope)
        return { items: useItems(house.id), done: useMarkDone(house.id) }
      },
      { wrapper },
    )
  const kept = (title: string, ago = 60_000) =>
    localStorage.setItem(
      cacheKey(scope),
      JSON.stringify({
        savedAt: Date.now() - ago,
        lists: [{ name: 'items', data: [{ ...milk, title }], updatedAt: Date.now() - ago }],
      }),
    )
  const savedItems = (): Item[] | undefined =>
    JSON.parse(localStorage.getItem(cacheKey(scope)) ?? 'null')?.lists.find(
      (l: { name: string }) => l.name === 'items',
    )?.data
  return {
    milk,
    network,
    render,
    kept,
    savedItems,
    holdMarkDone: () => void (markDoneHeld = true),
    answerMarkDone: () => {
      markDoneHeld = false
      heldDone.splice(0).forEach((go) => go())
    },
  }
}

describe("opening with the house's lists from this device (T114)", () => {
  it('shows the kept copy while the network is slow, then the answer replaces it', async () => {
    const s = await setup()
    s.kept('Milk (kept)')
    s.network.hold()
    const { result } = s.render()
    await waitFor(() => expect(result.current.items.data?.[0]?.title).toBe('Milk (kept)'))

    await act(async () => s.network.answer())
    await waitFor(() => expect(result.current.items.data?.[0]?.title).toBe('Milk'))
  })

  it('a copy from a moment ago is fetched again too: nothing was heard while the app was closed', async () => {
    const s = await setup()
    s.kept('Milk (kept)', 1_000)
    const { result } = s.render()
    await waitFor(() => expect(result.current.items.data?.[0]?.title).toBe('Milk'))
  })

  it('offline, nothing kept is shown: the app stays online-only (A25)', async () => {
    const s = await setup()
    s.kept('Milk (kept)')
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    s.network.hold()
    const { result } = s.render()
    await act(() => new Promise<void>((r) => setTimeout(r, 50)))
    expect(result.current.items.data).toBeUndefined()
  })

  it('writes a copy once a list has loaded', async () => {
    const s = await setup()
    s.render()
    await waitFor(() => expect(s.savedItems()?.[0]?.title).toBe('Milk'), { timeout: 3_000 })
  })

  it("doesn't keep a tap that hasn't been saved, and keeps the answer once it has", async () => {
    const s = await setup()
    const { result } = s.render()
    await waitFor(() => expect(s.savedItems()).toBeDefined(), { timeout: 3_000 })

    s.holdMarkDone()
    act(() => void result.current.done.mutateAsync(s.milk.id))
    await waitFor(() => expect(result.current.items.data?.[0]).toHaveProperty('done'))
    await act(() => new Promise<void>((r) => setTimeout(r, 1_500)))
    expect(s.savedItems()?.[0]).not.toHaveProperty('done')

    await act(async () => s.answerMarkDone())
    await waitFor(() => expect(s.savedItems()?.[0]).toHaveProperty('done'), { timeout: 4_000 })
  })

  it('a save already on its way writes nothing back after the copy was forgotten', async () => {
    const s = await setup()
    s.network.hold()
    s.render()
    await act(async () => s.network.answer())
    // The list has landed and a save is waiting; signing out forgets the copy meanwhile.
    forgetHouseData()
    await act(() => new Promise<void>((r) => setTimeout(r, 1_500)))
    expect(s.savedItems()).toBeUndefined()
    expect(localStorage.length).toBe(0)
  })
})

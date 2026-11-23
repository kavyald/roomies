// @vitest-environment jsdom
// T113: a tap shows before the server answers, against the in-memory adapters and the real use
// cases, with the "server" held until the test lets it answer.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import {
  makeCreateItem,
  makeDoChore,
  makeMarkDone,
  makeSetFeeling,
  makeUndoChore,
} from '@/lib/app/items'
import { depsForTest } from '@/lib/compose'
import type { UserId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { err } from '@/lib/domain/result'
import { instant } from '@/lib/domain/time'
import { fakeAppClient } from '@/lib/testing/app-client'
import { fixedClock } from '@/lib/testing/clock'
import type { AppCommands } from './app-client'
import {
  useDoChore,
  useFeelings,
  useItems,
  useLiveUpdates,
  useMarkDone,
  useSavedLastDone,
  useSetFeeling,
  useUndoChore,
} from './hooks'
import { AppClientProvider, makeQueryClient } from './provider'

afterEach(cleanup)

// Far from the browser's clock, so a time the server saved can't be mistaken for one shown.
const SERVER_NOW = instant(Date.UTC(2026, 8, 29, 16, 0))

const setup = async (commands: Partial<AppCommands> = {}) => {
  const deps = depsForTest({ clock: fixedClock(SERVER_NOW) })
  const { house, admin, member } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const me = asMember(house.id, admin)
  const wren = asMember(house.id, member)
  const add = async (input: Parameters<ReturnType<typeof makeCreateItem>>[1]) => {
    const made = await makeCreateItem(deps)(me, input)
    if (!made.ok) throw new Error(made.error)
    return made.value
  }
  const milk = await add({ category: 'need', title: 'Milk' })
  const eggs = await add({ category: 'need', title: 'Eggs' })
  const sink = await add({ category: 'chore', title: 'Sink', kind: 'upkeep' })

  // The "server": every command waits here until the test lets it through.
  let open = true
  const waiting: (() => void)[] = []
  const server = {
    hold: () => void (open = false),
    answer: () => {
      open = true
      waiting.splice(0).forEach((go) => go())
    },
  }
  const through = <T,>(work: () => Promise<T>) =>
    open ? work() : new Promise<void>((go) => waiting.push(go)).then(work)

  const client = fakeAppClient(deps.uow, me, {
    markDone: (id) => through(() => makeMarkDone(deps)(me, id)) as never,
    doChore: (id) => through(() => makeDoChore(deps)(me, id)) as never,
    undoChore: (i) =>
      through(() => makeUndoChore(deps)(me, { id: i.id, doneAt: instant(i.doneAt) })) as never,
    setFeeling: (i) => through(() => makeSetFeeling(deps)(me, i)) as never,
    ...commands,
  })
  // Count the downloads of the item list.
  let itemFetches = 0
  const items = client.queries.items
  client.queries.items = (h) => (itemFetches++, items(h))

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppClientProvider client={client} queryClient={queryClient}>
      {children}
    </AppClientProvider>
  )
  const queryClient = makeQueryClient()
  return {
    deps,
    house,
    me,
    wren,
    milk,
    eggs,
    sink,
    server,
    wrapper,
    itemFetches: () => itemFetches,
  }
}

const find = (items: readonly Item[] | undefined, id: string) => items?.find((i) => i.id === id)
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 30)))

describe('a tap shows before the server answers (T113)', () => {
  it('Got it: done at once, then the saved copy replaces it, and the command ends at the answer', async () => {
    const s = await setup()
    const { result } = renderHook(
      () => ({ items: useItems(s.house.id), done: useMarkDone(s.house.id) }),
      { wrapper: s.wrapper },
    )
    await waitFor(() => expect(result.current.items.data).toBeDefined())

    s.server.hold()
    let answered = false
    act(() => void result.current.done.mutateAsync(s.milk.id).then(() => (answered = true)))
    await waitFor(() => expect(find(result.current.items.data, s.milk.id)).toHaveProperty('done'))
    const shown = find(result.current.items.data, s.milk.id) as {
      done: { at: { epochMs: number } }
    }
    expect(shown.done.at.epochMs).not.toBe(SERVER_NOW.epochMs) // the browser's time, for now
    expect(answered).toBe(false)
    expect(find(result.current.items.data, s.eggs.id)).not.toHaveProperty('done')

    await act(async () => s.server.answer())
    await waitFor(() => expect(answered).toBe(true))
    await waitFor(() =>
      expect(find(result.current.items.data, s.milk.id)).toMatchObject({
        done: { at: SERVER_NOW },
      }),
    )
  })

  it('a refusal puts back what was there', async () => {
    const refused = await setup({ markDone: async () => err('not_found') })
    const { result } = renderHook(
      () => ({ items: useItems(refused.house.id), done: useMarkDone(refused.house.id) }),
      { wrapper: refused.wrapper },
    )
    await waitFor(() => expect(result.current.items.data).toBeDefined())
    let r: { ok: boolean } | undefined
    await act(async () => void (r = await result.current.done.mutateAsync(refused.milk.id)))
    expect(r?.ok).toBe(false)
    await settle()
    expect(find(result.current.items.data, refused.milk.id)).not.toHaveProperty('done')
  })

  it('a dropped request puts back what was there too', async () => {
    const s = await setup({
      markDone: async () => {
        throw new Error('offline')
      },
    })
    const { result } = renderHook(
      () => ({ items: useItems(s.house.id), done: useMarkDone(s.house.id) }),
      { wrapper: s.wrapper },
    )
    await waitFor(() => expect(result.current.items.data).toBeDefined())
    // It answers like a refusal, so the screen's own "Couldn't…" message shows.
    await act(async () => {
      expect(await result.current.done.mutateAsync(s.milk.id)).toEqual({
        ok: false,
        error: 'unexpected',
      })
    })
    await settle()
    expect(find(result.current.items.data, s.milk.id)).not.toHaveProperty('done')
  })

  it('ticking a chore and unticking it straight away both land: Undo names the saved time', async () => {
    const s = await setup()
    const { result } = renderHook(
      () => ({
        items: useItems(s.house.id),
        did: useDoChore(s.house.id),
        undo: useUndoChore(s.house.id),
        savedLastDone: useSavedLastDone(s.house.id),
      }),
      { wrapper: s.wrapper },
    )
    await waitFor(() => expect(result.current.items.data).toBeDefined())

    s.server.hold()
    act(() => void result.current.did.mutateAsync(s.sink.id))
    await waitFor(() =>
      expect(find(result.current.items.data, s.sink.id)).toHaveProperty('lastDone'),
    )
    // The second tap, before the first is answered.
    let undone: { ok: boolean } | undefined
    act(
      () =>
        void result.current
          .savedLastDone(s.sink.id)
          .then((doneAt) => result.current.undo.mutateAsync({ id: s.sink.id, doneAt: doneAt! }))
          .then((r) => (undone = r)),
    )
    await settle()
    expect(undone).toBeUndefined() // it waits for the tick's answer

    await act(async () => s.server.answer())
    await waitFor(() => expect(undone).toEqual(expect.objectContaining({ ok: true })))
    await waitFor(() =>
      expect(find(result.current.items.data, s.sink.id)).not.toHaveProperty('lastDone'),
    )
  })

  it('a feeling shows at once and is still there after the answer', async () => {
    const s = await setup()
    const { result } = renderHook(
      () => ({ feelings: useFeelings(s.house.id), set: useSetFeeling(s.house.id) }),
      { wrapper: s.wrapper },
    )
    await waitFor(() => expect(result.current.feelings.data).toBeDefined())
    s.server.hold()
    act(() => void result.current.set.mutateAsync({ itemId: s.milk.id, kind: 'anxious' }))
    await waitFor(() =>
      expect(result.current.feelings.data).toEqual([
        expect.objectContaining({ itemId: s.milk.id, kind: 'anxious' }),
      ]),
    )
    await act(async () => s.server.answer())
    await settle()
    expect(result.current.feelings.data).toEqual([
      expect.objectContaining({ itemId: s.milk.id, kind: 'anxious', at: SERVER_NOW }),
    ])
  })

  it("my own change downloads the list once, not again for its echo; a roommate's still does", async () => {
    const s = await setup()
    const { result } = renderHook(
      () => {
        useLiveUpdates(s.house.id)
        return { items: useItems(s.house.id), done: useMarkDone(s.house.id) }
      },
      { wrapper: s.wrapper },
    )
    await waitFor(() => expect(result.current.items.data).toBeDefined())
    expect(s.itemFetches()).toBe(1)

    await act(async () => void (await result.current.done.mutateAsync(s.milk.id)))
    await settle()
    expect(s.itemFetches()).toBe(2)

    await act(async () => void (await makeMarkDone(s.deps)(s.wren, s.eggs.id)))
    await settle()
    expect(s.itemFetches()).toBe(3)
    expect(find(result.current.items.data, s.eggs.id)).toHaveProperty('done')
  })
})

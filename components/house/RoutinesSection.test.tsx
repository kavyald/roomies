// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { asMember, seedHouse, system } from '@/lib/adapters/contracts/unit-of-work.contract'
import { makeCreateRoutine, makeEditRoutine, makeRemoveRoutine } from '@/lib/app/routines'
import type { AppCommands } from '@/lib/client/app-client'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import { depsForTest } from '@/lib/compose'
import type { Room } from '@/lib/domain/house'
import type { RoomId, UserId } from '@/lib/domain/ids'
import { err } from '@/lib/domain/result'
import { routineHolder } from '@/lib/domain/routines'
import { instant, localDateOf } from '@/lib/domain/time'
import { fakeAppClient } from '@/lib/testing/app-client'
import { ToastProvider } from '@/components/ui/Toast'
import { RoutinesSection } from './RoutinesSection'

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

const setup = async (commands: Partial<AppCommands> = {}) => {
  // The screen's "today" is the real one; the use cases must agree with it.
  const deps = depsForTest({ clock: { now: () => instant(Date.now()) } })
  const { house, admin, member } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const room = (name: string, sortOrder: number): Room => ({
    id: deps.ids.newId<'room'>() as RoomId,
    houseId: house.id,
    name,
    floor: 'first',
    kind: 'common',
    sortOrder,
  })
  const kitchen = room('Kitchen', 1)
  const dining = room('Dining', 2)
  await deps.uow.run(system(house.id), async (r) => {
    await r.rooms.save(kitchen)
    await r.rooms.save(dining)
  })
  const me = asMember(house.id, admin)
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, me, {
        createRoutine: (i) => makeCreateRoutine(deps)(me, i),
        editRoutine: (i) => makeEditRoutine(deps)(me, i),
        removeRoutine: (i) => makeRemoveRoutine(deps)(me, i),
        ...commands,
      })}
      queryClient={makeQueryClient()}
    >
      <ToastProvider>
        <RoutinesSection houseId={house.id} />
      </ToastProvider>
    </AppClientProvider>,
  )
  const stored = () => [...deps.uow.state.routines.values()].filter((r) => !r.removedAt)
  const today = () => localDateOf(instant(Date.now()), house.settings.timezone)
  const members = () => [...deps.uow.state.members.values()].filter((m) => m.houseId === house.id)
  return { deps, admin, member, kitchen, dining, stored, today, members, user: userEvent.setup() }
}

type Setup = Awaited<ReturnType<typeof setup>>

/** Adds "Upstairs" through the sheet, leaving everything else as it starts. */
const addOne = async ({ user }: Setup, extra?: (sheet: HTMLElement) => Promise<void>) => {
  await user.click(await screen.findByRole('button', { name: 'Add a routine' }))
  const sheet = await screen.findByRole('dialog', { name: 'New routine' })
  await user.type(within(sheet).getByLabelText('Name'), 'Upstairs')
  await extra?.(sheet)
  await user.click(within(sheet).getByRole('button', { name: 'Add' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

const openRow = async ({ user }: Setup, name: string) => {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }))
  return screen.findByRole('dialog', { name })
}

describe('Admin → Routines (T98)', () => {
  it('starts empty, and adds the first one for me, weekly, taking turns, with its rooms', async () => {
    const s = await setup()
    expect(
      await screen.findByText('No routines yet. Group rooms someone looks after, and it rotates.'),
    ).toBeTruthy()

    await addOne(s, async (sheet) => {
      await s.user.click(within(sheet).getByRole('button', { name: 'Broom' }))
      await s.user.click(within(sheet).getByRole('checkbox', { name: 'Kitchen' }))
    })

    const [r] = s.stored()
    expect(r).toMatchObject({
      name: 'Upstairs',
      icon: 'broom',
      resets: 'weekly',
      startsWith: s.admin,
    })
    expect(r!.fixedMember).toBeUndefined()
    expect(s.deps.uow.state.rooms.get(s.kitchen.id)?.routineId).toBe(r!.id)

    // The row: how often, who has it, and who's next, all as avatars.
    const row = await screen.findByRole('button', { name: /^Upstairs/ })
    expect(row.textContent).toContain('Weekly')
    expect(within(row).getByRole('img', { name: 'Kavya' })).toBeTruthy()
    expect(within(row).getByRole('img', { name: 'Wren' })).toBeTruthy()
    expect(row.querySelector('.lucide-arrow-right')).toBeTruthy()
  })

  it('sends only what changed, with the version it opened', async () => {
    const editRoutine = vi.fn<AppCommands['editRoutine']>(async () => err('no_change'))
    const s = await setup({ editRoutine })
    await addOne(s)
    const [r] = s.stored()

    // Nothing touched: no command at all.
    let sheet = await openRow(s, 'Upstairs')
    await s.user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(editRoutine).not.toHaveBeenCalled()

    // A no_change answer just closes the sheet.
    sheet = await openRow(s, 'Upstairs')
    await s.user.click(within(sheet).getByRole('button', { name: 'Monthly' }))
    await s.user.click(within(sheet).getByRole('checkbox', { name: 'Dining' }))
    await s.user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(editRoutine).toHaveBeenCalledWith({
      id: r!.id,
      patch: { resets: 'monthly', roomIds: [s.dining.id] },
      version: r!.version,
    })
  })

  it('changes who has it this period, and to always one person', async () => {
    const s = await setup()
    await addOne(s)

    let sheet = await openRow(s, 'Upstairs')
    await within(sheet).findByRole('group', { name: 'Who has it this week' })
    await s.user.click(within(sheet).getByRole('button', { name: 'Wren' }))
    await s.user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(routineHolder(s.stored()[0]!, s.members(), s.today())).toBe(s.member)

    sheet = await openRow(s, 'Upstairs')
    await s.user.click(within(sheet).getByRole('button', { name: 'Always one person' }))
    await within(sheet).findByRole('group', { name: 'Who looks after it' })
    expect(within(sheet).getByRole('button', { name: 'Wren' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    await s.user.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(s.stored()[0]!.fixedMember).toBe(s.member)

    // Always one person: their avatar, and nobody next.
    const row = await screen.findByRole('button', { name: /^Upstairs/ })
    await waitFor(() => expect(row.querySelector('.lucide-arrow-right')).toBeNull())
    expect(within(row).getAllByRole('img')).toHaveLength(1)
  })

  it('says when a ticked room moves from another routine', async () => {
    const s = await setup()
    await addOne(s, (sheet) =>
      s.user.click(within(sheet).getByRole('checkbox', { name: 'Kitchen' })),
    )

    await s.user.click(await screen.findByRole('button', { name: 'Add a routine' }))
    const sheet = await screen.findByRole('dialog', { name: 'New routine' })
    await s.user.type(within(sheet).getByLabelText('Name'), 'Downstairs')
    expect(within(sheet).getByText('In Upstairs')).toBeTruthy()
    const kitchen = within(sheet).getByRole('checkbox', { name: 'Kitchen' })
    await s.user.click(kitchen)
    expect(within(sheet).getByText('Moves here from Upstairs')).toBeTruthy()
    await s.user.click(within(sheet).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const downstairs = s.stored().find((r) => r.name === 'Downstairs')!
    expect(s.deps.uow.state.rooms.get(s.kitchen.id)?.routineId).toBe(downstairs.id)
  })

  it('removes one after saying where its chores go; the rooms are in no routine', async () => {
    const s = await setup()
    await addOne(s, (sheet) =>
      s.user.click(within(sheet).getByRole('checkbox', { name: 'Kitchen' })),
    )

    const sheet = await openRow(s, 'Upstairs')
    await s.user.click(within(sheet).getByRole('button', { name: 'Remove this routine' }))
    const confirm = within(sheet).getByRole('group', { name: 'Remove this routine?' })
    expect(confirm.textContent).toContain('Upkeep')
    expect(within(sheet).queryByRole('button', { name: 'Save' })).toBeNull()

    // Keeping it brings the form back.
    await s.user.click(within(confirm).getByRole('button', { name: 'Keep it' }))
    await s.user.click(within(sheet).getByRole('button', { name: 'Remove this routine' }))
    await s.user.click(
      within(within(sheet).getByRole('group', { name: 'Remove this routine?' })).getByRole(
        'button',
        { name: 'Remove' },
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(s.stored()).toEqual([])
    expect(s.deps.uow.state.rooms.get(s.kitchen.id)?.routineId).toBeUndefined()
    expect(await screen.findByText(/^No routines yet/)).toBeTruthy()
  })

  it('answers a stale save by closing with the latest', async () => {
    const s = await setup({ editRoutine: async () => err('conflict') })
    await addOne(s)
    const sheet = await openRow(s, 'Upstairs')
    await s.user.click(within(sheet).getByRole('button', { name: 'Monthly' }))
    await s.user.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText("Someone just changed this. Here's the latest.")).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

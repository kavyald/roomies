// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { makeSetNotificationEnabled, makeUpdateMySettings } from '@/lib/app/me'
import { depsForTest } from '@/lib/compose'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import type { QuietHours } from '@/lib/domain/notifications'
import { fakeAppClient } from '@/lib/testing/app-client'
import { MeScreen } from './MeScreen'

afterEach(cleanup)

const setup = async () => {
  const deps = depsForTest()
  const { house, admin } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const actor = asMember(house.id, admin)
  const update = makeUpdateMySettings(deps)
  const setEnabled = makeSetNotificationEnabled(deps)
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, actor, {
        updateMySettings: (i) =>
          update(actor, { ...i, quietHours: i.quietHours as QuietHours | null | undefined }),
        setNotificationEnabled: (i) => setEnabled(actor, i),
      })}
      queryClient={makeQueryClient()}
    >
      <MeScreen houseId={house.id} />
    </AppClientProvider>,
  )
}

describe('MeScreen notifications (T61: one section)', () => {
  it('shows the six categories as named switches, each with what it means', async () => {
    await setup()
    const group = await screen.findByRole('group', { name: 'Tell me when' })
    const switches = within(group).getAllByRole('switch')
    expect(switches).toHaveLength(6)
    const polls = within(group).getByRole('switch', { name: 'Polls' })
    const description = document.getElementById(polls.getAttribute('aria-describedby') ?? '')
    expect(description?.textContent).toMatch(/polls/i)
    expect(polls.getAttribute('aria-checked')).toBe('true')

    await userEvent.click(polls)
    await expect.poll(() => polls.getAttribute('aria-checked')).toBe('false')
  })

  it('keeps quiet hours to one row: edit inline, or switch them off', async () => {
    await setup()
    const row = await screen.findByRole('button', { name: 'Quiet 10pm–8am' })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('From')).toBeNull()

    await userEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    const from = screen.getByLabelText('From')
    await userEvent.clear(from)
    await userEvent.type(from, '23:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save quiet hours' }))
    expect(await screen.findByRole('button', { name: 'Quiet 11pm–8am' })).toBeTruthy()
    expect(screen.queryByLabelText('From')).toBeNull()

    const quiet = screen.getByRole('switch', { name: 'Quiet hours' })
    expect(quiet.getAttribute('aria-checked')).toBe('true')
    await userEvent.click(quiet)
    await expect.poll(() => quiet.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Quiet hours off')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Quiet / })).toBeNull()
  })
})

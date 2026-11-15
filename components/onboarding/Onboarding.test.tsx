// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { ToastProvider } from '@/components/ui/Toast'
import { depsForTest } from '@/lib/compose'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import type { PushState } from '@/lib/client/push'
import { fakeAppClient } from '@/lib/testing/app-client'
import { NOT_NOW_TOAST, Onboarding } from './Onboarding'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const push = vi.hoisted(() => ({ state: 'off' as PushState, turnOn: vi.fn() }))
vi.mock('@/components/house/turn-on-push', () => ({
  settlePush: async () => ({ state: push.state, connected: false }),
  turnOnPush: push.turnOn,
  TURN_ON_TOASTS: { on: 'Notifications are on. 🔔', denied: 'Okay.', failed: 'Try again.' },
}))

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const realUserAgent = navigator.userAgent
const setUserAgent = (ua: string) =>
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })

beforeEach(() => {
  localStorage.clear()
  replace.mockClear()
  push.turnOn.mockReset()
  push.state = 'off'
})
afterEach(() => {
  cleanup()
  setUserAgent(realUserAgent)
})

const open = async () => {
  const deps = depsForTest()
  const { house, admin } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  render(
    <ToastProvider>
      <AppClientProvider
        client={fakeAppClient(deps.uow, asMember(house.id, admin))}
        queryClient={makeQueryClient()}
      >
        <Onboarding houseId={house.id} />
      </AppClientProvider>
    </ToastProvider>,
  )
  const user = userEvent.setup()
  // The welcome, with the house's name once it loads.
  expect(await screen.findByRole('heading', { level: 1, name: /^Welcome to / })).toBeTruthy()
  const next = screen.getByRole('button', { name: 'Next' })
  await vi.waitFor(() => expect(next).toHaveProperty('disabled', false))
  return { user, next, houseId: house.id }
}

describe('Onboarding (T110)', () => {
  it('welcomes, says what each tab is for, then asks; Not now says where to turn them on', async () => {
    const { user, next, houseId } = await open()
    const tabs = within(screen.getByRole('list', { name: 'The tabs' })).getAllByRole('listitem')
    expect(tabs.map((t) => t.querySelector('b')?.textContent)).toEqual([
      'Needs',
      'Tasks',
      'Chores',
      'House',
    ])

    await user.click(next)
    expect(screen.getByRole('heading', { name: 'Turn on notifications?' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(await screen.findByText(NOT_NOW_TOAST)).toBeTruthy()
    expect(replace).toHaveBeenCalledWith(`/h/${houseId}`)
    expect(localStorage.getItem('roomies.pushPromptDone')).not.toBeNull()
  })

  it('Turn on turns them on and lands on House', async () => {
    push.turnOn.mockResolvedValue('on')
    const { user, next, houseId } = await open()
    await user.click(next)
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(push.turnOn).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith(`/h/${houseId}`)
  })

  it('blocked: the steps inline, and Skip for now', async () => {
    push.state = 'blocked'
    const { user, next, houseId } = await open()
    await user.click(next)
    expect(screen.getByRole('heading', { name: 'Notifications are blocked' })).toBeTruthy()
    expect(await screen.findByRole('list', { name: 'How to turn them on' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(replace).toHaveBeenCalledWith(`/h/${houseId}`)
  })

  it('a browser that can’t: one line and Continue', async () => {
    push.state = 'unsupported'
    const { user, next } = await open()
    await user.click(next)
    expect(screen.getByRole('heading', { name: 'No notifications on this browser' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(localStorage.getItem('roomies.pushPromptDone')).not.toBeNull()
  })

  it('iPhone Safari: the Add to Home Screen guide, and the question waits for the Home Screen', async () => {
    setUserAgent(IPHONE_SAFARI)
    push.state = 'install_first'
    const { user, next, houseId } = await open()
    await user.click(next)
    expect(screen.getByRole('heading', { name: 'Add Roomies to your Home Screen' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(replace).toHaveBeenCalledWith(`/h/${houseId}`)
    expect(localStorage.getItem('roomies.pushPromptDone')).toBeNull()
    expect(localStorage.getItem('roomies.installGuideDismissedAt')).not.toBeNull()
  })

  it('already on: Next goes straight to House', async () => {
    push.state = 'on'
    const { user, next, houseId } = await open()
    await user.click(next)
    expect(replace).toHaveBeenCalledWith(`/h/${houseId}`)
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedHouse, asMember } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import { ok } from '@/lib/domain/result'
import { fakeAppClient } from '@/lib/testing/app-client'
import { PushSettings } from './PushSettings'

// The browser half is stubbed: this browser has a subscription and permission (pushState 'on').
vi.mock('@/lib/client/push', () => ({
  pushState: async () => 'on',
  thisBrowsersEndpoint: async () => 'https://push.example/this-phone',
  subscribeThisBrowser: async () => ({ ok: false, reason: 'failed' }),
}))

afterEach(cleanup)

const renderWith = async (saved: boolean) => {
  const deps = depsForTest()
  const { house, member } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const asked: string[] = []
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, asMember(house.id, member), {
        isPushSubscriptionSaved: async ({ endpoint }) => {
          asked.push(endpoint)
          return ok(saved)
        },
      })}
      queryClient={makeQueryClient()}
    >
      <PushSettings />
    </AppClientProvider>,
  )
  return asked
}

describe('PushSettings (T84: "on" only if the server has this browser for me)', () => {
  it('shows on when the server has it', async () => {
    const asked = await renderWith(true)
    expect(await screen.findByText('On for this device.')).toBeTruthy()
    expect(asked).toEqual(['https://push.example/this-phone'])
  })

  it("shows off, with the button, when it doesn't (someone else used this phone)", async () => {
    await renderWith(false)
    expect(await screen.findByText('Off on this device.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeTruthy()
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { asMember } from '@/lib/adapters/contracts/unit-of-work.contract'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import { depsForTest } from '@/lib/compose'
import type { UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { sampleHouse } from '@/lib/testing/sample-house'
import { CalendarScreen } from './CalendarScreen'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Opens the calendar at `at` (UTC) for the sample house (America/New_York). The house query
 * resolves after the first render, so that render only knows UTC. */
const openAt = async (at: string) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(at))
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, asMember(s.house.id, s.people.Kavya))}
      queryClient={makeQueryClient()}
    >
      <CalendarScreen houseId={s.house.id} />
    </AppClientProvider>,
  )
  // The first render knows only UTC: it shows tomorrow (in New York) as today.
  return s
}

describe('CalendarScreen', () => {
  it("opens on the house's today, not UTC's, once the time zone arrives", async () => {
    await openAt('2026-11-15T01:48:00Z') // 8:48pm on the 14th in New York
    const day = await screen.findByRole('button', { name: 'Saturday, November 14', pressed: true })
    expect(day.className).toContain('shadow-') // the today ring
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: 'November 2026' })).toBeTruthy()
  })

  it('opens on the right month at a month end', async () => {
    await openAt('2026-12-01T02:00:00Z') // 9pm on November 30 in New York
    await screen.findByRole('button', { name: 'Monday, November 30', pressed: true })
    expect(screen.getByRole('heading', { level: 2, name: 'November 2026' })).toBeTruthy()
  })
})

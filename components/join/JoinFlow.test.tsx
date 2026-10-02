// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acceptJoin } from '@/app/actions/invites'
import type { RoomId } from '@/lib/domain/ids'
import { JoinFlow } from './JoinFlow'

vi.mock('@/app/actions/auth', () => ({ verifyCode: vi.fn() }))
vi.mock('@/app/actions/invites', () => ({
  startJoin: vi.fn(),
  acceptJoin: vi.fn(async () => ({ ok: true, value: 'house-1' })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))

afterEach(cleanup)

const bedrooms = [{ id: 'room-1' as RoomId, name: 'Fire', element: 'fire' as const }]

describe('JoinFlow', () => {
  it('keeps the name field while you type, when you arrive already signed in', async () => {
    const user = userEvent.setup()
    render(<JoinFlow token="t" bedrooms={bedrooms} signedIn />)

    await user.type(screen.getByLabelText('Your name'), 'Wren')

    expect(screen.getByLabelText('Your name')).toHaveProperty('value', 'Wren')
    const join = screen.getByRole('button', { name: 'Join the house' })
    expect(join).toHaveProperty('disabled', false)
    await user.click(join)
    expect(acceptJoin).toHaveBeenCalledWith('t', { displayName: 'Wren' })
  })
})

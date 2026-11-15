// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SetupFlow } from './SetupFlow'

vi.mock('@/app/actions/auth', () => ({ verifyCode: vi.fn() }))
vi.mock('@/app/actions/setup', () => ({
  startSetup: vi.fn(),
  finishSetup: vi.fn(async () => ({ ok: true, value: 'house-1' })),
}))
const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

afterEach(cleanup)

describe('SetupFlow', () => {
  it('lands on onboarding once the house exists (T110)', async () => {
    const user = userEvent.setup()
    render(<SetupFlow token="t" signedIn />)
    await user.type(screen.getByLabelText('Your name'), 'Kavya')
    await user.click(screen.getByRole('button', { name: 'Create the house' }))
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/h/house-1/welcome'))
  })
})

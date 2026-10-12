// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import { err, ok } from '@/lib/domain/result'
import { SignOutButton } from './SignOutButton'

const signOut = vi.fn()
const unsubscribe = vi.fn(async () => 'https://push.example/this-phone')
vi.mock('@/app/actions/auth', () => ({ signOut: (i: unknown) => signOut(i) }))
vi.mock('@/lib/client/push', () => ({
  thisBrowsersEndpoint: async () => 'https://push.example/this-phone',
  unsubscribeThisBrowser: () => unsubscribe(),
}))

const assign = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: (to: string) => assign(to), refresh: () => {} }),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const press = () => {
  render(
    <ToastProvider>
      <SignOutButton />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
}

describe('SignOutButton (T84)', () => {
  it('signs out with this browser, then unsubscribes it and leaves', async () => {
    signOut.mockResolvedValue(ok(undefined))
    press()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in'))
    expect(signOut).toHaveBeenCalledWith({ endpoint: 'https://push.example/this-phone' })
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it.each([
    ['refused', () => signOut.mockResolvedValue(err('unexpected'))],
    ['unreachable', () => signOut.mockRejectedValue(new Error('offline'))],
  ])('when the server is %s, keeps notifications and lets you try again', async (_, arrange) => {
    arrange()
    press()
    expect(await screen.findByText("Couldn't sign you out. Try again.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveProperty('disabled', false)
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })
})

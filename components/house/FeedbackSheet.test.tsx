// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asMember, seedHouse } from '@/lib/adapters/contracts/unit-of-work.contract'
import { depsForTest } from '@/lib/compose'
import { makeSendFeedback } from '@/lib/app/feedback'
import { AppClientProvider, makeQueryClient } from '@/lib/client/provider'
import type { UserId } from '@/lib/domain/ids'
import { fakeAppClient } from '@/lib/testing/app-client'
import { ToastProvider } from '@/components/ui/Toast'
import { FeedbackButton } from './FeedbackSheet'

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

const setup = async () => {
  const deps = depsForTest()
  const { house, member } = await seedHouse({
    uow: deps.uow,
    ids: deps.ids,
    createUser: async () => deps.ids.newId<'user'>() as UserId,
    activity: async () => [],
  })
  const me = asMember(house.id, member)
  render(
    <AppClientProvider
      client={fakeAppClient(deps.uow, me, {
        sendFeedback: (i) => makeSendFeedback(deps)(me, i, { userAgent: 'jsdom' }),
      })}
      queryClient={makeQueryClient()}
    >
      <ToastProvider>
        <FeedbackButton houseId={house.id} />
      </ToastProvider>
    </AppClientProvider>,
  )
  return { deps, member }
}

describe('Admin → Send feedback (T91)', () => {
  it('an icon with no visible text opens a sheet that sends a bug', async () => {
    const { deps, member } = await setup()
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: 'Send feedback' })
    expect(button.textContent).toBe('')
    await user.click(button)

    const sheet = await screen.findByRole('dialog', { name: 'Feedback' })
    const kinds = within(sheet).getByRole('group', { name: 'Kind of feedback' })
    expect(
      within(kinds).getByRole('button', { name: 'Idea 💡' }).getAttribute('aria-pressed'),
    ).toBe('true')
    const send = within(sheet).getByRole('button', { name: 'Send' })
    expect(send).toHaveProperty('disabled', true)

    await user.click(within(kinds).getByRole('button', { name: 'Bug 🐞' }))
    const box = within(sheet).getByRole('textbox', { name: 'Message' })
    expect(box.getAttribute('placeholder')).toBe('What went wrong?')
    await user.type(box, 'The calendar is blank')
    await user.click(send)

    await waitFor(() => expect(deps.uow.state.feedback).toHaveLength(1))
    expect(deps.uow.state.feedback[0]).toMatchObject({
      userId: member,
      kind: 'bug',
      message: 'The calendar is blank',
      userAgent: 'jsdom',
    })
    expect(await screen.findByText('Thanks for telling us!')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull())
  })
})

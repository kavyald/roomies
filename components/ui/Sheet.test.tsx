// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Sheet, SheetSave } from './Sheet'

afterEach(cleanup)
beforeAll(() => {
  // Vaul asks for these; jsdom has neither.
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
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

function FormSheet({
  onSubmit,
  onOpenChange,
}: {
  onSubmit: (t: string) => void
  onOpenChange: (o: boolean) => void
}) {
  const [title, setTitle] = useState('')
  return (
    <Sheet open onOpenChange={onOpenChange} title="A need">
      <form
        id="f"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(title)
        }}
      >
        <label htmlFor="t">Title</label>
        <input id="t" value={title} onChange={(e) => setTitle(e.target.value)} />
        <SheetSave form="f" label="Add" disabled={!title.trim()} />
      </form>
    </Sheet>
  )
}

describe('Sheet (T80)', () => {
  it('puts the save check in the header; it submits the form and is off until it can', async () => {
    const onSubmit = vi.fn()
    render(<FormSheet onSubmit={onSubmit} onOpenChange={() => {}} />)
    const sheet = await screen.findByRole('dialog', { name: 'A need' })
    const check = within(sheet).getByRole('button', { name: 'Add' })
    // In the header (beside the title), not inside the form's own markup.
    expect(check.closest('form')).toBeNull()
    expect((check as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(within(sheet).getByLabelText('Title'), 'Soap')
    await userEvent.click(check)
    expect(onSubmit).toHaveBeenCalledWith('Soap')
  })

  it('has no X; the drag handle is a button named Close that dismisses', async () => {
    const onOpenChange = vi.fn()
    render(<FormSheet onSubmit={() => {}} onOpenChange={onOpenChange} />)
    const sheet = await screen.findByRole('dialog', { name: 'A need' })
    const close = within(sheet).getAllByRole('button', { name: 'Close' })
    expect(close).toHaveLength(1)
    await userEvent.click(close[0]!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows no header button when there is nothing to save, and calls onSave otherwise', async () => {
    const onSave = vi.fn()
    const { rerender } = render(
      <Sheet open onOpenChange={() => {}} title="Details">
        <p>Read only</p>
      </Sheet>,
    )
    const sheet = await screen.findByRole('dialog', { name: 'Details' })
    expect(
      within(sheet)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Close'])
    rerender(
      <Sheet open onOpenChange={() => {}} title="Details">
        <SheetSave onSave={onSave} busy />
      </Sheet>,
    )
    const busy = within(sheet).getByRole('button', { name: 'Save' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    rerender(
      <Sheet open onOpenChange={() => {}} title="Details">
        <SheetSave onSave={onSave} />
      </Sheet>,
    )
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledOnce()
  })
})

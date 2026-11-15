// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateField, TimeField, openPicker } from './DateTimeField'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DateField and TimeField', () => {
  it('label the field and name the icon, which the label describes', () => {
    render(
      <>
        <DateField id="d" label="Date (optional)" value="" onChange={() => {}} />
        <TimeField id="t" label="From" value="22:00" onChange={() => {}} />
      </>,
    )
    expect(screen.getByLabelText('Date (optional)')).toHaveProperty('type', 'date')
    expect(screen.getByLabelText('From')).toHaveProperty('type', 'time')
    expect(
      screen.getByRole('button', { name: 'Open calendar', description: 'Date (optional)' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open clock', description: 'From' })).toBeTruthy()
  })

  it("the icon opens the field's own picker", async () => {
    const show = vi.fn()
    HTMLInputElement.prototype.showPicker = show
    render(<DateField id="d" label="Date" value="" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(show).toHaveBeenCalledTimes(1)
    expect(show.mock.contexts[0]).toBe(screen.getByLabelText('Date'))
    expect(document.activeElement).toBe(screen.getByLabelText('Date'))
  })

  it('a disabled field keeps its icon off', () => {
    render(<TimeField id="t" label="Time" disabled value="" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Open clock' })).toHaveProperty('disabled', true)
  })
})

describe('openPicker', () => {
  it('falls back to focusing the field where there is no picker for it', () => {
    render(<input aria-label="When" type="time" />)
    const input = screen.getByLabelText('When') as HTMLInputElement
    input.showPicker = () => {
      throw new DOMException('not supported', 'NotSupportedError')
    }
    openPicker(input)
    expect(document.activeElement).toBe(input)
  })

  it('does nothing for a disabled field or none', () => {
    render(<input aria-label="When" type="date" disabled />)
    const input = screen.getByLabelText('When') as HTMLInputElement
    const show = vi.fn()
    input.showPicker = show
    openPicker(input)
    openPicker(null)
    expect(show).not.toHaveBeenCalled()
  })
})

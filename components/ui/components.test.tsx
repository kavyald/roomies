// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Avatar, initials } from './Avatar'
import { TierChip } from './Chip'
import { Disclosure } from './Disclosure'
import { OverflowMenu } from './OverflowMenu'
import { SegmentedControl } from './SegmentedControl'
import { ToastProvider, useCelebrate } from './Toast'
import { useState } from 'react'

afterEach(cleanup)

describe('Avatar', () => {
  it('uses initials and names the room for screen readers', () => {
    render(<Avatar name="Maya Lin" element="fire" />)
    const av = screen.getByRole('img', { name: 'Maya Lin, Fire room' })
    expect(av.textContent).toBe('ML')
  })

  it.each([
    ['Wren', 'WR'],
    ['kavya d', 'KD'],
    ['  Sam  ', 'SA'],
    ['Élodie', 'ÉL'],
  ])('initials(%j) = %s', (name, expected) => expect(initials(name)).toBe(expected))
})

describe('TierChip', () => {
  it('always says the tier in words', () => {
    render(
      <>
        <TierChip tier="top" />
        <TierChip tier="high" />
        <TierChip tier="low" />
      </>,
    )
    expect(screen.getByText('Top')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
    expect(screen.getByText('Low')).toBeTruthy()
  })
})

describe('SegmentedControl', () => {
  function Harness() {
    const [v, setV] = useState<'mine' | 'all'>('mine')
    return (
      <SegmentedControl
        label="Whose"
        value={v}
        onChange={setV}
        options={[
          { value: 'mine', label: 'Mine' },
          { value: 'all', label: 'All' },
        ]}
      />
    )
  }

  it('marks the chosen option as pressed', async () => {
    render(<Harness />)
    const all = screen.getByRole('button', { name: 'All' })
    expect(all.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(all)
    expect(all.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Mine' }).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('completion burst', () => {
  it('is decorative, skipped with reduced motion, and clears itself', async () => {
    vi.useFakeTimers()
    function Done() {
      const celebrate = useCelebrate()
      return (
        <button type="button" onClick={celebrate}>
          Did it
        </button>
      )
    }
    const { container } = render(
      <ToastProvider>
        <Done />
      </ToastProvider>,
    )
    act(() => screen.getByRole('button', { name: 'Did it' }).click())
    const burst = container.querySelector('[aria-hidden].motion-reduce\\:hidden')
    expect(burst?.children).toHaveLength(10)
    act(() => vi.advanceTimersByTime(800))
    expect(container.querySelector('.motion-reduce\\:hidden')).toBeNull()
    vi.useRealTimers()
  })
})

describe('Disclosure', () => {
  it('is a named region whose row says the summary and whether it is open', async () => {
    render(
      <Disclosure title="Costs" summary="$42.00">
        <p>$42.00 · Wren paid</p>
      </Disclosure>,
    )
    const region = screen.getByRole('region', { name: 'Costs' })
    const row = screen.getByRole('button', { name: 'Costs', description: '$42.00' })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(region.textContent).not.toContain('Wren paid')
    await userEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(region.textContent).toContain('Wren paid')
  })
})

describe('OverflowMenu', () => {
  it('opens a menu, moves with arrow keys, and closes on Escape back to its button', async () => {
    const edit = vi.fn()
    render(
      <OverflowMenu
        label="More actions"
        items={[
          { label: 'Edit', onSelect: edit },
          { label: 'Archive', onSelect: () => {} },
        ]}
      />,
    )
    const button = screen.getByRole('button', { name: 'More actions' })
    await userEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement?.textContent).toBe('Edit')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('Archive')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.textContent).toBe('Edit')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)

    await userEvent.click(button)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(edit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows nothing when there is nothing to do', () => {
    const { container } = render(<OverflowMenu items={[]} />)
    expect(container.innerHTML).toBe('')
  })
})

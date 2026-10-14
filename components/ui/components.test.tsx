// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListChecks, Pencil } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Avatar, initials } from './Avatar'
import { TierChip } from './Chip'
import { Disclosure } from './Disclosure'
import { IconButton } from './IconButton'
import { ListGroup, ListRow } from './ListRow'
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

describe('IconButton', () => {
  it('is named by its label, toggles with aria-pressed, and is disabled while busy', async () => {
    function Toggle() {
      const [on, setOn] = useState(false)
      return (
        <IconButton
          icon={ListChecks}
          label="Select all"
          aria-pressed={on}
          tone={on ? 'accent' : 'neutral'}
          onClick={() => setOn((o) => !o)}
        />
      )
    }
    render(<Toggle />)
    const button = screen.getByRole('button', { name: 'Select all' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    cleanup()
    render(<IconButton icon={Pencil} label="Edit" busy />)
    const busy = screen.getByRole('button', { name: 'Edit' })
    expect(busy).toHaveProperty('disabled', true)
    expect(busy.getAttribute('aria-busy')).toBe('true')
  })
})

describe('ListRow', () => {
  it('shows the edit Pencil inside its own button when editable, without a second control', () => {
    render(
      <ListGroup label="Contacts">
        <ListRow title="Super" subtitle="(555) 010-2231" editable onClick={() => {}} />
      </ListGroup>,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.querySelector('svg.lucide-pencil')).not.toBeNull()
    expect(buttons[0]!.textContent).toBe('Super(555) 010-2231')
  })
})

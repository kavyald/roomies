// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseId, PollId, RunId } from '@/lib/domain/ids'
import { OpenPoll, OpenRun } from './DeepLinks'

const replace = vi.fn()
const openPoll = vi.fn()
const openRun = vi.fn()
const lists = vi.hoisted(() => ({
  polls: {} as { data?: { id: string }[]; isError: boolean },
  runs: {} as { data?: { id: string }[]; isError: boolean },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/components/items/ItemSheets', () => ({ useItemSheets: () => ({ openPoll, openRun }) }))
vi.mock('@/lib/client/hooks', () => ({ usePolls: () => lists.polls, useRuns: () => lists.runs }))

const house = 'h1' as HouseId
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('poll and run deep links', () => {
  it('open the sheet over Home once the poll or run is in the house', () => {
    lists.polls = { data: [{ id: 'p1' }], isError: false }
    lists.runs = { data: [{ id: 'r1' }], isError: false }
    const { container } = render(
      <>
        <OpenPoll houseId={house} pollId={'p1' as PollId} />
        <OpenRun houseId={house} runId={'r1' as RunId} />
      </>,
    )
    expect(openPoll).toHaveBeenCalledWith('p1')
    expect(openRun).toHaveBeenCalledWith('r1')
    expect(replace).toHaveBeenCalledWith('/h/h1')
    expect(container.innerHTML).toBe('')
  })

  it('wait quietly while the house loads', () => {
    lists.polls = { isError: false }
    const { container } = render(<OpenPoll houseId={house} pollId={'p1' as PollId} />)
    expect(container.innerHTML).toBe('')
    expect(openPoll).not.toHaveBeenCalled()
  })

  it('say so kindly when the id is unknown (or from another house)', () => {
    lists.polls = { data: [{ id: 'p1' }], isError: false }
    lists.runs = { data: [], isError: false }
    render(<OpenPoll houseId={house} pollId={'nope' as PollId} />)
    expect(screen.getByRole('heading', { name: 'Poll', level: 1 })).toBeTruthy()
    expect(screen.getByText("We couldn't find that poll. It may have been removed.")).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Home' }).getAttribute('href')).toBe('/h/h1')
    cleanup()
    render(<OpenRun houseId={house} runId={'nope' as RunId} />)
    expect(screen.getByText("We couldn't find that run. It may have been removed.")).toBeTruthy()
    expect(openPoll).not.toHaveBeenCalled()
    expect(openRun).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('blame the connection, not the link, when the house is out of reach', () => {
    lists.runs = { isError: true }
    render(<OpenRun houseId={house} runId={'r1' as RunId} />)
    expect(
      screen.getByText("Couldn't reach the house. Check your connection and try again."),
    ).toBeTruthy()
  })
})

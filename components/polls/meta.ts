import type { Poll, PollResult } from '@/lib/domain/polls'

/** "Dyson V8 wins (3–1)", "It's a tie. Talk it out?", "No votes". */
export const resultLine = (p: Poll, r: PollResult): string => {
  if ('noVotes' in r) return 'No votes this time.'
  if ('tie' in r) return "It's a tie. Talk it out?"
  const label = p.options.find((o) => o.id === r.winner)?.label ?? 'An option'
  return `${label} wins (${r.votes}–${r.runnerUp})`
}

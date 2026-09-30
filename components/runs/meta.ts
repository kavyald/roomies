import { CalendarDays, Send, ShoppingCart, type LucideIcon } from 'lucide-react'
import type { Run } from '@/lib/domain/runs'

export const RUN_ICON: Record<Run['kind'], LucideIcon> = {
  batch: ShoppingCart,
  request: Send,
  visit: CalendarDays,
}

/** "Groceries", "Kavya's run", "Landlord visit", "Landlord request" (FRONTEND §3.4). */
export const runLabel = (
  run: Run,
  names: { person(id: string): string | undefined; contact(id: string): string | undefined },
): string => {
  if (run.title) return run.title
  if (run.kind === 'batch') return `${names.person(run.runner) ?? 'Someone'}'s run`
  const who = names.contact(run.contactId) ?? 'Contact'
  return run.kind === 'visit' ? `${who} visit` : `${who} request`
}

/** "On Kavya's run", "On Landlord visit", "Sent to Landlord" style badge text. */
export const onRunLabel = (run: Run, label: string): string =>
  run.kind === 'request' && run.state.at === 'sent' ? `Sent: ${label}` : `On ${label}`

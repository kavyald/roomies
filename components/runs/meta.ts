import { CalendarDays, Send, ShoppingCart, type LucideIcon } from 'lucide-react'
import { daysAgo } from '@/lib/domain/lists'
import type { Request, Run, SentVia } from '@/lib/domain/runs'
import { calendarDaysBetween, type Instant } from '@/lib/domain/time'

export const RUN_ICON: Record<Run['kind'], LucideIcon> = {
  batch: ShoppingCart,
  request: Send,
  visit: CalendarDays,
}

export { runLabel } from '@/lib/domain/runs'

/** "On Kavya's run", "On Landlord visit", "Sent to Landlord" style badge text. */
export const onRunLabel = (run: Run, label: string): string =>
  run.kind === 'request' && run.state.at === 'sent' ? `Sent: ${label}` : `On ${label}`

export const VIA_LABEL: Record<SentVia, string> = {
  text: 'by text',
  email: 'by email',
  call: 'by phone',
  portal: 'through the portal',
  in_person: 'in person',
}

/** "Sent 2 days ago by text", "not sent yet". */
export const requestStage = (run: Request, now: Instant, tz: string): string => {
  if (run.state.at === 'gathering') return 'not sent yet'
  if (run.state.at === 'closed') return 'all sorted'
  return `Sent ${daysAgo(calendarDaysBetween(run.state.sentAt, now, tz))} ${VIA_LABEL[run.state.via]}`
}

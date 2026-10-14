'use client'

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { cn } from '@/components/ui/cn'
import { useHouse, useItems, useRuns } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { byDay, calendarEntries, monthGrid, monthRange, shiftMonth } from '@/lib/domain/calendar'
import type { HouseId } from '@/lib/domain/ids'
import { localDateOf, type LocalDate } from '@/lib/domain/time'
import { useEntryView } from './useEntryLabel'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const dayName = (d: LocalDate) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay()
  return `${WEEKDAY_NAMES[wd]}, ${MONTHS[m - 1]} ${day}`
}

/** The month calendar (FRONTEND §5.10): dots on days with something, the selected day below. */
export function CalendarScreen({ houseId }: { houseId: HouseId }) {
  const items = useItems(houseId)
  const runs = useRuns(houseId)
  const house = useHouse(houseId)
  const now = useNow()
  const view = useEntryView(houseId)
  const tz = house.data?.settings.timezone ?? 'UTC'
  const today = localDateOf(now, tz)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState<LocalDate>(today)

  const { first, last } = monthRange(month)
  const days = byDay(calendarEntries(items.data ?? [], runs.data ?? [], first, last))
  const [y, m] = month.split('-').map(Number) as [number, number]
  const onDay = days.get(selected) ?? []
  const go = (by: number) => {
    const next = shiftMonth(month, by)
    setMonth(next)
    setSelected(next === today.slice(0, 7) ? today : monthRange(next).first)
  }

  return (
    <div className="grid gap-4">
      <div className="sticker grid gap-2 rounded-[20px] border-[1.5px] border-outline bg-card p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            className="grid size-11 place-items-center rounded-full"
            onClick={() => go(-1)}
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <h2 className="m-0 text-lg font-extrabold" aria-live="polite">
            {MONTHS[m - 1]} {y}
          </h2>
          <button
            type="button"
            aria-label="Next month"
            className="grid size-11 place-items-center rounded-full"
            onClick={() => go(1)}
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
        <table className="w-full table-fixed border-collapse text-center">
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className="pb-1 text-[0.75rem] font-extrabold text-ink-soft"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthGrid(month).map((week, w) => (
              <tr key={w}>
                {week.map((d, i) =>
                  d ? (
                    <td key={d} className="p-0.5">
                      <button
                        type="button"
                        aria-pressed={d === selected}
                        aria-label={`${dayName(d)}${
                          days.get(d)?.length
                            ? `, ${days.get(d)!.length} ${days.get(d)!.length === 1 ? 'thing' : 'things'}`
                            : ''
                        }`}
                        onClick={() => setSelected(d)}
                        className={cn(
                          'mx-auto grid size-11 place-items-center rounded-full text-[0.95rem] font-bold',
                          d === today && 'shadow-[inset_0_0_0_1.5px_var(--accent)]',
                          d === selected && 'bg-accent text-on-accent',
                        )}
                      >
                        <span className="leading-none">{Number(d.slice(8))}</span>
                        <span
                          aria-hidden
                          className={cn(
                            'size-1.5 rounded-full',
                            days.get(d)?.length
                              ? d === selected
                                ? 'bg-on-accent'
                                : 'bg-accent'
                              : 'bg-transparent',
                          )}
                        />
                      </button>
                    </td>
                  ) : (
                    <td key={`empty-${w}-${i}`} />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="day-list" className="grid gap-2.5">
        <h2 id="day-list" className="m-0 text-lg font-extrabold">
          {dayName(selected)}
        </h2>
        {onDay.length === 0 ? (
          <EmptyState icon={CalendarDays}>Nothing on this day.</EmptyState>
        ) : (
          <ListGroup label="On this day">
            {onDay.map((e) => {
              const v = view(e)
              return (
                <ListRow
                  key={v.key}
                  leading={<v.icon aria-hidden className="size-5 text-ink-soft" />}
                  title={v.title}
                  subtitle={e.when.time ?? 'Any time'}
                  onClick={v.open}
                />
              )
            })}
          </ListGroup>
        )}
      </section>
    </div>
  )
}

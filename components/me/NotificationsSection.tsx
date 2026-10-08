'use client'

import { ChevronDown, Moon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Field } from '@/components/auth/fields'
import { PushSettings } from '@/components/house/PushSettings'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import {
  useMyNotificationsOff,
  useSetNotificationEnabled,
  useUpdateMySettings,
} from '@/lib/client/hooks'
import { clockTime } from '@/lib/domain/format'
import type { HouseId } from '@/lib/domain/ids'
import {
  CATEGORY_LABEL,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type QuietHours,
} from '@/lib/domain/notifications'

/** The short name of each category; `CATEGORY_LABEL` is the "you get this when…" line under it. */
const CATEGORY_TITLE: Record<NotificationCategory, string> = {
  assigned: 'Handed to me',
  due: 'Coming due',
  feelings: 'Feelings on my things',
  polls: 'Polls',
  runs: 'Runs',
  people: 'People',
}

/** The on/off pill. Decorative: the button around it carries the switch role. */
function Pill({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative h-6 w-10 flex-none rounded-full transition-colors motion-reduce:transition-none',
        on ? 'bg-accent' : 'bg-neutral-fill',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-5 rounded-full bg-card shadow transition-[left] motion-reduce:transition-none',
          on ? 'left-[18px]' : 'left-0.5',
        )}
      />
    </span>
  )
}

/** A compact switch row: a short name, with what it means as its VoiceOver description. */
function SwitchRow({
  title,
  description,
  on,
  disabled,
  onChange,
}: {
  title: string
  description: string
  on: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  const id = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-d`}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-t`} className="block font-semibold">
          {title}
        </span>
        <span id={`${id}-d`} className="block text-[0.8125rem] leading-snug text-ink-soft">
          {description}
        </span>
      </span>
      <Pill on={on} />
    </button>
  )
}

/** Quiet hours as one row: "Quiet 10pm–8am" opens an inline editor; the switch beside it. */
function QuietHoursRow({
  quiet,
  busy,
  save,
}: {
  quiet: QuietHours
  busy: boolean
  save: (next: { start: string; end: string } | null) => Promise<boolean>
}) {
  const id = useId()
  const hasQuiet = quiet.start !== quiet.end
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState<string>(quiet.start)
  const [end, setEnd] = useState<string>(quiet.end)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStart(quiet.start)
    setEnd(quiet.end)
  }, [quiet.start, quiet.end])

  const summary = (
    <span className="min-w-0 flex-1">
      <span id={`${id}-t`} className="block font-semibold">
        {hasQuiet ? `Quiet ${clockTime(quiet.start)}–${clockTime(quiet.end)}` : 'Quiet hours off'}
      </span>
      <span id={`${id}-d`} className="block text-[0.8125rem] leading-snug text-ink-soft">
        {hasQuiet
          ? 'Notifications wait until quiet hours end. Nothing is lost.'
          : 'Notifications come any time.'}
      </span>
    </span>
  )

  return (
    <div>
      <div className="flex min-h-12 items-center gap-3 px-3.5">
        <Moon aria-hidden className="size-5 flex-none text-ink-soft" />
        {hasQuiet ? (
          <button
            type="button"
            aria-expanded={editing}
            aria-controls={`${id}-edit`}
            aria-labelledby={`${id}-t`}
            aria-describedby={`${id}-d`}
            onClick={() => setEditing(!editing)}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left"
          >
            {summary}
            <ChevronDown
              aria-hidden
              className={cn(
                'size-4 flex-none text-ink-soft transition-transform motion-reduce:transition-none',
                editing && 'rotate-180',
              )}
            />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 py-2">{summary}</div>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={hasQuiet}
          aria-label="Quiet hours"
          disabled={busy}
          onClick={async () => {
            setEditing(false)
            await save(hasQuiet ? { start: '00:00', end: '00:00' } : null)
          }}
          className="flex min-h-12 items-center"
        >
          <Pill on={hasQuiet} />
        </button>
      </div>
      {hasQuiet && editing && (
        <div id={`${id}-edit`} className="grid gap-2.5 px-3.5 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <Field
              id="quiet-start"
              label="From"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <Field
              id="quiet-end"
              label="Until"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <Button
            size="small"
            className="justify-self-start"
            disabled={busy || (start === quiet.start && end === quiet.end) || !start || !end}
            onClick={async () => {
              if (await save({ start, end })) setEditing(false)
            }}
          >
            Save quiet hours
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Notifications in one section (FRONTEND §5.11, PRD §11): this device's status and button, the
 * six categories, and quiet hours.
 */
export function NotificationsSection({ houseId, quiet }: { houseId: HouseId; quiet: QuietHours }) {
  const off = useMyNotificationsOff(houseId)
  const toggle = useSetNotificationEnabled(houseId)
  const update = useUpdateMySettings(houseId)
  const toast = useToast()

  if (!off.data) return <p className="text-ink-soft">Loading…</p>
  const turnedOff = new Set(off.data)

  const saveQuiet = async (next: { start: string; end: string } | null) => {
    const r = await update.mutateAsync({ quietHours: next })
    if (!r.ok && r.error !== 'no_change') {
      toast("Couldn't save quiet hours. Try again.")
      return false
    }
    return true
  }

  return (
    <div className="sticker grid divide-y-[1.5px] divide-line overflow-hidden rounded-[20px] border-[1.5px] border-outline bg-card">
      <PushSettings />
      <div role="group" aria-label="Tell me when" className="grid divide-y-[1.5px] divide-line">
        {NOTIFICATION_CATEGORIES.map((c) => (
          <SwitchRow
            key={c}
            title={CATEGORY_TITLE[c]}
            description={CATEGORY_LABEL[c]}
            on={!turnedOff.has(c)}
            disabled={toggle.isPending}
            onChange={async (on) => {
              const r = await toggle.mutateAsync({ category: c, enabled: on })
              if (!r.ok) toast("Couldn't change that. Try again.")
            }}
          />
        ))}
      </div>
      <QuietHoursRow quiet={quiet} busy={update.isPending} save={saveQuiet} />
    </div>
  )
}

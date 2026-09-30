'use client'

import { useEffect, useState } from 'react'
import { Field } from '@/components/auth/fields'
import { PushSettings } from '@/components/house/PushSettings'
import { useCardContext } from '@/components/items/useCardContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import {
  useMyNotificationsOff,
  useProfiles,
  useSetNotificationEnabled,
  useUpdateMySettings,
} from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { Theme } from '@/lib/domain/house'
import type { HouseId } from '@/lib/domain/ids'
import {
  CATEGORY_LABEL,
  DEFAULT_QUIET_HOURS,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '@/lib/domain/notifications'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 mb-2.5 text-[1.0625rem] font-extrabold">{children}</h2>
}

/** A labelled on/off switch row. */
function Toggle({
  label,
  on,
  disabled,
  flush,
  onChange,
}: {
  label: string
  on: boolean
  disabled?: boolean
  /** Inside an already padded card. */
  flush?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 py-2.5 text-left font-semibold',
        !flush && 'px-3.5',
      )}
    >
      <span className="flex-1">{label}</span>
      <span
        aria-hidden
        className={cn(
          'relative h-7 w-12 flex-none rounded-full transition-colors motion-reduce:transition-none',
          on ? 'bg-accent' : 'bg-neutral-fill',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-6 rounded-full bg-card shadow transition-[left] motion-reduce:transition-none',
            on ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

/** Personal settings (FRONTEND §5.1, PRD §11): which notifications, quiet hours, and theme. */
export function MeScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const profiles = useProfiles(houseId)
  const off = useMyNotificationsOff(houseId)
  const toggle = useSetNotificationEnabled(houseId)
  const update = useUpdateMySettings(houseId)
  const ctx = useCardContext(houseId)
  const toast = useToast()
  const mine = profiles.data?.find((p) => p.id === me)
  const quiet = mine?.quietHours ?? DEFAULT_QUIET_HOURS
  const hasQuiet = quiet.start !== quiet.end
  const [start, setStart] = useState<string>(quiet.start)
  const [end, setEnd] = useState<string>(quiet.end)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStart(quiet.start)
    setEnd(quiet.end)
  }, [quiet.start, quiet.end])

  if (!mine || !off.data) return <p className="text-ink-soft">Loading…</p>
  const turnedOff = new Set(off.data)
  const person = ctx.person(me)

  const saveQuiet = async (next: { start: string; end: string } | null) => {
    const r = await update.mutateAsync({ quietHours: next })
    if (!r.ok && r.error !== 'no_change') toast("Couldn't save quiet hours. Try again.")
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={mine.displayName} element={person?.element} size={48} />
        <p className="m-0 text-lg font-extrabold">{mine.displayName}</p>
      </div>

      <SectionTitle>Notifications</SectionTitle>
      <div className="grid gap-3">
        <PushSettings />
        <div
          role="group"
          aria-label="Tell me when"
          className="sticker grid divide-y-[1.5px] divide-line overflow-hidden rounded-[20px] border-[1.5px] border-outline bg-card"
        >
          {NOTIFICATION_CATEGORIES.map((c: NotificationCategory) => (
            <Toggle
              key={c}
              label={CATEGORY_LABEL[c]}
              on={!turnedOff.has(c)}
              disabled={toggle.isPending}
              onChange={async (on) => {
                const r = await toggle.mutateAsync({ category: c, enabled: on })
                if (!r.ok) toast("Couldn't change that. Try again.")
              }}
            />
          ))}
        </div>
      </div>

      <SectionTitle>Quiet hours</SectionTitle>
      <div className="sticker grid gap-2.5 rounded-[20px] border-[1.5px] border-outline bg-card p-3.5">
        <p className="m-0 text-sm text-ink-soft">
          Notifications wait until quiet hours end. Nothing is lost.
        </p>
        <Toggle
          flush
          label="Quiet hours"
          on={hasQuiet}
          disabled={update.isPending}
          onChange={(on) => saveQuiet(on ? null : { start: '00:00', end: '00:00' })}
        />
        {hasQuiet && (
          <>
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
              disabled={
                update.isPending || (start === quiet.start && end === quiet.end) || !start || !end
              }
              onClick={() => saveQuiet({ start, end })}
            >
              Save quiet hours
            </Button>
          </>
        )}
      </div>

      <SectionTitle>Appearance</SectionTitle>
      <SegmentedControl
        label="Theme"
        wide
        value={mine.theme}
        onChange={async (theme: Theme) => {
          const r = await update.mutateAsync({ theme })
          if (!r.ok && r.error !== 'no_change') toast("Couldn't change the theme. Try again.")
        }}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </>
  )
}

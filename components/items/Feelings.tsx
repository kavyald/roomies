'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { inputClass } from '@/components/auth/fields'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { useToast } from '@/components/ui/Toast'
import { useFeelings, useHouse, useItemActivity, useSetFeeling } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import { useNow } from '@/lib/client/use-now'
import {
  earlierFeelings,
  FEELING_KINDS,
  FEELING_META,
  feelingCounts,
  MAX_FEELING_NOTE,
  type Feeling,
  type FeelingKind,
} from '@/lib/domain/feelings'
import { relativeTime } from '@/lib/domain/format'
import type { Element } from '@/lib/domain/house'
import type { HouseId, ItemId } from '@/lib/domain/ids'

type Person = (id: string) => { name: string; element?: Element } | undefined

/** "😰 1 · 🙏 2" for a card or row; nothing when nobody has shared a feeling. */
export function FeelingCounts({ feelings }: { feelings: readonly Feeling[] }) {
  const counts = feelingCounts(feelings)
  if (counts.length === 0) return null
  const label = counts
    .map((c) => `${c.count} ${FEELING_META[c.kind].label.toLowerCase()}`)
    .join(', ')
  return (
    <span
      aria-label={`Feelings: ${label}`}
      className="flex gap-1.5 text-[0.8rem] font-bold text-ink-soft"
    >
      {counts.map((c) => (
        <span key={c.kind} aria-hidden>
          {FEELING_META[c.kind].emoji}
          {c.count}
        </span>
      ))}
    </span>
  )
}

/** Six big choices + an optional note (FRONTEND §5.2). */
function FeelingPicker({
  houseId,
  itemId,
  current,
  onDone,
}: {
  houseId: HouseId
  itemId: ItemId
  current?: Feeling
  onDone: () => void
}) {
  const setFeeling = useSetFeeling(houseId)
  const toast = useToast()
  const [kind, setKind] = useState<FeelingKind | null>(current?.kind ?? null)
  const [note, setNote] = useState(current?.note ?? '')

  const share = async () => {
    if (!kind) return
    const r = await setFeeling.mutateAsync({ itemId, kind, ...(note.trim() && { note }) })
    if (r.ok) toast('Shared. The house can see how you feel. 💛')
    else if (r.error !== 'no_change')
      return toast(
        r.error === 'note_too_long'
          ? 'Keep the note under 280 characters.'
          : "Couldn't share it. Try again.",
      )
    onDone()
  }
  const remove = async () => {
    const r = await setFeeling.mutateAsync({ itemId, kind: null })
    toast(r.ok ? 'Removed your feeling.' : "Couldn't remove it. Try again.")
    onDone()
  }

  return (
    <section
      aria-label="How do you feel about this?"
      className="grid gap-3 rounded-2xl bg-paper p-3"
    >
      <div>
        <h3 className="m-0 text-base font-extrabold">How do you feel about this?</h3>
        <p className="m-0 text-sm text-ink-soft">
          Only if it matters to you. The house will see it.
        </p>
      </div>
      <div role="radiogroup" aria-label="Feeling" className="grid grid-cols-3 gap-2">
        {FEELING_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'grid justify-items-center gap-1 rounded-[18px] bg-card px-1 py-3 text-[0.8rem] font-bold text-ink-soft shadow-[inset_0_0_0_1.5px_var(--line)] motion-safe:transition-transform',
              kind === k &&
                'scale-[1.04] bg-top-fill text-top-ink shadow-[inset_0_0_0_2px_var(--accent)]',
            )}
          >
            <span aria-hidden className="text-[1.9rem] leading-none">
              {FEELING_META[k].emoji}
            </span>
            {FEELING_META[k].label}
          </button>
        ))}
      </div>
      <label htmlFor="feeling-note" className="sr-only">
        Add a note (optional)
      </label>
      <textarea
        id="feeling-note"
        rows={2}
        maxLength={MAX_FEELING_NOTE}
        placeholder="Add a note (optional)"
        className={`${inputClass} resize-none`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button block disabled={!kind || setFeeling.isPending} onClick={share}>
        Share with the house
      </Button>
      {current && (
        <Button block variant="secondary" disabled={setFeeling.isPending} onClick={remove}>
          Remove my feeling
        </Button>
      )}
    </section>
  )
}

/** "How the house feels" (FRONTEND §5.4): current feelings with notes, then Earlier. */
export function HouseFeels({
  houseId,
  itemId,
  person,
}: {
  houseId: HouseId
  itemId: ItemId
  person: Person
}) {
  const { me } = useAppClient()
  const feelings = useFeelings(houseId)
  const activity = useItemActivity(houseId, itemId)
  const house = useHouse(houseId)
  const now = useNow()
  const [picking, setPicking] = useState(false)
  const [showEarlier, setShowEarlier] = useState(false)
  const tz = house.data?.settings.timezone ?? 'UTC'

  const current = (feelings.data ?? [])
    .filter((f) => f.itemId === itemId)
    .sort((a, b) => (a.by === me ? -1 : b.by === me ? 1 : b.at.epochMs - a.at.epochMs))
  const mine = current.find((f) => f.by === me)
  const earlier = activity.data ? earlierFeelings(activity.data) : []

  const row = (f: Feeling, key: string) => {
    const who = person(f.by)
    return (
      <li key={key} className="flex items-start gap-2.5">
        <Avatar name={who?.name ?? 'Former roommate'} element={who?.element} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-bold">
            {f.by === me ? 'You' : (who?.name ?? 'Former roommate')} · {FEELING_META[f.kind].emoji}{' '}
            {FEELING_META[f.kind].label}
            <span className="font-semibold text-ink-soft"> · {relativeTime(f.at, now, tz)}</span>
          </p>
          {f.note && <p className="m-0 text-sm leading-snug text-ink-soft">{f.note}</p>}
        </div>
      </li>
    )
  }

  return (
    <section aria-label="How the house feels" className="grid gap-2.5">
      <h3 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
        How the house feels
      </h3>
      {current.length === 0 && !picking && (
        <p className="m-0 text-sm text-ink-soft">No feelings shared yet.</p>
      )}
      {current.length > 0 && (
        <ul className="m-0 grid list-none gap-2.5 p-0">{current.map((f) => row(f, f.by))}</ul>
      )}
      {picking ? (
        <FeelingPicker
          houseId={houseId}
          itemId={itemId}
          current={mine}
          onDone={() => setPicking(false)}
        />
      ) : (
        <Button
          variant="secondary"
          size="small"
          className="justify-self-start"
          onClick={() => setPicking(true)}
        >
          {mine ? 'Change my feeling' : '🙂+ Share a feeling'}
        </Button>
      )}
      {earlier.length > 0 && (
        <div className="grid gap-2">
          <button
            type="button"
            aria-expanded={showEarlier}
            onClick={() => setShowEarlier((s) => !s)}
            className="flex min-h-11 items-center gap-1 justify-self-start text-sm font-bold text-ink-soft"
          >
            Earlier ({earlier.length}){' '}
            <ChevronDown aria-hidden className={cn('size-4', showEarlier && 'rotate-180')} />
          </button>
          {showEarlier && (
            <ul aria-label="Earlier feelings" className="m-0 grid list-none gap-2.5 p-0 opacity-80">
              {earlier.map((f, i) => row(f, `${f.by}-${i}`))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

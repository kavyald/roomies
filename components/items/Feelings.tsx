'use client'

import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
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

/** My current feeling about an item, if I've shared one. */
export const useMyFeeling = (houseId: HouseId, itemId: ItemId): Feeling | undefined => {
  const { me } = useAppClient()
  const feelings = useFeelings(houseId)
  return feelings.data?.find((f) => f.itemId === itemId && f.by === me)
}

/** The 🙂+ that opens the emoji tray, beside a card or row (never inside its button). */
export function FeelingButton({
  title,
  open,
  controls,
  onClick,
  className,
  ref,
}: {
  title: string
  open: boolean
  controls: string
  onClick: () => void
  className?: string
  ref?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={`Share a feeling: ${title}`}
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={onClick}
      className={cn(
        'grid size-11 flex-none place-items-center rounded-full text-[0.95rem] leading-none',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid h-8 min-w-9 place-items-center rounded-full px-1.5 font-bold text-ink-soft',
          open ? 'bg-top-fill text-top-ink' : 'bg-neutral-fill',
        )}
      >
        🙂+
      </span>
    </button>
  )
}

/**
 * The six emoji, one tap each (FRONTEND §5.2): tapping one shares it straight away, with "Add a
 * note" in the toast; tapping your current one removes it. Opens from 🙂+ on a card, a swipe left,
 * or the detail sheet. Escape closes it.
 */
export function FeelingTray({
  id,
  houseId,
  itemId,
  labels = false,
  onDone,
  onAddNote,
  className,
}: {
  id?: string
  houseId: HouseId
  itemId: ItemId
  /** Show each feeling's name under its emoji (the detail sheet has room for them). */
  labels?: boolean
  /** Called after a choice, or on Escape, so the tray can close. */
  onDone: () => void
  /** "Add a note" in the toast. */
  onAddNote: () => void
  className?: string
}) {
  const mine = useMyFeeling(houseId, itemId)
  const setFeeling = useSetFeeling(houseId)
  const toast = useToast()
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus({ preventScroll: true }), [])

  const choose = async (kind: FeelingKind) => {
    onDone()
    if (mine?.kind === kind) {
      const r = await setFeeling.mutateAsync({ itemId, kind: null })
      return toast(r.ok ? 'Removed your feeling.' : "Couldn't remove it. Try again.")
    }
    const r = await setFeeling.mutateAsync({ itemId, kind })
    if (r.ok)
      toast('Shared. The house can see how you feel. 💛', {
        label: 'Add a note',
        onClick: onAddNote,
      })
    else toast("Couldn't share it. Try again.")
  }
  const escape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    onDone()
  }

  return (
    <div
      id={id}
      role="group"
      aria-label="How do you feel about this?"
      data-keeps-escape
      onKeyDown={escape}
      className={cn('grid grid-cols-6 gap-1', className)}
    >
      {FEELING_KINDS.map((k) => {
        const pressed = mine?.kind === k
        return (
          <button
            key={k}
            ref={(mine ? pressed : k === FEELING_KINDS[0]) ? first : undefined}
            type="button"
            aria-pressed={pressed}
            aria-label={FEELING_META[k].label}
            title={pressed ? `${FEELING_META[k].label} (tap to remove)` : FEELING_META[k].label}
            disabled={setFeeling.isPending}
            onClick={() => choose(k)}
            className={cn(
              'grid min-h-11 justify-items-center gap-0.5 rounded-2xl px-0.5 py-1.5 text-[0.7rem] leading-tight font-bold text-ink-soft motion-safe:transition-transform',
              pressed
                ? 'bg-top-fill text-top-ink shadow-[inset_0_0_0_2px_var(--accent)]'
                : 'bg-paper shadow-[inset_0_0_0_1.5px_var(--line)]',
            )}
          >
            <span aria-hidden className={cn('leading-none', labels ? 'text-[1.7rem]' : 'text-2xl')}>
              {FEELING_META[k].emoji}
            </span>
            {labels && <span aria-hidden>{FEELING_META[k].label}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** A note on my feeling, after the fact ("Add a note" in the toast, or in the detail sheet). */
function NoteEditor({
  houseId,
  mine,
  onDone,
}: {
  houseId: HouseId
  mine: Feeling
  onDone: () => void
}) {
  const setFeeling = useSetFeeling(houseId)
  const toast = useToast()
  const [note, setNote] = useState(mine.note ?? '')
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const r = await setFeeling.mutateAsync({
      itemId: mine.itemId,
      kind: mine.kind,
      ...(note.trim() && { note }),
    })
    if (!r.ok && r.error === 'note_too_long') return toast('Keep the note under 280 characters.')
    if (!r.ok && r.error !== 'no_change') return toast("Couldn't save it. Try again.")
    if (r.ok) toast('Saved your note.')
    onDone()
  }
  return (
    <form
      onSubmit={save}
      aria-label={`A note with your ${FEELING_META[mine.kind].emoji}`}
      data-keeps-escape
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        onDone()
      }}
      className="grid gap-2 rounded-2xl bg-paper p-3"
    >
      <label htmlFor="feeling-note" className="text-sm font-extrabold">
        Add a note to your {FEELING_META[mine.kind].emoji}
      </label>
      <textarea
        id="feeling-note"
        rows={2}
        autoFocus
        maxLength={MAX_FEELING_NOTE}
        placeholder="What's going on? (optional)"
        className={`${inputClass} resize-none`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="small" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="small" disabled={setFeeling.isPending}>
          Save note
        </Button>
      </div>
    </form>
  )
}

/** "How the house feels" (FRONTEND §5.4): current feelings with notes, then Earlier. */
export function HouseFeels({
  houseId,
  itemId,
  person,
  startWithNote = false,
}: {
  houseId: HouseId
  itemId: ItemId
  person: Person
  /** Opened from "Add a note" in the toast: show the note editor for my feeling. */
  startWithNote?: boolean
}) {
  const { me } = useAppClient()
  const feelings = useFeelings(houseId)
  const activity = useItemActivity(houseId, itemId)
  const house = useHouse(houseId)
  const now = useNow()
  const [picking, setPicking] = useState(false)
  const [editingNote, setEditingNote] = useState(startWithNote)
  const [showEarlier, setShowEarlier] = useState(false)
  const pick = useRef<HTMLButtonElement>(null)
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
      {editingNote && mine ? (
        <NoteEditor houseId={houseId} mine={mine} onDone={() => setEditingNote(false)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            ref={pick}
            variant="secondary"
            size="small"
            aria-expanded={picking}
            aria-controls={picking ? 'feeling-tray' : undefined}
            onClick={() => setPicking((p) => !p)}
          >
            {mine ? 'Change my feeling' : '🙂+ Share a feeling'}
          </Button>
          {mine && !picking && (
            <Button variant="secondary" size="small" onClick={() => setEditingNote(true)}>
              {mine.note ? 'Edit my note' : 'Add a note'}
            </Button>
          )}
        </div>
      )}
      {picking && (
        <div className="grid gap-1.5">
          <p className="m-0 text-sm text-ink-soft">
            Only if it matters to you. The house will see it.
            {mine && ' Tap yours again to remove it.'}
          </p>
          <FeelingTray
            id="feeling-tray"
            houseId={houseId}
            itemId={itemId}
            labels
            onDone={() => {
              setPicking(false)
              pick.current?.focus()
            }}
            onAddNote={() => setEditingNote(true)}
          />
        </div>
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

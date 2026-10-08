'use client'

import { CalendarClock, Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/components/auth/fields'
import { useCardContext } from '@/components/items/useCardContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import {
  useAddPollOption,
  useClosePoll,
  useHouse,
  useItems,
  useMembers,
  usePolls,
  useReopenPoll,
  useSetPollDeadline,
  useVote,
  useWithdrawVote,
} from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import { useNow } from '@/lib/client/use-now'
import { describeWhen } from '@/lib/domain/format'
import type { HouseId, ItemId, PollId } from '@/lib/domain/ids'
import { isPollOpen, resultOf, tally } from '@/lib/domain/polls'
import { instantAt, localDateOf, toIso, type LocalDate, type LocalTime } from '@/lib/domain/time'
import { resultLine } from './meta'

const PROBLEM: Record<string, string> = {
  duplicate_label: "That one's already an option.",
  empty_label: 'Give the option a name.',
  label_too_long: 'That option is a bit long.',
  closed: 'This poll is closed.',
  in_the_past: "Pick a day that hasn't passed yet.",
}

/**
 * The poll sheet (FRONTEND §5.8): tap an option to vote, tap another to change, tap yours again to
 * take it back. The deadline can be changed while it's open, and a closed poll can be reopened.
 */
export function PollSheet({
  houseId,
  pollId,
  onClose,
  onOpenItem,
}: {
  houseId: HouseId
  pollId: PollId
  onClose: () => void
  onOpenItem: (id: ItemId) => void
}) {
  const { me } = useAppClient()
  const polls = usePolls(houseId)
  const items = useItems(houseId)
  const members = useMembers(houseId)
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const now = useNow()
  const toast = useToast()
  const vote = useVote(houseId)
  const add = useAddPollOption(houseId)
  const close = useClosePoll(houseId)
  const withdraw = useWithdrawVote(houseId)
  const reopen = useReopenPoll(houseId)
  const setDeadline = useSetPollDeadline(houseId)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  // The deadline editor: null while it's not open, else the day picked (YYYY-MM-DD, '' for none).
  const [deadline, setDeadlineDraft] = useState<string | null>(null)

  const poll = polls.data?.find((p) => p.id === pollId)
  if (!poll) return null
  const tz = house.data?.settings.timezone ?? 'UTC'
  const open = isPollOpen(poll, now)
  const about = poll.itemId ? items.data?.find((i) => i.id === poll.itemId) : undefined
  const counts = new Map(tally(poll).map((c) => [c.option, c.votes]))
  const mine = poll.votes.find((v) => v.user === me)?.option
  const active = (members.data ?? []).filter((m) => m.status.active).length
  const status = [
    `${poll.votes.length} of ${active} voted`,
    open &&
      poll.closesAt &&
      `closes ${describeWhen({ date: localDateOf(poll.closesAt, tz) }, now, tz)}`,
    !open && 'Closed',
  ]
    .filter(Boolean)
    .join(' · ')
  const result = !poll.state.open ? resultOf(poll) : undefined
  const busy =
    vote.isPending ||
    add.isPending ||
    close.isPending ||
    withdraw.isPending ||
    reopen.isPending ||
    setDeadline.isPending
  const today = localDateOf(now, tz)
  const closesOn = poll.closesAt ? localDateOf(poll.closesAt, tz) : undefined
  const saveDeadline = async (day: string | null) => {
    // A deadline closes it at the end of that day, in the house's time zone (as when it started).
    const closesAt = day ? toIso(instantAt(day as LocalDate, '23:59' as LocalTime, tz)) : null
    const r = await setDeadline.mutateAsync({ pollId: poll.id, closesAt })
    if (!r.ok && r.error !== 'no_change')
      return toast(PROBLEM[r.error] ?? "Couldn't change the deadline. Try again.")
    setDeadlineDraft(null)
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={poll.question} description={status}>
      {about && (
        <button
          type="button"
          className="min-h-11 justify-self-start text-sm font-extrabold text-accent-ink"
          onClick={() => onOpenItem(about.id)}
        >
          About: {about.title}
        </button>
      )}
      {result && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-top-fill px-3.5 py-3 font-extrabold text-top-ink"
        >
          {resultLine(poll, result)}
        </p>
      )}
      <div
        role="radiogroup"
        aria-label="Options"
        aria-describedby={open && mine ? 'poll-withdraw-hint' : undefined}
        className="grid gap-2"
      >
        {poll.options.map((o) => {
          const voters = poll.votes.filter((v) => v.option === o.id)
          const chosen = mine === o.id
          const addedBy =
            o.addedBy === me ? 'you' : (ctx.person(o.addedBy)?.name ?? 'a former roommate')
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={!open || busy}
              onClick={async () => {
                if (chosen) {
                  const r = await withdraw.mutateAsync({ pollId: poll.id })
                  return toast(
                    r.ok
                      ? 'Vote taken back.'
                      : (PROBLEM[r.error] ?? "Couldn't do that. Try again."),
                  )
                }
                const r = await vote.mutateAsync({ pollId: poll.id, optionId: o.id })
                if (!r.ok) toast(PROBLEM[r.error] ?? "Couldn't vote. Try again.")
              }}
              className={cn(
                'grid min-h-14 gap-1 rounded-[18px] bg-paper px-3.5 py-3 text-left shadow-[inset_0_0_0_1.5px_var(--line)] disabled:cursor-default',
                chosen && 'bg-top-fill text-top-ink shadow-[inset_0_0_0_2px_var(--accent)]',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 font-extrabold">{o.label}</span>
                {chosen && <Check aria-hidden className="size-5" />}
                <span className="font-extrabold tabular-nums">{counts.get(o.id) ?? 0}</span>
              </span>
              {o.note && <span className="text-sm opacity-90">{o.note}</span>}
              <span className="flex items-center justify-between gap-2 text-[0.78rem] font-semibold opacity-80">
                <span>Added by {addedBy}</span>
                <span className="flex -space-x-1.5">
                  {voters.map((v) => {
                    const p = ctx.person(v.user)
                    return (
                      <Avatar
                        key={v.user}
                        name={p?.name ?? 'Former roommate'}
                        element={p?.element}
                        size={20}
                      />
                    )
                  })}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {open && mine && (
        <p id="poll-withdraw-hint" className="m-0 text-[0.8rem] font-semibold text-ink-soft">
          Changed your mind? Tap your pick again to take your vote back.
        </p>
      )}

      {open &&
        (adding ? (
          <div className="grid gap-2 rounded-2xl bg-paper p-3">
            <Field
              id="option-label"
              label="Option"
              maxLength={80}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Field
              id="option-note"
              label="Note (optional)"
              placeholder="A link or a price"
              maxLength={280}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              disabled={busy || !label.trim()}
              onClick={async () => {
                const r = await add.mutateAsync({
                  pollId: poll.id,
                  label,
                  ...(note.trim() && { note }),
                })
                if (!r.ok) return toast(PROBLEM[r.error] ?? "Couldn't add it. Try again.")
                setLabel('')
                setNote('')
                setAdding(false)
              }}
            >
              Add option
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="flex min-h-11 items-center gap-1 justify-self-start font-bold text-accent-ink"
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden className="size-4" /> Add an option
          </button>
        ))}

      {poll.state.open &&
        (deadline === null ? (
          <div className="flex min-h-11 items-center gap-2">
            <CalendarClock aria-hidden className="size-4 text-ink-soft" />
            <span className="flex-1 text-sm font-bold">
              {closesOn ? `Closes ${describeWhen({ date: closesOn }, now, tz)}` : 'No deadline'}
            </span>
            <button
              type="button"
              className="min-h-11 px-1 text-sm font-extrabold text-accent-ink"
              aria-label={closesOn ? 'Change the deadline' : undefined}
              disabled={busy}
              onClick={() => setDeadlineDraft(closesOn ?? '')}
            >
              {closesOn ? 'Change' : 'Add a deadline'}
            </button>
          </div>
        ) : (
          <div className="grid gap-2 rounded-2xl bg-paper p-3">
            <Field
              id="poll-deadline-edit"
              label="Closes"
              type="date"
              min={today}
              value={deadline}
              onChange={(e) => setDeadlineDraft(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                disabled={busy || !deadline}
                onClick={() => saveDeadline(deadline)}
              >
                Save
              </Button>
              {closesOn && (
                <Button
                  size="small"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => saveDeadline(null)}
                >
                  No deadline
                </Button>
              )}
              <Button
                size="small"
                variant="secondary"
                disabled={busy}
                onClick={() => setDeadlineDraft(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ))}

      {poll.state.open ? (
        <Button
          variant="secondary"
          block
          disabled={busy}
          onClick={async () => {
            const r = await close.mutateAsync({ pollId: poll.id })
            if (!r.ok) toast("Couldn't close it. Try again.")
          }}
        >
          Close poll
        </Button>
      ) : (
        <Button
          variant="secondary"
          block
          disabled={busy}
          onClick={async () => {
            const r = await reopen.mutateAsync({ pollId: poll.id })
            toast(
              r.ok ? 'Poll reopened. Votes can change again.' : "Couldn't reopen it. Try again.",
            )
          }}
        >
          Reopen poll
        </Button>
      )}
    </Sheet>
  )
}

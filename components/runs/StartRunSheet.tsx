'use client'

import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Field } from '@/components/auth/fields'
import { FeelingCounts } from '@/components/items/Feelings'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { useFeelingsByItem, useHouse, useItems, useStartRun } from '@/lib/client/hooks'
import { feelingScore } from '@/lib/domain/feelings'
import type { HouseId, ItemId, RunId } from '@/lib/domain/ids'
import { needList } from '@/lib/domain/lists'
import type { LocalDate } from '@/lib/domain/time'

/**
 * "Start a run" (FRONTEND §5.5): every open need that isn't on a run yet, already checked (the ones
 * with a feeling first), so the usual run is one tap. Uncheck what you won't get; a title and date
 * sit behind More options (T44).
 */
export function StartRunSheet({
  houseId,
  onClose,
  onStarted,
}: {
  houseId: HouseId
  onClose: () => void
  onStarted: (id: RunId) => void
}) {
  const items = useItems(houseId)
  const house = useHouse(houseId)
  const feelingsBy = useFeelingsByItem(houseId)
  const start = useStartRun(houseId)
  const toast = useToast()
  // What's left out (not what's in), so needs that load or arrive later start checked too.
  const [skipped, setSkipped] = useState<ReadonlySet<ItemId>>(new Set())
  const [more, setMore] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')

  const weights = house.data?.settings.feelingWeights
  const needs = useMemo(
    () =>
      needList(items.data ?? [], (id) =>
        weights ? feelingScore(feelingsBy.get(id) ?? [], weights) : 0,
      ).filter((n) => !n.run),
    [items.data, feelingsBy, weights],
  )
  const picked = needs.filter((n) => !skipped.has(n.id)).map((n) => n.id)
  const all = picked.length === needs.length && needs.length > 0

  const submit = async () => {
    const r = await start.mutateAsync({
      itemIds: picked,
      ...(title.trim() && { title }),
      ...(date && { when: { date: date as LocalDate } }),
    })
    if (!r.ok) {
      return toast(
        r.error === 'already_on_a_run'
          ? "Someone's already put one of those on a run."
          : "Couldn't start the run. Try again.",
      )
    }
    toast('Run started. 🛒')
    onStarted(r.value.id)
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Start a run"
      description="Everything's checked. Uncheck what you won't get."
    >
      {!items.data ? null : needs.length === 0 ? (
        <p className="m-0 text-ink-soft">Everything on the list is already on a run.</p>
      ) : (
        <>
          <Button
            variant="secondary"
            size="small"
            className="justify-self-start"
            onClick={() => setSkipped(all ? new Set(needs.map((n) => n.id)) : new Set())}
          >
            {all ? 'Clear' : 'Select all'}
          </Button>
          <ul aria-label="Open needs" className="m-0 grid list-none gap-1 p-0">
            {needs.map((n) => (
              <li key={n.id}>
                <label className="flex min-h-12 items-center gap-3 px-1">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--accent)]"
                    checked={!skipped.has(n.id)}
                    onChange={() =>
                      setSkipped((s) => {
                        const next = new Set(s)
                        if (next.has(n.id)) next.delete(n.id)
                        else next.add(n.id)
                        return next
                      })
                    }
                  />
                  <span className="flex-1 font-bold">{n.title}</span>
                  <FeelingCounts feelings={feelingsBy.get(n.id) ?? []} />
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <button
        type="button"
        aria-expanded={more}
        aria-controls="start-run-more"
        onClick={() => setMore((m) => !m)}
        className="flex min-h-11 items-center gap-1.5 justify-self-start text-sm font-extrabold text-accent-ink"
      >
        More options
        <ChevronDown
          aria-hidden
          className={cn('size-4 transition-transform', more && 'rotate-180')}
        />
      </button>
      {more && (
        <div id="start-run-more" className="grid gap-2.5">
          <Field
            id="run-title"
            label="Title (optional)"
            placeholder="Amazon order"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Field
            id="run-date"
            label="When (optional)"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      )}
      <Button block disabled={start.isPending || picked.length === 0} onClick={submit}>
        {picked.length === 0
          ? 'Start run'
          : `Start run · ${picked.length} ${picked.length === 1 ? 'thing' : 'things'}`}
      </Button>
    </Sheet>
  )
}

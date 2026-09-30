'use client'

import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { inputClass } from '@/components/auth/fields'
import { CATEGORY } from '@/components/items/meta'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import {
  useFinishRun,
  useHouse,
  useItems,
  useMarkRunItemsDone,
  useMoveRunItems,
  useReturnToPool,
  useRunActivity,
  useRuns,
} from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { describeWhen } from '@/lib/domain/format'
import type { HouseId, ItemId, RunId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { isRunOpen, runLedger, runProgress, runSteps, type LedgerEntry } from '@/lib/domain/runs'

type Panel = null | 'move' | 'back'

/** A run's sheet (FRONTEND §5.9): every item that's been on it, and bulk actions on a selection. */
export function RunSheet({
  houseId,
  runId,
  onClose,
}: {
  houseId: HouseId
  runId: RunId
  onClose: () => void
}) {
  const runs = useRuns(houseId)
  const items = useItems(houseId)
  const activity = useRunActivity(houseId, runId)
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const now = useNow()
  const toast = useToast()
  const done = useMarkRunItemsDone(houseId)
  const move = useMoveRunItems(houseId)
  const back = useReturnToPool(houseId)
  const finish = useFinishRun(houseId)
  const [selected, setSelected] = useState<ReadonlySet<ItemId>>(new Set())
  const [panel, setPanel] = useState<Panel>(null)
  const [note, setNote] = useState('')
  const [target, setTarget] = useState<RunId | ''>('')
  const [clearContact, setClearContact] = useState(true)

  const run = runs.data?.find((r) => r.id === runId)
  const byId = useMemo(() => new Map((items.data ?? []).map((i) => [i.id, i])), [items.data])
  const ledger = useMemo(
    () =>
      run && activity.data
        ? runLedger(run.id, runSteps(activity.data), items.data ?? [])
        : ([] as LedgerEntry[]),
    [run, activity.data, items.data],
  )
  if (!run) return null

  const label = ctx.run(run.id)?.label ?? 'Run'
  const tz = house.data?.settings.timezone ?? 'UTC'
  const open = isRunOpen(run)
  const pending = ledger.filter((e) => e.state.at === 'pending').map((e) => e.itemId)
  const chosen = pending.filter((id) => selected.has(id))
  const chosenItems = chosen.map((id) => byId.get(id)).filter((i): i is Item => !!i)
  const { done: doneCount, total } = runProgress(ledger)
  const busy = done.isPending || move.isPending || back.isPending || finish.isPending

  const reset = () => {
    setSelected(new Set())
    setPanel(null)
    setNote('')
    setTarget('')
  }
  const say = (ok: boolean, success: string) => {
    toast(ok ? success : "Couldn't do that. Try again.")
    if (ok) reset()
  }
  const toggle = (id: ItemId) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Requests and visits take tasks only; a sent request takes nothing more.
  const tasksOnly = chosenItems.every((i) => i.category === 'task')
  const targets = (runs.data ?? []).filter(
    (r) =>
      r.id !== run.id &&
      isRunOpen(r) &&
      !(r.kind === 'request' && r.state.at === 'sent') &&
      (r.kind === 'batch' || tasksOnly),
  )

  const who = ctx.person(run.runner)?.name
  const header = [
    run.kind === 'batch' ? who && `${who}'s on it` : who && `Point person: ${who}`,
    run.kind !== 'request' && run.when && describeWhen(run.when, now, tz),
    open ? `${doneCount} of ${total} done` : 'Finished',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={label} description={header}>
      {ledger.length === 0 ? (
        <p className="m-0 text-ink-soft">Nothing on this run yet.</p>
      ) : (
        <ul aria-label="On this run" className="m-0 grid list-none gap-1 p-0">
          {ledger.map((e) => {
            const item = byId.get(e.itemId)
            const title = item?.title ?? 'An item'
            const Icon = item ? CATEGORY[item.category].icon : Check
            if (e.state.at === 'pending' && open) {
              return (
                <li key={e.itemId}>
                  <label className="flex min-h-12 items-center gap-3 rounded-2xl px-1">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--accent)]"
                      checked={selected.has(e.itemId)}
                      onChange={() => toggle(e.itemId)}
                    />
                    <Icon aria-hidden className="size-4 text-ink-soft" />
                    <span className="flex-1 font-bold">{title}</span>
                  </label>
                </li>
              )
            }
            return (
              <li key={e.itemId} className="flex min-h-12 items-center gap-3 px-1 text-ink-soft">
                <span className="size-5" />
                <Icon aria-hidden className="size-4" />
                <span className="min-w-0 flex-1">
                  <span className={cn('font-bold', e.state.at === 'done' && 'line-through')}>
                    {title}
                  </span>
                  <span className="block text-[0.8rem] font-semibold">{outcome(e, ctx)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {open && pending.length > 0 && (
        <div className="grid gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                setSelected(chosen.length === pending.length ? new Set() : new Set(pending))
              }
            >
              {chosen.length === pending.length ? 'Clear' : 'Select all'}
            </Button>
            <Button
              size="small"
              disabled={busy || chosen.length === 0}
              onClick={async () =>
                say(
                  (await done.mutateAsync({ runId: run.id, itemIds: chosen })).ok,
                  chosen.length === 1 ? 'Done. 💛' : `${chosen.length} done. 💛`,
                )
              }
            >
              Done
            </Button>
            <Button
              variant="secondary"
              size="small"
              aria-expanded={panel === 'move'}
              disabled={busy || chosen.length === 0}
              onClick={() => setPanel(panel === 'move' ? null : 'move')}
            >
              Move to…
            </Button>
            <Button
              variant="secondary"
              size="small"
              aria-expanded={panel === 'back'}
              disabled={busy || chosen.length === 0}
              onClick={() => setPanel(panel === 'back' ? null : 'back')}
            >
              Back to the pool…
            </Button>
          </div>

          {panel === 'move' && chosen.length > 0 && (
            <div className="grid gap-2 rounded-2xl bg-paper p-3">
              <label htmlFor="move-to" className="text-[0.8rem] font-extrabold text-ink-soft">
                Move {chosen.length === 1 ? 'it' : `these ${chosen.length}`} to
              </label>
              {targets.length === 0 ? (
                <p className="m-0 text-sm text-ink-soft">
                  No other open run to move to. Start one from Needs.
                </p>
              ) : (
                <select
                  id="move-to"
                  className={inputClass}
                  value={target}
                  onChange={(e) => setTarget(e.target.value as RunId | '')}
                >
                  <option value="">Pick a run</option>
                  {targets.map((r) => (
                    <option key={r.id} value={r.id}>
                      {ctx.run(r.id)?.label ?? 'Run'}
                    </option>
                  ))}
                </select>
              )}
              <NoteField value={note} onChange={setNote} />
              <Button
                disabled={busy || !target}
                onClick={async () =>
                  target &&
                  say(
                    (
                      await move.mutateAsync({
                        fromRunId: run.id,
                        toRunId: target,
                        itemIds: chosen,
                        note: note || undefined,
                      })
                    ).ok,
                    `Moved to ${ctx.run(target)?.label ?? 'the other run'}.`,
                  )
                }
              >
                Move
              </Button>
            </div>
          )}

          {panel === 'back' && chosen.length > 0 && (
            <div className="grid gap-2 rounded-2xl bg-paper p-3">
              <NoteField value={note} onChange={setNote} placeholder="Not done this time" />
              {run.kind !== 'batch' && (
                <label className="flex min-h-11 items-center gap-2.5 text-sm font-bold">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--accent)]"
                    checked={clearContact}
                    onChange={(e) => setClearContact(e.target.checked)}
                  />
                  Change &ldquo;Handled by&rdquo; to One of us
                </label>
              )}
              <Button
                disabled={busy}
                onClick={async () =>
                  say(
                    (
                      await back.mutateAsync({
                        runId: run.id,
                        itemIds: chosen,
                        note: note || undefined,
                        clearContact: run.kind !== 'batch' && clearContact,
                      })
                    ).ok,
                    'Back in the pool.',
                  )
                }
              >
                Put back
              </Button>
            </div>
          )}
        </div>
      )}

      {open && run.kind !== 'request' && (
        <Button
          variant={pending.length === 0 ? 'primary' : 'secondary'}
          block
          disabled={busy}
          onClick={async () => {
            const left = pending.length
            const r = await finish.mutateAsync({ runId: run.id })
            if (!r.ok) return toast("Couldn't finish it. Try again.")
            toast(
              left === 0
                ? 'Finished. Thanks! 💛'
                : `Finished. ${left === 1 ? '1 thing went' : `${left} things went`} back to the pool.`,
            )
            onClose()
          }}
        >
          Finish
        </Button>
      )}
    </Sheet>
  )
}

function NoteField({
  value,
  onChange,
  placeholder = 'Add a note (optional)',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <>
      <label htmlFor="run-note" className="sr-only">
        Note
      </label>
      <input
        id="run-note"
        className={inputClass}
        maxLength={280}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  )
}

/** Where an item went ("✓ Done", "Moved → Saturday · Sold out", "Back in the pool · note"). */
const outcome = (
  e: LedgerEntry,
  ctx: { run(id: string): { label: string } | undefined },
): string => {
  const withNote = (s: string, note?: string) => (note ? `${s} · ${note}` : s)
  switch (e.state.at) {
    case 'done':
      return '✓ Done'
    case 'moved':
      return withNote(`Moved → ${ctx.run(e.state.to)?.label ?? 'another run'}`, e.state.note)
    case 'returned':
      return withNote('Back in the pool', e.state.note)
    case 'pending':
      return 'Still on it'
  }
}

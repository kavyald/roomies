'use client'

import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Field, inputClass } from '@/components/auth/fields'
import { CATEGORY } from '@/components/items/meta'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import {
  useFinishRun,
  useHandToContact,
  useHouse,
  useItems,
  useMarkRunItemsDone,
  useMoveRunItems,
  useMoveToNewVisit,
  useReturnToPool,
  useRunActivity,
  useRuns,
} from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { describeWhen } from '@/lib/domain/format'
import type { HouseId, ItemId, RunId, UserId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import type { Cents } from '@/lib/domain/money'
import {
  isRunOpen,
  runLedger,
  runProgress,
  runSteps,
  type LedgerEntry,
  type Run,
} from '@/lib/domain/runs'
import type { LocalDate, LocalTime } from '@/lib/domain/time'
import { useCostFields } from '@/components/costs/CostForm'
import { useSplitwise } from '@/components/costs/useSplitwise'
import { useContactChoice } from './ContactChoice'
import { requestStage } from './meta'
import { AddMore, SendRequest, VisitDate } from './RunExtras'

type Panel = null | 'move' | 'back' | 'hand'
const NEW_VISIT = '__new_visit'

/**
 * A run's sheet (FRONTEND §5.9): every item that's been on it, and bulk actions on a selection.
 * Requests add "Add more" and "Send request"; visits show their date.
 */
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
  const ctx = useCardContext(houseId)
  const byId = useMemo(() => new Map((items.data ?? []).map((i) => [i.id, i])), [items.data])
  const run = runs.data?.find((r) => r.id === runId)
  const ledger = useMemo(
    () =>
      run && activity.data
        ? runLedger(run.id, runSteps(activity.data), items.data ?? [])
        : ([] as LedgerEntry[]),
    [run, activity.data, items.data],
  )
  if (!run) return null
  return (
    <RunSheetFor
      houseId={houseId}
      run={run}
      runs={runs.data ?? []}
      ledger={ledger}
      byId={byId}
      label={ctx.run(run.id)?.label ?? 'Run'}
      onClose={onClose}
    />
  )
}

function RunSheetFor({
  houseId,
  run,
  runs,
  ledger,
  byId,
  label,
  onClose,
}: {
  houseId: HouseId
  run: Run
  runs: readonly Run[]
  ledger: readonly LedgerEntry[]
  byId: ReadonlyMap<ItemId, Item>
  label: string
  onClose: () => void
}) {
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const now = useNow()
  const toast = useToast()
  const done = useMarkRunItemsDone(houseId)
  const move = useMoveRunItems(houseId)
  const toNewVisit = useMoveToNewVisit(houseId)
  const back = useReturnToPool(houseId)
  const hand = useHandToContact(houseId)
  const finish = useFinishRun(houseId)
  const handTo = useContactChoice(houseId, { id: 'hand-to', label: 'Hand to' })
  const [selected, setSelected] = useState<ReadonlySet<ItemId>>(new Set())
  const [panel, setPanel] = useState<Panel>(null)
  const [note, setNote] = useState('')
  const [target, setTarget] = useState<string>('')
  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [clearContact, setClearContact] = useState(true)

  const tz = house.data?.settings.timezone ?? 'UTC'
  const open = isRunOpen(run)
  const pending = ledger.filter((e) => e.state.at === 'pending').map((e) => e.itemId)
  const chosen = pending.filter((id) => selected.has(id))
  const chosenItems = chosen.map((id) => byId.get(id)).filter((i): i is Item => !!i)
  const { done: doneCount, total } = runProgress(ledger)
  const busy = [done, move, toNewVisit, back, hand, finish].some((m) => m.isPending)
  const contactName = run.kind === 'batch' ? undefined : ctx.contacts.get(run.contactId)?.name

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
  const tasksOnly = chosenItems.length > 0 && chosenItems.every((i) => i.category === 'task')
  const targets = runs.filter(
    (r) =>
      r.id !== run.id &&
      isRunOpen(r) &&
      !(r.kind === 'request' && r.state.at === 'sent') &&
      (r.kind === 'batch' || tasksOnly),
  )
  const canNewVisit = run.kind !== 'batch' && tasksOnly

  const who = ctx.person(run.runner)?.name
  const header = [
    run.kind === 'batch' ? who && `${who}'s on it` : who && `Point person: ${who}`,
    run.kind === 'request' && requestStage(run, now, tz),
    run.kind === 'batch' && run.when && describeWhen(run.when, now, tz),
    open ? `${doneCount} of ${total} done` : run.kind === 'request' ? undefined : 'Finished',
  ]
    .filter(Boolean)
    .join(' · ')

  const doneLabel = run.kind === 'batch' ? 'Done' : 'Fixed'

  const doMove = async () => {
    if (target === NEW_VISIT) {
      const when = visitDate
        ? { date: visitDate as LocalDate, ...(visitTime && { time: visitTime as LocalTime }) }
        : undefined
      const r = await toNewVisit.mutateAsync({
        fromRunId: run.id,
        itemIds: chosen,
        ...(when && { when }),
        note: note || undefined,
      })
      return say(r.ok, `Moved to a new ${contactName ?? ''} visit.`.replace('  ', ' '))
    }
    const r = await move.mutateAsync({
      fromRunId: run.id,
      toRunId: target as RunId,
      itemIds: chosen,
      note: note || undefined,
    })
    say(r.ok, `Moved to ${ctx.run(target)?.label ?? 'the other run'}.`)
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={label} description={header}>
      {run.kind === 'visit' && <VisitDate houseId={houseId} run={run} />}

      {ledger.length === 0 ? (
        <p className="m-0 text-ink-soft">
          {run.kind === 'request' ? 'Nothing on this list yet.' : 'Nothing on this run yet.'}
        </p>
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
                  <span className="block text-[0.8rem] font-semibold">
                    {outcome(e, ctx, doneLabel)}
                  </span>
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
              variant={run.kind === 'request' ? 'secondary' : 'primary'}
              size="small"
              disabled={busy || chosen.length === 0}
              onClick={async () =>
                say(
                  (await done.mutateAsync({ runId: run.id, itemIds: chosen })).ok,
                  chosen.length === 1
                    ? `${doneLabel}. 💛`
                    : `${chosen.length} ${doneLabel.toLowerCase()}. 💛`,
                )
              }
            >
              {doneLabel}
            </Button>
            <Button
              variant={run.kind === 'request' ? 'primary' : 'secondary'}
              size="small"
              aria-expanded={panel === 'move'}
              disabled={busy || chosen.length === 0}
              onClick={() => setPanel(panel === 'move' ? null : 'move')}
            >
              {run.kind === 'request' ? 'Move to a visit…' : 'Move to…'}
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
            {tasksOnly && (
              <Button
                variant="secondary"
                size="small"
                aria-expanded={panel === 'hand'}
                disabled={busy}
                onClick={() => setPanel(panel === 'hand' ? null : 'hand')}
              >
                Hand to…
              </Button>
            )}
          </div>

          {panel === 'move' && chosen.length > 0 && (
            <div className="grid gap-2 rounded-2xl bg-paper p-3">
              <label htmlFor="move-to" className="text-[0.8rem] font-extrabold text-ink-soft">
                Move {chosen.length === 1 ? 'it' : `these ${chosen.length}`} to
              </label>
              {targets.length === 0 && !canNewVisit ? (
                <p className="m-0 text-sm text-ink-soft">
                  No other open run to move to. Start one from Needs.
                </p>
              ) : (
                <select
                  id="move-to"
                  className={inputClass}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Pick one</option>
                  {canNewVisit && (
                    <option value={NEW_VISIT}>A new {contactName ?? ''} visit</option>
                  )}
                  {targets.map((r) => (
                    <option key={r.id} value={r.id}>
                      {ctx.run(r.id)?.label ?? 'Run'}
                    </option>
                  ))}
                </select>
              )}
              {target === NEW_VISIT && (
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    id="new-visit-date"
                    label="Date (optional)"
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                  />
                  <Field
                    id="new-visit-time"
                    label="Time (optional)"
                    type="time"
                    disabled={!visitDate}
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                  />
                </div>
              )}
              <NoteField value={note} onChange={setNote} />
              <Button disabled={busy || !target} onClick={doMove}>
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

          {panel === 'hand' && tasksOnly && (
            <div className="grid gap-2 rounded-2xl bg-paper p-3">
              {handTo.field}
              <NoteField value={note} onChange={setNote} />
              <Button
                disabled={busy || !handTo.ready}
                onClick={async () => {
                  const contactId = await handTo.resolve()
                  if (!contactId) return
                  const r = await hand.mutateAsync({
                    runId: run.id,
                    itemIds: chosen,
                    contactId,
                    note: note || undefined,
                  })
                  say(r.ok, `Added to ${ctx.contacts.get(contactId)?.name ?? 'their'} list.`)
                }}
              >
                Hand over
              </Button>
            </div>
          )}
        </div>
      )}

      {run.kind === 'request' && run.state.at === 'gathering' && (
        <div className="grid gap-2.5">
          <AddMore houseId={houseId} run={run} />
          <SendRequest houseId={houseId} run={run} onSent={reset} />
        </div>
      )}

      {open && run.kind !== 'request' && (
        <FinishRun
          houseId={houseId}
          run={run}
          left={pending.length}
          label={label}
          onFinished={onClose}
        />
      )}

      {run.kind === 'request' && (
        <p className="m-0 text-center text-[0.8rem] text-ink-soft">
          Recording their reply is just moving tasks.
        </p>
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

/** Where an item went ("✓ Fixed", "Moved → Landlord visit · Sending a plumber", "Back in the pool"). */
const outcome = (
  e: LedgerEntry,
  ctx: { run(id: string): { label: string } | undefined },
  doneLabel: string,
): string => {
  const withNote = (s: string, note?: string) => (note ? `${s} · ${note}` : s)
  switch (e.state.at) {
    case 'done':
      return `✓ ${doneLabel}`
    case 'moved':
      return withNote(`Moved → ${ctx.run(e.state.to)?.label ?? 'another run'}`, e.state.note)
    case 'returned':
      return withNote('Back in the pool', e.state.note)
    case 'pending':
      return 'Still on it'
  }
}

/**
 * Finish: anything left goes back to the pool. A batch first asks "Did you spend money?" and
 * records one cost on the run (PRD §6.6).
 */
function FinishRun({
  houseId,
  run,
  left,
  label,
  onFinished,
}: {
  houseId: HouseId
  run: Run
  left: number
  label: string
  onFinished: () => void
}) {
  const finish = useFinishRun(houseId)
  const toast = useToast()
  const splitwise = useSplitwise(houseId)
  const cost = useCostFields(houseId, 'run-cost')
  const [asking, setAsking] = useState(false)

  const go = async (spent?: { amount: Cents; paidBy: UserId; note?: string }) => {
    const r = await finish.mutateAsync({
      runId: run.id,
      ...(spent && { spent: spent.amount, paidBy: spent.paidBy, note: spent.note }),
    })
    if (!r.ok) return toast("Couldn't finish it. Try again.")
    const back =
      left === 0 ? '' : ` ${left === 1 ? '1 thing went' : `${left} things went`} back to the pool.`
    const recorded = r.value.cost
    toast(
      `Finished.${back || ' Thanks! 💛'}`,
      recorded ? { label: 'Open Splitwise', onClick: () => splitwise(recorded, label) } : undefined,
    )
    onFinished()
  }

  if (run.kind === 'batch' && asking) {
    return (
      <div className="grid gap-2.5 rounded-2xl bg-paper p-3">
        <p className="m-0 font-extrabold">Did you spend money?</p>
        {cost.fields}
        <Button
          disabled={finish.isPending || !cost.valid}
          onClick={() => {
            const v = cost.value()
            if (v) void go(v)
          }}
        >
          Save and finish
        </Button>
        <Button variant="secondary" disabled={finish.isPending} onClick={() => go()}>
          No, just finish
        </Button>
      </div>
    )
  }
  return (
    <Button
      variant={left === 0 ? 'primary' : 'secondary'}
      block
      disabled={finish.isPending}
      onClick={() => (run.kind === 'batch' ? setAsking(true) : go())}
    >
      Finish
    </Button>
  )
}

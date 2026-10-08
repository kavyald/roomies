'use client'

import { useEffect, useState } from 'react'
import { Field } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useItems, usePlanVisit, useStartRequest } from '@/lib/client/hooks'
import type { HouseId, ItemId, RunId } from '@/lib/domain/ids'
import type { Task } from '@/lib/domain/items'
import type { LocalDate, LocalTime } from '@/lib/domain/time'
import { useContactChoice } from './ContactChoice'

type Mode = 'request' | 'visit'

/**
 * "New request or visit" (FRONTEND §5.7): ask a contact to take tasks on (a request, which can
 * start empty), or record that they've agreed (a visit, with an optional date).
 */
export function NewRunSheet({
  houseId,
  onClose,
  onCreated,
}: {
  houseId: HouseId
  onClose: () => void
  onCreated: (id: RunId) => void
}) {
  const items = useItems(houseId)
  const startRequest = useStartRequest(houseId)
  const planVisit = usePlanVisit(houseId)
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('request')
  const contact = useContactChoice(houseId, { id: 'run-contact', label: 'Who' })
  const [picked, setPicked] = useState<ReadonlySet<ItemId>>(new Set())
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  const tasks = (items.data ?? []).filter(
    (i): i is Task => i.category === 'task' && !i.done && !i.archivedAt && !i.run,
  )
  // Choosing a contact pre-checks the tasks they already handle.
  const chosen = contact.choice
  useEffect(() => {
    if (!chosen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(new Set(tasks.filter((t) => t.contactId === chosen).map((t) => t.id)))
    // Only when the contact changes, not on every refetch of the tasks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen])

  const busy = startRequest.isPending || planVisit.isPending
  const submit = async () => {
    const contactId = await contact.resolve()
    if (!contactId) return
    const itemIds = [...picked]
    const r =
      mode === 'request'
        ? await startRequest.mutateAsync({ contactId, itemIds })
        : await planVisit.mutateAsync({
            contactId,
            itemIds,
            ...(date && {
              when: { date: date as LocalDate, ...(time && { time: time as LocalTime }) },
            }),
          })
    if (!r.ok) {
      return toast(
        r.error === 'already_on_a_run'
          ? 'One of those is already on a list or visit.'
          : "Couldn't start it. Try again.",
      )
    }
    toast(mode === 'request' ? 'List started.' : 'Visit planned.')
    onCreated(r.value.id)
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="New request or visit">
      <SegmentedControl
        label="What kind"
        wide
        value={mode}
        onChange={setMode}
        options={[
          { value: 'request', label: 'Ask someone' },
          { value: 'visit', label: "They've agreed" },
        ]}
      />
      <p className="m-0 text-sm text-ink-soft">
        {mode === 'request'
          ? 'A list to send them. You can start it empty and add to it.'
          : "They've taken these on. The date can wait."}
      </p>
      {contact.field}
      {tasks.length > 0 && (
        <fieldset className="m-0 grid gap-1 border-0 p-0">
          <legend className="mb-1 text-[0.8rem] font-extrabold text-ink-soft">Tasks</legend>
          {tasks.map((t) => (
            <label key={t.id} className="flex min-h-12 items-center gap-3 px-1">
              <input
                type="checkbox"
                className="size-5 accent-[var(--accent)]"
                checked={picked.has(t.id)}
                onChange={() =>
                  setPicked((p) => {
                    const next = new Set(p)
                    if (next.has(t.id)) next.delete(t.id)
                    else next.add(t.id)
                    return next
                  })
                }
              />
              <span className="flex-1 font-bold">{t.title}</span>
            </label>
          ))}
        </fieldset>
      )}
      {mode === 'visit' && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            id="visit-date"
            label="Date (optional)"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Field
            id="visit-time"
            label="Time (optional)"
            type="time"
            disabled={!date}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      )}
      <Button block disabled={busy || !contact.ready} onClick={submit}>
        {mode === 'request' ? 'Start list' : 'Plan visit'}
      </Button>
    </Sheet>
  )
}

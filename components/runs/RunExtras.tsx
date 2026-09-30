'use client'

import { Copy } from 'lucide-react'
import { useState } from 'react'
import { Field, inputClass } from '@/components/auth/fields'
import { useCopy } from '@/components/house/useCopy'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import {
  useAddToRun,
  useContacts,
  useHouse,
  useItems,
  useRooms,
  useSendRequest,
  useSetVisitDate,
} from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { describeWhen } from '@/lib/domain/format'
import type { HouseId, ItemId } from '@/lib/domain/ids'
import type { Task } from '@/lib/domain/items'
import { requestMessage, type Request, type SentVia, type Visit } from '@/lib/domain/runs'
import type { LocalDate, LocalTime } from '@/lib/domain/time'

const VIA_OPTIONS: { value: SentVia; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Phone call' },
  { value: 'portal', label: 'The portal' },
  { value: 'in_person', label: 'In person' },
]

/** "Add more" on a list that's still gathering: open tasks that aren't on anything yet. */
export function AddMore({ houseId, run }: { houseId: HouseId; run: Request }) {
  const items = useItems(houseId)
  const add = useAddToRun(houseId)
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<ItemId>>(new Set())
  const free = (items.data ?? []).filter(
    (i): i is Task => i.category === 'task' && !i.done && !i.archivedAt && !i.run,
  )
  if (!open) {
    return (
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        Add more
      </Button>
    )
  }
  return (
    <div className="grid gap-2 rounded-2xl bg-paper p-3">
      {free.length === 0 ? (
        <p className="m-0 text-sm text-ink-soft">Every open task is already on a list or visit.</p>
      ) : (
        <fieldset className="m-0 grid gap-1 border-0 p-0">
          <legend className="mb-1 text-[0.8rem] font-extrabold text-ink-soft">Add tasks</legend>
          {free.map((t) => (
            <label key={t.id} className="flex min-h-11 items-center gap-3 px-1">
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
      <Button
        disabled={add.isPending || picked.size === 0}
        onClick={async () => {
          const r = await add.mutateAsync({ runId: run.id, itemIds: [...picked] })
          toast(r.ok ? 'Added to the list.' : "Couldn't add them. Try again.")
          if (r.ok) {
            setPicked(new Set())
            setOpen(false)
          }
        }}
      >
        Add to the list
      </Button>
    </div>
  )
}

/**
 * "Send request": the composed message to copy and send yourself (Roomies never sends it), then
 * "Mark as sent" with how it went out.
 */
export function SendRequest({
  houseId,
  run,
  onSent,
}: {
  houseId: HouseId
  run: Request
  onSent: () => void
}) {
  const items = useItems(houseId)
  const rooms = useRooms(houseId)
  const contacts = useContacts(houseId)
  const house = useHouse(houseId)
  const send = useSendRequest(houseId)
  const copy = useCopy()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [via, setVia] = useState<SentVia>('text')

  const onIt = (items.data ?? []).filter((i) => i.run?.id === run.id)
  const roomName = new Map((rooms.data ?? []).map((r) => [r.id as string, r.name]))
  const contact = contacts.data?.find((c) => c.id === run.contactId)
  const message = requestMessage(
    contact?.name ?? 'there',
    onIt.map((t) => ({
      title: t.title,
      ...(t.roomId && roomName.get(t.roomId) && { room: roomName.get(t.roomId) }),
      ...(t.note && { note: t.note }),
    })),
    house.data,
  )

  if (!open) {
    return (
      <Button block disabled={onIt.length === 0} onClick={() => setOpen(true)}>
        Send request
      </Button>
    )
  }
  return (
    <div className="grid gap-2.5 rounded-2xl bg-paper p-3">
      <label htmlFor="request-message" className="text-[0.8rem] font-extrabold text-ink-soft">
        The message
      </label>
      <textarea
        id="request-message"
        readOnly
        rows={Math.min(10, message.split('\n').length + 1)}
        className={`${inputClass} resize-none text-sm`}
        value={message}
      />
      <Button variant="secondary" onClick={() => copy(message, 'Message copied.')}>
        <Copy aria-hidden className="size-4" /> Copy message
      </Button>
      {contact?.phone && (
        <p className="m-0 text-sm text-ink-soft">
          {contact.name}: <span className="tabular-nums">{contact.phone}</span>
        </p>
      )}
      <div className="grid gap-1.5">
        <label htmlFor="sent-via" className="text-[0.8rem] font-extrabold text-ink-soft">
          Sent by
        </label>
        <select
          id="sent-via"
          className={inputClass}
          value={via}
          onChange={(e) => setVia(e.target.value as SentVia)}
        >
          {VIA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Button
        disabled={send.isPending}
        onClick={async () => {
          const r = await send.mutateAsync({ runId: run.id, via })
          toast(r.ok ? 'Marked as sent.' : "Couldn't mark it sent. Try again.")
          if (r.ok) {
            setOpen(false)
            onSent()
          }
        }}
      >
        Mark as sent
      </Button>
    </div>
  )
}

/** A visit's date: "Thu 10:00 · Change" or "Date TBD · Set a date". */
export function VisitDate({ houseId, run }: { houseId: HouseId; run: Visit }) {
  const house = useHouse(houseId)
  const set = useSetVisitDate(houseId)
  const toast = useToast()
  const now = useNow()
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState<string>(run.when?.date ?? '')
  const [time, setTime] = useState<string>(run.when?.time ?? '')
  const tz = house.data?.settings.timezone ?? 'UTC'
  const open = run.state.open

  const save = async (clear = false) => {
    const when =
      clear || !date ? null : { date: date as LocalDate, ...(time && { time: time as LocalTime }) }
    const r = await set.mutateAsync({ runId: run.id, when })
    if (!r.ok && r.error !== 'no_change') return toast("Couldn't change the date. Try again.")
    setEditing(false)
  }

  if (!editing) {
    return (
      <p className="m-0 flex flex-wrap items-center gap-x-2 font-bold">
        {run.when ? describeWhen(run.when, now, tz) : 'Date TBD'}
        {open && (
          <button
            type="button"
            className="min-h-11 text-sm font-extrabold text-accent-ink"
            onClick={() => setEditing(true)}
          >
            {run.when ? 'Change' : 'Set a date'}
          </button>
        )}
      </p>
    )
  }
  return (
    <div className="grid gap-2 rounded-2xl bg-paper p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field
          id="visit-date-edit"
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          id="visit-time-edit"
          label="Time (optional)"
          type="time"
          disabled={!date}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={set.isPending} onClick={() => save()}>
          Save
        </Button>
        {run.when && (
          <Button variant="secondary" disabled={set.isPending} onClick={() => save(true)}>
            No date yet
          </Button>
        )}
      </div>
    </div>
  )
}

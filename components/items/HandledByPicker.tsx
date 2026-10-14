'use client'

import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { useToast } from '@/components/ui/Toast'
import { useAddContact, useContacts, useEditItem } from '@/lib/client/hooks'
import type { ContactId, HouseId, RunId } from '@/lib/domain/ids'
import type { Task } from '@/lib/domain/items'
import { useCardContext } from './useCardContext'

/**
 * "Who's handling it?" (FRONTEND §5.4): one of us, a contact, or someone new (saved to Contacts).
 * Setting a contact hands the task to them; "One of us" takes it back. On a request or visit,
 * "handled by" follows that run (PRD §6.3), so it says so and opens the run instead.
 */
export function HandledByPicker({
  houseId,
  task,
  onDone,
  onOpenRun,
}: {
  houseId: HouseId
  task: Task
  onDone: () => void
  onOpenRun: (id: RunId) => void
}) {
  const contacts = useContacts(houseId)
  const cardCtx = useCardContext(houseId)
  const edit = useEditItem(houseId)
  const addContact = useAddContact(houseId)
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const busy = edit.isPending || addContact.isPending

  const handTo = async (contactId: ContactId | null, label: string) => {
    if ((task.contactId ?? null) === contactId) return onDone()
    const r = await edit.mutateAsync({ id: task.id, patch: { contactId } })
    if (!r.ok && r.error === 'on_a_run')
      return toast("It's on a request or visit. Move it there to change who's handling it.")
    if (!r.ok) return toast("Couldn't change who's handling it. Try again.")
    toast(contactId ? `Handed to ${label}.` : 'One of us has it.')
    onDone()
  }

  const addAndHand = async () => {
    const c = await addContact.mutateAsync({ name, phone })
    if (!c.ok)
      return toast(
        c.error === 'empty_name' ? 'Give them a name.' : "Couldn't save the contact. Try again.",
      )
    await handTo(c.value.id, c.value.name)
  }

  const option = (
    key: string,
    label: string,
    sub: string | undefined,
    chosen: boolean,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={chosen}
      disabled={busy}
      onClick={onClick}
      className={cn(
        'flex min-h-12 items-center gap-2.5 rounded-[14px] bg-paper px-3.5 py-2.5 text-left font-bold shadow-[inset_0_0_0_1.5px_var(--line)]',
        chosen && 'bg-top-fill text-top-ink shadow-[inset_0_0_0_2px_var(--accent)]',
      )}
    >
      <span className="flex-1">
        {label}
        {sub && (
          <span className="block text-[0.8rem] font-semibold opacity-80 tabular-nums">{sub}</span>
        )}
      </span>
      {chosen && <Check aria-hidden className="size-5" />}
    </button>
  )

  const heading = (
    <h3 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
      Who&apos;s handling it?
    </h3>
  )

  const run = task.run
  if (run && run.kind !== 'batch') {
    // "the Landlord request" (FRONTEND §3.4), or just "the visit" while runs load.
    const name = `the ${cardCtx.run(run.id)?.label ?? run.kind}`
    return (
      <section aria-label="Who's handling it?" className="grid gap-2 rounded-2xl p-0.5">
        {heading}
        <p className="m-0 rounded-2xl bg-paper px-3.5 py-3 leading-snug">
          It&apos;s on {name}. Move it to change who&apos;s handling it.
        </p>
        <Button variant="secondary" block onClick={() => onOpenRun(run.id)}>
          Open {name}
        </Button>
      </section>
    )
  }

  return (
    <section aria-label="Who's handling it?" className="grid gap-2 rounded-2xl p-0.5">
      {heading}
      <div role="radiogroup" aria-label="Handled by" className="grid gap-2">
        {option('us', 'One of us', undefined, !task.contactId, () => handTo(null, 'One of us'))}
        {(contacts.data ?? [])
          .filter((c) => !c.archivedAt)
          .map((c) =>
            option(c.id, c.name, c.phone, task.contactId === c.id, () => handTo(c.id, c.name)),
          )}
      </div>
      {adding ? (
        <div className="grid gap-2.5 rounded-2xl bg-paper p-3">
          <Field
            id="new-contact-name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            id="new-contact-phone"
            label="Phone (optional)"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button block disabled={busy || !name.trim()} onClick={addAndHand}>
            Save and hand it over
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 justify-self-start font-bold text-accent-ink"
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden className="size-4" /> Someone new
        </button>
      )}
    </section>
  )
}

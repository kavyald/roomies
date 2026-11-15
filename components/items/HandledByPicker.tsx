'use client'

import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { useToast } from '@/components/ui/Toast'
import {
  useAddContact,
  useContacts,
  useEditItem,
  useMembers,
  useProfiles,
} from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { ContactId, HouseId, RunId, UserId } from '@/lib/domain/ids'
import type { Task } from '@/lib/domain/items'
import { useCardContext } from './useCardContext'

/**
 * "Who's doing it?" (FRONTEND §5.4, T111): any of us, a roommate, a contact, or someone new (saved
 * to Contacts). One field for what the data keeps as two (`assignee`, `contactId`): picking a
 * roommate clears the contact and picking a contact clears the roommate. On a request or visit,
 * the contact follows that run (PRD §6.3), so it says so and opens the run instead.
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
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const { me } = useAppClient()
  const cardCtx = useCardContext(houseId)
  const edit = useEditItem(houseId)
  const addContact = useAddContact(houseId)
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const busy = edit.isPending || addContact.isPending

  const nameOf = (u: string) => profiles.data?.find((p) => p.id === u)?.displayName ?? 'Roommate'
  // Me first, then the others in the house's order.
  const people = (members.data ?? [])
    .filter((m) => m.status.active)
    .sort((a, b) => Number(b.userId === me) - Number(a.userId === me))

  const save = async (
    who: { assignee: UserId | null; contactId: ContactId | null },
    said: string,
  ) => {
    if ((task.assignee ?? null) === who.assignee && (task.contactId ?? null) === who.contactId)
      return onDone()
    const r = await edit.mutateAsync({ id: task.id, patch: who })
    if (!r.ok && r.error === 'on_a_run')
      return toast("It's on a request or visit. Move it there to change who's doing it.")
    if (!r.ok) return toast("Couldn't change who's doing it. Try again.")
    toast(said)
    onDone()
  }
  const handTo = (contactId: ContactId, label: string) =>
    save({ assignee: null, contactId }, `Handed to ${label}.`)

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
      Who&apos;s doing it?
    </h3>
  )

  const run = task.run
  if (run && run.kind !== 'batch') {
    // "the Landlord request" (FRONTEND §3.4), or just "the visit" while runs load.
    const name = `the ${cardCtx.run(run.id)?.label ?? run.kind}`
    return (
      <section aria-label="Who's doing it?" className="grid gap-2 rounded-2xl p-0.5">
        {heading}
        <p className="m-0 rounded-2xl bg-paper px-3.5 py-3 leading-snug">
          It&apos;s on {name}. Move it to change who&apos;s doing it.
        </p>
        <Button variant="secondary" block onClick={() => onOpenRun(run.id)}>
          Open {name}
        </Button>
      </section>
    )
  }

  return (
    <section aria-label="Who's doing it?" className="grid gap-2 rounded-2xl p-0.5">
      {heading}
      <div role="radiogroup" aria-label="Who's doing it" className="grid gap-2">
        {option('us', 'Any of us', undefined, !task.contactId && !task.assignee, () =>
          save({ assignee: null, contactId: null }, 'Any of us can do it now.'),
        )}
        {people.map((m) =>
          option(
            m.userId,
            m.userId === me ? 'Me' : nameOf(m.userId),
            undefined,
            !task.contactId && task.assignee === m.userId,
            () =>
              save(
                { assignee: m.userId, contactId: null },
                m.userId === me ? "It's yours. Thanks! 💛" : `${nameOf(m.userId)} has it now.`,
              ),
          ),
        )}
        {(contacts.data ?? [])
          .filter((c) => !c.archivedAt)
          .map((c) =>
            option(
              c.id,
              c.name,
              c.phone ? `Outside help · ${c.phone}` : 'Outside help',
              task.contactId === c.id,
              () => handTo(c.id, c.name),
            ),
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

'use client'

import { Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useAddContact, useContacts, useEditContact, useRemoveContact } from '@/lib/client/hooks'
import type { Contact } from '@/lib/domain/house'
import type { HouseId } from '@/lib/domain/ids'
import { useCopy } from './useCopy'

/** The super, the landlord, and anyone else the house calls (FRONTEND §5.11). */
export function ContactsSection({ houseId }: { houseId: HouseId }) {
  const contacts = useContacts(houseId)
  const copy = useCopy()
  const [open, setOpen] = useState<Contact | 'new' | null>(null)
  const live = (contacts.data ?? []).filter((c) => !c.archivedAt)

  return (
    <div className="grid gap-2.5">
      {live.length === 0 ? (
        <EmptyState icon={Phone}>No contacts yet. Add the super or the landlord.</EmptyState>
      ) : (
        <ListGroup label="Contacts">
          {live.map((c) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={c.phone}
              onClick={() => setOpen(c)}
              trailing={
                c.phone ? (
                  <button
                    type="button"
                    aria-label={`Copy ${c.name}'s number`}
                    className="grid min-h-11 place-items-center rounded-full px-3 text-sm font-extrabold text-accent-ink"
                    onClick={() => void copy(c.phone!, 'Number copied.')}
                  >
                    Copy number
                  </button>
                ) : undefined
              }
            />
          ))}
        </ListGroup>
      )}
      <Button variant="secondary" block onClick={() => setOpen('new')}>
        <Plus aria-hidden className="size-4" /> Add a contact
      </Button>
      {open && (
        <ContactSheet
          houseId={houseId}
          contact={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function ContactSheet({
  houseId,
  contact,
  onClose,
}: {
  houseId: HouseId
  contact: Contact | null
  onClose: () => void
}) {
  const add = useAddContact(houseId)
  const edit = useEditContact(houseId)
  const remove = useRemoveContact(houseId)
  const toast = useToast()
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [note, setNote] = useState(contact?.note ?? '')
  const busy = add.isPending || edit.isPending || remove.isPending

  const save = async () => {
    const r = contact
      ? await edit.mutateAsync({ id: contact.id, patch: { name, phone, note } })
      : await add.mutateAsync({ name, phone, note })
    if (!r.ok && r.error !== 'no_change') {
      return toast(r.error === 'empty_name' ? 'Give them a name.' : "Couldn't save. Try again.")
    }
    toast(contact ? 'Saved.' : `${name.trim()} added.`)
    onClose()
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={contact ? contact.name : 'Add a contact'}
    >
      <Field
        id="c-name"
        label="Name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        id="c-phone"
        label="Phone (optional)"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Field
        id="c-note"
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button block disabled={busy || !name.trim()} onClick={save}>
        {contact ? 'Save' : 'Add'}
      </Button>
      {contact && (
        <Button
          variant="secondary"
          block
          disabled={busy}
          onClick={async () => {
            const r = await remove.mutateAsync(contact.id)
            toast(r.ok ? `${contact.name} removed.` : "Couldn't remove. Try again.")
            if (r.ok) onClose()
          }}
        >
          Remove from contacts
        </Button>
      )}
    </Sheet>
  )
}

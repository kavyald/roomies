'use client'

import { useState } from 'react'
import { Field, inputClass } from '@/components/auth/fields'
import { useToast } from '@/components/ui/Toast'
import { useAddContact, useContacts } from '@/lib/client/hooks'
import type { ContactId, HouseId } from '@/lib/domain/ids'

const NEW = '__new'

/**
 * A contact picker with "+ Someone new" (name + optional phone, saved to Contacts when used).
 * `resolve()` returns the chosen contact's id, saving a new one first, or null.
 */
export function useContactChoice(
  houseId: HouseId,
  { id, label, initial = '' }: { id: string; label: string; initial?: ContactId | '' },
) {
  const contacts = useContacts(houseId)
  const add = useAddContact(houseId)
  const toast = useToast()
  const [choice, setChoice] = useState<string>(initial)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const live = (contacts.data ?? []).filter((c) => !c.archivedAt)

  const field = (
    <div className="grid gap-2">
      <div className="grid gap-1.5">
        <label htmlFor={id} className="text-[0.8rem] font-extrabold text-ink-soft">
          {label}
        </label>
        <select
          id={id}
          className={inputClass}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">Pick someone</option>
          {live.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW}>+ Someone new</option>
        </select>
      </div>
      {choice === NEW && (
        <div className="grid gap-2 rounded-2xl bg-paper p-3">
          <Field
            id={`${id}-name`}
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            id={`${id}-phone`}
            label="Phone (optional)"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      )}
    </div>
  )

  const resolve = async (): Promise<ContactId | null> => {
    if (choice !== NEW) return (choice || null) as ContactId | null
    const r = await add.mutateAsync({ name, phone })
    if (!r.ok) {
      toast(
        r.error === 'empty_name' ? 'Give them a name.' : "Couldn't save the contact. Try again.",
      )
      return null
    }
    setChoice(r.value.id)
    return r.value.id
  }

  const ready = choice === NEW ? name.trim().length > 0 : choice !== ''
  return { field, resolve, ready, choice: choice === NEW ? null : (choice as ContactId | '') }
}

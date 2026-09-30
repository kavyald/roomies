'use client'

import { useState } from 'react'
import { Field, inputClass } from '@/components/auth/fields'
import { useMembers, useProfiles } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { HouseId, UserId } from '@/lib/domain/ids'
import { parseCents, type Cents } from '@/lib/domain/money'

/** Amount + who paid (defaults to me) + an optional note. `value()` is null until it's valid. */
export function useCostFields(houseId: HouseId, idPrefix: string) {
  const { me } = useAppClient()
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState<UserId>(me)
  const [note, setNote] = useState('')
  const parsed = parseCents(amount)
  const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
  const people = (members.data ?? []).filter((m) => m.status.active)

  const fields = (
    <div className="grid gap-2">
      <Field
        id={`${idPrefix}-amount`}
        label="Amount"
        inputMode="decimal"
        placeholder="$0.00"
        autoComplete="off"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <div className="grid gap-1.5">
        <label
          htmlFor={`${idPrefix}-paid-by`}
          className="text-[0.8rem] font-extrabold text-ink-soft"
        >
          Who paid
        </label>
        <select
          id={`${idPrefix}-paid-by`}
          className={inputClass}
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value as UserId)}
        >
          {people.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userId === me ? 'Me' : (names.get(m.userId) ?? 'Roommate')}
            </option>
          ))}
        </select>
      </div>
      <Field
        id={`${idPrefix}-note`}
        label="Note (optional)"
        maxLength={280}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </div>
  )

  const value = (): { amount: Cents; paidBy: UserId; note?: string } | null =>
    parsed.ok && parsed.value > 0
      ? { amount: parsed.value, paidBy, ...(note.trim() && { note }) }
      : null
  const reset = () => {
    setAmount('')
    setNote('')
    setPaidBy(me)
  }
  return { fields, value, reset, valid: parsed.ok && parsed.value > 0 }
}

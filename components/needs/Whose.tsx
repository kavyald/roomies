'use client'

// Whose a need is (T45, PRD §6.1): the house's, or one person's ("For Kavya"). A label only:
// everyone sees it, anyone can get it or put it on a run, and money doesn't change.

import { User } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'
import { Chip } from '@/components/ui/Chip'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { needOwner, type Item } from '@/lib/domain/items'

export type Whose = 'house' | 'me'

const KEY = 'roomies:need-for'
const listeners = new Set<() => void>()
const read = (): Whose => {
  try {
    return localStorage.getItem(KEY) === 'me' ? 'me' : 'house'
  } catch {
    return 'house'
  }
}

/** House or Me for new needs, remembered on this device (the last one picked). */
export const useWhoseChoice = (): [Whose, (w: Whose) => void] => {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    read,
    () => 'house' as const,
  )
  const set = useCallback((w: Whose) => {
    try {
      localStorage.setItem(KEY, w)
    } catch {
      // Private mode: it just isn't remembered.
    }
    listeners.forEach((l) => l())
  }, [])
  return [value, set]
}

/** The House / Me toggle beside "We need…" and on the need form. */
export function WhoseToggle({ value, onChange }: { value: Whose; onChange: (w: Whose) => void }) {
  return (
    <SegmentedControl
      compact
      label="Who it's for"
      value={value}
      onChange={onChange}
      options={[
        { value: 'house', label: 'House' },
        { value: 'me', label: 'Me' },
      ]}
    />
  )
}

/** "For Kavya" on a personal need; nothing on the house's. */
export function ForChip({
  item,
  person,
}: {
  item: Item | undefined
  person: (id: string) => { name: string } | undefined
}) {
  const owner = item && needOwner(item)
  if (!owner) return null
  return <Chip icon={User}>For {person(owner)?.name ?? 'a former roommate'}</Chip>
}

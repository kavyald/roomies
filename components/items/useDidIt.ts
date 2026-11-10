'use client'

import { useCelebrate, useToast } from '@/components/ui/Toast'
import { useDoChore, useUndoChore } from '@/lib/client/hooks'
import type { HouseId, ItemId } from '@/lib/domain/ids'

/**
 * Did it on a chore, with the toast's Undo (like Got it on a need): Undo puts the chore back to
 * the last done it had before, unless someone has done it again since.
 */
export function useDidIt(houseId: HouseId) {
  const did = useDoChore(houseId)
  const undo = useUndoChore(houseId)
  const toast = useToast()
  const celebrate = useCelebrate()

  /** Puts the chore back to its last done before; false (with a toast) if that can't happen. */
  const undoIt = async (id: ItemId, doneAt: number): Promise<boolean> => {
    const back = await undo.mutateAsync({ id, doneAt })
    if (back.ok) return true
    toast(
      back.error === 'done_again'
        ? "It's been done again since. Nothing to undo."
        : "Couldn't undo that. Try again.",
    )
    return false
  }

  const didIt = async (id: ItemId, thanks = 'Did it. Thanks! 💛') => {
    const r = await did.mutateAsync(id)
    const doneAt = r.ok && r.value.category === 'chore' ? r.value.lastDone?.at : undefined
    if (!r.ok || !doneAt) return toast("Couldn't record that. Try again.")
    celebrate()
    toast(thanks, {
      label: 'Undo',
      onClick: () => void undoIt(id, doneAt.epochMs),
    })
  }

  return { didIt, undoIt, isPending: did.isPending || undo.isPending }
}

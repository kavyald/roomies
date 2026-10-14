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

  const didIt = async (id: ItemId, thanks = 'Did it. Thanks! 💛') => {
    const r = await did.mutateAsync(id)
    const doneAt = r.ok && r.value.category === 'chore' ? r.value.lastDone?.at : undefined
    if (!r.ok || !doneAt) return toast("Couldn't record that. Try again.")
    celebrate()
    toast(thanks, {
      label: 'Undo',
      onClick: async () => {
        const back = await undo.mutateAsync({ id, doneAt: doneAt.epochMs })
        if (back.ok) return
        toast(
          back.error === 'done_again'
            ? "It's been done again since. Nothing to undo."
            : "Couldn't undo that. Try again.",
        )
      },
    })
  }

  return { didIt, isPending: did.isPending || undo.isPending }
}

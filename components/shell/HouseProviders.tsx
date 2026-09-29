'use client'

import { useState, type ReactNode } from 'react'
import { createContactAction } from '@/app/actions/contacts'
import {
  deleteAccountAction,
  editContactAction,
  moveOutAction,
  moveRoomAction,
  removeContactAction,
  renameRoomAction,
  setRoleAction,
} from '@/app/actions/house'
import { createInviteAction, revokeInviteAction } from '@/app/actions/invites'
import {
  archiveItemAction,
  createItemAction,
  doChoreAction,
  editItemAction,
  markDoneAction,
  reopenItemAction,
  restoreItemAction,
} from '@/app/actions/items'
import { ItemSheetsProvider } from '@/components/items/ItemSheets'
import { browserAppClient } from '@/lib/compose.client'
import type { HouseId, UserId } from '@/lib/domain/ids'
import { AppClientProvider } from '@/lib/client/provider'

/** Everything under /h/[houseId] reads and writes through one AppClient for that house. */
export function HouseProviders({
  houseId,
  me,
  children,
}: {
  houseId: HouseId
  me: UserId
  children: ReactNode
}) {
  const [client] = useState(() =>
    browserAppClient(me, {
      createContact: (input) => createContactAction(houseId, input),
      createInvite: (input) => createInviteAction(houseId, input),
      revokeInvite: (id) => revokeInviteAction(houseId, id),
      editContact: (input) => editContactAction(houseId, input),
      removeContact: (id) => removeContactAction(houseId, id),
      moveOut: (input) => moveOutAction(houseId, input),
      setRole: (input) => setRoleAction(houseId, input),
      renameRoom: (input) => renameRoomAction(houseId, input),
      moveRoom: (input) => moveRoomAction(houseId, input),
      deleteAccount: () => deleteAccountAction(houseId),
      createItem: (input) => createItemAction(houseId, input),
      editItem: (input) => editItemAction(houseId, input),
      markDone: (id) => markDoneAction(houseId, id),
      reopenItem: (id) => reopenItemAction(houseId, id),
      doChore: (id) => doChoreAction(houseId, id),
      archiveItem: (id) => archiveItemAction(houseId, id),
      restoreItem: (id) => restoreItemAction(houseId, id),
    }),
  )
  return (
    <AppClientProvider client={client}>
      <ItemSheetsProvider houseId={houseId}>{children}</ItemSheetsProvider>
    </AppClientProvider>
  )
}

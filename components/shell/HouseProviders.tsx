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
    }),
  )
  return <AppClientProvider client={client}>{children}</AppClientProvider>
}

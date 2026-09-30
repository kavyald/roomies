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
  setFeelingWeightsAction,
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
  setFeelingAction,
} from '@/app/actions/items'
import {
  addToRequestAction,
  addToRunAction,
  handToContactAction,
  moveToNewVisitAction,
  planVisitAction,
  sendRequestAction,
  setVisitDateAction,
  startRequestAction,
  finishRunAction,
  markRunItemsDoneAction,
  moveRunItemsAction,
  returnToPoolAction,
  startRunAction,
} from '@/app/actions/runs'
import { ItemSheetsProvider } from '@/components/items/ItemSheets'
import { browserAppClient } from '@/lib/compose.client'
import type { HouseId, UserId } from '@/lib/domain/ids'
import { useLiveUpdates } from '@/lib/client/hooks'
import { AppClientProvider } from '@/lib/client/provider'

/** Keeps the house's screens current while someone else changes things (T26). */
function LiveUpdates({ houseId }: { houseId: HouseId }) {
  useLiveUpdates(houseId)
  return null
}

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
      setFeeling: (input) => setFeelingAction(houseId, input),
      setFeelingWeights: (weights) => setFeelingWeightsAction(houseId, weights),
      startRun: (input) => startRunAction(houseId, input),
      addToRun: (input) => addToRunAction(houseId, input),
      markRunItemsDone: (input) => markRunItemsDoneAction(houseId, input),
      moveRunItems: (input) => moveRunItemsAction(houseId, input),
      returnToPool: (input) => returnToPoolAction(houseId, input),
      finishRun: (input) => finishRunAction(houseId, input),
      startRequest: (input) => startRequestAction(houseId, input),
      planVisit: (input) => planVisitAction(houseId, input),
      addToRequest: (input) => addToRequestAction(houseId, input),
      sendRequest: (input) => sendRequestAction(houseId, input),
      handToContact: (input) => handToContactAction(houseId, input),
      moveToNewVisit: (input) => moveToNewVisitAction(houseId, input),
      setVisitDate: (input) => setVisitDateAction(houseId, input),
    }),
  )
  return (
    <AppClientProvider client={client}>
      <LiveUpdates houseId={houseId} />
      <ItemSheetsProvider houseId={houseId}>{children}</ItemSheetsProvider>
    </AppClientProvider>
  )
}

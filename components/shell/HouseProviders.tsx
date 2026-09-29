'use client'

import { useState, type ReactNode } from 'react'
import { createContactAction } from '@/app/actions/contacts'
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
    browserAppClient(me, { createContact: (input) => createContactAction(houseId, input) }),
  )
  return <AppClientProvider client={client}>{children}</AppClientProvider>
}

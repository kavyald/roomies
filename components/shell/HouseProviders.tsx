'use client'

import { useState, type ReactNode } from 'react'
import { createContactAction } from '@/app/actions/contacts'
import { browserAppClient } from '@/lib/compose.client'
import type { HouseId } from '@/lib/domain/ids'
import { AppClientProvider } from '@/lib/client/provider'

/** Everything under /h/[houseId] reads and writes through one AppClient for that house. */
export function HouseProviders({ houseId, children }: { houseId: HouseId; children: ReactNode }) {
  const [client] = useState(() =>
    browserAppClient({ createContact: (input) => createContactAction(houseId, input) }),
  )
  return <AppClientProvider client={client}>{children}</AppClientProvider>
}

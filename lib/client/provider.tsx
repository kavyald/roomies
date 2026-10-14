'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { AppClient } from './app-client'

const AppClientContext = createContext<AppClient | null>(null)

export const makeQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      // Realtime invalidates on change (T26), so data can stay fresh for a while.
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
      mutations: { retry: 0 },
    },
  })

/** Provides the AppClient and a TanStack Query cache to everything below. */
export function AppClientProvider({
  client,
  queryClient,
  children,
}: {
  client: AppClient
  queryClient?: QueryClient
  children: ReactNode
}) {
  const [qc] = useState(() => queryClient ?? makeQueryClient())
  return (
    <AppClientContext.Provider value={client}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </AppClientContext.Provider>
  )
}

export const useAppClient = (): AppClient => {
  const c = useContext(AppClientContext)
  if (!c) throw new Error('useAppClient needs an <AppClientProvider> above it.')
  return c
}

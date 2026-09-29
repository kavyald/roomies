import { WifiOff } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata = { title: 'Offline · Roomies' }

/** Shown by the service worker when a page can't load and wasn't cached. */
export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <EmptyState icon={WifiOff}>
        Couldn&apos;t reach the house. Check your connection and try again.
      </EmptyState>
    </main>
  )
}

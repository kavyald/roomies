import { notFound } from 'next/navigation'
import { devToolsEnabled } from '@/lib/config'
import { Kit } from './Kit'

export const metadata = { title: 'UI kit · Roomies' }

/** Every UI component in light and dark at 375pt (T09). Not built into production. */
export default function KitPage() {
  if (!devToolsEnabled()) notFound()
  return (
    <main className="flex flex-wrap justify-center gap-6 p-4">
      <Kit theme="light" />
      <Kit theme="dark" />
    </main>
  )
}

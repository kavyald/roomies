import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import type { HouseId } from '@/lib/domain/ids'

/** Back to the House tab from a page it opens: Activity, Calendar, You and setup (T107). */
export function BackToHouse({ houseId }: { houseId: HouseId }) {
  return (
    <Link
      href={`/h/${houseId}`}
      className="-ml-1.5 inline-flex min-h-11 items-center gap-1 pr-3 font-bold text-ink-soft"
    >
      <ChevronLeft aria-hidden className="size-5" />
      House
    </Link>
  )
}

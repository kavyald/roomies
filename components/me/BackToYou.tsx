import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import type { HouseId } from '@/lib/domain/ids'

/** Back to your settings from one of its pages (T65). */
export function BackToYou({ houseId }: { houseId: HouseId }) {
  return (
    <Link
      href={`/h/${houseId}/me`}
      className="-ml-1.5 inline-flex min-h-11 items-center gap-1 pr-3 font-bold text-ink-soft"
    >
      <ChevronLeft aria-hidden className="size-5" />
      You
    </Link>
  )
}

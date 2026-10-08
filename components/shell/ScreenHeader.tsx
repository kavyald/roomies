import type { ReactNode } from 'react'

/** A screen's title row: Display type (28/800) with an optional control on the right. */
export function ScreenHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <header className="mt-1.5 mb-4 flex items-center justify-between gap-3">
      <h1 className="m-0 text-[1.75rem] font-extrabold tracking-[-.01em]">{title}</h1>
      {trailing}
    </header>
  )
}

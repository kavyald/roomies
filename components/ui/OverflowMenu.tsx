'use client'

import { MoreHorizontal } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from './cn'

export type MenuItem = {
  label: string
  onSelect: () => void
  /** Quieter actions that take something away (Archive). */
  tone?: 'normal' | 'soft'
}

/**
 * The "…" button and its menu: the less-used actions on a sheet (Edit, Archive). Arrow keys move,
 * Escape closes it (and only it: `data-keeps-escape` tells the Sheet not to close too).
 */
export function OverflowMenu({ label = 'More', items }: { label?: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = all.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => all[(i + all.length) % all.length]?.focus()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(-1)
    else if (e.key === 'Tab') setOpen(false)
    else return
    if (e.key !== 'Tab') e.preventDefault()
  }

  if (items.length === 0) return null
  return (
    <div ref={wrap} className="relative" data-keeps-escape={open || undefined}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 flex-none place-items-center rounded-full text-neutral-ink"
      >
        <span className="grid size-8 place-items-center rounded-full bg-neutral-fill">
          <MoreHorizontal aria-hidden className="size-4" strokeWidth={2.5} />
        </span>
      </button>
      {open && (
        <div
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="sticker absolute top-full right-0 z-10 mt-1 grid min-w-44 overflow-hidden rounded-2xl border-[1.5px] border-outline bg-card py-1"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className={cn(
                'min-h-11 px-4 py-2.5 text-left text-base font-bold focus-visible:bg-paper',
                it.tone === 'soft' && 'text-ink-soft',
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

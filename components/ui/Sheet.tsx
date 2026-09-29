'use client'

import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Drawer } from 'vaul'

/**
 * iOS-style bottom sheet for create/edit (ARCHITECTURE §8): drag to dismiss, 28px top corners,
 * safe-area padding. Built on Vaul (Radix Dialog underneath) for focus trap and labelling.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-[430px] flex-col rounded-t-[28px] bg-card shadow-[0_-1.5px_0_var(--outline)] outline-none">
          <div aria-hidden className="mx-auto mt-2 h-[5px] w-10 flex-none rounded-[3px] bg-line" />
          <div className="flex items-start justify-between gap-3 px-[18px] pt-2.5 pb-1.5">
            <div>
              <Drawer.Title className="m-0 text-xl leading-tight font-extrabold text-balance">
                {title}
              </Drawer.Title>
              {description ? (
                <Drawer.Description className="mt-1 mb-0 text-sm leading-snug text-ink-soft">
                  {description}
                </Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">{title}</Drawer.Description>
              )}
            </div>
            <Drawer.Close
              aria-label="Close"
              className="grid size-11 flex-none place-items-center rounded-full text-neutral-ink"
            >
              <span className="grid size-8 place-items-center rounded-full bg-neutral-fill">
                <X aria-hidden className="size-4" strokeWidth={2.5} />
              </span>
            </Drawer.Close>
          </div>
          <div className="grid gap-3.5 overflow-y-auto px-[18px] pt-2 pb-[calc(32px+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

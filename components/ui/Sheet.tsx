'use client'

import { Check } from 'lucide-react'
import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Drawer } from 'vaul'
import { IconButton } from './IconButton'

/** The header slot a form's <SheetSave> portals its check into. */
const SaveSlot = createContext<HTMLElement | null>(null)

/**
 * iOS-style bottom sheet for create/edit (ARCHITECTURE §8, FRONTEND §9). There is no X: swipe
 * down, tap the backdrop or press Escape to dismiss. The drag handle is also a real button named
 * "Close", so VoiceOver and keyboard users have a dismiss of their own (T80). A form sheet saves
 * with the check in the header (<SheetSave>, rendered anywhere inside the form); a sheet with
 * nothing to save shows no header button. Built on Vaul (Radix Dialog underneath) for the focus
 * trap and labelling; 28px top corners, safe-area padding.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Beside the save check: icon buttons such as Edit (Pencil) and Delete (Trash2), T68. */
  actions?: ReactNode
  children: ReactNode
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  // A drag that starts on the handle shouldn't also count as a tap on Close.
  const pressedAt = useRef<number | null>(null)
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Drawer.Content
          data-sheet // the toast moves to the top while a sheet is open
          // An open menu inside the sheet closes itself on Escape; the sheet stays.
          onEscapeKeyDown={(e) => {
            if ((e.target as Element | null)?.closest?.('[data-keeps-escape]')) e.preventDefault()
          }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-[430px] flex-col rounded-t-[28px] bg-card shadow-[0_-1.5px_0_var(--outline)] outline-none"
        >
          <Drawer.Close
            aria-label="Close"
            onPointerDown={(e) => {
              pressedAt.current = e.clientY
            }}
            onClick={(e) => {
              const from = pressedAt.current
              pressedAt.current = null
              if (from !== null && e.detail > 0 && Math.abs(e.clientY - from) > 6)
                e.preventDefault()
            }}
            className="mx-auto flex h-[22px] w-20 flex-none justify-center rounded-full pt-2"
          >
            <span aria-hidden className="block h-[5px] w-10 rounded-[3px] bg-line" />
          </Drawer.Close>
          <div className="flex items-start justify-between gap-1 px-[18px] pt-0.5 pb-1.5">
            <div className="min-w-0 flex-1 pr-2">
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
            {actions}
            <div ref={setSlot} className="contents" />
          </div>
          <div className="grid gap-3.5 overflow-y-auto px-[18px] pt-2 pb-[calc(32px+env(safe-area-inset-bottom))]">
            <SaveSlot.Provider value={slot}>{children}</SaveSlot.Provider>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/**
 * The sheet's save: a check in the header, where Close used to be. Render it anywhere inside a
 * Sheet's children, so the form that owns the values also owns the check's state. With `form`, it
 * submits that form (and Enter in a field still submits through it); otherwise it calls `onSave`.
 * `label` is its accessible name: what saving does here ("Save", "Add", "Start poll").
 */
export function SheetSave({
  label = 'Save',
  form,
  onSave,
  busy,
  disabled,
}: {
  label?: string
  form?: string
  onSave?: () => void
  busy?: boolean
  disabled?: boolean
}) {
  const slot = useContext(SaveSlot)
  if (!slot) return null
  return createPortal(
    <IconButton
      icon={Check}
      tone="accent"
      label={label}
      busy={busy}
      disabled={disabled}
      {...(form ? { type: 'submit' as const, form } : { onClick: onSave })}
    />,
    slot,
  )
}

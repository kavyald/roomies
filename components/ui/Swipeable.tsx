'use client'

import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cn } from './cn'

/** How far (px) a drag has to go before it counts. */
export const SWIPE_THRESHOLD = 88
/** Movement (px) before we decide whether a drag is sideways (ours) or up and down (a scroll). */
const SLOP = 10
/** Clicks this soon after a drag are the drag's own, not a tap. */
const CLICK_AFTER_DRAG_MS = 400

type Side = { label: string; icon: ReactNode; className: string }

/** Past this, the card moves at a quarter of the finger's speed. */
const resist = (dx: number) => {
  const free = SWIPE_THRESHOLD * 1.6
  const a = Math.abs(dx)
  return Math.sign(dx) * (a <= free ? a : free + (a - free) * 0.25)
}

/**
 * A row or card that can be swiped sideways (FRONTEND §5.1): right does `right` (finish it), left
 * does `left` (share a feeling). Only sideways drags are claimed (`touch-action: pan-y`), so the
 * page still scrolls; a drag never counts as a tap on what's inside. Swiping is a shortcut: every
 * swipe has a button inside the row that does the same, for VoiceOver and keyboards. Reduced
 * motion makes the snap back instant (the global transition rule).
 */
export function Swipeable({
  children,
  right,
  left,
  className,
}: {
  children: ReactNode
  right?: Side & { onSwipe: () => void }
  left?: Side & { onSwipe: () => void }
  className?: string
}) {
  const [dx, setDx] = useState(0)
  const drag = useRef<{
    id: number
    x: number
    y: number
    sideways: boolean
  } | null>(null)
  const draggedAt = useRef(0)

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, sideways: false }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    let x = e.clientX - d.x
    const y = e.clientY - d.y
    if (!d.sideways) {
      if (Math.abs(y) > SLOP && Math.abs(y) >= Math.abs(x)) {
        drag.current = null // a scroll: leave it to the page
        return
      }
      if (Math.abs(x) <= SLOP) return
      d.sideways = true
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId) // keep getting moves off the card
      } catch {
        // A pointer the browser no longer tracks; the drag still works while over the card.
      }
    }
    // Only the sides that do something move.
    if ((x > 0 && !right) || (x < 0 && !left)) x = 0
    setDx(resist(x))
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !d.sideways) return
    draggedAt.current = e.timeStamp
    const x = e.clientX - d.x
    setDx(0)
    if (x >= SWIPE_THRESHOLD && right) right.onSwipe()
    else if (x <= -SWIPE_THRESHOLD && left) left.onSwipe()
  }
  const cancel = () => {
    drag.current = null
    setDx(0)
  }

  const side = dx > 0 ? right : dx < 0 ? left : undefined
  const armed = Math.abs(dx) >= SWIPE_THRESHOLD

  return (
    <div className={cn('relative [overflow-x:clip]', className)}>
      {side && (
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 flex items-center gap-2 rounded-[inherit] px-5 text-[0.9rem] font-extrabold',
            dx > 0 ? 'justify-start' : 'justify-end',
            side.className,
          )}
        >
          <span
            className={cn(
              'flex items-center gap-1.5 opacity-60 motion-safe:transition-[opacity,transform]',
              armed && 'scale-110 opacity-100',
            )}
          >
            {side.icon}
            {side.label}
          </span>
        </div>
      )}
      <div
        data-swipe
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onLostPointerCapture={(e) => drag.current?.id === e.pointerId && cancel()}
        onClickCapture={(e) => {
          // The one click a drag can end with isn't a tap; the next one is.
          const dragged = draggedAt.current
          draggedAt.current = 0
          if (dragged && e.timeStamp - dragged < CLICK_AFTER_DRAG_MS) {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        className={cn(
          'relative touch-pan-y rounded-[inherit]',
          dx ? 'select-none' : 'transition-transform duration-(--dur-base) ease-(--ease-out)',
        )}
      >
        {children}
      </div>
    </div>
  )
}

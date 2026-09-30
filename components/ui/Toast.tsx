'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastAction = { label: string; onClick: () => void }
type ToastState = { id: number; message: string; action?: ToastAction } | null
type Show = (message: string, action?: ToastAction) => void

const ToastContext = createContext<Show>(() => {})
const BurstContext = createContext<() => void>(() => {})

/** Shows one short message at a time ("Shared. The house can see how you feel. 💛"). */
export const useToast = (): Show => useContext(ToastContext)

/** A small burst of dots for finishing something (Got it, Done, Did it). Decorative only. */
export const useCelebrate = (): (() => void) => useContext(BurstContext)

const BURST_DOTS = 10

/** Dots flying out from one point; hidden from screen readers and with reduced motion. */
// Inks, not fills: they stand out from the page in light and dark.
const BURST_COLORS = [
  'var(--accent)',
  'var(--fire-ink)',
  'var(--air-ink)',
  'var(--water-ink)',
  'var(--earth-ink)',
]

function Burst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 700)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <span aria-hidden className="pointer-events-none absolute -top-2 left-8 motion-reduce:hidden">
      {Array.from({ length: BURST_DOTS }, (_, i) => {
        const angle = (Math.PI * (i + 0.5)) / BURST_DOTS // an upward half-ring
        const r = 38 + (i % 3) * 10
        return (
          <span
            key={i}
            className="absolute size-2 rounded-full motion-safe:animate-[burst_650ms_var(--ease-spring)_forwards]"
            style={
              {
                background: BURST_COLORS[i % BURST_COLORS.length],
                '--burst-x': `${Math.round(Math.cos(angle) * r)}px`,
                '--burst-y': `${Math.round(-Math.sin(angle) * r)}px`,
              } as React.CSSProperties
            }
          />
        )
      })}
    </span>
  )
}

export function ToastProvider({
  children,
  duration = 4000,
}: {
  children: ReactNode
  duration?: number
}) {
  const [toast, setToast] = useState<ToastState>(null)
  const [burst, setBurst] = useState(0)
  const next = useRef(0)
  const celebrate = useCallback(() => setBurst((b) => b + 1), [])
  const endBurst = useCallback(() => setBurst(0), [])

  const show = useCallback<Show>((message, action) => {
    next.current += 1
    setToast({ id: next.current, message, action })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), duration)
    return () => clearTimeout(t)
  }, [toast, duration])

  return (
    <ToastContext.Provider value={show}>
      <BurstContext.Provider value={celebrate}>{children}</BurstContext.Provider>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(100px+env(safe-area-inset-bottom))] z-60 mx-auto max-w-[398px]"
      >
        {burst > 0 && <Burst key={`burst-${burst}`} onDone={endBurst} />}
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-2.5 rounded-2xl bg-ink px-3.5 py-3 text-[0.9rem] font-bold text-paper motion-safe:animate-[toast-in_240ms_var(--ease-spring)]"
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="min-h-11 font-extrabold underline"
                onClick={() => {
                  toast.action?.onClick()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

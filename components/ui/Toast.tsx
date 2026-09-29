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

/** Shows one short message at a time ("Shared. The house can see how you feel. 💛"). */
export const useToast = (): Show => useContext(ToastContext)

export function ToastProvider({
  children,
  duration = 4000,
}: {
  children: ReactNode
  duration?: number
}) {
  const [toast, setToast] = useState<ToastState>(null)
  const next = useRef(0)

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
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(100px+env(safe-area-inset-bottom))] z-60 mx-auto max-w-[398px]"
      >
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

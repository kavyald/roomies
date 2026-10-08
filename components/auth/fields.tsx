'use client'

import type { InputHTMLAttributes } from 'react'

export const inputClass =
  'w-full rounded-[14px] border-[1.5px] border-line bg-paper px-3.5 py-3 text-base text-ink placeholder:text-ink-soft'

/** A labelled text field (inputs stay ≥16px so iOS doesn't zoom). */
export function Field({
  id,
  label,
  ...rest
}: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[0.8rem] font-extrabold text-ink-soft">
        {label}
      </label>
      <input id={id} className={inputClass} {...rest} />
    </div>
  )
}

/** The 6-digit code: one field iOS can autofill, submitting itself once all six are in. */
export function CodeField({
  value,
  onChange,
  onComplete,
}: {
  value: string
  onChange: (v: string) => void
  onComplete: (code: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor="code" className="text-[0.8rem] font-extrabold text-ink-soft">
        6-digit code
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        required
        autoFocus
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
          onChange(digits)
          if (digits.length === 6) onComplete(digits)
        }}
        className={`${inputClass} text-center text-[1.75rem] font-extrabold tracking-[0.5em] tabular-nums`}
      />
    </div>
  )
}

export function FormMessage({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="m-0 font-bold text-ink-soft">
      {children}
    </p>
  )
}

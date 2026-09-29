'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import { requestCode, verifyCode } from '@/app/actions/auth'
import { Button } from '@/components/ui/Button'

const inputClass =
  'w-full rounded-[14px] border-[1.5px] border-line bg-paper px-3.5 py-3 text-base text-ink placeholder:text-ink-soft'

/** Returning sign-in: email → 6-digit code (ARCHITECTURE §5.1). Codes only, no links. */
export function SignInForm() {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const send = (e?: FormEvent) => {
    e?.preventDefault()
    setMessage(null)
    start(async () => {
      const r = await requestCode(email)
      if (!r.ok) return setMessage("That doesn't look like an email address.")
      setStep('code')
      setCode('')
    })
  }

  const check = (value = code) => {
    setMessage(null)
    start(async () => {
      const r = await verifyCode(email, value)
      if (r.ok) {
        router.replace('/')
        router.refresh()
      } else {
        setMessage("That code didn't work. Check it and try again, or get a new one.")
      }
    })
  }

  if (step === 'email') {
    return (
      <form onSubmit={send} className="grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="email" className="text-[0.8rem] font-extrabold text-ink-soft">
            Your email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        {message && (
          <p role="alert" className="m-0 font-bold text-ink-soft">
            {message}
          </p>
        )}
        <Button type="submit" block disabled={pending || email.trim() === ''}>
          Send me a code
        </Button>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        check()
      }}
      className="grid gap-4"
    >
      <p role="status" className="m-0 leading-snug">
        If you have an account, we sent a code to <b>{email}</b>. It works for 10 minutes.
      </p>
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
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
            setCode(digits)
            if (digits.length === 6) check(digits) // autofill fills all six at once
          }}
          className={`${inputClass} text-center text-[1.75rem] font-extrabold tracking-[0.5em] tabular-nums`}
        />
      </div>
      {message && (
        <p role="alert" className="m-0 font-bold text-ink-soft">
          {message}
        </p>
      )}
      <Button type="submit" block disabled={pending || code.length !== 6}>
        Sign in
      </Button>
      <div className="flex justify-between gap-3 text-sm font-bold">
        <button
          type="button"
          className="min-h-11 text-accent-ink underline"
          onClick={() => setStep('email')}
        >
          Use a different email
        </button>
        <button
          type="button"
          className="min-h-11 text-accent-ink underline"
          disabled={pending}
          onClick={() => send()}
        >
          Send a new code
        </button>
      </div>
    </form>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import { verifyCode } from '@/app/actions/auth'
import { finishSetup, startSetup } from '@/app/actions/setup'
import { CodeField, Field, FormMessage } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'

type Step = 'account' | 'code' | 'house'

const MESSAGES: Record<string, string> = {
  invalid_email: "That doesn't look like an email address.",
  already_set_up: 'This house is already set up. Sign in instead.',
  invalid_token: 'This setup link doesn’t work.',
  empty_house_name: 'Give the house a name.',
  empty_owner_name: 'Add your name so roommates know who you are.',
  wrong_code: "That code didn't work. Check it and try again, or get a new one.",
}
const fallback = "Couldn't reach the house. Check your connection and try again."

/** One-time setup: your account (name, email, code), then the house (PRD §10). */
export function SetupFlow({ token, signedIn }: { token: string; signedIn: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(signedIn ? 'house' : 'account')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [houseName, setHouseName] = useState('The apartment')
  const [address, setAddress] = useState('')
  const [unit, setUnit] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const say = (error: string) => setMessage(MESSAGES[error] ?? fallback)

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault()
    setMessage(null)
    start(async () => {
      const r = await startSetup(token, email)
      if (!r.ok) return say(r.error)
      setCode('')
      setStep('code')
    })
  }

  const checkCode = (value: string) => {
    setMessage(null)
    start(async () => {
      const r = await verifyCode(email, value)
      if (!r.ok) return say(r.error)
      setStep('house')
    })
  }

  const createHouse = (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    start(async () => {
      const r = await finishSetup(token, {
        houseName,
        address,
        unit,
        ownerName,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (!r.ok) return say(r.error)
      router.replace(`/h/${r.value}`)
    })
  }

  if (step === 'account') {
    return (
      <form onSubmit={sendCode} className="grid gap-4">
        <Field
          id="name"
          label="Your name"
          autoComplete="given-name"
          required
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
        />
        <Field
          id="email"
          label="Your email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {message && <FormMessage>{message}</FormMessage>}
        <Button type="submit" block disabled={pending || !ownerName.trim() || !email.trim()}>
          Send me a code
        </Button>
      </form>
    )
  }

  if (step === 'code') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          checkCode(code)
        }}
        className="grid gap-4"
      >
        <p role="status" className="m-0 leading-snug">
          We sent a code to <b>{email}</b>. It works for 10 minutes.
        </p>
        <CodeField value={code} onChange={setCode} onComplete={checkCode} />
        {message && <FormMessage>{message}</FormMessage>}
        <Button type="submit" block disabled={pending || code.length !== 6}>
          Continue
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={createHouse} className="grid gap-4">
      {!ownerName && (
        <Field
          id="name"
          label="Your name"
          autoComplete="given-name"
          required
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
        />
      )}
      <Field
        id="house"
        label="House name"
        required
        value={houseName}
        onChange={(e) => setHouseName(e.target.value)}
      />
      <Field
        id="address"
        label="Address (optional)"
        autoComplete="street-address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <Field
        id="unit"
        label="Unit (optional)"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
      />
      <p className="m-0 text-sm text-ink-soft">
        We&apos;ll add the apartment&apos;s rooms. You can rename or add rooms later.
      </p>
      {message && <FormMessage>{message}</FormMessage>}
      <Button type="submit" block disabled={pending || !houseName.trim() || !ownerName.trim()}>
        Create the house
      </Button>
    </form>
  )
}

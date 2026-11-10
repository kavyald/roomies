'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import { verifyCode } from '@/app/actions/auth'
import { acceptJoin, startJoin } from '@/app/actions/invites'
import { CodeField, Field, FormMessage } from '@/components/auth/fields'
import { BedroomPicker } from '@/components/house/BedroomPicker'
import { Button } from '@/components/ui/Button'
import type { Bedroom } from '@/lib/app/invites'
import type { RoomId } from '@/lib/domain/ids'
import { inviteProblemCopy, type InviteProblem } from '@/lib/domain/invites'

const say = (error: string): string =>
  error in inviteProblemCopy
    ? inviteProblemCopy[error as InviteProblem]
    : ({
        invalid_email: "That doesn't look like an email address.",
        wrong_code: "That code didn't work. Check it and try again, or get a new one.",
        rate_limited: 'Too many tries for now. Take a breather and try again in a bit.',
        room_taken: 'Someone just took that room. Pick another?',
        empty_name: 'Add your name so the house knows who you are.',
        already_member: "You're already in this house.",
      }[error] ?? "Couldn't reach the house. Check your connection and try again.")

/** Name + email → 6-digit code → "Which room is yours?" → in (PRD §10, FRONTEND §5.12). */
export function JoinFlow({
  token,
  bedrooms,
  signedIn,
}: {
  token: string
  bedrooms: Bedroom[]
  signedIn: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState<'account' | 'code' | 'room'>(signedIn ? 'room' : 'account')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [roomId, setRoomId] = useState<RoomId | null>(null)
  // Decided once, not from the live value: hiding the field when `name` fills in would remove it
  // after the first letter. Arriving signed in skips the step that asks for a name.
  const [askName, setAskName] = useState(signedIn)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault()
    setMessage(null)
    start(async () => {
      const r = await startJoin(token, email)
      if (!r.ok) return setMessage(say(r.error))
      setCode('')
      setStep('code')
    })
  }

  const checkCode = (value: string) => {
    setMessage(null)
    start(async () => {
      const r = await verifyCode(email, value)
      if (!r.ok) return setMessage(say(r.error))
      setAskName(!name.trim())
      setStep('room')
    })
  }

  const join = (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    start(async () => {
      const r = await acceptJoin(token, { displayName: name, ...(roomId && { roomId }) })
      if (!r.ok) return setMessage(say(r.error))
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
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <Button type="submit" block disabled={pending || !name.trim() || !email.trim()}>
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
    <form onSubmit={join} className="grid gap-4">
      <h2 className="m-0 text-xl font-extrabold">Which room is yours?</h2>
      <p className="m-0 text-sm text-ink-soft">Your room sets your color in the app.</p>
      {askName && (
        <Field
          id="name"
          label="Your name"
          autoComplete="given-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <BedroomPicker
        options={bedrooms.map((b) => ({
          key: b.id,
          name: b.name,
          ...(b.element && { element: b.element }),
          ...(b.takenBy && { takenBy: b.takenBy }),
        }))}
        value={roomId}
        onChange={(k) => setRoomId(k as RoomId | null)}
      />
      {message && <FormMessage>{message}</FormMessage>}
      <Button type="submit" block disabled={pending || !name.trim()}>
        Join the house
      </Button>
    </form>
  )
}

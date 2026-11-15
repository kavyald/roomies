'use client'

import { CheckCircle, House, ShoppingBag, Sparkles, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NotificationSteps } from '@/components/house/NotificationSteps'
import { settlePush, TURN_ON_TOASTS, turnOnPush } from '@/components/house/turn-on-push'
import { INSTALL_PITCH, INSTALL_TITLE, InstallSteps } from '@/components/shell/InstallGuide'
import { PUSH_PITCH } from '@/components/shell/NotificationsPrompt'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { isStandalone, rememberPushAnswered, snoozeInstallGuide } from '@/lib/client/device-memory'
import { useHouse } from '@/lib/client/hooks'
import { onboardingPushStep, type OnboardingPush } from '@/lib/client/install'
import { useAppClient } from '@/lib/client/provider'
import type { HouseId } from '@/lib/domain/ids'

const TOUR: { icon: LucideIcon; name: string; text: string }[] = [
  {
    icon: ShoppingBag,
    name: 'Needs',
    text: 'What the house is running low on. Whoever’s out grabs it.',
  },
  { icon: CheckCircle, name: 'Tasks', text: 'Fixes and to-dos, until someone takes care of them.' },
  {
    icon: Sparkles,
    name: 'Chores',
    text: 'Who looks after which rooms, and the upkeep everyone shares.',
  },
  { icon: House, name: 'House', text: 'Polls, the calendar, and what everyone’s been up to.' },
]

export const NOT_NOW_TOAST = 'No problem. You can turn them on later from You → Notifications.'

/** One onboarding screen: a big title, a line under it, then the body and its buttons. */
function Step({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)
  // A new step is a new screen: screen readers start at its title.
  useEffect(() => heading.current?.focus(), [])
  return (
    <section className="grid gap-5">
      <div className="grid gap-1">
        <h1
          ref={heading}
          tabIndex={-1}
          className="m-0 text-[1.75rem] leading-tight font-extrabold outline-none"
        >
          {title}
        </h1>
        <p className="m-0 text-ink-soft">{lead}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * Onboarding (T110, PRD D41): right after joining or setting up, a welcome with what each tab is
 * for, then notifications, then House. The notifications step fits the device: the question, the
 * Add to Home Screen guide on iPhone Safari (the question comes on the first open from the Home
 * Screen, T95), the steps to unblock them, or one line where this browser can't.
 */
export function Onboarding({ houseId }: { houseId: HouseId }) {
  const router = useRouter()
  const toast = useToast()
  const { commands, vapidPublicKey } = useAppClient()
  const house = useHouse(houseId)
  const [step, setStep] = useState<'welcome' | 'notifications'>('welcome')
  const [push, setPush] = useState<OnboardingPush | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void settlePush(commands, vapidPublicKey).then(({ state, connected }) => {
      if (!live) return
      // Allowed already (another account used this device): on, with no tap (PRD D42).
      if (connected) toast(TURN_ON_TOASTS.on)
      setPush(
        onboardingPushStep(state, { userAgent: navigator.userAgent, standalone: isStandalone() }),
      )
    })
    return () => {
      live = false
    }
  }, [commands, vapidPublicKey, toast])

  const home = () => router.replace(`/h/${houseId}`)
  const answered = () => {
    rememberPushAnswered(Date.now())
    home()
  }

  if (step === 'welcome') {
    const name = house.data?.name
    return (
      <Step
        title={name ? `Welcome to ${name} 👋` : 'Welcome 👋'}
        lead="Everything the house shares, in four tabs."
      >
        <ul aria-label="The tabs" className="m-0 grid list-none gap-3 p-0">
          {TOUR.map(({ icon: Icon, name, text }) => (
            <li key={name} className="flex items-start gap-3 rounded-2xl bg-paper px-3.5 py-3">
              <span className="grid size-9 flex-none place-items-center rounded-full bg-neutral-fill text-neutral-ink">
                <Icon aria-hidden className="size-[18px]" />
              </span>
              <span className="leading-snug">
                <b className="font-extrabold">{name}</b>
                <span className="block text-ink-soft">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <Button
          block
          disabled={push === null}
          onClick={() => (push === 'on' ? home() : setStep('notifications'))}
        >
          Next
        </Button>
      </Step>
    )
  }

  if (push === 'ask') {
    const turnOn = async () => {
      setBusy(true)
      const r = await turnOnPush(commands, vapidPublicKey)
      setBusy(false)
      toast(TURN_ON_TOASTS[r])
      if (r !== 'failed') answered()
    }
    return (
      <Step title="Turn on notifications?" lead={PUSH_PITCH}>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            block
            onClick={() => {
              toast(NOT_NOW_TOAST)
              answered()
            }}
          >
            Not now
          </Button>
          <Button block disabled={busy} onClick={turnOn}>
            Turn on
          </Button>
        </div>
      </Step>
    )
  }

  if (push === 'add_to_home_screen') {
    return (
      <Step title={INSTALL_TITLE} lead={INSTALL_PITCH}>
        <InstallSteps />
        <p className="m-0 text-sm text-ink-soft">
          Opened from there, Roomies asks about notifications.
        </p>
        <Button
          block
          onClick={() => {
            // Just shown here, so House doesn't show it again straight away. The question about
            // notifications isn't answered yet: it comes on the first open from the Home Screen.
            snoozeInstallGuide(Date.now())
            home()
          }}
        >
          Continue
        </Button>
      </Step>
    )
  }

  if (push === 'blocked') {
    return (
      <Step
        title="Notifications are blocked"
        lead="They were turned off for Roomies on this device. Here’s how to turn them back on:"
      >
        <NotificationSteps kind="blocked" />
        <Button variant="secondary" block onClick={answered}>
          Skip for now
        </Button>
      </Step>
    )
  }

  return (
    <Step
      title="No notifications on this browser"
      lead="You’ll still see everything in the app. You can turn them on later from You → Notifications."
    >
      <Button block onClick={answered}>
        Continue
      </Button>
    </Step>
  )
}

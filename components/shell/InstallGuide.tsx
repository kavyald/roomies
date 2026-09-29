'use client'

import { Share, SquarePlus, House } from 'lucide-react'
import { useEffect, useState } from 'react'
import { shouldShowInstallGuide } from '@/lib/client/install'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'

const DISMISSED_KEY = 'roomies.installGuideDismissedAt'
const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000

const readDismissed = (now: number): boolean => {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY))
    return Number.isFinite(at) && at > 0 && now - at < REMIND_AFTER_MS
  } catch {
    return false
  }
}

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** "Add Roomies to your Home Screen": iOS only, until installed. Closing it snoozes it 3 days. */
export function InstallGuide() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const show = shouldShowInstallGuide({
      userAgent: navigator.userAgent,
      standalone: isStandalone(),
      dismissed: readDismissed(Date.now()),
    })
    // Decided after mount: the server can't know the device.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (show) setOpen(true)
  }, [])

  const close = (next: boolean) => {
    if (next) return
    setOpen(false)
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {
      // Private mode: it just shows again next time.
    }
  }

  const steps = [
    { icon: Share, text: 'Tap Share at the bottom of Safari.' },
    { icon: SquarePlus, text: 'Choose Add to Home Screen.' },
    { icon: House, text: 'Open Roomies from your Home Screen.' },
  ]

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title="Add Roomies to your Home Screen"
      description="It opens like an app, and it's the only way your phone can ping you."
    >
      <ol className="m-0 grid list-none gap-3 p-0">
        {steps.map(({ icon: Icon, text }, i) => (
          <li
            key={text}
            className="flex items-center gap-3 rounded-2xl bg-paper px-3.5 py-3 font-semibold"
          >
            <span className="grid size-9 flex-none place-items-center rounded-full bg-neutral-fill text-neutral-ink">
              <Icon aria-hidden className="size-[18px]" />
            </span>
            <span>
              <span className="sr-only">Step {i + 1}: </span>
              {text}
            </span>
          </li>
        ))}
      </ol>
      <Button block variant="secondary" onClick={() => close(false)}>
        Maybe later
      </Button>
    </Sheet>
  )
}

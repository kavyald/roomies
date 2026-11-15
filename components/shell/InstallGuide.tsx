'use client'

import { Share, SquarePlus, House } from 'lucide-react'
import { useEffect, useState } from 'react'
import { installGuideSnoozed, isStandalone, snoozeInstallGuide } from '@/lib/client/device-memory'
import { shouldShowInstallGuide } from '@/lib/client/install'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'

export const INSTALL_TITLE = 'Add Roomies to your Home Screen'
export const INSTALL_PITCH = "It opens like an app, and it's the only way your phone can ping you."

const steps = [
  { icon: Share, text: 'Tap Share at the bottom of Safari.' },
  { icon: SquarePlus, text: 'Choose Add to Home Screen.' },
  { icon: House, text: 'Open Roomies from your Home Screen.' },
]

/** Share → Add to Home Screen → open it, as numbered rows (the guide and onboarding, T110). */
export function InstallSteps() {
  return (
    <ol aria-label="How to add it" className="m-0 grid list-none gap-3 p-0">
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
  )
}

/** "Add Roomies to your Home Screen": iOS only, until installed. Closing it snoozes it 3 days. */
export function InstallGuide() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const show = shouldShowInstallGuide({
      userAgent: navigator.userAgent,
      standalone: isStandalone(),
      dismissed: installGuideSnoozed(Date.now()),
    })
    // Decided after mount: the server can't know the device.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (show) setOpen(true)
  }, [])

  const close = (next: boolean) => {
    if (next) return
    setOpen(false)
    snoozeInstallGuide(Date.now())
  }

  return (
    <Sheet open={open} onOpenChange={close} title={INSTALL_TITLE} description={INSTALL_PITCH}>
      <InstallSteps />
      <Button block variant="secondary" onClick={() => close(false)}>
        Maybe later
      </Button>
    </Sheet>
  )
}

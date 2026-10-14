// When to show the Add to Home Screen guide (ARCHITECTURE §2): on iPhone/iPad Safari, until the
// app runs installed. iOS push works only from the Home Screen, so the nudge matters there.

export type InstallContext = {
  readonly userAgent: string
  /** navigator.standalone (iOS) or the display-mode: standalone media query. */
  readonly standalone: boolean
  /** The person closed the guide recently. */
  readonly dismissed: boolean
}

const IOS = /iPhone|iPad|iPod/i
// In-app browsers and non-Safari iOS browsers can't add to the Home Screen the same way.
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV/i

export const isIosSafari = (ua: string): boolean => IOS.test(ua) && !NOT_SAFARI.test(ua)

export const shouldShowInstallGuide = (c: InstallContext): boolean =>
  !c.standalone && !c.dismissed && isIosSafari(c.userAgent)

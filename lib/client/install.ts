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

/** What the notifications prompt shows (T95), from this device's push state. */
export type PushPrompt = 'ask' | 'blocked' | 'unsupported'

/**
 * Notifications are on from the start (T95): the first time the app opens on a device where push
 * isn't on, a sheet offers it, once. Not in iPhone Safari before it's installed: the Add to Home
 * Screen guide comes first, and the prompt waits for the first open from the Home Screen.
 */
export const pushPromptFor = (
  state: 'unsupported' | 'install_first' | 'blocked' | 'off' | 'on',
  c: InstallContext,
): PushPrompt | null => {
  if (c.dismissed || state === 'on' || state === 'install_first') return null
  if (!c.standalone && isIosSafari(c.userAgent)) return null
  return state === 'off' ? 'ask' : state
}

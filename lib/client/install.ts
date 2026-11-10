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

/** Where someone is, for step-by-step help (T95): steps differ by phone, computer and browser. */
export type Platform =
  | 'iphone_app'
  | 'iphone_browser'
  | 'android'
  | 'desktop_chrome'
  | 'desktop_safari'
  | 'desktop_firefox'
  | 'other'

export const platformOf = (ua: string, standalone: boolean): Platform => {
  if (IOS.test(ua)) return standalone ? 'iphone_app' : 'iphone_browser'
  if (/Android/i.test(ua)) return 'android'
  if (/Firefox\//.test(ua)) return 'desktop_firefox'
  if (/Edg\/|Chrome\//.test(ua)) return 'desktop_chrome'
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'desktop_safari'
  return 'other'
}

const THEN_TURN_ON = 'Come back to Roomies. Notifications turn on by themselves.'

/** How to un-block notifications for Roomies, one short step at a time. */
export const allowSteps: Record<Platform, readonly string[]> = {
  iphone_app: [
    'Open the Settings app on your iPhone.',
    'Tap Notifications, then scroll down and tap Roomies.',
    'Turn on Allow Notifications.',
    THEN_TURN_ON,
  ],
  iphone_browser: [
    'Notifications only work from the Roomies app on your Home Screen.',
    'In Safari, tap Share, then Add to Home Screen.',
    'Open Roomies from your Home Screen and tap Turn on.',
  ],
  android: [
    'Tap the icon at the left of the address bar.',
    'Tap Permissions, then Notifications.',
    'Choose Allow.',
    THEN_TURN_ON,
  ],
  desktop_chrome: [
    'Click the icon at the left of the address bar (two little sliders).',
    'Turn on Notifications, or set it to Allow.',
    'Reload the page.',
    THEN_TURN_ON,
  ],
  desktop_safari: [
    'In the menu bar, choose Safari, then Settings.',
    'Click Websites, then Notifications in the list on the left.',
    'Find Roomies and set it to Allow.',
    THEN_TURN_ON,
  ],
  desktop_firefox: [
    'Click the icon at the left of the address bar.',
    'Next to Send Notifications, click the × to clear Blocked.',
    'Reload the page.',
    THEN_TURN_ON,
  ],
  other: [
    "Open this browser's settings for this site.",
    'Set Notifications to Allow.',
    'Reload the page.',
    THEN_TURN_ON,
  ],
}

/** When this browser can't push at all: what to do instead. */
export const unsupportedSteps = (p: Platform): readonly string[] =>
  p === 'iphone_browser' || p === 'iphone_app'
    ? [
        'Open Roomies in Safari.',
        'Tap Share, then Add to Home Screen.',
        'Open Roomies from your Home Screen. If it still can’t, update your iPhone (iOS 16.4 or later).',
      ]
    : ['Open Roomies in Chrome, Edge, Firefox or Safari.', 'Turn notifications on there.']

/**
 * Once the browser allows Roomies, notifications are on (owner, T95): a device that's allowed but
 * not connected to me connects itself when the app opens, with no tap. Turning them off is done by
 * blocking them again, or with the categories in the app.
 */
export const connectsItself = (
  state: 'unsupported' | 'install_first' | 'blocked' | 'off' | 'on',
  permission: NotificationPermission,
): boolean => state === 'off' && permission === 'granted'

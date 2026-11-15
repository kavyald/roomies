// What this device remembers about the prompts (T95, T110), in localStorage. Private mode can
// refuse it; then the prompt just shows again next time.

const PUSH_ANSWERED = 'roomies.pushPromptDone'
const INSTALL_GUIDE_CLOSED = 'roomies.installGuideDismissedAt'
const INSTALL_GUIDE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode: it asks again next time.
  }
}

/** Someone answered the notifications question on this device (any answer counts). */
export const pushAnswered = (): boolean => read(PUSH_ANSWERED) !== null
export const rememberPushAnswered = (now: number) => write(PUSH_ANSWERED, String(now))

/** The Add to Home Screen guide was closed in the last 3 days. */
export const installGuideSnoozed = (now: number): boolean => {
  const at = Number(read(INSTALL_GUIDE_CLOSED))
  return Number.isFinite(at) && at > 0 && now - at < INSTALL_GUIDE_SNOOZE_MS
}
export const snoozeInstallGuide = (now: number) => write(INSTALL_GUIDE_CLOSED, String(now))

/** Opened from the Home Screen (iOS) or as an installed app. */
export const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

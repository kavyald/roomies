'use client'

// The browser half of "Turn on notifications" (T34): what this browser can do, and subscribing
// it with the house's VAPID public key.

export type PushState = 'unsupported' | 'install_first' | 'blocked' | 'off' | 'on'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)

/** Where this browser stands; iPhones need the app on the Home Screen before they can push. */
export const pushState = async (): Promise<PushState> => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return isIos() && !isStandalone() ? 'install_first' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  // Pushes arrive through the service worker (production builds register it, just after load).
  const reg =
    (await navigator.serviceWorker.getRegistration()) ??
    (await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000)),
    ]))
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** The VAPID key as the bytes `pushManager.subscribe` wants. */
export const applicationServerKey = (base64url: string): Uint8Array<ArrayBuffer> => {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Asks for permission and subscribes; returns what to store, or why it couldn't. */
export const subscribeThisBrowser = async (
  vapidPublicKey: string,
): Promise<
  | { ok: true; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }
  | { ok: false; reason: 'denied' | 'failed' }
> => {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(vapidPublicKey),
      }))
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
      return { ok: false, reason: 'failed' }
    return {
      ok: true,
      subscription: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

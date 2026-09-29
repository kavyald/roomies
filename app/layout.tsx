import type { Metadata, Viewport } from 'next'
import { ServiceWorker } from '@/components/shell/ServiceWorker'
import { ToastProvider } from '@/components/ui/Toast'
import { devToolsEnabled } from '@/lib/config'
import './globals.css'

export const metadata: Metadata = {
  title: 'Roomies',
  description: 'Needs, chores, and tasks for one house of roommates.',
  applicationName: 'Roomies',
  appleWebApp: { capable: true, title: 'Roomies', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // draw under the notch; the shell pads with env(safe-area-inset-*)
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBF5EA' },
    { media: '(prefers-color-scheme: dark)', color: '#211A16' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
        {/* In development the worker would serve stale chunks, so it's production-only. */}
        {!devToolsEnabled() && <ServiceWorker />}
      </body>
    </html>
  )
}

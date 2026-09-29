import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Roomies',
  description: 'Needs, chores, and tasks for one house of roommates.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}

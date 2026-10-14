import { redirect } from 'next/navigation'
import { SignInForm } from '@/components/auth/SignInForm'
import { currentUserId } from '@/lib/server/session'

export const metadata = { title: 'Sign in · Roomies' }

export default async function SignInPage() {
  if (await currentUserId()) redirect('/')
  return (
    <main className="mx-auto grid min-h-dvh max-w-[430px] content-center gap-6 px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="grid gap-1">
        <h1 className="m-0 text-[1.75rem] font-extrabold">Welcome back 🏠</h1>
        <p className="m-0 text-ink-soft">We&apos;ll email you a code. No password needed.</p>
      </div>
      <SignInForm />
    </main>
  )
}

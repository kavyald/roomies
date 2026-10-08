import { signOut } from '@/app/actions/auth'
import { Button } from '@/components/ui/Button'

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="secondary" block>
        Sign out
      </Button>
    </form>
  )
}

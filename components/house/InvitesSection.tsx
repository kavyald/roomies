'use client'

import { Link2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useToast } from '@/components/ui/Toast'
import { useCreateInvite, useHouse, useInvites, useRevokeInvite } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId } from '@/lib/domain/ids'
import { validateInvite } from '@/lib/domain/invites'
import { localDateOf } from '@/lib/domain/time'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Admins make and turn off invite links (PRD §10). A link is shown once, right after it's made. */
export function InvitesSection({ houseId }: { houseId: HouseId }) {
  const invites = useInvites(houseId)
  const house = useHouse(houseId)
  const create = useCreateInvite(houseId)
  const revoke = useRevokeInvite(houseId)
  const toast = useToast()
  const now = useNow()
  const [link, setLink] = useState<{ url: string; maxUses: number } | null>(null)
  const tz = house.data?.settings.timezone ?? 'UTC'

  const makeLink = async () => {
    const r = await create.mutateAsync({})
    if (!r.ok) return toast("Couldn't make a link. Try again in a moment.")
    setLink({
      url: `${window.location.origin}/join/${r.value.token}`,
      maxUses: r.value.invite.maxUses,
    })
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied. Paste it in the group chat.')
    } catch {
      toast('Couldn’t copy. Press and hold the link to copy it.')
    }
  }

  const working = (invites.data ?? []).filter((i) => validateInvite(i, now).ok)
  const until = (i: (typeof working)[number]) => {
    const [, m, d] = localDateOf(i.expiresAt, tz).split('-').map(Number) as [number, number, number]
    return `${MONTHS[m - 1]} ${d}`
  }

  return (
    <section aria-label="Invite link" className="grid gap-2.5">
      {link ? (
        <div className="grid gap-2.5 rounded-[20px] border-[1.5px] border-outline bg-card p-3.5">
          <p className="m-0 text-sm font-semibold text-ink-soft">
            Share this in the group chat. It works for {house.data?.settings.inviteTtlDays ?? 7}{' '}
            days, for up to {link.maxUses === 1 ? '1 person' : `${link.maxUses} people`}.
          </p>
          <p className="m-0 rounded-xl bg-paper px-3 py-2.5 font-mono text-sm break-all select-all">
            {link.url}
          </p>
          <Button block onClick={() => copy(link.url)}>
            Copy link
          </Button>
        </div>
      ) : (
        <Button block variant="secondary" disabled={create.isPending} onClick={makeLink}>
          Make an invite link
        </Button>
      )}

      {working.length > 0 && (
        <ListGroup label="Invite links">
          {working.map((i) => (
            <ListRow
              key={i.id}
              leading={<Link2 aria-hidden className="size-5 text-ink-soft" />}
              title={`${i.uses} of ${i.maxUses} used`}
              subtitle={`Works until ${until(i)}`}
              trailing={
                <Button
                  size="small"
                  variant="secondary"
                  disabled={revoke.isPending}
                  onClick={async () => {
                    const r = await revoke.mutateAsync(i.id)
                    toast(r.ok ? 'Link turned off.' : "Couldn't turn it off. Try again.")
                  }}
                >
                  Turn off
                </Button>
              }
            />
          ))}
        </ListGroup>
      )}
    </section>
  )
}

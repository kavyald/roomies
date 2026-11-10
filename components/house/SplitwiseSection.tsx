'use client'

import { useState } from 'react'
import { inputClass } from '@/components/auth/fields'
import { SplitwiseMark } from '@/components/costs/SplitwiseMark'
import { Button } from '@/components/ui/Button'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Sheet, SheetSave } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useHouse, useSetSplitwiseGroup } from '@/lib/client/hooks'
import type { HouseId } from '@/lib/domain/ids'

/**
 * Admin → Splitwise (T89): the house's group link, which every cost's Splitwise icon opens. Any
 * roommate can set, change or remove it.
 */
export function SplitwiseSection({ houseId }: { houseId: HouseId }) {
  const house = useHouse(houseId)
  const [open, setOpen] = useState(false)
  if (!house.data) return null
  const linked = house.data.settings.splitwiseGroup
  return (
    <>
      <ListGroup label="Splitwise">
        <ListRow
          leading={<SplitwiseMark />}
          title="Splitwise"
          subtitle={linked ? 'Costs open your group' : "Add your group's link"}
          onClick={() => setOpen(true)}
          editable
        />
      </ListGroup>
      {open && <SplitwiseSheet houseId={houseId} current={linked} onClose={() => setOpen(false)} />}
    </>
  )
}

function SplitwiseSheet({
  houseId,
  current,
  onClose,
}: {
  houseId: HouseId
  current: string | undefined
  onClose: () => void
}) {
  const [link, setLink] = useState(current ?? '')
  const [bad, setBad] = useState(false)
  const save = useSetSplitwiseGroup(houseId)
  const toast = useToast()

  const submit = async (next: string | null) => {
    const r = await save.mutateAsync({ link: next })
    if (!r.ok && r.error === 'invalid') return setBad(true)
    if (!r.ok && r.error !== 'no_change') return toast("Couldn't save the link. Try again.")
    if (r.ok)
      toast(
        r.value.settings.splitwiseGroup
          ? 'Saved. Costs open your Splitwise group.'
          : 'Link removed. Costs open Splitwise.',
      )
    onClose()
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Splitwise group"
      description="Each cost's Splitwise icon opens this group. Anyone can change it."
    >
      <form
        id="splitwise-group"
        // The link's own check explains what's wrong; the browser's would refuse a link without
        // https:// that Splitwise's share sheet gives.
        noValidate
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(link)
        }}
      >
        <label htmlFor="splitwise-link" className="text-[0.8rem] font-extrabold text-ink-soft">
          Group link
        </label>
        <input
          id="splitwise-link"
          className={inputClass}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="https://secure.splitwise.com/#/groups/…"
          value={link}
          aria-invalid={bad || undefined}
          aria-describedby="splitwise-link-hint"
          onChange={(e) => {
            setLink(e.target.value)
            setBad(false)
          }}
        />
        <p id="splitwise-link-hint" className="m-0 text-[0.8rem] font-semibold text-ink-soft">
          {bad
            ? "That isn't a Splitwise group link. Open the group in Splitwise and copy the link."
            : 'In Splitwise on the web, open your group and copy the link from the address bar.'}
        </p>
      </form>
      <SheetSave form="splitwise-group" busy={save.isPending} />
      {current && (
        <Button
          variant="secondary"
          block
          disabled={save.isPending}
          onClick={() => void submit(null)}
        >
          Remove the link
        </Button>
      )}
    </Sheet>
  )
}

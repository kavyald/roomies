'use client'

import { Minus, Plus, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ListRow } from '@/components/ui/ListRow'
import { Sheet, SheetSave } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useHouse, useSetFeelingWeights } from '@/lib/client/hooks'
import {
  DEFAULT_FEELING_WEIGHTS,
  FEELING_KINDS,
  FEELING_META,
  type FeelingWeights,
} from '@/lib/domain/feelings'
import type { HouseId } from '@/lib/domain/ids'
import { BASE_POINTS, signedPoints } from '@/lib/domain/priority'
import { stepWeight, WEIGHT_MAX, WEIGHT_MIN } from '@/lib/domain/weights'

/**
 * House → Priority (PRD §8.2, T107): one row, "How feelings raise priority", showing today's
 * feeling weights; it opens the sheet. The one setting any member can change. Sits in a ListGroup.
 */
export function FeelingWeightsRow({ houseId, linked }: { houseId: HouseId; linked?: boolean }) {
  const house = useHouse(houseId)
  // An item's "How feelings raise priority" link (`?priority`, T108) opens the sheet; the URL then
  // goes back to plain House, so a reload doesn't open it again.
  const [open, setOpen] = useState(!!linked)
  const [wasLinked, setWasLinked] = useState(linked)
  if (linked !== wasLinked) {
    setWasLinked(linked)
    if (linked) setOpen(true)
  }
  useEffect(() => {
    if (linked) window.history.replaceState(null, '', `/h/${houseId}`)
  }, [linked, houseId])
  if (!house.data) return null
  const weights = house.data.settings.feelingWeights
  return (
    <>
      <ListRow
        leading={<SlidersHorizontal aria-hidden className="size-5 text-ink-soft" />}
        title="How feelings raise priority"
        subtitle={FEELING_KINDS.map(
          (k) => `${FEELING_META[k].emoji} ${signedPoints(weights[k])}`,
        ).join(' · ')}
        onClick={() => setOpen(true)}
      />
      {open && (
        <FeelingWeightsSheet houseId={houseId} current={weights} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function FeelingWeightsSheet({
  houseId,
  current,
  onClose,
}: {
  houseId: HouseId
  current: FeelingWeights
  onClose: () => void
}) {
  const [weights, setWeights] = useState<FeelingWeights>(current)
  const save = useSetFeelingWeights(houseId)
  const toast = useToast()
  const step = (k: keyof FeelingWeights, d: 1 | -1) =>
    setWeights((w) => ({ ...w, [k]: stepWeight(w[k], d) }))
  const isDefault = FEELING_KINDS.every((k) => weights[k] === DEFAULT_FEELING_WEIGHTS[k])

  const submit = async () => {
    const r = await save.mutateAsync(weights)
    if (!r.ok && r.error !== 'no_change') return toast("Couldn't save the weights. Try again.")
    if (r.ok) toast('Saved. Priorities change for everyone.')
    onClose()
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Feeling weights"
      description="One setting for the whole house. Anyone can change it."
    >
      <p className="m-0 text-sm font-semibold text-ink-soft">
        Items start at {BASE_POINTS.normal} out of 100; each feeling adds this much.
      </p>
      <ul aria-label="Feeling weights" className="m-0 grid list-none gap-1 p-0">
        {FEELING_KINDS.map((k) => {
          const { emoji, label } = FEELING_META[k]
          return (
            <li key={k} className="flex min-h-12 items-center gap-3">
              <span aria-hidden className="text-2xl">
                {emoji}
              </span>
              <span className="flex-1 font-bold">{label}</span>
              <Stepper
                label={label}
                value={weights[k]}
                onDown={() => step(k, -1)}
                onUp={() => step(k, 1)}
              />
            </li>
          )
        })}
      </ul>
      <SheetSave busy={save.isPending} onSave={submit} />
      <Button
        variant="secondary"
        block
        disabled={isDefault}
        onClick={() => setWeights(DEFAULT_FEELING_WEIGHTS)}
      >
        Reset to defaults
      </Button>
    </Sheet>
  )
}

function Stepper({
  label,
  value,
  onDown,
  onUp,
}: {
  label: string
  value: number
  onDown: () => void
  onUp: () => void
}) {
  const round =
    'grid size-11 place-items-center rounded-full bg-neutral-fill text-neutral-ink disabled:opacity-40'
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Lower ${label}`}
        className={round}
        disabled={value <= WEIGHT_MIN}
        onClick={onDown}
      >
        <Minus aria-hidden className="size-4" strokeWidth={2.5} />
      </button>
      <output
        aria-label={`${label} weight`}
        className="w-11 text-center font-extrabold tabular-nums"
      >
        {signedPoints(value)}
      </output>
      <button
        type="button"
        aria-label={`Raise ${label}`}
        className={round}
        disabled={value >= WEIGHT_MAX}
        onClick={onUp}
      >
        <Plus aria-hidden className="size-4" strokeWidth={2.5} />
      </button>
    </span>
  )
}

'use client'

import { Minus, Plus, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useHouse, useSetFeelingWeights } from '@/lib/client/hooks'
import {
  DEFAULT_FEELING_WEIGHTS,
  FEELING_KINDS,
  FEELING_META,
  type FeelingWeights,
} from '@/lib/domain/feelings'
import type { HouseId } from '@/lib/domain/ids'
import { signedPoints } from '@/lib/domain/priority'
import { stepWeight, WEIGHT_MAX, WEIGHT_MIN } from '@/lib/domain/weights'

/** House → Settings (PRD §8.2). Feeling weights is the one setting any member can change. */
export function FeelingWeightsSection({ houseId }: { houseId: HouseId }) {
  const house = useHouse(houseId)
  const [open, setOpen] = useState(false)
  if (!house.data) return null
  return (
    <>
      <ListGroup label="Settings">
        <ListRow
          leading={<SlidersHorizontal aria-hidden className="size-5 text-ink-soft" />}
          title="Feeling weights"
          subtitle="How much each feeling raises priority"
          onClick={() => setOpen(true)}
        />
      </ListGroup>
      {open && (
        <FeelingWeightsSheet
          houseId={houseId}
          current={house.data.settings.feelingWeights}
          onClose={() => setOpen(false)}
        />
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
    if (r.ok) toast('Saved. The feed is re-ranked for everyone.')
    onClose()
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Feeling weights"
      description="One setting for the whole house. Anyone can change it."
    >
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
      <Button block disabled={save.isPending} onClick={submit}>
        Save
      </Button>
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

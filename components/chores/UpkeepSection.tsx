'use client'

import { useId, useRef, useState } from 'react'
import { FeelingTray } from '@/components/items/Feelings'
import type { CardContext } from '@/components/items/ItemCard'
import { choreRoomsLabel, TOOK_CARE } from '@/components/items/meta'
import { useItemSheets } from '@/components/items/ItemSheets'
import { useDidIt } from '@/components/items/useDidIt'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ChoreIcon } from '@/components/ui/ChoreIcon'
import { cn } from '@/components/ui/cn'
import { FEELING_META, type Feeling } from '@/lib/domain/feelings'
import type { ItemId } from '@/lib/domain/ids'
import type { Chore } from '@/lib/domain/items'
import type { ChoreBoard } from '@/lib/domain/lists'

/** A chore someone feels something about: who and which emoji, and "Took care of it". */
function FeltRow({
  ctx,
  chore,
  feelings,
}: {
  ctx: CardContext
  chore: Chore
  feelings: readonly Feeling[]
}) {
  const { openItem } = useItemSheets()
  const { didIt } = useDidIt(ctx.houseId)
  const id = useId()
  const rooms = choreRoomsLabel(chore, ctx.rooms)
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => openItem(chore.id)}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-more`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <ChoreIcon name={chore.icon} className="size-5 flex-none text-accent-ink" />
        <span className="grid min-w-0 gap-0.5">
          <span id={`${id}-title`} className="leading-tight font-bold">
            {chore.title}
          </span>
          <span
            id={`${id}-more`}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8rem] font-semibold text-ink-soft"
          >
            {rooms && <span>{rooms}</span>}
            {feelings.map((f) => {
              const who = ctx.person(f.by) ?? { name: 'Former roommate' }
              return (
                <span key={f.by} className="flex items-center gap-1">
                  <span>{FEELING_META[f.kind].emoji}</span>
                  <Avatar name={who.name} element={who.element} size={20} />
                </span>
              )
            })}
          </span>
        </span>
      </button>
      <Button
        size="small"
        variant="secondary"
        aria-label={`Took care of it: ${chore.title}`}
        className="flex-none whitespace-nowrap"
        onClick={() => didIt(chore.id, TOOK_CARE)}
      >
        Took care of it
      </Button>
    </li>
  )
}

/**
 * Upkeep (FRONTEND §5.6): the house's, never inside a card, so it doesn't read as the holder's
 * job; it also holds chores nobody's on. What someone feels something about comes first, the rest
 * are small chips: a tap opens the emoji tray, with the chore's details one more tap away.
 */
export function UpkeepSection({
  ctx,
  upkeep,
  onAdd,
}: {
  ctx: CardContext
  upkeep: ChoreBoard['upkeep']
  onAdd: () => void
}) {
  const { openItem } = useItemSheets()
  const [openChip, setOpenChip] = useState<ItemId | null>(null)
  const chips = useRef(new Map<ItemId, HTMLButtonElement>())
  const id = useId()
  const open = upkeep.calm.find((c) => c.id === openChip)
  const closeTray = () => {
    if (openChip) chips.current.get(openChip)?.focus({ preventScroll: true })
    setOpenChip(null)
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="grid gap-2 rounded-[20px] border-[1.5px] border-line bg-paper px-3 pt-1.5 pb-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="m-0 text-lg font-extrabold">
          Upkeep
        </h2>
        <button
          type="button"
          aria-label="Add to Upkeep"
          onClick={onAdd}
          className="min-h-11 px-1 text-sm font-extrabold text-accent-ink"
        >
          + Add
        </button>
      </div>

      {upkeep.felt.length === 0 ? (
        <p className="m-0 text-sm font-bold text-ink-soft">All calm</p>
      ) : (
        <ul aria-label="Piling up" className="m-0 grid list-none gap-1 p-0">
          {upkeep.felt.map(({ chore, feelings }) => (
            <FeltRow key={chore.id} ctx={ctx} chore={chore} feelings={feelings} />
          ))}
        </ul>
      )}

      {upkeep.calm.length > 0 && (
        <ul aria-label="Everything else" className="m-0 flex list-none flex-wrap gap-x-1.5 p-0">
          {upkeep.calm.map((chore) => {
            const pressed = chore.id === openChip
            return (
              <li key={chore.id}>
                <button
                  ref={(el) => {
                    if (el) chips.current.set(chore.id, el)
                    else chips.current.delete(chore.id)
                  }}
                  type="button"
                  aria-label={`Share a feeling: ${chore.title}`}
                  aria-expanded={pressed}
                  aria-controls={pressed ? `${id}-tray` : undefined}
                  onClick={() => (pressed ? closeTray() : setOpenChip(chore.id))}
                  className="flex min-h-11 items-center"
                >
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-[0.78rem] font-bold',
                      pressed ? 'bg-top-fill text-top-ink' : 'bg-neutral-fill text-neutral-ink',
                    )}
                  >
                    <ChoreIcon name={chore.icon} className="size-4" />
                    {chore.title}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && (
        <div className="grid gap-2 rounded-2xl bg-card p-2.5">
          <FeelingTray
            id={`${id}-tray`}
            houseId={ctx.houseId}
            itemId={open.id}
            onDone={closeTray}
            onAddNote={() => openItem(open.id, { note: true })}
          />
          <Button
            size="small"
            variant="secondary"
            className="justify-self-start"
            onClick={() => {
              setOpenChip(null)
              openItem(open.id)
            }}
          >
            See details
          </Button>
        </div>
      )}
    </section>
  )
}

'use client'

import { Check, Phone } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Chip, RoomChip, TierChip } from '@/components/ui/Chip'
import { cn } from '@/components/ui/cn'
import { Swipeable } from '@/components/ui/Swipeable'
import type { Feeling } from '@/lib/domain/feelings'
import type { Contact, Element, Room } from '@/lib/domain/house'
import type { HouseId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import type { Tier } from '@/lib/domain/priority'
import type { Run } from '@/lib/domain/runs'
import { onRunLabel, RUN_ICON } from '@/components/runs/meta'
import { FeelingButton, FeelingCounts, FeelingTray } from './Feelings'
import { useItemSheets } from './ItemSheets'
import { CATEGORY, FINISH, scheduleLabel } from './meta'

export type CardContext = {
  houseId: HouseId
  rooms: ReadonlyMap<string, Room>
  contacts: ReadonlyMap<string, Contact>
  /** The run an item is on, with its label ("Kavya's run"). */
  run(id: string): { run: Run; label: string } | undefined
  person(id: string): { name: string; element?: Element } | undefined
}

/** What a swipe reveals: finish on the left (swiping right), the feelings on the right. */
export const finishSide = (label: string) => ({
  label,
  icon: <Check aria-hidden className="size-5" strokeWidth={3} />,
  className: 'bg-accent text-on-accent',
})
export const feelSide = {
  label: 'Feeling',
  icon: <span aria-hidden>🙂</span>,
  className: 'bg-top-fill text-top-ink',
}

/**
 * An item as a card (FRONTEND §5.1): one line with the tier (and, on Home, the category) and the
 * feelings; the title; at most two chips (room, then the run it's on or who's handling it); one
 * meta line. Tapping it opens the detail sheet. Beside it, the check button does the quick action
 * and 🙂+ opens the emoji tray; swiping right and left do the same two things.
 */
export function ItemCard({
  item,
  ctx,
  meta,
  tier,
  feelings,
  showCategory,
  onOpen,
  onCheck,
  checkLabel,
}: {
  item: Item
  ctx: CardContext
  /** The meta line: "Due Thu", "Last done 9 days ago · Wren", … */
  meta?: string
  /** The priority tier, on Home's ranked feed. */
  tier?: Tier
  /** The feelings on this item, shown as "😤1 🙏2". */
  feelings?: readonly Feeling[]
  /** Home mixes needs, chores and tasks, so its cards say which they are. */
  showCategory?: boolean
  onOpen: () => void
  onCheck?: () => void
  checkLabel?: string
}) {
  const { openItem } = useItemSheets()
  const [tray, setTray] = useState(false)
  const feelButton = useRef<HTMLButtonElement>(null)
  const room = item.roomId ? ctx.rooms.get(item.roomId) : undefined
  const contact =
    item.category === 'task' && item.contactId ? ctx.contacts.get(item.contactId) : undefined
  const assignee = item.assignee ? ctx.person(item.assignee) : undefined
  const onRun = item.run ? ctx.run(item.run.id) : undefined
  const Icon = CATEGORY[item.category].icon
  // The schedule says the most about a chore on the Chores tab; Home names the category instead.
  const kind = showCategory ? (
    <Chip icon={Icon}>{CATEGORY[item.category].label}</Chip>
  ) : item.category === 'chore' ? (
    <span className="text-[0.8rem] font-bold text-ink-soft">{scheduleLabel(item)}</span>
  ) : null
  const hasTop = !!tier || !!kind || !!feelings?.length
  const hasChips = !!room || !!onRun || !!contact
  const hasMeta = !!assignee || !!meta
  // VoiceOver reads the title first; the tier, chips and meta line follow as the description.
  const id = useId()
  const closeTray = () => {
    setTray(false)
    feelButton.current?.focus({ preventScroll: true })
  }

  return (
    <Swipeable
      className="rounded-[20px]"
      right={onCheck && { ...finishSide(FINISH[item.category]), onSwipe: onCheck }}
      left={{ ...feelSide, onSwipe: () => setTray(true) }}
    >
      <article className="sticker grid rounded-[20px] border-[1.5px] border-outline bg-card">
        <div className="flex items-start gap-1 pr-1.5">
          <button
            type="button"
            onClick={onOpen}
            aria-labelledby={`${id}-title`}
            aria-describedby={
              [hasTop && `${id}-top`, hasChips && `${id}-chips`, hasMeta && `${id}-meta`]
                .filter(Boolean)
                .join(' ') || undefined
            }
            className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-2 px-3.5 pt-3.5 pb-3 text-left"
          >
            {hasTop && (
              <span id={`${id}-top`} className="flex min-h-6 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {tier && <TierChip tier={tier} />}
                  {kind}
                </span>
                {feelings?.length ? <FeelingCounts feelings={feelings} /> : null}
              </span>
            )}
            <h3
              id={`${id}-title`}
              className="m-0 text-[1.0625rem] leading-tight font-bold text-balance"
            >
              {item.title}
            </h3>
            {hasChips && (
              <span id={`${id}-chips`} className="flex flex-wrap gap-1.5">
                {room && <RoomChip name={room.name} element={room.element} />}
                {onRun ? (
                  <Chip icon={RUN_ICON[onRun.run.kind]}>{onRunLabel(onRun.run, onRun.label)}</Chip>
                ) : (
                  contact && <Chip icon={Phone}>Handled by: {contact.name}</Chip>
                )}
              </span>
            )}
            {hasMeta && (
              <span
                id={`${id}-meta`}
                className="flex min-h-6 items-center gap-2 text-[0.8rem] leading-snug font-semibold text-ink-soft"
              >
                {assignee && <Avatar name={assignee.name} element={assignee.element} size={20} />}
                <span className="min-w-0">{meta}</span>
              </span>
            )}
          </button>
          <div className="mt-1.5 flex flex-none flex-col items-center">
            {onCheck && (
              <button
                type="button"
                aria-label={checkLabel}
                onClick={onCheck}
                className={cn(
                  'grid size-11 flex-none place-items-center rounded-full text-transparent',
                  'hover:text-ink-soft',
                )}
              >
                <span className="grid size-9 place-items-center rounded-full bg-card shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--ink)_30%,transparent)]">
                  <Check aria-hidden className="size-5" strokeWidth={2.5} />
                </span>
              </button>
            )}
            <FeelingButton
              ref={feelButton}
              title={item.title}
              open={tray}
              controls={`${id}-tray`}
              onClick={() => (tray ? closeTray() : setTray(true))}
            />
          </div>
        </div>
        {tray && (
          <FeelingTray
            id={`${id}-tray`}
            houseId={ctx.houseId}
            itemId={item.id}
            className="px-2.5 pb-2.5"
            onDone={closeTray}
            onAddNote={() => openItem(item.id, { note: true })}
          />
        )}
      </article>
    </Swipeable>
  )
}

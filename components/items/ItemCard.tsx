'use client'

import { Check, Phone } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Chip, RoomChip } from '@/components/ui/Chip'
import { cn } from '@/components/ui/cn'
import type { Contact, Element, Room } from '@/lib/domain/house'
import type { Item } from '@/lib/domain/items'
import type { Run } from '@/lib/domain/runs'
import { onRunLabel, RUN_ICON } from '@/components/runs/meta'
import { CATEGORY, scheduleLabel } from './meta'

export type CardContext = {
  rooms: ReadonlyMap<string, Room>
  contacts: ReadonlyMap<string, Contact>
  /** The run an item is on, with its label ("Kavya's run"). */
  run(id: string): { run: Run; label: string } | undefined
  person(id: string): { name: string; element?: Element } | undefined
}

/**
 * An item as a card (FRONTEND §5.1): chips, title, meta line. Tapping it opens the detail sheet;
 * the check button beside it does the item's quick action.
 */
export function ItemCard({
  item,
  ctx,
  meta,
  top,
  onOpen,
  onCheck,
  checkLabel,
  hideCategory,
}: {
  item: Item
  ctx: CardContext
  /** The meta line: "Due Thu", "Last done 9 days ago · Wren", … */
  meta?: string
  /** Above the title: the tier chip and feelings (T24). */
  top?: ReactNode
  onOpen: () => void
  onCheck?: () => void
  checkLabel?: string
  hideCategory?: boolean
}) {
  const room = item.roomId ? ctx.rooms.get(item.roomId) : undefined
  const contact =
    item.category === 'task' && item.contactId ? ctx.contacts.get(item.contactId) : undefined
  const assignee = item.assignee ? ctx.person(item.assignee) : undefined
  const onRun = item.run ? ctx.run(item.run.id) : undefined
  const Icon = CATEGORY[item.category].icon
  // VoiceOver reads the title first; the tier, chips and meta line follow as the description.
  const id = useId()

  return (
    <article className="sticker flex items-start gap-2 rounded-[20px] border-[1.5px] border-outline bg-card pr-2.5">
      <button
        type="button"
        onClick={onOpen}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-top ${id}-chips ${id}-meta`}
        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-2 px-3.5 pt-3.5 pb-3 text-left"
      >
        {top && <span id={`${id}-top`}>{top}</span>}
        <h3
          id={`${id}-title`}
          className="m-0 text-[1.0625rem] leading-tight font-bold text-balance"
        >
          {item.title}
        </h3>
        <span id={`${id}-chips`} className="flex flex-wrap gap-1.5">
          {!hideCategory && (
            <Chip icon={Icon}>
              {item.category === 'chore' ? scheduleLabel(item) : CATEGORY[item.category].label}
            </Chip>
          )}
          {contact && <Chip icon={Phone}>Handled by: {contact.name}</Chip>}
          {room && <RoomChip name={room.name} element={room.element} />}
          {onRun && (
            <Chip icon={RUN_ICON[onRun.run.kind]}>{onRunLabel(onRun.run, onRun.label)}</Chip>
          )}
        </span>
        {(assignee || meta) && (
          <span
            id={`${id}-meta`}
            className="flex min-h-6 items-center gap-2 text-[0.8rem] leading-snug font-semibold text-ink-soft"
          >
            {assignee && <Avatar name={assignee.name} element={assignee.element} size={20} />}
            <span className="min-w-0">{meta}</span>
          </span>
        )}
      </button>
      {onCheck && (
        <button
          type="button"
          aria-label={checkLabel}
          onClick={onCheck}
          className={cn(
            'mt-3 grid size-11 flex-none place-items-center rounded-full text-transparent',
            'hover:text-ink-soft',
          )}
        >
          <span className="grid size-9 place-items-center rounded-full bg-card shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--ink)_30%,transparent)]">
            <Check aria-hidden className="size-5" strokeWidth={2.5} />
          </span>
        </button>
      )}
    </article>
  )
}

'use client'

import { Check, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Chip, RoomChip } from '@/components/ui/Chip'
import { cn } from '@/components/ui/cn'
import type { Contact, Element, Room } from '@/lib/domain/house'
import type { Item } from '@/lib/domain/items'
import { CATEGORY, scheduleLabel } from './meta'

export type CardContext = {
  rooms: ReadonlyMap<string, Room>
  contacts: ReadonlyMap<string, Contact>
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
  const Icon = CATEGORY[item.category].icon

  return (
    <article className="sticker flex items-start gap-2 rounded-[20px] border-[1.5px] border-outline bg-card pr-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="grid min-w-0 flex-1 gap-2 px-3.5 pt-3.5 pb-3 text-left"
      >
        {top}
        <h3 className="m-0 text-[1.0625rem] leading-tight font-bold text-balance">{item.title}</h3>
        <span className="flex flex-wrap gap-1.5">
          {!hideCategory && (
            <Chip icon={Icon}>
              {item.category === 'chore' ? scheduleLabel(item) : CATEGORY[item.category].label}
            </Chip>
          )}
          {contact && <Chip icon={Phone}>Handled by: {contact.name}</Chip>}
          {room && <RoomChip name={room.name} element={room.element} />}
        </span>
        {(assignee || meta) && (
          <span className="flex min-h-6 items-center gap-2 text-[0.8rem] font-semibold text-ink-soft">
            {assignee && <Avatar name={assignee.name} element={assignee.element} size={20} />}
            <span className="min-w-0 truncate">{meta}</span>
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

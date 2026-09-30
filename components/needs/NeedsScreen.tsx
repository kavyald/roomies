'use client'

import { BarChart3, Check, Plus, ShoppingBag, ShoppingCart } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { inputClass } from '@/components/auth/fields'
import { FeelingCounts } from '@/components/items/Feelings'
import { useItemSheets } from '@/components/items/ItemSheets'
import { whenLabel } from '@/components/items/meta'
import { useCardContext } from '@/components/items/useCardContext'
import { onRunLabel, RUN_ICON } from '@/components/runs/meta'
import { Button } from '@/components/ui/Button'
import { Chip, RoomChip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import {
  useCreateItem,
  useHouse,
  useItems,
  useMarkDone,
  useReopenItem,
  useFeelingsByItem,
  usePolls,
} from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId, ItemId } from '@/lib/domain/ids'
import { feelingScore } from '@/lib/domain/feelings'
import { needList } from '@/lib/domain/lists'

/**
 * The shared shopping list (FRONTEND §5.5): "We need…" at the top, then each open need with a
 * Got it circle. No Soon flag: a feeling says "we need this soon" (T23).
 */
export function NeedsScreen({ houseId }: { houseId: HouseId }) {
  const items = useItems(houseId)
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const feelingsBy = useFeelingsByItem(houseId)
  const { openItem, startRun } = useItemSheets()
  const create = useCreateItem(houseId)
  const done = useMarkDone(houseId)
  const reopen = useReopenItem(houseId)
  const toast = useToast()
  const now = useNow()
  const polls = usePolls(houseId)
  const openPollItems = new Set(
    (polls.data ?? []).filter((p) => p.state.open && p.itemId).map((p) => p.itemId as string),
  )
  const [title, setTitle] = useState('')
  const [highlight, setHighlight] = useState<ItemId | null>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (!highlight) return
    rows.current.get(highlight)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(() => setHighlight(null), 2400)
    return () => clearTimeout(t)
  }, [highlight])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const r = await create.mutateAsync({ category: 'need', title })
    if (r.ok) {
      setTitle('')
      return
    }
    if (r.error === 'duplicate_need' && r.detail?.existingId) {
      setTitle('')
      setHighlight(r.detail.existingId as ItemId)
      return toast("That's already on the list.")
    }
    toast(r.error === 'title_too_long' ? 'That one is a bit long.' : "Couldn't add it. Try again.")
  }

  const gotIt = async (id: ItemId, name: string) => {
    const r = await done.mutateAsync(id)
    if (!r.ok) return toast("Couldn't check it off. Try again.")
    toast(`Got ${name}.`, {
      label: 'Undo',
      onClick: async () => {
        const back = await reopen.mutateAsync(id)
        if (!back.ok && back.error === 'duplicate_need') toast("Someone's already added it again.")
      },
    })
  }

  const tz = house.data?.settings.timezone ?? 'UTC'
  const weights = house.data?.settings.feelingWeights
  const needs = items.data
    ? needList(items.data, (id) => (weights ? feelingScore(feelingsBy.get(id) ?? [], weights) : 0))
    : []

  return (
    <div className="grid gap-4">
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="we-need" className="sr-only">
          We need…
        </label>
        <input
          id="we-need"
          placeholder="We need…"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={120}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          aria-label="Add to the list"
          disabled={create.isPending || !title.trim()}
          className="sticker grid size-12 flex-none place-items-center rounded-full bg-accent text-on-accent disabled:opacity-45 [--sticker-edge:color-mix(in_srgb,var(--accent)_60%,#000)]"
        >
          <Plus aria-hidden className="size-6" strokeWidth={2.5} />
        </button>
      </form>

      {items.isError ? (
        <p role="alert" className="font-bold text-ink-soft">
          Couldn&apos;t reach the house. Check your connection and try again.
        </p>
      ) : items.isPending ? (
        <p className="text-ink-soft">Loading…</p>
      ) : needs.length === 0 ? (
        <EmptyState icon={ShoppingBag}>Nothing to buy. Nice.</EmptyState>
      ) : (
        <ul
          aria-label="Needs"
          className="sticker m-0 list-none overflow-hidden rounded-[20px] border-[1.5px] border-outline p-0"
        >
          {needs.map((n) => {
            const room = n.roomId ? ctx.rooms.get(n.roomId) : undefined
            const when = whenLabel(n, now, tz)
            const onRun = n.run ? ctx.run(n.run.id) : undefined
            const polled = openPollItems.has(n.id)
            return (
              <li
                key={n.id}
                ref={(el) => {
                  if (el) rows.current.set(n.id, el)
                  else rows.current.delete(n.id)
                }}
                className={cn(
                  'flex items-center gap-1 border-b-[1.5px] border-line bg-card pl-1.5 transition-colors duration-500 last:border-b-0',
                  highlight === n.id && 'bg-top-fill',
                )}
              >
                <button
                  type="button"
                  aria-label={`Got it: ${n.title}`}
                  onClick={() => gotIt(n.id, n.title)}
                  className="group grid size-11 flex-none place-items-center rounded-full"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-card text-transparent shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--ink)_30%,transparent)] group-hover:text-ink-soft">
                    <Check aria-hidden className="size-4" strokeWidth={3} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openItem(n.id)}
                  className="grid min-h-12 flex-1 gap-1 py-2.5 pr-3.5 text-left"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold">{n.title}</span>
                    <FeelingCounts feelings={feelingsBy.get(n.id) ?? []} />
                  </span>
                  {(n.note || room || when || onRun || polled) && (
                    <span className="flex flex-wrap items-center gap-1.5 text-[0.8rem] font-semibold text-ink-soft">
                      {onRun && (
                        <Chip icon={RUN_ICON[onRun.run.kind]}>
                          {onRunLabel(onRun.run, onRun.label)}
                        </Chip>
                      )}
                      {polled && <Chip icon={BarChart3}>Poll</Chip>}
                      {room && <RoomChip name={room.name} element={room.element} />}
                      {when && <span>{when}</span>}
                      {n.note && <span className="truncate">{n.note}</span>}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {needs.some((n) => !n.run) && (
        <Button variant="secondary" block onClick={startRun}>
          <ShoppingCart aria-hidden className="size-5" /> Start a run
        </Button>
      )}
    </div>
  )
}

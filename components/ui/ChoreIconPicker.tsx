'use client'

import { Search } from 'lucide-react'
import { useId, useState } from 'react'
import {
  CHORE_ICON_GROUPS,
  CHORE_ICONS,
  choreIconGroup,
  choreIconLabel,
  searchIcons,
  suggestIcons,
  type ChoreIconName,
} from '@/lib/domain/icons'
import { CHORE_ICON_COMPONENTS } from './ChoreIcon'
import { Disclosure, DisclosureGroup } from './Disclosure'
import { cn } from './cn'

export { choreIconLabel }

/**
 * The icon a chore gets when nobody picked one: the best fit for its name, if any (T101). Forms
 * show it chosen in the picker and save it.
 */
export const iconFor = (picked: string, title: string): string =>
  picked || suggestIcons(title)[0] || ''

/**
 * Picking a chore or routine's outline icon (FRONTEND §3.4, T101): icons suggested by the name,
 * a search by word ("mop", "vac"), and every icon under its group's heading. Each is a 44pt toggle
 * named for what it shows; the chosen one shows accent. `label` names the whole picker.
 */
export function ChoreIconPicker({
  label,
  value,
  title = '',
  onChange,
}: {
  label: string
  value?: string
  /** The chore's name, for the Suggested row. */
  title?: string
  onChange: (icon: ChoreIconName) => void
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const suggested = suggestIcons(title)
  // The chosen icon stays in view: first in Suggested when it isn't one of them.
  const shown =
    value &&
    !suggested.includes(value as ChoreIconName) &&
    CHORE_ICONS.includes(value as ChoreIconName)
      ? [value as ChoreIconName, ...suggested.slice(0, 5)]
      : suggested
  const found = query.trim() ? searchIcons(query) : null

  const grid = (names: readonly ChoreIconName[], name: string) => (
    <div role="group" aria-label={name} className="flex flex-wrap gap-1">
      {names.map((n) => (
        <IconToggle key={n} name={n} on={value === n} onPick={() => onChange(n)} />
      ))}
    </div>
  )

  return (
    <div role="group" aria-label={label} className="grid gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft"
        />
        <input
          id={`${id}-search`}
          type="search"
          aria-label="Search icons"
          placeholder="Search icons"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Inside a sheet's form, Enter here searches; it never saves the chore.
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          className="w-full rounded-[14px] border-[1.5px] border-line bg-paper py-2.5 pr-3 pl-9 text-base text-ink placeholder:text-ink-soft"
        />
      </div>
      {found ? (
        found.length > 0 ? (
          grid(found, 'Icons found')
        ) : (
          <p className="m-0 text-sm text-ink-soft">No icon for that. Try another word.</p>
        )
      ) : (
        <>
          {shown.length > 0 && (
            <div className="grid gap-1">
              <p className="m-0 text-[0.8rem] font-extrabold text-ink-soft">Suggested</p>
              {grid(shown, 'Suggested icons')}
            </div>
          )}
          <DisclosureGroup>
            <Disclosure title="All icons" defaultOpen={suggested.length === 0}>
              <div className="grid gap-2.5">
                {CHORE_ICON_GROUPS.map((group) => (
                  <div key={group} className="grid gap-1">
                    <p className="m-0 text-[0.8rem] font-extrabold text-ink-soft">{group}</p>
                    {grid(
                      CHORE_ICONS.filter((n) => choreIconGroup(n) === group),
                      group,
                    )}
                  </div>
                ))}
              </div>
            </Disclosure>
          </DisclosureGroup>
        </>
      )}
    </div>
  )
}

function IconToggle({
  name,
  on,
  onPick,
}: {
  name: ChoreIconName
  on: boolean
  onPick: () => void
}) {
  const Icon = CHORE_ICON_COMPONENTS[name]
  return (
    <button
      type="button"
      aria-label={choreIconLabel(name)}
      aria-pressed={on}
      onClick={onPick}
      className="grid size-[max(2.75rem,44px)] place-items-center rounded-full"
    >
      <span
        aria-hidden
        className={cn(
          'grid size-[max(2.25rem,36px)] place-items-center rounded-full',
          on ? 'bg-accent text-on-accent' : 'bg-neutral-fill text-neutral-ink',
        )}
      >
        <Icon className="size-[max(1.125rem,18px)]" />
      </span>
    </button>
  )
}

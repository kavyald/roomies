'use client'

import { ArrowRight, CalendarSync, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Field } from '@/components/auth/fields'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ChoreIcon } from '@/components/ui/ChoreIcon'
import { ChoreIconPicker, iconFor } from '@/components/ui/ChoreIconPicker'
import { cn } from '@/components/ui/cn'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet, SheetSave } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import {
  CHANGED_MEANWHILE,
  useCreateRoutine,
  useEditRoutine,
  useHouse,
  useMembers,
  useProfiles,
  useRemoveRoutine,
  useRooms,
  useRoutines,
} from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import { useNow } from '@/lib/client/use-now'
import type { Element, Member, Room } from '@/lib/domain/house'
import type { HouseId, RoomId, UserId } from '@/lib/domain/ids'
import { ROOM_GROUPS, roomsInGroup } from '@/lib/domain/rooms'
import {
  MAX_ROUTINE_NAME,
  nextHolder,
  RESETS,
  routineHolder,
  rotationOrder,
  type Resets,
  type Routine,
  type RoutinePatch,
  type RoutineWho,
} from '@/lib/domain/routines'
import { localDateOf, type LocalDate } from '@/lib/domain/time'
import { ROOM_GROUP_LABEL } from './room-labels'

const RESETS_LABEL: Record<Resets, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}
const RESETS_OPTIONS = RESETS.map((value) => ({ value, label: RESETS_LABEL[value] }))

const THIS_PERIOD: Record<Resets, string> = {
  weekly: 'this week',
  biweekly: 'these two weeks',
  monthly: 'this month',
}

type WhoMode = 'turns' | 'fixed'
const WHO_OPTIONS = [
  { value: 'turns', label: 'Takes turns' },
  { value: 'fixed', label: 'Always one person' },
] as const satisfies readonly { value: WhoMode; label: string }[]

const PROBLEMS: Record<string, string> = {
  empty_name: 'Give it a name.',
  name_too_long: 'That name is a bit long. Try a shorter one.',
  unknown_member: "They've moved out. Pick someone else.",
  unknown_room: 'One of those rooms is gone. Check the list and try again.',
}

type Person = { readonly id: UserId; readonly name: string; readonly element?: Element }

/** What the section and its sheet both read: the house as of today. */
type Context = {
  readonly houseId: HouseId
  readonly today: LocalDate
  readonly members: readonly Member[]
  readonly people: readonly Person[]
  readonly rooms: readonly Room[]
  readonly routines: readonly Routine[]
}

/**
 * Admin → Routines (FRONTEND §5.11, T98), for every member: who looks after a set of rooms, when its
 * checklist starts fresh, and who has it now. The only screen that says "routine".
 */
export function RoutinesSection({ houseId }: { houseId: HouseId }) {
  const house = useHouse(houseId)
  const routines = useRoutines(houseId)
  const rooms = useRooms(houseId)
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const now = useNow()
  // A copy from when the sheet opened: saving it after someone else changed it is a conflict.
  const [sheet, setSheet] = useState<{ routine?: Routine } | null>(null)

  if (routines.isError || rooms.isError || house.isError) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (!house.data || !routines.data || !rooms.data || !members.data || !profiles.data) {
    return <p className="text-ink-soft">Loading…</p>
  }

  const today = localDateOf(now, house.data.settings.timezone)
  const nameOf = new Map(profiles.data.map((p) => [p.id as string, p.displayName]))
  const elementOf = new Map(rooms.data.map((r) => [r.id as string, r.element]))
  const person = (id: UserId): Person => {
    const roomId = members.data.find((m) => m.userId === id)?.roomId
    const element = roomId && elementOf.get(roomId)
    return { id, name: nameOf.get(id) ?? 'Former roommate', ...(element && { element }) }
  }
  const ctx: Context = {
    houseId,
    today,
    members: members.data,
    people: rotationOrder(members.data).map(person),
    rooms: rooms.data,
    routines: routines.data,
  }
  const add = <Button onClick={() => setSheet({})}>Add a routine</Button>

  return (
    <>
      {routines.data.length === 0 ? (
        <EmptyState icon={CalendarSync} action={add}>
          No routines yet. Group rooms someone looks after, and it rotates.
        </EmptyState>
      ) : (
        <div className="grid gap-2.5">
          <ListGroup label="Routines">
            {routines.data.map((r) => {
              const holder = routineHolder(r, members.data, today)
              const next = nextHolder(r, members.data, today)
              return (
                <ListRow
                  key={r.id}
                  leading={
                    <span className="grid size-[max(2.25rem,36px)] flex-none place-items-center rounded-full bg-neutral-fill text-neutral-ink">
                      <ChoreIcon name={r.icon} className="size-[max(1.125rem,18px)]" />
                    </span>
                  }
                  title={r.name}
                  subtitle={
                    <span className="flex items-center gap-1.5">
                      <span className="mr-0.5">{RESETS_LABEL[r.resets]}</span>
                      {holder && <PersonAvatar person={person(holder)} />}
                      {holder && next && next !== holder && (
                        <>
                          <ArrowRight aria-hidden className="size-3.5" />
                          <span className="sr-only">then</span>
                          <PersonAvatar person={person(next)} />
                        </>
                      )}
                    </span>
                  }
                  editable
                  onClick={() => setSheet({ routine: r })}
                />
              )
            })}
          </ListGroup>
          <Button variant="secondary" onClick={() => setSheet({})}>
            Add a routine
          </Button>
        </div>
      )}
      {sheet && <RoutineSheet ctx={ctx} routine={sheet.routine} onClose={() => setSheet(null)} />}
    </>
  )
}

const PersonAvatar = ({ person }: { person: Person }) => (
  <Avatar name={person.name} {...(person.element && { element: person.element })} size={20} />
)

function Label({ children }: { children: ReactNode }) {
  return <span className="text-[0.8rem] font-extrabold text-ink-soft">{children}</span>
}

/** Adds a routine, or edits one. Sends only what changed. */
function RoutineSheet({
  ctx,
  routine,
  onClose,
}: {
  ctx: Context
  routine: Routine | undefined
  onClose: () => void
}) {
  const { me } = useAppClient()
  const create = useCreateRoutine(ctx.houseId)
  const edit = useEditRoutine(ctx.houseId)
  const remove = useRemoveRoutine(ctx.houseId)
  const toast = useToast()

  const startPerson = routine
    ? routineHolder(routine, ctx.members, ctx.today)
    : (ctx.people.find((p) => p.id === me) ?? ctx.people[0])?.id
  const startRooms = ctx.rooms.filter((r) => routine && r.routineId === routine.id).map((r) => r.id)

  const [name, setName] = useState(routine?.name ?? '')
  const [picked, setIcon] = useState(routine?.icon ?? '')
  // Until one is picked, the icon the name suggests (T101), else sparkles.
  const icon = iconFor(picked, name) || 'sparkles'
  const [resets, setResets] = useState<Resets>(routine?.resets ?? 'weekly')
  const [mode, setMode] = useState<WhoMode>(routine?.fixedMember ? 'fixed' : 'turns')
  const [pickedPerson, setPickedPerson] = useState<UserId | undefined>(undefined)
  const [roomIds, setRoomIds] = useState<readonly RoomId[]>(startRooms)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const person = pickedPerson ?? startPerson
  const busy = create.isPending || edit.isPending || remove.isPending

  const toggleRoom = (id: RoomId) =>
    setRoomIds((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))

  const problem = (error: string) => toast(PROBLEMS[error] ?? "Couldn't save that. Try again.")

  const submit = async () => {
    if (!person) return
    const who: RoutineWho =
      mode === 'turns'
        ? { takesTurns: true, startsWith: person }
        : { takesTurns: false, fixedMember: person }

    if (!routine) {
      const r = await create.mutateAsync({ name, icon, resets, who, roomIds })
      if (!r.ok) return problem(r.error)
      toast('Added.')
      return onClose()
    }

    const whoChanged = (mode === 'fixed') !== !!routine.fixedMember || person !== startPerson
    const roomsChanged =
      roomIds.length !== startRooms.length || roomIds.some((id) => !startRooms.includes(id))
    const patch: RoutinePatch & { roomIds?: readonly RoomId[] } = {
      ...(name.trim() !== routine.name && { name }),
      ...(icon !== routine.icon && { icon }),
      ...(resets !== routine.resets && { resets }),
      ...(whoChanged && { who }),
      ...(roomsChanged && { roomIds }),
    }
    if (Object.keys(patch).length === 0) return onClose()
    const r = await edit.mutateAsync({
      id: routine.id,
      patch,
      ...(routine.version && { version: routine.version }),
    })
    if (r.ok) {
      toast('Saved.')
      return onClose()
    }
    if (r.error === 'no_change') return onClose()
    if (r.error === 'conflict' || r.error === 'removed') {
      toast(CHANGED_MEANWHILE)
      return onClose()
    }
    problem(r.error)
  }

  const doRemove = async () => {
    if (!routine) return
    const r = await remove.mutateAsync(routine.id)
    if (r.ok || r.error === 'removed') {
      toast('Removed.')
      return onClose()
    }
    toast("Couldn't remove it. Try again.")
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={routine ? routine.name : 'New routine'}
      {...(!routine && { description: 'Group rooms someone looks after.' })}
      actions={
        routine && !confirmRemove ? (
          <IconButton
            icon={Trash2}
            label="Remove this routine"
            onClick={() => setConfirmRemove(true)}
          />
        ) : undefined
      }
    >
      {confirmRemove ? (
        <RemoveConfirm
          busy={busy}
          onKeep={() => setConfirmRemove(false)}
          onRemove={() => void doRemove()}
        />
      ) : (
        <form
          id="routine-form"
          className="grid gap-3.5"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field
            id="routine-name"
            label="Name"
            value={name}
            maxLength={MAX_ROUTINE_NAME}
            placeholder="Upstairs"
            autoFocus={!routine}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <ChoreIconPicker label="Icon" title={name} value={icon} onChange={setIcon} />
          </div>
          <div className="grid gap-1.5">
            <Label>Resets</Label>
            <SegmentedControl
              label="Resets"
              options={RESETS_OPTIONS}
              value={resets}
              onChange={setResets}
              wide
            />
            <p className="m-0 text-[0.8rem] font-semibold text-ink-soft">
              {resets === 'monthly'
                ? 'The checklist starts fresh on the 1st.'
                : resets === 'weekly'
                  ? 'The checklist starts fresh every Monday.'
                  : 'The checklist starts fresh every other Monday.'}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Who</Label>
            <SegmentedControl
              label="Who"
              options={WHO_OPTIONS}
              value={mode}
              onChange={setMode}
              wide
            />
          </div>
          <PeoplePicker
            label={mode === 'turns' ? `Who has it ${THIS_PERIOD[resets]}` : 'Who looks after it'}
            note={
              mode === 'turns' ? 'Then everyone takes a turn, in the order they joined.' : undefined
            }
            people={ctx.people}
            value={person}
            onChange={setPickedPerson}
          />
          <RoomTicks ctx={ctx} routine={routine} value={roomIds} onToggle={toggleRoom} />
          <SheetSave
            label={routine ? 'Save' : 'Add'}
            form="routine-form"
            busy={busy}
            disabled={!name.trim() || !person}
          />
        </form>
      )}
    </Sheet>
  )
}

function PeoplePicker({
  label,
  note,
  people,
  value,
  onChange,
}: {
  label: string
  note: string | undefined
  people: readonly Person[]
  value: UserId | undefined
  onChange: (id: UserId) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {people.map((p) => {
          const on = p.id === value
          return (
            <button
              key={p.id}
              type="button"
              aria-label={p.name}
              aria-pressed={on}
              onClick={() => onChange(p.id)}
              className={cn(
                'flex min-h-[max(2.75rem,44px)] items-center gap-2 rounded-full py-1 pr-3.5 pl-1.5 font-bold',
                on ? 'bg-accent text-on-accent' : 'bg-neutral-fill text-neutral-ink',
              )}
            >
              <Avatar name={p.name} {...(p.element && { element: p.element })} />
              <span>{p.name}</span>
            </button>
          )
        })}
      </div>
      {note && <p className="m-0 text-[0.8rem] font-semibold text-ink-soft">{note}</p>}
    </div>
  )
}

/** Tick rooms, by group. A room in another routine says so, and that it moves when ticked. */
function RoomTicks({
  ctx,
  routine,
  value,
  onToggle,
}: {
  ctx: Context
  routine: Routine | undefined
  value: readonly RoomId[]
  onToggle: (id: RoomId) => void
}) {
  const routineName = (id: string) => ctx.routines.find((r) => r.id === id)?.name
  return (
    <>
      {ROOM_GROUPS.map((group) => {
        const here = roomsInGroup(ctx.rooms, group)
        if (here.length === 0) return null
        return (
          <fieldset key={group} className="m-0 grid border-0 p-0">
            <legend className="mb-1 text-[0.8rem] font-extrabold text-ink-soft">
              {ROOM_GROUP_LABEL[group]}
            </legend>
            {here.map((r) => {
              const ticked = value.includes(r.id)
              const other =
                r.routineId && r.routineId !== routine?.id ? routineName(r.routineId) : undefined
              return (
                <label
                  key={r.id}
                  className="flex min-h-[max(2.75rem,44px)] items-center gap-3 px-1 py-1"
                >
                  <input
                    type="checkbox"
                    className="size-5 flex-none accent-[var(--accent)]"
                    checked={ticked}
                    aria-labelledby={`routine-room-${r.id}`}
                    {...(other && { 'aria-describedby': `routine-room-${r.id}-note` })}
                    onChange={() => onToggle(r.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span id={`routine-room-${r.id}`} className="block font-bold">
                      {r.name}
                    </span>
                    {other && (
                      <span
                        id={`routine-room-${r.id}-note`}
                        className="block text-[0.8rem] font-semibold text-ink-soft"
                      >
                        {ticked ? `Moves here from ${other}` : `In ${other}`}
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </fieldset>
        )
      })}
    </>
  )
}

function RemoveConfirm({
  busy,
  onKeep,
  onRemove,
}: {
  busy: boolean
  onKeep: () => void
  onRemove: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  return (
    <div
      role="group"
      aria-label="Remove this routine?"
      className="grid gap-2 rounded-2xl bg-paper p-3.5"
    >
      <p className="m-0 font-semibold">
        Remove this routine? Its rooms&apos; chores move to the Upkeep section, with no owner.
        Nothing is deleted.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button ref={first} variant="secondary" disabled={busy} onClick={onKeep}>
          Keep it
        </Button>
        <Button disabled={busy} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Field, inputClass } from '@/components/auth/fields'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useMembers, useProfiles, useRenameRun, useSetRunner } from '@/lib/client/hooks'
import type { HouseId, UserId } from '@/lib/domain/ids'
import { isRunOpen, MAX_RUN_TITLE, runLabel, type Run } from '@/lib/domain/runs'

/** Whether the run's editor is open under the header line (the sheet's Pencil opens it). */
export type HeaderPanel = null | 'edit'

/**
 * The top of a run's sheet (FRONTEND §5.9): who's on a batch, or a request's or visit's point
 * person. While the run is going, anyone can rename it or hand it to another roommate (T56), both
 * from one editor behind the sheet's header Pencil (T111; two identical pencils before).
 */
export function RunHeader({
  houseId,
  run,
  panel,
  onPanel,
}: {
  houseId: HouseId
  run: Run
  panel: HeaderPanel
  onPanel: (p: HeaderPanel) => void
}) {
  const ctx = useCardContext(houseId)
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const rename = useRenameRun(houseId)
  const setRunner = useSetRunner(houseId)
  const toast = useToast()

  const open = isRunOpen(run)
  const batch = run.kind === 'batch'
  const nameOf = (id: string) => ctx.person(id)?.name
  const who = nameOf(run.runner) ?? 'Someone'
  const { title: _title, ...parts } = run
  const usual = runLabel(parts, { person: nameOf, contact: (id) => ctx.contacts.get(id)?.name })
  const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
  const people = (members.data ?? []).filter((m) => m.status.active)
  const busy = rename.isPending || setRunner.isPending

  /** Saves what changed: the name (null goes back to the usual one), the runner, or both. */
  const save = async (title: string | null, runner: string) => {
    const renamed = (title?.trim() || undefined) !== (run.title || undefined)
    const handed = runner !== run.runner
    if (renamed) {
      const r = await rename.mutateAsync({ runId: run.id, title: title })
      if (!r.ok && r.error !== 'no_change') return toast("Couldn't rename it. Try again.")
    }
    if (handed) {
      const r = await setRunner.mutateAsync({ runId: run.id, runner: runner as UserId })
      if (!r.ok && r.error !== 'no_change') return toast("Couldn't change that. Try again.")
    }
    const name = names.get(runner) ?? 'They'
    if (handed) toast(batch ? `${name}'s on it now.` : `${name} is the point person now.`)
    else if (renamed) toast(title?.trim() ? 'Renamed.' : `Back to “${usual}”.`)
    onPanel(null)
  }

  return (
    <div className="grid gap-2">
      <p className="m-0 font-bold">{batch ? `${who}'s on it` : `Point person: ${who}`}</p>

      {open && panel === 'edit' && (
        <EditRun
          title={run.title}
          usual={usual}
          runner={run.runner}
          runnerLabel={batch ? "Who's on it?" : 'Point person'}
          people={people.map((m) => ({ id: m.userId, name: names.get(m.userId) ?? 'Someone' }))}
          busy={busy}
          onSave={save}
          onCancel={() => onPanel(null)}
        />
      )}
    </div>
  )
}

/** The run's name and who's on it, starting from what they are now (mounted fresh each time). */
function EditRun({
  title: current,
  usual,
  runner: currentRunner,
  runnerLabel,
  people,
  busy,
  onSave,
  onCancel,
}: {
  title: string | undefined
  usual: string
  runner: string
  runnerLabel: string
  people: { id: string; name: string }[]
  busy: boolean
  onSave: (title: string | null, runner: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(current ?? '')
  const [runner, setRunner] = useState(currentRunner)
  return (
    <form
      className="grid gap-2.5 rounded-2xl bg-paper p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(title, runner)
      }}
    >
      <Field
        id="run-rename"
        label="Name"
        placeholder={usual}
        maxLength={MAX_RUN_TITLE}
        enterKeyHint="done"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {current && (
        <button
          type="button"
          className="min-h-[44px] justify-self-start text-sm font-bold text-accent-ink"
          disabled={busy}
          onClick={() => onSave(null, runner)}
        >
          Use “{usual}”
        </button>
      )}
      <div className="grid gap-1.5">
        <label htmlFor="run-runner" className="text-[0.8rem] font-extrabold text-ink-soft">
          {runnerLabel}
        </label>
        <select
          id="run-runner"
          className={inputClass}
          value={runner}
          onChange={(e) => setRunner(e.target.value)}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy}>
          Save
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

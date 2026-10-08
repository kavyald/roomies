'use client'

import { useState } from 'react'
import { Field, inputClass } from '@/components/auth/fields'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useMembers, useProfiles, useRenameRun, useSetRunner } from '@/lib/client/hooks'
import type { HouseId, UserId } from '@/lib/domain/ids'
import { isRunOpen, MAX_RUN_TITLE, runLabel, type Run } from '@/lib/domain/runs'

const linkClass = 'min-h-11 text-sm font-extrabold text-accent-ink'

/**
 * The top of a run's sheet (FRONTEND §5.9): who's on a batch, or a request's or visit's point
 * person. While the run is going, anyone can hand it to another roommate or rename it (T56).
 */
export function RunHeader({ houseId, run }: { houseId: HouseId; run: Run }) {
  const ctx = useCardContext(houseId)
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const rename = useRenameRun(houseId)
  const setRunner = useSetRunner(houseId)
  const toast = useToast()
  const [panel, setPanel] = useState<null | 'rename' | 'runner'>(null)
  const [title, setTitle] = useState(run.title ?? '')
  const [runner, setRunnerId] = useState<string>(run.runner)

  const open = isRunOpen(run)
  const batch = run.kind === 'batch'
  const nameOf = (id: string) => ctx.person(id)?.name
  const who = nameOf(run.runner) ?? 'Someone'
  const { title: _title, ...parts } = run
  const usual = runLabel(parts, { person: nameOf, contact: (id) => ctx.contacts.get(id)?.name })
  const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
  const people = (members.data ?? []).filter((m) => m.status.active)
  const busy = rename.isPending || setRunner.isPending

  const toggle = (p: 'rename' | 'runner') => {
    setTitle(run.title ?? '')
    setRunnerId(run.runner)
    setPanel(panel === p ? null : p)
  }

  const saveTitle = async (next: string | null) => {
    const r = await rename.mutateAsync({ runId: run.id, title: next })
    if (!r.ok && r.error !== 'no_change') return toast("Couldn't rename it. Try again.")
    if (r.ok) toast(next?.trim() ? 'Renamed.' : `Back to “${usual}”.`)
    setPanel(null)
  }

  const saveRunner = async () => {
    const r = await setRunner.mutateAsync({ runId: run.id, runner: runner as UserId })
    if (!r.ok && r.error !== 'no_change') return toast("Couldn't change that. Try again.")
    const name = names.get(runner) ?? 'They'
    if (r.ok) toast(batch ? `${name}'s on it now.` : `${name} is the point person now.`)
    setPanel(null)
  }

  return (
    <div className="grid gap-2">
      <p className="m-0 flex flex-wrap items-center gap-x-3 font-bold">
        <span>{batch ? `${who}'s on it` : `Point person: ${who}`}</span>
        {open && (
          <>
            <button
              type="button"
              className={linkClass}
              aria-label={batch ? "Change who's on it" : 'Change the point person'}
              aria-expanded={panel === 'runner'}
              onClick={() => toggle('runner')}
            >
              Change
            </button>
            <button
              type="button"
              className={linkClass}
              aria-label="Rename this run"
              aria-expanded={panel === 'rename'}
              onClick={() => toggle('rename')}
            >
              Rename
            </button>
          </>
        )}
      </p>

      {open && panel === 'runner' && (
        <div className="grid gap-2 rounded-2xl bg-paper p-3">
          <label htmlFor="run-runner" className="text-[0.8rem] font-extrabold text-ink-soft">
            {batch ? "Who's on it?" : 'Point person'}
          </label>
          <select
            id="run-runner"
            className={inputClass}
            value={runner}
            onChange={(e) => setRunnerId(e.target.value)}
          >
            {people.map((m) => (
              <option key={m.userId} value={m.userId}>
                {names.get(m.userId) ?? 'Someone'}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy || runner === run.runner}
              onClick={saveRunner}
            >
              Save
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {open && panel === 'rename' && (
        <form
          className="grid gap-2 rounded-2xl bg-paper p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void saveTitle(title)
          }}
        >
          <Field
            id="run-rename"
            label="Name"
            placeholder={usual}
            maxLength={MAX_RUN_TITLE}
            enterKeyHint="done"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="flex-1" disabled={busy}>
              Save
            </Button>
            {run.title && (
              <Button variant="secondary" disabled={busy} onClick={() => saveTitle(null)}>
                Use “{usual}”
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

'use client'

import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Field, inputClass } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useCreatePoll, useHouse } from '@/lib/client/hooks'
import type { HouseId, ItemId, PollId } from '@/lib/domain/ids'
import { instantAt, toIso, type LocalDate, type LocalTime } from '@/lib/domain/time'

const PROBLEM: Record<string, string> = {
  empty_question: 'Ask a question.',
  question_too_long: 'That question is a bit long.',
  needs_two_options: 'Give it at least two options.',
  duplicate_label: 'Two options have the same name.',
  label_too_long: 'One of the options is a bit long.',
}

/** A new poll: a question and two or more options, optionally about an item, with a deadline. */
export function NewPollSheet({
  houseId,
  about,
  onClose,
  onCreated,
}: {
  houseId: HouseId
  about?: { id: ItemId; title: string }
  onClose: () => void
  onCreated: (id: PollId) => void
}) {
  const create = useCreatePoll(houseId)
  const house = useHouse(houseId)
  const toast = useToast()
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<{ label: string; note: string }[]>([
    { label: '', note: '' },
    { label: '', note: '' },
  ])
  const [deadline, setDeadline] = useState('')
  const set = (i: number, patch: Partial<{ label: string; note: string }>) =>
    setOptions((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : o)))

  const submit = async () => {
    const tz = house.data?.settings.timezone ?? 'UTC'
    // A deadline closes it at the end of that day, in the house's time zone.
    const closesAt = deadline
      ? toIso(instantAt(deadline as LocalDate, '23:59' as LocalTime, tz))
      : undefined
    const r = await create.mutateAsync({
      question,
      ...(about && { itemId: about.id }),
      options: options
        .filter((o) => o.label.trim())
        .map((o) => ({ label: o.label, ...(o.note.trim() && { note: o.note }) })),
      ...(closesAt && { closesAt }),
    })
    if (!r.ok) return toast(PROBLEM[r.error] ?? "Couldn't start the poll. Try again.")
    toast('Poll started.')
    onCreated(r.value.id)
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={about ? 'Poll about this' : 'A poll'}
      description={about ? `About: ${about.title}` : undefined}
    >
      <Field
        id="poll-question"
        label="Question"
        placeholder={about ? `Which ${about.title.toLowerCase()}?` : 'House name?'}
        maxLength={200}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <fieldset className="m-0 grid gap-2.5 border-0 p-0">
        <legend className="mb-1 text-[0.8rem] font-extrabold text-ink-soft">Options</legend>
        {options.map((o, i) => (
          <div key={i} className="grid gap-1.5 rounded-2xl bg-paper p-2.5">
            <div className="flex items-center gap-2">
              <label htmlFor={`poll-option-${i}`} className="sr-only">
                Option {i + 1}
              </label>
              <input
                id={`poll-option-${i}`}
                className={inputClass}
                placeholder={`Option ${i + 1}`}
                maxLength={80}
                value={o.label}
                onChange={(e) => set(i, { label: e.target.value })}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  aria-label={`Remove option ${i + 1}`}
                  className="grid size-11 flex-none place-items-center rounded-full text-ink-soft"
                  onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>
            <label htmlFor={`poll-note-${i}`} className="sr-only">
              Note for option {i + 1}
            </label>
            <input
              id={`poll-note-${i}`}
              className={`${inputClass} py-2 text-sm`}
              placeholder="A link or a price (optional)"
              maxLength={280}
              value={o.note}
              onChange={(e) => set(i, { note: e.target.value })}
            />
          </div>
        ))}
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 justify-self-start font-bold text-accent-ink"
          onClick={() => setOptions((os) => [...os, { label: '', note: '' }])}
        >
          <Plus aria-hidden className="size-4" /> Another option
        </button>
      </fieldset>
      <Field
        id="poll-deadline"
        label="Closes (optional)"
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      />
      <Button block disabled={create.isPending || !question.trim()} onClick={submit}>
        Start poll
      </Button>
    </Sheet>
  )
}

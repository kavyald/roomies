'use client'

import { MessageSquareHeart } from 'lucide-react'
import { useState } from 'react'
import { inputClass } from '@/components/auth/fields'
import { IconButton } from '@/components/ui/IconButton'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Sheet, SheetSave } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useSendFeedback } from '@/lib/client/hooks'
import { MAX_FEEDBACK, type FeedbackKind } from '@/lib/domain/feedback'
import type { HouseId } from '@/lib/domain/ids'

const KINDS = [
  { value: 'bug', label: 'Bug 🐞' },
  { value: 'idea', label: 'Idea 💡' },
  { value: 'praise', label: 'Praise 💛' },
] as const satisfies readonly { value: FeedbackKind; label: string }[]

const PLACEHOLDER: Record<FeedbackKind, string> = {
  bug: 'What went wrong?',
  idea: 'What would make this better?',
  praise: 'What’s working for you?',
}

/** Admin's top-right icon (T91): opens the sheet that sends the owner a bug, an idea or praise. */
export function FeedbackButton({ houseId }: { houseId: HouseId }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton icon={MessageSquareHeart} label="Send feedback" onClick={() => setOpen(true)} />
      {open && <FeedbackSheet houseId={houseId} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Pick a kind, write it, send. The server adds the app version and the browser. */
export function FeedbackSheet({ houseId, onClose }: { houseId: HouseId; onClose: () => void }) {
  const send = useSendFeedback(houseId)
  const toast = useToast()
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [message, setMessage] = useState('')

  const submit = async () => {
    const r = await send.mutateAsync({ kind, message })
    if (!r.ok) return toast("Couldn't send that. Try again.")
    toast('Thanks for telling us!')
    onClose()
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Feedback"
      description="Found a bug, have an idea, or like something? Tell the people who make Roomies."
    >
      <SegmentedControl
        label="Kind of feedback"
        options={KINDS}
        value={kind}
        onChange={setKind}
        wide
      />
      <div className="grid gap-1.5">
        <label htmlFor="feedback-message" className="text-[0.8rem] font-extrabold text-ink-soft">
          Message
        </label>
        <textarea
          id="feedback-message"
          rows={5}
          maxLength={MAX_FEEDBACK}
          className={`${inputClass} resize-none`}
          placeholder={PLACEHOLDER[kind]}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <SheetSave label="Send" busy={send.isPending} disabled={!message.trim()} onSave={submit} />
    </Sheet>
  )
}

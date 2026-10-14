import { ListChecks } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'

/**
 * Select all / Clear as one icon toggle (T68): pressed (accent) while everything is checked, and
 * tapping it then clears them. VoiceOver hears "Select all, toggle button, selected".
 */
export function SelectAll({ all, onToggle }: { all: boolean; onToggle: () => void }) {
  return (
    <IconButton
      icon={ListChecks}
      label="Select all"
      aria-pressed={all}
      tone={all ? 'accent' : 'neutral'}
      onClick={onToggle}
    />
  )
}

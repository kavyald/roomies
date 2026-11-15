'use client'

import { CalendarDays, Clock, type LucideIcon } from 'lucide-react'
import { useRef, type InputHTMLAttributes } from 'react'
import { inputClass } from '@/components/auth/fields'
import { IconButton } from './IconButton'
import { cn } from './cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id' | 'className'> & {
  id: string
  label: string
  /** On the wrapper (label + field), e.g. a width. */
  className?: string
}

/**
 * Opens the browser's own picker for a date or time field. showPicker needs the tap that called
 * it and isn't there for every type everywhere (older Safari has no time picker), so it falls back
 * to focusing the field, where the date or time can be typed.
 */
export const openPicker = (input: HTMLInputElement | null): void => {
  if (!input || input.disabled) return
  input.focus()
  try {
    input.showPicker?.()
  } catch {
    // Focused is the fallback: type it in.
  }
}

function PickerField({
  kind,
  icon,
  verb,
  id,
  label,
  className,
  disabled,
  ...rest
}: Props & { kind: 'date' | 'time'; icon: LucideIcon; verb: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label id={`${id}-label`} htmlFor={id} className="text-[0.8rem] font-extrabold text-ink-soft">
        {label}
      </label>
      <div className="relative">
        {/* iPhone keeps its own wheel picker on a tap (T69); the icon is for a mouse. Chrome's
            built-in indicator is hidden there so there's one icon, and the field stays typeable. */}
        <input
          ref={ref}
          id={id}
          type={kind}
          disabled={disabled}
          className={cn(
            inputClass,
            'pointer-fine:pr-12 pointer-fine:[&::-webkit-calendar-picker-indicator]:hidden',
          )}
          {...rest}
        />
        <span className="absolute inset-y-0 right-0.5 hidden items-center pointer-fine:flex">
          <IconButton
            icon={icon}
            label={verb}
            aria-describedby={`${id}-label`}
            disabled={disabled}
            onClick={() => openPicker(ref.current)}
          />
        </span>
      </div>
    </div>
  )
}

/** A labelled date field (FRONTEND §9): with a mouse, its calendar icon opens the picker. */
export const DateField = (p: Props) => (
  <PickerField kind="date" icon={CalendarDays} verb="Open calendar" {...p} />
)

/** A labelled time field (FRONTEND §9): with a mouse, its clock icon opens the picker. */
export const TimeField = (p: Props) => (
  <PickerField kind="time" icon={Clock} verb="Open clock" {...p} />
)

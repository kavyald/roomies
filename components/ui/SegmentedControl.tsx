import { cn } from './cn'

type Option<V extends string> = { value: V; label: string }

/** "Mine | All" style toggle. Each option is a pressed/unpressed button. */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  wide,
  compact,
}: {
  label: string
  options: readonly Option<V>[]
  value: V
  onChange: (v: V) => void
  wide?: boolean
  /** Tighter padding, for five or more options on a phone. */
  compact?: boolean
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'rounded-full bg-neutral-fill p-[3px]',
        wide ? 'flex w-full' : 'inline-flex justify-self-start',
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-8 rounded-full py-1 text-[0.8rem] font-bold whitespace-nowrap text-neutral-ink',
            compact ? 'px-3' : 'px-3.5',
            wide && 'flex-1',
            o.value === value &&
              'bg-card text-ink shadow-[0_1px_0_var(--line),0_0_0_1px_color-mix(in_srgb,var(--ink)_12%,transparent)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

import { err, ok, type Result } from './result'

/** Money is always integer cents. */
export type Cents = number & { readonly __cents: true }

export const cents = (n: number): Result<Cents, 'not_integer'> =>
  Number.isSafeInteger(n) ? ok(n as Cents) : err('not_integer')

/** Parses what a person types: "42.5", "$42.50", "1,200". At most two decimals. */
export const parseCents = (input: string): Result<Cents, 'invalid'> => {
  const s = input.trim().replace(/^\$/, '').replace(/,/g, '')
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return err('invalid')
  const whole = Number(m[1])
  const frac = Number((m[2] ?? '').padEnd(2, '0'))
  const total = whole * 100 + frac
  return Number.isSafeInteger(total) ? ok(total as Cents) : err('invalid')
}

/** "$42.50", "-$3.05". Plain numbers per FRONTEND §7. */
export const formatCents = (c: Cents): string => {
  const sign = c < 0 ? '-' : ''
  const abs = Math.abs(c)
  const dollars = Math.floor(abs / 100).toLocaleString('en-US')
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`
}

export const sumCents = (xs: readonly Cents[]): Cents => xs.reduce((a, b) => a + b, 0) as Cents

/**
 * Splits `total` into `n` shares that differ by at most one cent and add back up to `total`.
 * The first shares get the extra cents.
 */
export const splitEqually = (total: Cents, n: number): Cents[] => {
  if (!Number.isInteger(n) || n <= 0) return []
  const base = Math.trunc(total / n)
  const rest = total - base * n
  const step = Math.sign(rest)
  return Array.from({ length: n }, (_, i) => (base + (i < Math.abs(rest) ? step : 0)) as Cents)
}

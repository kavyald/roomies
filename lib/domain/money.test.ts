import { describe, expect, it } from 'vitest'
import { cents, formatCents, parseCents, splitEqually, sumCents, type Cents } from './money'

const c = (n: number) => n as Cents

describe('money', () => {
  it('accepts only integer cents', () => {
    expect(cents(4250)).toEqual({ ok: true, value: 4250 })
    expect(cents(42.5)).toEqual({ ok: false, error: 'not_integer' })
  })

  it.each([
    ['42.50', 4250],
    ['$42.5', 4250],
    ['42', 4200],
    ['1,200.05', 120005],
    ['  0.07 ', 7],
  ])('parses %s', (input, expected) => {
    expect(parseCents(input)).toEqual({ ok: true, value: expected })
  })

  it.each(['', '4.255', 'abc', '-3', '$'])('rejects %j', (input) => {
    expect(parseCents(input).ok).toBe(false)
  })

  it('formats as plain dollars', () => {
    expect(formatCents(c(4250))).toBe('$42.50')
    expect(formatCents(c(5))).toBe('$0.05')
    expect(formatCents(c(18900000))).toBe('$189,000.00')
    expect(formatCents(c(-305))).toBe('-$3.05')
  })

  it('splits so shares add back up to the total', () => {
    expect(splitEqually(c(1000), 4)).toEqual([250, 250, 250, 250])
    expect(splitEqually(c(1001), 4)).toEqual([251, 250, 250, 250])
    expect(splitEqually(c(1003), 4)).toEqual([251, 251, 251, 250])
    expect(splitEqually(c(-1001), 4)).toEqual([-251, -250, -250, -250])
    expect(splitEqually(c(100), 0)).toEqual([])
    for (const [total, n] of [
      [4250, 3],
      [1, 7],
      [99999, 8],
    ] as const) {
      expect(sumCents(splitEqually(c(total), n))).toBe(total)
    }
  })
})

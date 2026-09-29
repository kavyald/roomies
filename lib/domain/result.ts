// Expected failures are values, not exceptions (ARCHITECTURE §4.1 rule 1).

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E extends string> = { readonly ok: false; readonly error: E }
export type Result<T, E extends string> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E extends string>(error: E): Err<E> => ({ ok: false, error })

export const mapResult = <T, U, E extends string>(r: Result<T, E>, f: (t: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r

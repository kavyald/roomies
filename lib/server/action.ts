// The shape of every server action (ARCHITECTURE §4.1 rule 4): parse input with Zod, find who's
// acting, build deps, call one use case, and hand back its Result. Anything unexpected becomes a
// plain 'unexpected' so no stack trace or SQL error reaches the browser.

import type { z } from 'zod'
import { AccessDenied, type AppDeps } from '../app/ports'
import type { CommandResult } from '../client/app-client'
import type { HouseActor } from '../domain/actor'
import { err, type Result } from '../domain/result'

export type ActionEnv = {
  /** The signed-in member acting in this house, or null. */
  currentActor(): Promise<HouseActor | null>
  deps(actor: HouseActor): AppDeps
  log?(e: unknown): void
  /** Runs after a successful change (e.g. sending the notifications it enqueued). */
  afterSuccess?(): void
}

export const makeAction =
  <S extends z.ZodType, T, E extends string>(
    schema: S,
    run: (deps: AppDeps, actor: HouseActor, input: z.infer<S>) => Promise<Result<T, E>>,
    env: ActionEnv,
  ) =>
  async (raw: unknown): Promise<CommandResult<T, E>> => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return err('invalid_input')
    try {
      const actor = await env.currentActor()
      if (!actor) return err('not_signed_in')
      const result = await run(env.deps(actor), actor, parsed.data)
      if (result.ok) env.afterSuccess?.()
      return result
    } catch (e) {
      if (e instanceof AccessDenied) return err('not_allowed')
      ;(env.log ?? console.error)(e)
      return err('unexpected')
    }
  }

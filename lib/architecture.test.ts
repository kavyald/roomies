// Guards the guardrails: runs ESLint on small virtual files in each layer, so a config change
// that stops catching a boundary violation fails the suite.

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint({ cwd: process.cwd() })

const problems = async (filePath: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath })
  return (result?.messages ?? []).map((m) => m.ruleId)
}

describe('architecture guardrails', { timeout: 60_000 }, () => {
  it('stops lib/domain importing Supabase', async () => {
    expect(
      await problems(
        'lib/domain/zz.ts',
        "import { createClient } from '@supabase/supabase-js'\nexport const x = createClient\n",
      ),
    ).toContain('no-restricted-imports')
  })

  it('stops lib/domain importing any package or an adapter', async () => {
    const found = await problems(
      'lib/domain/zz.ts',
      "import { z } from 'zod'\nimport { systemClock } from '../adapters/clock'\nexport const x = [z, systemClock]\n",
    )
    expect(found).toEqual(['no-restricted-imports', 'boundaries/dependencies'])
  })

  it('stops use cases importing adapters or the composition root', async () => {
    const found = await problems(
      'lib/app/zz.ts',
      "import { systemClock } from '../adapters/clock'\nimport { depsForTest } from '../compose'\nexport const x = [systemClock, depsForTest]\n",
    )
    expect(found).toEqual(['boundaries/dependencies', 'no-restricted-imports'])
  })

  it('stops UI code using Kysely, adapters, or the environment', async () => {
    const found = await problems(
      'components/zz.tsx',
      "import { Kysely } from 'kysely'\nimport { systemClock } from '@/lib/adapters/clock'\nexport const x = [Kysely, systemClock, process.env.X]\n",
    )
    expect(found).toEqual([
      'no-restricted-imports',
      'boundaries/dependencies',
      'no-restricted-properties',
    ])
  })

  it('stops domain code reading the clock', async () => {
    expect(await problems('lib/domain/zz.ts', 'export const now = () => Date.now()\n')).toEqual([
      'no-restricted-syntax',
    ])
  })

  it('lets adapters use Kysely and the domain', async () => {
    expect(
      await problems(
        'lib/adapters/zz.ts',
        "import { Kysely } from 'kysely'\nimport { ok } from '../domain/result'\nexport const x = [Kysely, ok]\n",
      ),
    ).toEqual([])
  })
})

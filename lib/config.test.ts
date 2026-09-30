import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, loadPublicConfig } from './config'

const good = {
  DATABASE_URL: 'postgresql://app_server:pw@127.0.0.1:54322/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SETUP_TOKEN: 'x'.repeat(32),
  CRON_SECRET: 'c'.repeat(32),
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
}

const messageFor = (env: Record<string, string | undefined>) => {
  try {
    loadConfig(env)
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError)
    return (e as Error).message
  }
  throw new Error('expected loadConfig to throw')
}

describe('loadConfig', () => {
  it('returns typed values', () => {
    const c = loadConfig(good)
    expect(c.databaseUrl).toBe(good.DATABASE_URL)
    expect(c.setupToken).toHaveLength(32)
    expect(c.cronSecret).toBe('c'.repeat(32))
    expect(c.public).toEqual({ supabaseUrl: good.SUPABASE_URL, supabaseAnonKey: 'anon-key' })
  })

  it('names every missing variable', () => {
    const msg = messageFor({ ...good, DATABASE_URL: undefined, SETUP_TOKEN: '' })
    expect(msg).toContain('DATABASE_URL: missing')
    expect(msg).toContain('SETUP_TOKEN: missing')
    expect(msg).toContain('.env.example')
  })

  it('explains invalid values', () => {
    expect(messageFor({ ...good, CRON_SECRET: undefined })).toContain('CRON_SECRET: missing')
    expect(messageFor({ ...good, SETUP_TOKEN: 'short' })).toContain(
      'SETUP_TOKEN: must be at least 32 characters',
    )
    expect(messageFor({ ...good, DATABASE_URL: 'http://nope' })).toMatch(
      /DATABASE_URL: (?!missing)/,
    )
  })

  it('checks the public values on their own', () => {
    expect(() => loadPublicConfig({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL: missing/)
  })
})

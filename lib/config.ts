// The only reader of process.env (ARCHITECTURE §4.1). Everything else receives typed config.

import { z } from 'zod'

const url = z.url({ protocol: /^https?$/ })

const serverSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SETUP_TOKEN: z.string().min(32, 'must be at least 32 characters'),
})

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

/** Values only the server may see. */
export type ServerConfig = {
  readonly databaseUrl: string
  readonly supabaseUrl: string
  readonly supabaseServiceRoleKey: string
  readonly setupToken: string
}

/** Values that are safe to ship to the browser. */
export type PublicConfig = {
  readonly supabaseUrl: string
  readonly supabaseAnonKey: string
}

export type EnvConfig = ServerConfig & { readonly public: PublicConfig }

export class ConfigError extends Error {
  override name = 'ConfigError'
}

type Env = Record<string, string | undefined>

const parse = <S extends z.ZodType>(schema: S, env: Env): z.infer<S> => {
  const r = schema.safeParse(env)
  if (r.success) return r.data
  const lines = r.error.issues.map((i) => {
    const key = String(i.path[0])
    return `  - ${key}: ${env[key] === undefined || env[key] === '' ? 'missing' : i.message}`
  })
  throw new ConfigError(
    `Roomies can't start: some environment variables are missing or invalid.\n${lines.join('\n')}\n` +
      'Copy .env.example to .env.local and fill them in (see README).',
  )
}

// Empty strings count as missing, the way people leave blanks in .env files.
const clean = (env: Env): Env =>
  Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''))

export const loadPublicConfig = (env: Env): PublicConfig => {
  const p = parse(publicSchema, clean(env))
  return {
    supabaseUrl: p.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: p.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}

export const loadConfig = (env: Env): EnvConfig => {
  const e = clean(env)
  const s = parse(serverSchema.extend(publicSchema.shape), e)
  return {
    databaseUrl: s.DATABASE_URL,
    supabaseUrl: s.SUPABASE_URL,
    supabaseServiceRoleKey: s.SUPABASE_SERVICE_ROLE_KEY,
    setupToken: s.SETUP_TOKEN,
    public: loadPublicConfig(e),
  }
}

let cached: EnvConfig | undefined

/** Server config from process.env, validated once. */
export const serverConfig = (): EnvConfig => (cached ??= loadConfig(process.env))

/**
 * Browser config. Next inlines NEXT_PUBLIC_ values at build time only when they're written out
 * literally, so they're listed by name here.
 */
export const publicConfig = (): PublicConfig =>
  loadPublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })

/** Called from instrumentation.ts so a bad environment stops the server at startup. */
export const checkConfigAtStartup = (): void => {
  if (process.env.NEXT_RUNTIME === 'nodejs') serverConfig()
}

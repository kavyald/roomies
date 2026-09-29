// The browser's composition root: the AppClient the UI uses, built from the Supabase browser
// client (the user's session, so RLS applies) and the server actions for writes.

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseHouseQueries } from './adapters/supabase/house-queries'
import type { ChangeFeed } from './app/ports'
import type { AppClient, AppCommands } from './client/app-client'
import { publicConfig } from './config'

let browserClient: SupabaseClient | undefined

const supabase = (): SupabaseClient => {
  const { supabaseUrl, supabaseAnonKey } = publicConfig()
  return (browserClient ??= createBrowserClient(supabaseUrl, supabaseAnonKey))
}

/** Realtime arrives in T26; until then nothing pushes changes. */
const noChanges: ChangeFeed = { subscribe: () => () => {} }

export const browserAppClient = (commands: AppCommands): AppClient => ({
  queries: supabaseHouseQueries(supabase()),
  changes: noChanges,
  commands,
})

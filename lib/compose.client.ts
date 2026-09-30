// The browser's composition root: the AppClient the UI uses, built from the Supabase browser
// client (the user's session, so RLS applies) and the server actions for writes.

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseHouseQueries } from './adapters/supabase/house-queries'
import { supabaseChangeFeed } from './adapters/supabase/change-feed'
import type { AppClient, AppCommands } from './client/app-client'
import { publicConfig } from './config'
import type { UserId } from './domain/ids'

let browserClient: SupabaseClient | undefined

const supabase = (): SupabaseClient => {
  const { supabaseUrl, supabaseAnonKey } = publicConfig()
  return (browserClient ??= createBrowserClient(supabaseUrl, supabaseAnonKey))
}

export const browserAppClient = (me: UserId, commands: AppCommands): AppClient => ({
  me,
  queries: supabaseHouseQueries(supabase()),
  changes: supabaseChangeFeed(supabase()),
  commands,
})

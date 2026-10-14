-- Scheduled jobs (T32, ARCHITECTURE §7.3): pg_cron calls the app's /api/cron/<job> routes through
-- pg_net, with a shared secret header. The app URL and the secret live in Supabase Vault (never in
-- this repo): locally `pnpm cron:local` writes them; hosted, they're set once in the dashboard (E3).
-- Until both are set, the schedule runs and does nothing.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'roomies-tick',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := s.url || '/api/cron/tick',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', s.secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'roomies_app_url') as url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'roomies_cron_secret') as secret
  ) s
  where s.url is not null and s.secret is not null
  $job$
);

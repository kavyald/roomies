-- Reminder jobs (T35, ARCHITECTURE §7.3): reminders carry a dedupe key (person + thing + day), so a
-- job that runs twice enqueues nothing new; polls past their deadline are closed hourly.

alter table public.notifications_outbox add column dedupe_key text null;
create unique index notifications_outbox_dedupe_idx on public.notifications_outbox (dedupe_key)
  where dedupe_key is not null;

select cron.schedule(
  'roomies-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := s.url || '/api/cron/reminders',
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

select cron.schedule(
  'roomies-close-polls',
  '5 * * * *',
  $job$
  select net.http_post(
    url := s.url || '/api/cron/close-polls',
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

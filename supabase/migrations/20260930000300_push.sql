-- Web Push (T34, ARCHITECTURE §6.1): one row per browser that turned notifications on. A push
-- service saying a subscription is gone (404/410) marks it gone; nothing is deleted. Sending is a
-- job (service role), every 5 minutes and right after a change that enqueued something.

create table public.push_subscriptions (
  id          uuid primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint like 'https://%'),
  p256dh      text not null,
  auth        text not null,
  user_agent  text null check (user_agent is null or length(user_agent) <= 400),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz null,
  gone_at     timestamptz null
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where gone_at is null;

-- Your own browsers only (the sender runs as the service role).
alter table public.push_subscriptions enable row level security;
create policy "push subscriptions read own" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push subscriptions insert own" on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "push subscriptions update own" on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;
revoke delete, truncate on public.push_subscriptions from authenticated;

select cron.schedule(
  'roomies-send-notifications',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := s.url || '/api/cron/send-notifications',
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

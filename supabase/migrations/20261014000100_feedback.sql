-- Feedback (T91, PRD §6.8): a member sends the owner a bug, an idea or praise from Admin. The
-- server stamps the app version and the browser's user agent. The owner reads the rows in the
-- Supabase dashboard; members write their own and read none (it isn't house history, A34).

create table public.feedback (
  id           uuid primary key,
  house_id     uuid not null references public.houses (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  kind         text not null check (kind in ('bug', 'idea', 'praise')),
  message      text not null check (length(btrim(message)) between 1 and 2000),
  app_version  text not null check (length(app_version) between 1 and 64),
  user_agent   text null check (user_agent is null or length(user_agent) <= 400),
  created_at   timestamptz not null default now()
);

create index feedback_created_idx on public.feedback (created_at);

-- "feedback insert own": an active member, in their own name, for their own house. No SELECT
-- policy, so members read nothing back.
alter table public.feedback enable row level security;
create policy "feedback insert own" on public.feedback for insert to authenticated
  with check (private.is_member(house_id) and user_id = (select auth.uid()));

-- Explicit grants (T76, A30): the default privileges would give members SELECT and the jobs ALL.
-- Members only insert, through the server's app_writer; the owner reads (and clears) as
-- service_role in the dashboard.
revoke all on public.feedback from anon, authenticated, service_role;
grant insert on public.feedback to app_writer;
grant select, delete on public.feedback to service_role;

-- Notification settings (T33, PRD §11): a row per category someone has changed (no row = on).
-- Whoever records an event enqueues messages for the others (the transactional outbox), so
-- housemates can read each other's toggles; only you change yours.

create table public.notification_prefs (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  category   text not null check (category in ('assigned', 'due', 'feelings', 'polls', 'runs', 'people')),
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create trigger notification_prefs_touch_updated_at before update on public.notification_prefs
  for each row execute function public.touch_updated_at();

alter table public.notification_prefs enable row level security;
create policy "notification prefs read" on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_house(user_id));
create policy "notification prefs insert own" on public.notification_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "notification prefs update own" on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.notification_prefs from anon;
revoke delete, truncate on public.notification_prefs from authenticated;

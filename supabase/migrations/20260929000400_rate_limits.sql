-- Per-key request counters for rate limits (ARCHITECTURE §5.4): invite start/accept and setup,
-- per IP. Fixed windows; old windows can be pruned by a job later. Server-only: RLS is on with no
-- policies, and only service_role (the server's system role) has privileges.
create table public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

-- Refused join and setup attempts (ARCHITECTURE §5.4): unknown, expired, revoked or used-up invite
-- tokens, wrong setup tokens, and rate-limited tries. Written by the server outside the use case's
-- transaction, so a refusal still lands. Not house history: members never see it. Server-only:
-- RLS is on with no policies, and only service_role (the server's system role) has privileges.
-- `ip` is the caller's address as the rate limiter sees it (plain, like the `rate_limits` keys:
-- an unsalted hash of an IPv4 address is reversible in seconds, so it would hide nothing).
create table public.security_events (
  id     bigint      generated always as identity primary key,
  at     timestamptz not null,
  kind   text        not null check (kind in ('invite_refused', 'setup_token_refused', 'rate_limited')),
  ip     text        not null,
  detail jsonb       not null default '{}'::jsonb   -- { step, reason? }
);

create index security_events_at on public.security_events (at);

alter table public.security_events enable row level security;
-- Append-only: Supabase's default privileges would give service_role everything, so start from
-- nothing. Delete is kept for pruning old rows (by hand, or a later job).
revoke all on public.security_events from anon, authenticated, service_role;
grant select, insert, delete on public.security_events to service_role;

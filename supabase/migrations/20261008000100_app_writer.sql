-- Server-only writes, step 1 (DEPLOYMENT D9, ARCHITECTURE §5.2, A30). `app_writer` is the role the
-- server switches to for a member's transaction (`set local role app_writer` + their JWT claims).
-- It is a member of `authenticated`, so every RLS policy written `to authenticated` still applies
-- and it reads what members read; on top of that it holds the write grants members need. It has
-- no login and is granted only to `app_server`, never to `authenticator`, so a JWT can't pick it
-- through the REST API. Step 2 (revoke_authenticated_writes) takes the writes away from
-- `authenticated`, the browser's role. New tables grant their writes here, never to
-- `authenticated` (supabase/tests/grants.test.ts fails otherwise).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_writer') then
    create role app_writer with nologin inherit;
  end if;
end
$$;

grant authenticated to app_writer;
grant app_writer to app_server;
-- The database tests act as members from `postgres` (lib/testing/db.ts), as they already do with
-- `authenticated`. `postgres` owns every table, so this gives it nothing new.
grant app_writer to postgres with inherit false, set true;

-- History and the outbox are append-only; costs are added, then edited through the column grant.
grant insert on public.activity_events, public.notifications_outbox, public.costs to app_writer;

grant insert, update on
  public.profiles, public.houses, public.rooms, public.house_members, public.house_invites,
  public.contacts, public.items, public.feelings, public.runs, public.polls, public.poll_options,
  public.poll_votes, public.notification_prefs, public.push_subscriptions
  to app_writer;

-- The only two DELETE policies: "feelings delete own" and "poll votes withdraw own while open".
grant delete on public.feelings, public.poll_votes to app_writer;

-- "costs update": amount, who paid, note, removed (T57).
grant update (amount_cents, paid_by, note, removed_at) on public.costs to app_writer;

grant usage on all sequences in schema public to app_writer;

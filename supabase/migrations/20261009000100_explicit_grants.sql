-- Explicit grants (T76). The local CLI's default privileges in `public` give `authenticated`
-- SELECT and `service_role` ALL on every new table, sequence and function; newer hosted projects
-- give them almost nothing (REFERENCES, TRIGGER, TRUNCATE, MAINTAIN). The earlier migrations
-- relied on the local defaults, so on hosted the server's jobs (service_role) and every member
-- read (authenticated, and app_writer through it) were refused. This grants explicitly what local
-- had, and sets hosted's defaults to local's for tables created later. A no-op locally.
-- Writes stay as before: `authenticated` gets none (A30), `app_writer` keeps its own grants.

-- Member reads (RLS still decides which rows).
grant select on
  public.activity_events, public.contacts, public.costs, public.feelings, public.house_invites,
  public.house_members, public.houses, public.items, public.notification_prefs,
  public.notifications_outbox, public.poll_options, public.poll_votes, public.polls,
  public.profiles, public.push_subscriptions, public.rooms, public.runs
  to authenticated;

-- Jobs and the system actor (bypasses RLS). activity_events stays append-only.
grant all on
  public.contacts, public.costs, public.feelings, public.house_invites, public.house_members,
  public.houses, public.items, public.notification_prefs, public.notifications_outbox,
  public.poll_options, public.poll_votes, public.polls, public.profiles, public.push_subscriptions,
  public.rooms, public.runs
  to service_role;
grant select, insert on public.activity_events to service_role;

grant all on sequence
  public.activity_events_id_seq, public.notifications_outbox_id_seq, public.security_events_id_seq
  to service_role;
grant select on sequence
  public.activity_events_id_seq, public.notifications_outbox_id_seq, public.security_events_id_seq
  to authenticated;

grant execute on function public.touch_updated_at(), public.valid_feeling_weights(jsonb)
  to authenticated, service_role;

-- Later tables: the same defaults on hosted as locally (reads for members, everything for jobs).
alter default privileges for role postgres in schema public grant select on tables to authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant select on sequences to authenticated;
alter default privileges for role postgres in schema public grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;

-- Server-only writes, step 2 (DEPLOYMENT D9, ARCHITECTURE §5.2, A30). The browser's role,
-- `authenticated`, keeps SELECT (reads through the REST API, Realtime) and loses every write:
-- the anon key and every policy are public, so a signed-in roommate could otherwise write through
-- the REST API directly, skipping the app's checks and the activity log. The server writes as
-- `app_writer` (step 1). Tables that later migrations create give `authenticated` no writes
-- either. After launch this would ship a release after step 1 (D5).

revoke insert, update, delete, truncate, trigger, maintain
  on all tables in schema public from authenticated;
revoke update (amount_cents, paid_by, note, removed_at) on public.costs from authenticated;
revoke usage, update on all sequences in schema public from authenticated;

alter default privileges in schema public
  revoke insert, update, delete, truncate, trigger, maintain on tables from authenticated;
alter default privileges in schema public
  revoke usage, update on sequences from authenticated;

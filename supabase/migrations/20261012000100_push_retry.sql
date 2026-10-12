-- Passing push failures are tried again (T84): a message no browser took (5xx, 429, a timeout)
-- waits 5 minutes, 30 minutes, then 2 hours before being given up on. `attempts` counts those
-- tries. Only the sender (service_role, which has ALL on the table) changes it; members still only
-- insert (app_writer) and read their own rows, so no grant or policy changes.

alter table public.notifications_outbox
  add column attempts integer not null default 0 check (attempts >= 0);

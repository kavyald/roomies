-- Outbox sending (T83, ARCHITECTURE §7.3): each message is sent once, and only while it's still true.
--
-- claimed_until: the sender claims a batch first (update … where id in (select … for update skip
--   locked)), so two senders that overlap (the 5-minute job and the one after each action) never
--   take the same rows. A claim is a lease: if the sender dies before marking a message, it's free
--   again once the lease runs out. Marking a message sent or putting it off clears it.
-- expires_at: reminders are about a day ("Today: …", "Tomorrow: …", "Closing tomorrow: …"); one
--   held past that day by quiet hours is marked 'stale' instead of pushed.
--
-- Only the sender (service_role, which has ALL on the table) sets either column's later values.
-- Members still only insert (app_writer's table grant covers the new columns) and read their own
-- rows, so no grant or policy changes.

alter table public.notifications_outbox
  add column claimed_until timestamptz null,
  add column expires_at timestamptz null;

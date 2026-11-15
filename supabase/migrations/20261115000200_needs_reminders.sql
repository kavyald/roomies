-- Needs reminders (T85, PRD §11): a need with a "needed by" date reminds everyone on the day,
-- through its own 'needs' category so people can switch it off and keep task reminders. Only the
-- category check widens; the table's RLS and grants are unchanged.

alter table public.notification_prefs drop constraint notification_prefs_category_check;
alter table public.notification_prefs add constraint notification_prefs_category_check
  check (category in ('assigned', 'due', 'needs', 'feelings', 'polls', 'runs', 'people'));

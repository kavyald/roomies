-- Realtime (T26): every change writes an activity row in the same transaction, so the browser
-- listens to activity inserts for its house (RLS still decides who hears them) and refreshes the
-- matching queries. One table covers deletes too (Realtime can't filter DELETE events).
alter publication supabase_realtime add table public.activity_events;

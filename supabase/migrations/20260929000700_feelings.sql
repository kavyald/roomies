-- Feelings (PRD §7): one current feeling + note per member per item. Earlier feelings live in
-- activity_events (feeling.set carries the previous one), so the row itself can be replaced or
-- removed: this is the one table where a member may delete (their own row).

alter table public.items add constraint items_house_id_id_key unique (house_id, id);

create table public.feelings (
  item_id    uuid not null,
  user_id    uuid not null references public.profiles (id),
  house_id   uuid not null,
  kind       text not null check (kind in ('anxious', 'frustrated', 'confused', 'fine', 'meh', 'thanks')),
  note       text null check (note is null or length(note) <= 280),
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id),
  foreign key (house_id, item_id) references public.items (house_id, id) on delete cascade
);

create index feelings_house_idx on public.feelings (house_id);

alter table public.feelings enable row level security;
create policy "feelings read" on public.feelings for select to authenticated
  using (public.is_member(house_id));
create policy "feelings insert own" on public.feelings for insert to authenticated
  with check (public.is_member(house_id) and user_id = (select auth.uid()));
create policy "feelings update own" on public.feelings for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member(house_id))
  with check (user_id = (select auth.uid()) and public.is_member(house_id));
create policy "feelings delete own" on public.feelings for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_member(house_id));

revoke all on public.feelings from anon;
revoke truncate on public.feelings from authenticated;
grant delete on public.feelings to authenticated;

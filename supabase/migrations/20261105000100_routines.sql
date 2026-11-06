-- Routines (T96, PRD §6.2): who looks after a set of rooms, and how often that changes hands. A room
-- is in at most one routine; a chore has a kind (deep clean or upkeep), an optional icon and any
-- number of rooms. Who's on a chore is worked out from these, never stored.
--
-- Additive only (DEPLOYMENT D5): the build already running keeps working while this goes in, so its
-- chores can still have a null chore_kind and a room_id. The new code reads a null kind as upkeep
-- and falls back to room_id, and writes neither. A later release's migration re-runs the backfill,
-- clears the old chore fields and adds the strict checks (the follow-up card to T96).

create table public.routines (
  id              uuid primary key,
  house_id        uuid not null references public.houses (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 60),
  icon            text not null check (length(icon) between 1 and 40),
  resets          text not null check (resets in ('weekly', 'biweekly', 'monthly')),
  -- The rotation: on the period starting starts_on, starts_with has it, then everyone in turn.
  starts_on       date not null,
  starts_with     uuid null references public.profiles (id),
  -- Set: always this person; the checklist still resets.
  fixed_member_id uuid null references public.profiles (id),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  removed_at      timestamptz null,
  unique (house_id, id), -- target for same-house foreign keys
  check (starts_with is not null or fixed_member_id is not null)
);

create index routines_house_idx on public.routines (house_id, sort_order);

create trigger routines_touch_updated_at before update on public.routines
  for each row execute function public.touch_updated_at();

alter table public.rooms add column routine_id uuid null;
alter table public.rooms
  add constraint rooms_routine_fkey foreign key (house_id, routine_id)
  references public.routines (house_id, id);

alter table public.items
  add column chore_kind text null check (chore_kind in ('deep_clean', 'upkeep')),
  add column icon       text null check (icon is null or length(icon) between 1 and 40),
  add constraint items_chore_kind_only_chores check (category = 'chore' or chore_kind is null),
  add constraint items_icon_only_chores check (category = 'chore' or icon is null);

create table public.chore_rooms (
  house_id uuid not null,
  item_id  uuid not null,
  room_id  uuid not null,
  primary key (item_id, room_id),
  foreign key (house_id, room_id) references public.rooms (house_id, id),
  foreign key (house_id) references public.houses (id) on delete cascade,
  foreign key (item_id) references public.items (id)
);

create index chore_rooms_house_idx on public.chore_rooms (house_id);
create index chore_rooms_room_idx on public.chore_rooms (room_id);

-- Existing chores are upkeep, in the room they had.
update public.items set chore_kind = 'upkeep' where category = 'chore' and chore_kind is null;
insert into public.chore_rooms (house_id, item_id, room_id)
  select house_id, id, room_id from public.items where category = 'chore' and room_id is not null
  on conflict do nothing;

-- Activity: the new kinds, and the routine they point at.
alter table public.activity_events add column routine_id uuid null references public.routines (id);
alter table public.activity_events drop constraint activity_events_kind_check;
alter table public.activity_events add constraint activity_events_kind_check check (kind in (
  'item.created', 'item.edited', 'item.done', 'item.reopened', 'item.archived', 'item.restored',
  'item.assigned', 'item.handled_by_changed', 'chore.done', 'chore.undone',
  'feeling.set', 'feeling.removed',
  'poll.created', 'poll.closed', 'poll.reopened', 'poll.deadline_changed', 'poll.option_added',
  'poll.voted', 'poll.vote_changed', 'poll.vote_withdrawn',
  'run.created', 'run.renamed', 'run.date_set', 'run.point_person_changed',
  'run.item_added', 'run.item_moved', 'run.item_returned', 'run.item_done',
  'request.sent', 'request.closed', 'run.finished',
  'cost.added', 'cost.edited', 'cost.removed', 'cost.splitwise_copied',
  'house.created', 'settings.feeling_weights_changed', 'invite.created', 'invite.revoked',
  'member.joined', 'member.room_changed', 'member.role_changed', 'member.moved_out', 'member.removed',
  'contact.created', 'contact.edited', 'contact.removed',
  'room.renamed', 'room.routine_changed',
  'routine.created', 'routine.updated', 'routine.removed'
));
alter table public.activity_events
  add constraint activity_events_routine_subject check (kind not like 'routine.%' or routine_id is not null);

-- Any member reads and changes routines (owner), and a removed one is never deleted, since activity
-- points at it. A chore's rooms are rows you add and remove, so "chore rooms delete" is the third
-- DELETE policy (ARCHITECTURE §5.2).
alter table public.routines enable row level security;
create policy "routines read" on public.routines for select to authenticated
  using (private.is_member(house_id));
create policy "routines insert" on public.routines for insert to authenticated
  with check (private.is_member(house_id));
create policy "routines update" on public.routines for update to authenticated
  using (private.is_member(house_id)) with check (private.is_member(house_id));

alter table public.chore_rooms enable row level security;
create policy "chore rooms read" on public.chore_rooms for select to authenticated
  using (private.is_member(house_id));
create policy "chore rooms insert" on public.chore_rooms for insert to authenticated
  with check (private.is_member(house_id));
create policy "chore rooms delete" on public.chore_rooms for delete to authenticated
  using (private.is_member(house_id));

-- Reads for authenticated and everything for service_role come from the default privileges (T76);
-- writes go only to the server's app_writer (A30).
grant insert, update on public.routines to app_writer;
grant insert, delete on public.chore_rooms to app_writer;

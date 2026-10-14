-- Items: needs, chores, and tasks in one table (ARCHITECTURE §6.1–6.2, D18). Category-specific
-- columns are tied to their category by CHECKs. The run columns get their foreign key to `runs`
-- in T28; until then they must stay empty.

create table public.items (
  id            uuid primary key,
  house_id      uuid not null references public.houses (id) on delete cascade,
  category      text not null check (category in ('need', 'chore', 'task')),   -- never changes (D15)
  title         text not null check (length(btrim(title)) between 1 and 120),
  note          text null,
  room_id       uuid null,
  assignee_id   uuid null references public.profiles (id),                      -- null = anyone
  when_at       timestamptz null,                                               -- due / needed by
  when_has_time boolean not null default false,
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  repeat_days   integer null check (repeat_days is null or repeat_days between 1 and 365), -- chores
  last_done_at  timestamptz null,                                               -- chores
  last_done_by  uuid null references public.profiles (id),                      -- chores
  contact_id    uuid null references public.contacts (id),                      -- tasks: handled by
  done_at       timestamptz null,                                               -- needs & tasks
  done_by       uuid null references public.profiles (id),
  run_id        uuid null,                                                      -- the run it's on now
  run_kind      text null check (run_kind in ('batch', 'request', 'visit')),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz null,

  foreign key (house_id, room_id) references public.rooms (house_id, id),
  check ((run_id is null) = (run_kind is null)),
  check (run_kind is null or run_kind = 'batch' or category = 'task'),     -- requests & visits hold tasks only
  check (run_id is null or (done_at is null and archived_at is null)),     -- done/archived items aren't on a run
  check (category = 'chore' or (repeat_days is null and last_done_at is null and last_done_by is null)),
  check (category = 'task' or contact_id is null),
  check (category <> 'chore' or done_at is null),                          -- chores are never "done", only "last done"
  check ((done_at is null) = (done_by is null)),
  check ((last_done_at is null) = (last_done_by is null)),
  check (when_at is not null or not when_has_time)
);

-- Adding a need that's already open points to it instead of repeating it.
create unique index items_open_need_title on public.items (house_id, lower(btrim(title)))
  where category = 'need' and done_at is null and archived_at is null;

create index items_house_category_idx on public.items (house_id, category) where archived_at is null;
create index items_house_when_idx on public.items (house_id, when_at) where when_at is not null;
create index items_run_idx on public.items (run_id) where run_id is not null;

-- The one trigger the architecture allows: keeping updated_at honest (§4).
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_touch_updated_at before update on public.items
  for each row execute function public.touch_updated_at();

alter table public.activity_events
  add constraint activity_events_item_id_fkey foreign key (item_id) references public.items (id);

-- Any member can add and edit any item (PRD §5). No delete: archive instead.
alter table public.items enable row level security;
create policy "items read" on public.items for select to authenticated
  using (public.is_member(house_id));
create policy "items insert" on public.items for insert to authenticated
  with check (public.is_member(house_id) and created_by = (select auth.uid()));
create policy "items update" on public.items for update to authenticated
  using (public.is_member(house_id)) with check (public.is_member(house_id));

revoke all on public.items from anon;
revoke delete, truncate on public.items from authenticated;

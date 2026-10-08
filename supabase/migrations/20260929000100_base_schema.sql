-- Base schema: the house, its people and places, the activity log, and the notification outbox
-- (ARCHITECTURE §5.2, §6.2, §6.4). Integrity only: RLS, foreign keys, CHECKs, indexes.
-- No business logic, no triggers besides updated_at (none needed yet).
--
-- The access rules here must match lib/adapters/memory/db.ts, which enforces the same rules for
-- unit tests.

-- ---------------------------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------------------------

-- Profiles are not foreign-keyed to auth.users: when an account is deleted, its profile is
-- anonymized ("Former roommate") and kept, because activity rows point at it (§5.3, §6.4).
create table public.profiles (
  id           uuid primary key,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  theme        text not null default 'auto' check (theme in ('auto', 'light', 'dark')),
  timezone     text null,
  quiet_start  time null,
  quiet_end    time null,
  created_at   timestamptz not null default now(),
  check ((quiet_start is null) = (quiet_end is null))
);

-- ---------------------------------------------------------------------------------------------
-- The house
-- ---------------------------------------------------------------------------------------------

create table public.houses (
  id         uuid primary key,
  name       text not null check (length(btrim(name)) between 1 and 80),
  address    text null,
  unit       text null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- { timezone, feeling_weights: {anxious, frustrated, confused, fine, meh, thanks}, invite_ttl_days }
  settings   jsonb not null,
  check (
    jsonb_typeof(settings -> 'timezone') = 'string'
    and jsonb_typeof(settings -> 'feeling_weights') = 'object'
    and jsonb_typeof(settings -> 'invite_ttl_days') = 'number'
  )
);

create table public.rooms (
  id          uuid primary key,
  house_id    uuid not null references public.houses (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  floor       text not null check (floor in ('first', 'basement', 'outside')),
  kind        text not null check (kind in ('bedroom', 'bath', 'common', 'entry', 'utility', 'outdoor')),
  element     text null check (element in ('air', 'fire', 'water', 'earth')),
  sort_order  integer not null default 0,
  archived_at timestamptz null,
  unique (house_id, id) -- target for same-house foreign keys
);

create index rooms_house_idx on public.rooms (house_id, sort_order);

create table public.house_members (
  house_id  uuid not null references public.houses (id) on delete cascade,
  user_id   uuid not null references public.profiles (id),
  role      text not null check (role in ('admin', 'member')),
  status    text not null default 'active' check (status in ('active', 'moved_out')),
  room_id   uuid null,
  joined_at timestamptz not null default now(),
  left_at   timestamptz null,
  primary key (house_id, user_id),
  foreign key (house_id, room_id) references public.rooms (house_id, id),
  check ((status = 'moved_out') = (left_at is not null))
);

create index house_members_user_idx on public.house_members (user_id);

create table public.house_invites (
  id         uuid primary key,
  house_id   uuid not null references public.houses (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses   integer not null check (max_uses > 0),
  uses       integer not null default 0 check (uses >= 0),
  revoked_at timestamptz null
);

create index house_invites_house_idx on public.house_invites (house_id);

-- Archived, never deleted: activity rows point at contacts.
create table public.contacts (
  id          uuid primary key,
  house_id    uuid not null references public.houses (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  phone       text null,
  note        text null,
  created_at  timestamptz not null default now(),
  archived_at timestamptz null
);

create index contacts_house_idx on public.contacts (house_id) where archived_at is null;

-- ---------------------------------------------------------------------------------------------
-- Activity: the only history store (§6.4). Append-only.
-- item/run/poll/option/cost columns get their foreign keys when those tables arrive.
-- ---------------------------------------------------------------------------------------------

create table public.activity_events (
  id         bigserial primary key,                 -- also the order events happened in
  house_id   uuid not null references public.houses (id) on delete cascade,
  at         timestamptz not null default now(),
  actor_id   uuid null references public.profiles (id), -- null = Roomies (jobs)
  action_id  uuid not null,                         -- one user action; a bulk action shares it
  kind       text not null,

  item_id    uuid null,
  run_id     uuid null,                             -- the run it happened on (or moved FROM)
  to_run_id  uuid null,                             -- moves only
  poll_id    uuid null,
  option_id  uuid null,
  cost_id    uuid null,
  contact_id uuid null references public.contacts (id),
  member_id  uuid null references public.profiles (id), -- the member affected, not the actor
  room_id    uuid null references public.rooms (id),

  note       text null,
  changes    jsonb null,                            -- field diffs; feeling previous/next
  payload    jsonb not null default '{"v":1}',      -- versioned extras only; nothing queried

  check (kind in (
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
    'room.added', 'room.renamed', 'room.archived'
  )),
  check (kind not like 'item.%'     or item_id is not null),
  check (kind not like 'chore.%'    or item_id is not null),
  check (kind not like 'feeling.%'  or item_id is not null),
  check (kind not like 'run.item_%' or (item_id is not null and run_id is not null)),
  check ((kind = 'run.item_moved') = (to_run_id is not null)),
  check (kind not like 'poll.%'     or poll_id is not null),
  check (kind not like 'cost.%'     or cost_id is not null),
  check (kind not like 'member.%'   or member_id is not null),
  check (kind not like 'contact.%'  or contact_id is not null),
  check (kind not like 'room.%'     or room_id is not null),
  check (jsonb_typeof(payload) = 'object' and payload ? 'v')
);

create index activity_events_house_idx  on public.activity_events (house_id, id desc);
create index activity_events_item_idx   on public.activity_events (item_id, id)  where item_id is not null;
create index activity_events_run_idx    on public.activity_events (run_id, id)   where run_id is not null;
create index activity_events_to_run_idx on public.activity_events (to_run_id)    where to_run_id is not null;
create index activity_events_poll_idx   on public.activity_events (poll_id, id)  where poll_id is not null;
create index activity_events_action_idx on public.activity_events (action_id);

-- ---------------------------------------------------------------------------------------------
-- Notification outbox (written by the EventSink in the same transaction; sent by a job)
-- ---------------------------------------------------------------------------------------------

create table public.notifications_outbox (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id),
  house_id   uuid not null references public.houses (id) on delete cascade,
  category   text not null,
  title      text not null,
  body       text not null,
  url        text not null,
  created_at timestamptz not null default now(),
  send_after timestamptz not null default now(),
  sent_at    timestamptz null,
  error      text null
);

create index notifications_outbox_pending_idx on public.notifications_outbox (send_after) where sent_at is null;

-- ---------------------------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so policies can look at membership without recursing through
-- house_members' own policy.
-- ---------------------------------------------------------------------------------------------

create function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.house_members
    where house_id = h and user_id = (select auth.uid()) and status = 'active'
  );
$$;

create function public.is_admin(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.house_members
    where house_id = h and user_id = (select auth.uid()) and status = 'active' and role = 'admin'
  );
$$;

-- Whether the signed-in user and `other` are active members of a common house.
create function public.shares_house(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.house_members me
    join public.house_members them on them.house_id = me.house_id
    where me.user_id = (select auth.uid()) and me.status = 'active'
      and them.user_id = other and them.status = 'active'
  );
$$;

-- The setup route works only while no house exists (§5.2). Counted outside RLS.
create function public.no_house_exists() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.houses);
$$;

revoke execute on function public.is_member(uuid), public.is_admin(uuid),
  public.shares_house(uuid), public.no_house_exists() from public, anon;
grant execute on function public.is_member(uuid), public.is_admin(uuid),
  public.shares_house(uuid), public.no_house_exists() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Row-level security: on for every table. No delete policies anywhere (archive instead).
-- ---------------------------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.houses               enable row level security;
alter table public.rooms                enable row level security;
alter table public.house_members        enable row level security;
alter table public.house_invites        enable row level security;
alter table public.contacts             enable row level security;
alter table public.activity_events      enable row level security;
alter table public.notifications_outbox enable row level security;

-- profiles: your own, and those of people you live with; you edit only your own
create policy "profiles read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_house(id));
create policy "profiles insert own" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- houses: members read; admins edit; the first account creates the only house
create policy "houses read" on public.houses for select to authenticated
  using (public.is_member(id));
create policy "houses setup" on public.houses for insert to authenticated
  with check (public.no_house_exists() and created_by = (select auth.uid()));
create policy "houses admin edit" on public.houses for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));

-- house_members: members see the house's list, and anyone sees their own row (to learn they moved
-- out); admins add and change members
create policy "members read" on public.house_members for select to authenticated
  using (public.is_member(house_id) or user_id = (select auth.uid()));
create policy "members admin insert" on public.house_members for insert to authenticated
  with check (public.is_admin(house_id));
create policy "members admin update" on public.house_members for update to authenticated
  using (public.is_admin(house_id)) with check (public.is_admin(house_id));

-- rooms and contacts: any member
create policy "rooms read" on public.rooms for select to authenticated
  using (public.is_member(house_id));
create policy "rooms insert" on public.rooms for insert to authenticated
  with check (public.is_member(house_id));
create policy "rooms update" on public.rooms for update to authenticated
  using (public.is_member(house_id)) with check (public.is_member(house_id));

create policy "contacts read" on public.contacts for select to authenticated
  using (public.is_member(house_id));
create policy "contacts insert" on public.contacts for insert to authenticated
  with check (public.is_member(house_id));
create policy "contacts update" on public.contacts for update to authenticated
  using (public.is_member(house_id)) with check (public.is_member(house_id));

-- invites: admins only (joining goes through the server as the system actor)
create policy "invites admin read" on public.house_invites for select to authenticated
  using (public.is_admin(house_id));
create policy "invites admin insert" on public.house_invites for insert to authenticated
  with check (public.is_admin(house_id));
create policy "invites admin update" on public.house_invites for update to authenticated
  using (public.is_admin(house_id)) with check (public.is_admin(house_id));

-- activity: members read; you record only in your own name; nobody edits or deletes
create policy "activity read" on public.activity_events for select to authenticated
  using (public.is_member(house_id));
create policy "activity insert own" on public.activity_events for insert to authenticated
  with check (public.is_member(house_id) and actor_id = (select auth.uid()));

-- outbox: you see your own messages; members enqueue for their house; sending is a job
create policy "outbox read own" on public.notifications_outbox for select to authenticated
  using (user_id = (select auth.uid()));
create policy "outbox enqueue" on public.notifications_outbox for insert to authenticated
  with check (public.is_member(house_id));

-- ---------------------------------------------------------------------------------------------
-- Grants: signed-out visitors get nothing; nobody may rewrite history.
-- ---------------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

revoke update, delete, truncate on public.activity_events from authenticated, service_role;
revoke update, delete, truncate on public.notifications_outbox from authenticated;
revoke delete, truncate on all tables in schema public from authenticated;
alter default privileges in schema public revoke delete, truncate on tables from authenticated;

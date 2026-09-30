-- Polls (T27, PRD §6.4, ARCHITECTURE §6.1): a question and two or more options, about an item or
-- standalone. Anyone adds options and votes (one vote each, changeable) while it's open; closing
-- locks both. The result is read from the votes (they can't change once closed).

create table public.polls (
  id          uuid primary key,
  house_id    uuid not null references public.houses (id) on delete cascade,
  question    text not null check (length(btrim(question)) between 1 and 200),
  item_id     uuid null,                                    -- about an item, or standalone
  closes_at   timestamptz null,
  closed_at   timestamptz null,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (house_id, id),
  foreign key (house_id, item_id) references public.items (house_id, id)
);

create index polls_open_idx on public.polls (house_id) where closed_at is null;
create index polls_item_idx on public.polls (item_id) where item_id is not null;

create trigger polls_touch_updated_at before update on public.polls
  for each row execute function public.touch_updated_at();

create table public.poll_options (
  id          uuid primary key,
  poll_id     uuid not null,
  house_id    uuid not null,
  label       text not null check (length(btrim(label)) between 1 and 80),
  note        text null check (note is null or length(note) <= 280),
  added_by    uuid not null references public.profiles (id),
  added_at    timestamptz not null default now(),
  sort_order  integer not null,
  unique (poll_id, id),
  foreign key (house_id, poll_id) references public.polls (house_id, id) on delete cascade
);

-- Duplicate labels are refused (PRD §6.4).
create unique index poll_options_label_idx on public.poll_options (poll_id, lower(btrim(label)));

create table public.poll_votes (
  poll_id     uuid not null,
  user_id     uuid not null references public.profiles (id),
  house_id    uuid not null,
  option_id   uuid not null,
  voted_at    timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (house_id, poll_id) references public.polls (house_id, id) on delete cascade,
  foreign key (poll_id, option_id) references public.poll_options (poll_id, id)
);

alter table public.activity_events
  add constraint activity_events_poll_id_fkey foreign key (poll_id) references public.polls (id),
  add constraint activity_events_option_id_fkey foreign key (option_id) references public.poll_options (id);

-- Whether a poll is still taking options and votes.
create function public.poll_is_open(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.polls where id = p and closed_at is null);
$$;

revoke execute on function public.poll_is_open(uuid) from public, anon;
grant execute on function public.poll_is_open(uuid) to authenticated, service_role;

alter table public.polls enable row level security;
create policy "polls read" on public.polls for select to authenticated
  using (public.is_member(house_id));
create policy "polls insert" on public.polls for insert to authenticated
  with check (public.is_member(house_id) and created_by = (select auth.uid()));
create policy "polls update" on public.polls for update to authenticated
  using (public.is_member(house_id)) with check (public.is_member(house_id));

alter table public.poll_options enable row level security;
create policy "poll options read" on public.poll_options for select to authenticated
  using (public.is_member(house_id));
create policy "poll options add while open" on public.poll_options for insert to authenticated
  with check (
    public.is_member(house_id) and added_by = (select auth.uid()) and public.poll_is_open(poll_id)
  );

alter table public.poll_votes enable row level security;
create policy "poll votes read" on public.poll_votes for select to authenticated
  using (public.is_member(house_id));
create policy "poll votes cast own while open" on public.poll_votes for insert to authenticated
  with check (
    public.is_member(house_id) and user_id = (select auth.uid()) and public.poll_is_open(poll_id)
  );
create policy "poll votes change own while open" on public.poll_votes for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member(house_id))
  with check (
    public.is_member(house_id) and user_id = (select auth.uid()) and public.poll_is_open(poll_id)
  );

revoke all on public.polls, public.poll_options, public.poll_votes from anon;
revoke delete, truncate on public.polls, public.poll_options, public.poll_votes from authenticated;

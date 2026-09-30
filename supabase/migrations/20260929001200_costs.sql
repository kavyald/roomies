-- Costs (T29, PRD §6.6, ARCHITECTURE §6.1): an amount, who paid, an optional note, and what it
-- was for (an item or a run, at most one). Split equally among members; Splitwise is a copy.

create table public.costs (
  id            uuid primary key,
  house_id      uuid not null references public.houses (id) on delete cascade,
  amount_cents  integer not null check (amount_cents > 0 and amount_cents <= 10000000),  -- up to $100,000
  paid_by       uuid not null references public.profiles (id),
  note          text null check (note is null or length(note) <= 280),
  item_id       uuid null,
  run_id        uuid null,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  check (num_nonnulls(item_id, run_id) <= 1),
  foreign key (house_id, item_id) references public.items (house_id, id),
  foreign key (run_id) references public.runs (id)
);

create index costs_house_created_idx on public.costs (house_id, created_at);

alter table public.activity_events
  add constraint activity_events_cost_id_fkey foreign key (cost_id) references public.costs (id);

-- Any member records a cost, in their own name (someone else may have paid). No edits or deletes
-- in v1.
alter table public.costs enable row level security;
create policy "costs read" on public.costs for select to authenticated
  using (public.is_member(house_id));
create policy "costs insert" on public.costs for insert to authenticated
  with check (public.is_member(house_id) and created_by = (select auth.uid()));

revoke all on public.costs from anon;
revoke update, delete, truncate on public.costs from authenticated;

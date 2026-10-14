-- Runs (T28, ARCHITECTURE §6.2, PRD §6.5): a batch of items handled together. Items point at the
-- run they're on right now (items.run_id / run_kind); what used to be on a run is read back from
-- activity_events (run.item_* rows). Requests and visits (T30) share this table.

create table public.runs (
  id            uuid primary key,
  house_id      uuid not null references public.houses (id) on delete cascade,
  kind          text not null check (kind in ('batch', 'request', 'visit')),   -- never changes
  title         text null check (title is null or length(btrim(title)) between 1 and 80), -- null: "Kavya's run"
  runner_id     uuid not null references public.profiles (id),  -- batch: who's doing it · request/visit: point person
  contact_id    uuid null references public.contacts (id),      -- required for request & visit
  when_at       timestamptz null,                               -- batch & visit only (optional)
  when_has_time boolean not null default false,
  status        text not null,
  sent_at       timestamptz null,                               -- requests only
  sent_via      text null check (sent_via in ('text', 'email', 'call', 'portal', 'in_person')),
  finished_at   timestamptz null,                               -- finished / closed
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (house_id, id, kind),                                   -- items' (house_id, run_id, run_kind) key
  check ((kind = 'batch') = (contact_id is null)),
  check (case kind when 'request' then status in ('gathering', 'sent', 'closed')
                   else status in ('open', 'finished') end),
  check (kind = 'request' or (sent_at is null and sent_via is null)),
  check (kind <> 'request' or when_at is null),
  check (status <> 'sent' or (sent_at is not null and sent_via is not null)),
  check ((status in ('finished', 'closed')) = (finished_at is not null)),
  check (when_at is not null or not when_has_time)
);

create index runs_house_status_idx on public.runs (house_id, status, when_at);

create trigger runs_touch_updated_at before update on public.runs
  for each row execute function public.touch_updated_at();

-- An item is on at most one run (one column), of its own house, of the kind it says.
alter table public.items
  add constraint items_run_fkey foreign key (house_id, run_id, run_kind)
  references public.runs (house_id, id, kind);

alter table public.activity_events
  add constraint activity_events_run_id_fkey foreign key (run_id) references public.runs (id),
  add constraint activity_events_to_run_id_fkey foreign key (to_run_id) references public.runs (id);

-- Any member can start and run a run (PRD §6.5). No delete: a run finishes or closes.
alter table public.runs enable row level security;
create policy "runs read" on public.runs for select to authenticated
  using (public.is_member(house_id));
create policy "runs insert" on public.runs for insert to authenticated
  with check (public.is_member(house_id) and created_by = (select auth.uid()));
create policy "runs update" on public.runs for update to authenticated
  using (public.is_member(house_id)) with check (public.is_member(house_id));

revoke all on public.runs from anon;
revoke delete, truncate on public.runs from authenticated;

-- Realtime: run changes reach browsers through their activity rows (T26), nothing to publish.

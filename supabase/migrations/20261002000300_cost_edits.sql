-- Costs: edit and remove (T57, PRD §6.6, ARCHITECTURE §6.2). Any member of the house edits a
-- cost's amount, who paid and note, or removes it. Removing sets removed_at: activity rows point at
-- costs, so nothing is deleted. What it was for, who added it and when never change: the column
-- grant below leaves them out (and saves never rewrite created_at, CLAUDE.md).

alter table public.costs add column removed_at timestamptz null;

create policy "costs update" on public.costs for update to authenticated
  using (public.is_member(house_id))
  with check (public.is_member(house_id));

grant update (amount_cents, paid_by, note, removed_at) on public.costs to authenticated;

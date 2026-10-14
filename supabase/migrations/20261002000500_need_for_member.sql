-- T45: a need can be one person's ("For Kavya") or the house's (null). A label only: costs, the
-- split and Spent this month don't look at it. Only needs carry it. RLS is unchanged: the items
-- policies already cover the new column (every member sees and can check off anyone's need).

alter table public.items
  add column for_member uuid null references public.profiles (id),
  add constraint items_for_member_needs_only check (category = 'need' or for_member is null);

-- "That's already on the list" now compares the title and whose it is: the house's "Milk" and
-- Kavya's "Milk" are two needs (null = the house, so it's coalesced to compare as one value).
drop index public.items_open_need_title;
create unique index items_open_need_title on public.items (
  house_id,
  coalesce(for_member, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(title))
) where category = 'need' and done_at is null and archived_at is null;

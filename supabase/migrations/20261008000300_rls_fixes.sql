-- Security fixes (DEPLOYMENT §8, ARCHITECTURE §5.2). Keep in sync with lib/adapters/memory/db.ts.

-- member_role(h, u) answers only a caller who is an active member of h (it used to tell anyone
-- signed in the role of any user in any house). "members update own" calls it for the caller's
-- own row, which is still active when the check runs.
create or replace function public.member_role(h uuid, u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.house_members m
  where m.house_id = h and m.user_id = u
    and exists (
      select 1 from public.house_members me
      where me.house_id = h and me.user_id = (select auth.uid()) and me.status = 'active'
    );
$$;

-- The outbox takes messages only for active members of the house (it used to take any user_id).
drop policy "outbox enqueue" on public.notifications_outbox;
create policy "outbox enqueue" on public.notifications_outbox for insert to authenticated
  with check (
    public.is_member(house_id)
    and exists (
      select 1 from public.house_members m
      where m.house_id = notifications_outbox.house_id
        and m.user_id = notifications_outbox.user_id
        and m.status = 'active'
    )
  );

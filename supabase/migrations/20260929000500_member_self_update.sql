-- Members may update their own membership (T17): move out, or change their room. They can't
-- change their role, and someone who moved out can't reactivate themselves (that takes an
-- invite). Keep in sync with lib/adapters/memory/db.ts.

create function public.member_role(h uuid, u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.house_members where house_id = h and user_id = u;
$$;

revoke execute on function public.member_role(uuid, uuid) from public, anon;
grant execute on function public.member_role(uuid, uuid) to authenticated, service_role;

create policy "members update own" on public.house_members for update to authenticated
  using (user_id = (select auth.uid()) and status = 'active')
  with check (
    user_id = (select auth.uid())
    and role = public.member_role(house_id, user_id)
  );

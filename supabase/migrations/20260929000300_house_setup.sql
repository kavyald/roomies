-- House setup (T15, ARCHITECTURE §5.2): the first account creates the only house and becomes its
-- admin. The creator isn't a member yet when adding themselves, so they get one narrow extra
-- right: to add *themselves* as the first admin of a house they created that has no members.
-- Keep in sync with lib/adapters/memory/db.ts.

create function public.can_claim_house(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.houses where id = h and created_by = (select auth.uid()))
     and not exists (select 1 from public.house_members where house_id = h);
$$;

revoke execute on function public.can_claim_house(uuid) from public, anon;
grant execute on function public.can_claim_house(uuid) to authenticated, service_role;

drop policy "members admin insert" on public.house_members;
create policy "members admin insert" on public.house_members for insert to authenticated
  with check (
    public.is_admin(house_id)
    or (user_id = (select auth.uid()) and role = 'admin' and public.can_claim_house(house_id))
  );

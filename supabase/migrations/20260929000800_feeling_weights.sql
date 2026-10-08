-- Feeling weights (T25, PRD §8.2): one setting for the whole house that ANY member may change,
-- while the rest of the house row stays admin-only. RLS can't see the old row directly, so the
-- policy compares the new row with the stored one through a helper (evaluated before the update
-- lands). Keep in sync with lib/adapters/memory/db.ts.

create function public.only_feeling_weights_changed(
  h uuid, new_name text, new_address text, new_unit text, new_created_by uuid,
  new_created_at timestamptz, new_settings jsonb
) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (s.name, s.address, s.unit, s.created_by, s.created_at, s.settings - 'feeling_weights')
      is not distinct from
      (new_name, new_address, new_unit, new_created_by, new_created_at, new_settings - 'feeling_weights')
    from public.houses s where s.id = h
  ), false);
$$;

revoke execute on function public.only_feeling_weights_changed(uuid, text, text, text, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.only_feeling_weights_changed(uuid, text, text, text, uuid, timestamptz, jsonb) to authenticated, service_role;

create policy "houses members set feeling weights" on public.houses for update to authenticated
  using (public.is_member(id))
  with check (
    public.is_member(id)
    and public.only_feeling_weights_changed(id, name, address, unit, created_by, created_at, settings)
  );

-- Each weight is a known feeling, a number from -20 to 40, in steps of 5. Missing ones fall back
-- to the defaults when read.
create function public.valid_feeling_weights(w jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(
    key in ('anxious', 'frustrated', 'confused', 'fine', 'meh', 'thanks')
    and jsonb_typeof(value) = 'number'
    and (value #>> '{}')::numeric between -20 and 40
    and (value #>> '{}')::numeric % 5 = 0
  ), true)
  from jsonb_each(w);
$$;

alter table public.houses add constraint houses_feeling_weights_valid
  check (public.valid_feeling_weights(settings -> 'feeling_weights'));

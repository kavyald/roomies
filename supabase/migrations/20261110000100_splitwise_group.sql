-- The house's Splitwise group link (T89): a second setting any member may change, beside the
-- feeling weights. The helper behind "houses members set feeling weights" now ignores both keys,
-- and policy and helper are renamed for what they cover. Policies reach the helper by oid, so the
-- rename keeps the policy working. Keep in sync with lib/adapters/memory/db.ts.

alter function private.only_feeling_weights_changed(uuid, text, text, text, uuid, timestamptz, jsonb)
  rename to only_shared_settings_changed;

create or replace function private.only_shared_settings_changed(
  h uuid, new_name text, new_address text, new_unit text, new_created_by uuid,
  new_created_at timestamptz, new_settings jsonb
) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (s.name, s.address, s.unit, s.created_by, s.created_at,
            s.settings - 'feeling_weights' - 'splitwise_group')
      is not distinct from
      (new_name, new_address, new_unit, new_created_by, new_created_at,
       new_settings - 'feeling_weights' - 'splitwise_group')
    from public.houses s where s.id = h
  ), false);
$$;

alter policy "houses members set feeling weights" on public.houses
  rename to "houses members set shared settings";

-- The link is always the one shape the app writes (lib/domain/splitwise.ts), or absent.
alter table public.houses add constraint houses_splitwise_group_valid check (
  settings -> 'splitwise_group' is null
  or jsonb_typeof(settings -> 'splitwise_group') = 'null'
  or (settings ->> 'splitwise_group') ~ '^https://secure\.splitwise\.com/#/groups/[0-9]{1,15}$'
);

-- Activity: linking, changing or unlinking the group.
alter table public.activity_events drop constraint activity_events_kind_check;
alter table public.activity_events add constraint activity_events_kind_check check (kind in (
  'item.created', 'item.edited', 'item.done', 'item.reopened', 'item.archived', 'item.restored',
  'item.assigned', 'item.handled_by_changed', 'chore.done', 'chore.undone',
  'feeling.set', 'feeling.removed',
  'poll.created', 'poll.closed', 'poll.reopened', 'poll.deadline_changed', 'poll.option_added',
  'poll.voted', 'poll.vote_changed', 'poll.vote_withdrawn',
  'run.created', 'run.renamed', 'run.date_set', 'run.point_person_changed',
  'run.item_added', 'run.item_moved', 'run.item_returned', 'run.item_done',
  'request.sent', 'request.closed', 'run.finished',
  'cost.added', 'cost.edited', 'cost.removed', 'cost.splitwise_copied',
  'house.created', 'settings.feeling_weights_changed', 'settings.splitwise_changed',
  'invite.created', 'invite.revoked',
  'member.joined', 'member.room_changed', 'member.role_changed', 'member.moved_out', 'member.removed',
  'contact.created', 'contact.edited', 'contact.removed',
  'room.renamed', 'room.routine_changed',
  'routine.created', 'routine.updated', 'routine.removed'
));

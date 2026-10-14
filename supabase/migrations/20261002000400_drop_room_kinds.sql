-- Rooms are never added or archived from the app (T60, owner): the seeded rooms are renamed and
-- reordered only, so `room.added` and `room.archived` leave the activity_events kind list.
-- Nothing ever recorded them, so no stored row breaks the narrower check. `room.renamed` stays.

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
  'house.created', 'settings.feeling_weights_changed', 'invite.created', 'invite.revoked',
  'member.joined', 'member.room_changed', 'member.role_changed', 'member.moved_out', 'member.removed',
  'contact.created', 'contact.edited', 'contact.removed',
  'room.renamed'
));

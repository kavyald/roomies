-- Taking back your vote (T55, PRD §6.4): you delete your own vote row, only while the poll is
-- open. Reopening a closed poll and changing its deadline go through "polls update" (any member;
-- closed_at and closes_at can both be cleared), so they need nothing new here.

create policy "poll votes withdraw own while open" on public.poll_votes for delete to authenticated
  using (
    public.is_member(house_id) and user_id = (select auth.uid()) and public.poll_is_open(poll_id)
  );

grant delete on public.poll_votes to authenticated;

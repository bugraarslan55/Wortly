-- `saveCloudSession` uses upsert. PostgREST therefore needs UPDATE
-- privileges and an UPDATE policy in addition to INSERT.
-- No existing rows are changed by this migration.

grant select, insert, update on table public.study_sessions to authenticated;

drop policy if exists study_sessions_update_own on public.study_sessions;
create policy study_sessions_update_own on public.study_sessions
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

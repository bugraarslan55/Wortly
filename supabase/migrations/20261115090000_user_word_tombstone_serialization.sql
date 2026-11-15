-- Wortly: serialize a tombstone delete with a matching stale upsert.
-- The base tombstone migration is already applied in staging. Keep it immutable;
-- this migration updates only the existing trigger function bodies.

create or replace function public.record_user_word_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.user_id
     and exists (select 1 from auth.users u where u.id = old.user_id) then
    -- DELETE already holds the user_words row lock. Use the same per-word advisory
    -- key as the BEFORE INSERT trigger so a racing upsert cannot outrun the tombstone.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(old.user_id::text || ':' || old.id, 0)
    );
    insert into public.user_word_tombstones (user_id, word_id)
    values (old.user_id, old.id)
    on conflict (user_id, word_id) do update set deleted_at = now();
  end if;
  return old;
end;
$$;

create or replace function public.skip_tombstoned_user_word()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Match DELETE's lock order: existing row first, then the per-word advisory key.
  perform 1
  from public.user_words w
  where w.user_id = new.user_id and w.id = new.id
  for update;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text || ':' || new.id, 0)
  );

  if exists (
    select 1
    from public.user_word_tombstones t
    where t.user_id = new.user_id and t.word_id = new.id
  ) then
    return null;
  end if;
  return new;
end;
$$;

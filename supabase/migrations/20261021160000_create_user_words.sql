-- Wortly custom words owned by the signed-in user.
-- The static Goethe vocabulary remains bundled in the app.

create table if not exists public.user_words (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  german text not null,
  article text not null default '' check (article in ('der', 'die', 'das', '')),
  turkish text not null,
  plural text,
  example text,
  example_turkish text,
  mastery_level smallint not null default 0 check (mastery_level between 0 and 3),
  last_reviewed timestamptz,
  is_custom boolean not null default true,
  topic_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_words_user_id_idx on public.user_words (user_id);

alter table public.user_words enable row level security;

grant select, insert, update, delete on table public.user_words to authenticated;

create or replace function public.set_user_words_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_words_set_updated_at on public.user_words;
create trigger user_words_set_updated_at
  before update on public.user_words
  for each row execute procedure public.set_user_words_updated_at();

drop policy if exists user_words_select_own on public.user_words;
create policy user_words_select_own on public.user_words
  for select using (auth.uid() = user_id);

drop policy if exists user_words_insert_own on public.user_words;
create policy user_words_insert_own on public.user_words
  for insert with check (auth.uid() = user_id);

drop policy if exists user_words_update_own on public.user_words;
create policy user_words_update_own on public.user_words
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_words_delete_own on public.user_words;
create policy user_words_delete_own on public.user_words
  for delete using (auth.uid() = user_id);

-- Wortly study history owned by the signed-in user.
-- Session data remains available locally when the network is unavailable.

create table if not exists public.study_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('flashcard', 'yazma', 'dogru-yanlis', 'dinle-sec', 'dinle-yaz', 'bosluk', 'cumle')),
  word_ids jsonb not null default '[]'::jsonb,
  score integer not null check (score >= 0),
  total integer not null check (total >= 0),
  session_date timestamptz not null,
  topic_id text,
  created_at timestamptz not null default now()
);

create index if not exists study_sessions_user_date_idx
  on public.study_sessions (user_id, session_date desc);

alter table public.study_sessions enable row level security;

grant select, insert on table public.study_sessions to authenticated;

drop policy if exists study_sessions_select_own on public.study_sessions;
create policy study_sessions_select_own on public.study_sessions
  for select using (auth.uid() = user_id);

drop policy if exists study_sessions_insert_own on public.study_sessions;
create policy study_sessions_insert_own on public.study_sessions
  for insert with check (auth.uid() = user_id);

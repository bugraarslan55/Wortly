-- Wortly: Gerçek Hayat Senaryoları sonuçları, cihazlar arası.
--
-- STATUS: HAZIRLANDI, UYGULANMADI. Önce ayrı bir test Supabase projesinde denenmeli
-- (bkz. supabase/tests/STAGING_TEST_PLAN.md). İstemci bu tabloyu henüz kullanmaz.
--
-- Yalnızca ekleme (append-only): bir senaryo tamamlandığında bir sonuç satırı yazılır, sonradan
-- değiştirilmez veya silinmez. Bu yüzden iki cihaz arasında güncelleme çakışması yoktur.
--
-- Tekrar gönderim: birincil anahtar (user_id, id). Kimlik istemcide üretilir (zaman + rastgele).
-- İstemci `upsert(..., { onConflict: 'user_id,id', ignoreDuplicates: true })` kullanmalıdır
-- (INSERT ... ON CONFLICT DO NOTHING): yeniden gönderilen kayıt ikinci satır oluşturmaz ve UPDATE
-- yetkisi gerekmez (study_sessions için sonradan `repair` migration'ı gerekmesinin nedeni upsert'in
-- UPDATE ister olmasıydı). Anahtarın kullanıcıyı içermesi, başka bir kullanıcının aynı kimliği
-- kullanmasının (veya önceden kapmasının) bu kullanıcının kaydını engellemesini önler.
--
-- Zaman: `completed_at` istemci saatidir. Gelecekteki damga (şimdi + 5 dk üstü) sunucuda şimdiye
-- çekilir; `created_at` sunucu saatidir. Sıralama/analiz için `completed_at` kullanılır.
--
-- Tombstone migration (20261101090000) ile çakışmaz: farklı tablo, işlev ve tetikleyici adları.

create table if not exists public.scenario_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 8 and 80),
  scenario_id text not null check (char_length(scenario_id) between 1 and 200),
  score integer not null check (score >= 0),
  total integer not null check (total >= 1),
  completed_at timestamptz not null check (completed_at >= timestamptz '2020-01-01 00:00:00+00'),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint scenario_results_score_within_total check (score <= total)
);

create index if not exists scenario_results_user_completed_idx
  on public.scenario_results (user_id, completed_at desc);

alter table public.scenario_results enable row level security;

-- Yalnızca okuma ve ekleme. UPDATE/DELETE yetkisi ve politikası bilerek yoktur.
revoke all on table public.scenario_results from anon, authenticated;
grant select, insert on table public.scenario_results to authenticated;

drop policy if exists scenario_results_select_own on public.scenario_results;
create policy scenario_results_select_own on public.scenario_results
  for select using (auth.uid() = user_id);

drop policy if exists scenario_results_insert_own on public.scenario_results;
create policy scenario_results_insert_own on public.scenario_results
  for insert with check (auth.uid() = user_id);

create or replace function public.guard_scenario_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.completed_at > now() + interval '5 minutes' then
    new.completed_at := now();
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists scenario_results_guard on public.scenario_results;
create trigger scenario_results_guard
  before insert on public.scenario_results
  for each row execute procedure public.guard_scenario_result();

-- GERİ ALMA (gerekirse):
--   drop trigger if exists scenario_results_guard on public.scenario_results;
--   drop function if exists public.guard_scenario_result();
--   -- drop table public.scenario_results;   -- tüm senaryo sonuçlarını siler

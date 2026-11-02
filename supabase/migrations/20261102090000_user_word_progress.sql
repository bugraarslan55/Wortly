-- Wortly: konu (statik) kelimelerinin çalışma ilerlemesi (seviye + son tekrar), cihazlar arası.
--
-- STATUS: HAZIRLANDI, UYGULANMADI. Önce ayrı bir test Supabase projesinde denenmeli
-- (bkz. supabase/tests/STAGING_TEST_PLAN.md). İstemci bu tabloyu henüz kullanmaz.
--
-- Kapsam: Goethe/konu kelimeleri uygulamayla birlikte gelir (kimlikleri sabittir); kişisel
-- kelimelerin ilerlemesi `user_words` satırında kalır. Kelime başına TEK güncel durum tutulur
-- (her tekrar için satır yazılmaz), böylece tablo küçük kalır.
--
-- Çakışma politikası (istemcideki utils/progress-merge.ts ile aynıdır):
--   * `last_reviewed` daha YENİ olan yazma kazanır; seviyesi düşük olsa bile (yanlış cevap seviyeyi
--     düşürebilir, bu yüzden "yüksek seviye kazanır" kullanılmaz).
--   * Zaman damgaları eşitse yüksek seviye kazanır (iki taraf aynı sonuca yakınsar).
--   * Daha eski `last_reviewed` taşıyan (gecikmiş / bayat) yazma HATA VERMEDEN yok sayılır;
--     satır olduğu gibi kalır, istemci kuyruğu takılmaz.
--   * İstemci saatine tek başına güvenilmez: gelecekteki damgalar (şimdi + 5 dk üstü) sunucuda
--     şimdiye çekilir; `updated_at` her zaman SUNUCU saatidir ve artımlı çekme için güvenilirdir.
--   * Sınırlama: saati çok geri olan bir cihazın gerçek tekrarı, daha ileri tarihli bir kayıtla
--     karşılaşırsa kaybedebilir. Sunucu yalnızca ileri sapmayı sınırlayabilir.
--
-- Tekrar gönderim: (user_id, word_id) birincil anahtardır; PostgREST upsert aynı kaydı güvenle
-- yeniden yazar. Çevrimdışı birikmiş kayıtlar sonradan yüklendiğinde de yukarıdaki kural geçerlidir.
-- Silme yoktur (ilerleme kullanıcı tarafından silinmez); hesap silinince cascade ile temizlenir.
-- Bu nedenle tombstone gerekmez ve 20261101090000_user_word_tombstones.sql ile çakışmaz
-- (farklı tablolar, farklı tetikleyici ve işlev adları).

create table if not exists public.user_word_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id text not null check (char_length(word_id) between 1 and 200),
  mastery_level smallint not null default 0 check (mastery_level between 0 and 3),
  last_reviewed timestamptz not null check (last_reviewed >= timestamptz '2020-01-01 00:00:00+00'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

-- Artımlı çekme (updated_at > son senkron) için.
create index if not exists user_word_progress_user_updated_idx
  on public.user_word_progress (user_id, updated_at);

alter table public.user_word_progress enable row level security;

-- Supabase'in varsayılan geniş yetkileri geri alınır; yalnızca gerekenler verilir. DELETE yok.
revoke all on table public.user_word_progress from anon, authenticated;
grant select, insert, update on table public.user_word_progress to authenticated;

drop policy if exists user_word_progress_select_own on public.user_word_progress;
create policy user_word_progress_select_own on public.user_word_progress
  for select using (auth.uid() = user_id);

drop policy if exists user_word_progress_insert_own on public.user_word_progress;
create policy user_word_progress_insert_own on public.user_word_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists user_word_progress_update_own on public.user_word_progress;
create policy user_word_progress_update_own on public.user_word_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Çakışma koruması. SECURITY INVOKER: başka tabloya erişmez, ek yetki gerekmez.
-- INSERT ... ON CONFLICT DO UPDATE yolunda da BEFORE UPDATE tetikleyicisi çalışır.
create or replace function public.guard_user_word_progress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Gelecekteki damga (istemci saati ileri): şimdiye çek.
  if new.last_reviewed > now() + interval '5 minutes' then
    new.last_reviewed := now();
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- Satır sahibi ve anahtar değiştirilemez.
  new.user_id := old.user_id;
  new.word_id := old.word_id;
  new.created_at := old.created_at;

  -- Bayat yazma: daha eski damga mevcut kaydı geri alamaz (sessizce yok sayılır).
  if new.last_reviewed < old.last_reviewed then
    return old;
  end if;

  -- Aynı an: yalnızca daha yüksek seviye kabul edilir (sıradan bağımsız yakınsama).
  if new.last_reviewed = old.last_reviewed and new.mastery_level <= old.mastery_level then
    return old;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_word_progress_guard on public.user_word_progress;
create trigger user_word_progress_guard
  before insert or update on public.user_word_progress
  for each row execute procedure public.guard_user_word_progress();

-- GERİ ALMA (gerekirse; kayıtlar dışında bir şeye dokunmaz):
--   drop trigger if exists user_word_progress_guard on public.user_word_progress;
--   drop function if exists public.guard_user_word_progress();
--   -- drop table public.user_word_progress;   -- tüm ilerleme kayıtlarını siler

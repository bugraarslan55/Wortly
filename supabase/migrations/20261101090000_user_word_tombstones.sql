-- Wortly: kelime silmelerini cihazlar arasında kalıcı yapan tombstone tablosu.
--
-- STATUS: HAZIRLANDI, UYGULANMADI. Önce staging/branch veritabanında denenmeli.
--
-- Amaç: Bir cihazda silinen kelimenin, silmeyi görmemiş başka bir cihazın eski yerel
-- kopyasından yeniden buluta yazılmasını (dirilme) sunucu tarafında engellemek.
--
-- Tasarım (geri uyumlu):
--   * `user_words` tablosuna, politikalarına ve sütunlarına DOKUNULMAZ. Eski ve yeni
--     istemciler aynı sorguları aynı sonuçlarla çalıştırmaya devam eder.
--   * Silme (DELETE) yine fiziksel silmedir; bir AFTER DELETE tetikleyicisi silineni
--     `user_word_tombstones` tablosuna yazar. Böylece ESKİ iOS sürümlerinin silmeleri de
--     otomatik olarak tombstone üretir.
--   * Tombstone'lu bir kimlikle gelen INSERT (eski kopyadan "upsert") sessizce atlanır
--     (BEFORE INSERT, NULL döner): istemci hata almaz, bekleyen kaydı takılı kalmaz.
--   * Hesap silinirken (auth.users cascade) tombstone üretilmez: ya `auth.uid()` eşleşmez ya da
--     kullanıcı satırı artık yoktur (aksi halde FK hatası hesap silmeyi engellerdi).
--   * Yetki: yalnızca silme tetikleyicisi SECURITY DEFINER'dır (istemcinin yazma yetkisi yok);
--     atlama tetikleyicisi SECURITY INVOKER'dır, böylece başka kullanıcının tombstone'u
--     RLS nedeniyle görünmez ve varlığı hata/sessizlik farkıyla sızdırılamaz.
--   * Bu dosya, supabase/tests/user_word_tombstones.test.js ile yerel PostgreSQL'de sınanır.
--   * Migration öncesinde silinmiş kelimeler için tombstone yoktur; onlar geri yazılabilir.
--
-- Neden `user_words.deleted_at` sütunu değil: sütun + gizleyen SELECT politikası, eski
-- istemcilerin upsert'lerini RLS hatasına çevirir (ON CONFLICT, mevcut satırı da
-- politikayla denetler); eski istemci başarısız kaydı yeniden denemeyi bırakmaz ve
-- sonraki bekleyen kayıtları da bloklar. Politikayı değiştirmezsek eski istemciler
-- silinmiş satırları okumaya devam eder. Ayrı tablo bu iki sorunu da yaratmaz.
--
-- Saklama süresi: tombstone'lar OTOMATİK TEMİZLENMEZ. Bir cihazın en son ne zaman
-- senkronize olduğu bilinmediği için güvenli bir süre yoktur; temizlik yalnızca hesap
-- silinince (cascade) olur. Kayıtlar küçüktür (kullanıcı, kimlik, zaman).

create table if not exists public.user_word_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

alter table public.user_word_tombstones enable row level security;

-- İstemciler yalnızca kendi tombstone'larını OKUYABİLİR. Supabase'in varsayılan geniş
-- tablo yetkileri geri alınır; yazma yalnızca aşağıdaki SECURITY DEFINER tetikleyici
-- işleviyle yapılır.
revoke all on table public.user_word_tombstones from anon, authenticated;
grant select on table public.user_word_tombstones to authenticated;

drop policy if exists user_word_tombstones_select_own on public.user_word_tombstones;
create policy user_word_tombstones_select_own on public.user_word_tombstones
  for select using (auth.uid() = user_id);

create or replace function public.record_user_word_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Yalnızca kullanıcının kendi silmesi tombstone üretir (cascade/yönetici silmesi değil).
  -- Kullanıcı satırı artık yoksa (hesap siliniyor) atlanır: FK hatası hesap silmeyi bozardı.
  if auth.uid() is not null
     and auth.uid() = old.user_id
     and exists (select 1 from auth.users u where u.id = old.user_id) then
    insert into public.user_word_tombstones (user_id, word_id)
    values (old.user_id, old.id)
    on conflict (user_id, word_id) do update set deleted_at = now();
  end if;
  return old;
end;
$$;

revoke all on function public.record_user_word_tombstone() from public, anon, authenticated;

drop trigger if exists user_words_record_tombstone on public.user_words;
create trigger user_words_record_tombstone
  after delete on public.user_words
  for each row execute procedure public.record_user_word_tombstone();

-- SECURITY INVOKER: çağıranın RLS'i geçerli olduğundan yalnızca kendi tombstone'ları
-- görünür. Başka kullanıcı adına yazma girişimi tombstone'un varlığından bağımsız olarak
-- aynı RLS hatasıyla biter.
create or replace function public.skip_tombstoned_user_word()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.user_word_tombstones t
    where t.user_id = new.user_id and t.word_id = new.id
  ) then
    return null; -- satırı sessizce atla; silinmiş kelime dirilmez
  end if;
  return new;
end;
$$;

drop trigger if exists user_words_skip_tombstoned on public.user_words;
create trigger user_words_skip_tombstoned
  before insert on public.user_words
  for each row execute procedure public.skip_tombstoned_user_word();

-- GERİ ALMA (gerekirse; veriye dokunmaz, yalnızca koruma kalkar):
--   drop trigger if exists user_words_skip_tombstoned on public.user_words;
--   drop trigger if exists user_words_record_tombstone on public.user_words;
--   drop function if exists public.skip_tombstoned_user_word();
--   drop function if exists public.record_user_word_tombstone();
--   -- Tablo kalıcı kayıt olarak bırakılabilir ya da: drop table public.user_word_tombstones;

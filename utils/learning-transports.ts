import type { ProgressRow, ProgressTransport, ScenarioRow, ScenarioTransport } from './learning-sync';

// Supabase (PostgREST) taşıyıcıları. Uygulama (store) gerçek istemciyi, entegrasyon testi ise TEST
// projesinin kullanıcı istemcisini verir; böylece testler uygulamayla AYNI sorguları çalıştırır.
//
// Yetki: yalnızca oturum açmış kullanıcının kendi satırları (RLS). service_role burada kullanılmaz.

/** Yalnızca kullandığımız parça: `from(tablo)`. */
export interface SupabaseLike {
  from: (table: string) => any;
}

export interface TransportOptions {
  /** İstek zaman aşımı sarmalayıcısı; verilmezse istek olduğu gibi beklenir. */
  withTimeout?: <T>(promise: PromiseLike<T>, fallback: T) => Promise<T>;
  /** Zaman aşımında/hata durumunda dönecek hata nesnesi. */
  timeoutError?: { message: string };
  /** Hata mesajı bildirimi (log). Gizli bilgi içermemelidir. */
  onError?: (message: string) => void;
}

const passthrough = <T,>(promise: PromiseLike<T>, fallback: T): Promise<T> =>
  Promise.resolve(promise).catch(() => fallback);

export function createProgressTransport(
  client: SupabaseLike,
  userId: string,
  options: TransportOptions = {},
): ProgressTransport {
  const guard = options.withTimeout ?? passthrough;
  const timeoutError = options.timeoutError ?? { message: 'İstek başarısız.' };
  const report = options.onError ?? (() => undefined);

  return {
    fetchPage: async (from, to) => {
      const { data, error } = await guard(
        client
          .from('user_word_progress')
          .select('word_id, mastery_level, last_reviewed')
          .eq('user_id', userId)
          .order('word_id', { ascending: true })
          .range(from, to),
        { data: null, error: timeoutError } as any,
      );
      if (error) {
        report(`Konu ilerlemesi buluttan okunamadı: ${error.message}`);
        return { rows: null, error: true };
      }
      return { rows: (data ?? []) as ProgressRow[], error: false };
    },
    upsert: async (rows) => {
      const { error } = await guard(
        client
          .from('user_word_progress')
          .upsert(rows.map(row => ({ ...row, user_id: userId })), { onConflict: 'user_id,word_id' }),
        { error: timeoutError } as any,
      );
      if (error) {
        report(`Konu ilerlemesi buluta gönderilemedi: ${error.message}`);
        return false;
      }
      return true;
    },
  };
}

export function createScenarioTransport(
  client: SupabaseLike,
  userId: string,
  options: TransportOptions = {},
): ScenarioTransport {
  const guard = options.withTimeout ?? passthrough;
  const timeoutError = options.timeoutError ?? { message: 'İstek başarısız.' };
  const report = options.onError ?? (() => undefined);

  return {
    fetchPage: async (from, to) => {
      const { data, error } = await guard(
        client
          .from('scenario_results')
          .select('id, scenario_id, score, total, completed_at')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
        { data: null, error: timeoutError } as any,
      );
      if (error) {
        report(`Senaryo sonuçları buluttan okunamadı: ${error.message}`);
        return { rows: null, error: true };
      }
      return { rows: (data ?? []) as ScenarioRow[], error: false };
    },
    insert: async (rows) => {
      // Yinelenen kimlikler sunucuda yok sayılır (ON CONFLICT DO NOTHING); UPDATE yetkisi gerekmez.
      const { error } = await guard(
        client
          .from('scenario_results')
          .upsert(rows.map(row => ({ ...row, user_id: userId })), { onConflict: 'user_id,id', ignoreDuplicates: true }),
        { error: timeoutError } as any,
      );
      if (error) {
        report(`Senaryo sonuçları buluta gönderilemedi: ${error.message}`);
        return false;
      }
      return true;
    },
    count: async () => {
      // Satırları indirmeden bulutta kayıtlı toplam sonuç sayısı. Başarısızsa null (sayı uydurulmaz).
      const { count, error } = await guard(
        client.from('scenario_results').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        { count: null, error: timeoutError } as any,
      );
      return !error && typeof count === 'number' ? count : null;
    },
  };
}

// Zaman damgası yardımcıları (saf, bağımlılıksız). Eşitleme birleştirmesi ve günlük görev hesapları
// gibi farklı özellikler aynı doğrulama kurallarını paylaşır.

/** 2020-01-01 öncesi veya sayısal olmayan değerler geçersizdir. */
export const MIN_VALID_TIMESTAMP = Date.UTC(2020, 0, 1);
/** Cihaz saatinin ileri sapmasına tanınan pay; sunucudaki 5 dakikalık sınırla aynı. */
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Geçerli bir ms zaman damgası döndürür; aksi halde undefined. İleri tarihliyse `now`a çeker. */
export function normalizeTimestamp(value: unknown, now: number = Date.now()): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(number) || number < MIN_VALID_TIMESTAMP) return undefined;
  return number > now + MAX_FUTURE_SKEW_MS ? now : number;
}

/**
 * Görev/rozet hesapları için katı zaman damgası: geçersiz VEYA gelecekteki (şimdi + 5 dk üstü) damgalar
 * yok sayılır (undefined). Senkron birleştirmesindeki `normalizeTimestamp` ileri damgayı "şimdi"ye çeker;
 * ama bozuk/ileri tarihli bir kayıt bugünün ilerlemesi gibi sayılmamalıdır.
 */
export function strictTimestamp(value: unknown, now: number = Date.now()): number | undefined {
  const timestamp = normalizeTimestamp(value, Number.MAX_SAFE_INTEGER);
  if (timestamp === undefined || timestamp > now + MAX_FUTURE_SKEW_MS) return undefined;
  return timestamp;
}

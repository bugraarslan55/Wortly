// Supabase Auth hata iletilerini kullanıcıya anlaşılır Türkçe mesaja çevirir (saf mantık; ham ileti ASLA gösterilmez).
export function getAuthMessage(message: string | null | undefined): string {
  const normalized = String(message ?? '').toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (normalized.includes('user already registered')) return 'Bu e-posta zaten kayıtlı.';
  if (normalized.includes('password should be at least')) return 'Şifre en az 6 karakter olmalı.';
  if (normalized.includes('email not confirmed')) return 'Önce e-posta adresini doğrulamalısın.';
  if (normalized.includes('rate limit')) return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.';
  // Ağ sorunları: kullanıcı ne yapacağını bilsin (iş "bir hata oluştu" ile bitmesin).
  if (/(network|fetch|timeout|timed out|offline|çevrimdışı|failed to connect|connection)/.test(normalized)) {
    return 'Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.';
  }
  return 'İşlem sırasında bir hata oluştu. Lütfen tekrar dene.';
}

export const UNEXPECTED_AUTH_ERROR_MESSAGE = 'Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.';

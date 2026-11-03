import { createLatestGuard } from './latest-guard';

// Ortak backend (TEST MODU) hesap kapısı — saf mantık.
//
// ÖNEMLİ: Bu kontrol İSTEMCİ TARAFLI bir emniyet önlemidir; gerçek güvenlik sınırı Supabase Auth ve RLS'tir
// (bir hesap yalnızca kendi satırlarına erişir). Amaç, geliştirme sırasında yanlışlıkla gerçek bir kullanıcı hesabıyla
// giriş yapıp o hesabın verisini deneysel kodla değiştirmeyi önlemektir. İzin, e-posta ile değil Supabase sunucusunun
// DOĞRULADIĞI auth kullanıcı kimliği (auth.getUser) ile verilir.

/** Virgül/boşlukla ayrılmış kullanıcı kimlikleri (UUID); geçersiz biçimler atılır, küçük harfe çevrilir, tekilleştirilir. */
export function parseAllowedUserIds(value: string | null | undefined): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  return Array.from(new Set(
    String(value ?? '').split(/[\s,;]+/).map(item => item.trim().toLowerCase()).filter(item => uuid.test(item)),
  ));
}

export type Verification =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'ok'; serverUserId: string };

export type AccountGate = 'open' | 'initializing' | 'verifying' | 'denied' | 'unverifiable';

/**
 * Uygulama içeriğinin (oturum sonrası veri yükleme, yazma, bildirim, senkron) başlayıp başlayamayacağı.
 * 'open' yalnızca (a) ortak backend modu kapalıyken, (b) oturum yokken (giriş ekranı; veri akışı başlamaz) veya
 * (c) sunucunun doğruladığı kullanıcı izin listesindeyken döner. Eksik/belirsiz her durum KAPALIDIR.
 */
export function evaluateAccountGate(input: {
  sharedMode: boolean;
  authLoaded: boolean;
  sessionUserId: string | null | undefined;
  verification: Verification;
  allowedUserIds: readonly string[];
}): AccountGate {
  if (!input.sharedMode) return 'open';
  if (!input.authLoaded) return 'initializing';
  const sessionUserId = String(input.sessionUserId ?? '').trim().toLowerCase();
  if (!sessionUserId) return 'open';
  if (input.verification.status === 'pending') return 'verifying';
  if (input.verification.status === 'error') return 'unverifiable';
  const serverUserId = String(input.verification.serverUserId ?? '').trim().toLowerCase();
  if (!serverUserId || serverUserId !== sessionUserId) return 'denied'; // sunucu başka kullanıcı diyorsa güvenme
  return input.allowedUserIds.map(id => id.toLowerCase()).includes(serverUserId) ? 'open' : 'denied';
}

type GetUser = () => Promise<{ data: { user: { id: string } | null } | null; error: unknown }>;

/**
 * Oturumdaki kullanıcıyı sunucuya doğrulatır. "Son istek kazanır": hesap A'dan B'ye geçerken ya da oturum kapanırken
 * A için başlamış geç bir yanıt SONUCU ASLA uygulanmaz (veri sızıntısı/yanlış izin olmaz).
 */
export function createAccountVerifier(getUser: GetUser, onResult: (sessionUserId: string, verification: Verification) => void) {
  const guard = createLatestGuard();
  return {
    verify(sessionUserId: string): Promise<void> {
      const token = guard.begin();
      const apply = (verification: Verification) => {
        if (guard.isLatest(token)) onResult(sessionUserId, verification);
      };
      let pending: Promise<void>;
      try {
        pending = getUser().then(
          (result) => {
            const id = result?.data?.user?.id;
            if (result?.error || !id) apply({ status: 'error' });
            else apply({ status: 'ok', serverUserId: id });
          },
          () => apply({ status: 'error' }),
        );
      } catch {
        apply({ status: 'error' });
        pending = Promise.resolve();
      }
      return pending;
    },
    /** Oturum kapandı/sıfırlandı: süren doğrulamaların sonucu uygulanmaz. */
    cancel() { guard.invalidate(); },
  };
}

export const SHARED_BACKEND_SIGN_UP_MESSAGE =
  'Test modunda ortak veritabanında yeni hesap oluşturulamaz. Önceden belirlenmiş test hesabıyla giriş yap.';
export const SHARED_BACKEND_RESET_MESSAGE =
  'Test modunda ortak veritabanında şifre sıfırlama e-postası gönderilemez.';

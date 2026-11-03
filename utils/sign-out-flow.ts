// Çıkış akışının saf mantığı (Supabase, depolama ve bildirim API'leri enjekte edilir; test edilebilir).
//
// Sıra: (1) bildirim sahipliğini SENKRON geri al (süren planlamalar bildirim kuramaz), (2) uzak çıkışı yap,
// (3a) başarısızsa (hata dönerse ya da istisna fırlatırsa) oturum açık kalır: yerel veri SİLİNMEZ, bildirim
// sahipliği geri yüklenir; (3b) başarılıysa yerel veriyi ve Wortly bildirimlerini temizle, oturumu kapat.

export interface SignOutDeps {
  /** Süren bildirim planlamalarını anında geçersiz kılar. */
  revokeOwner(): void;
  /** Çıkış başarısız oldu: aynı kullanıcı için yeni bir sahiplik dönemi başlatır (eski planlar geçerli OLMAZ). */
  restoreOwner(userId: string): void;
  /** Uzak çıkış; Supabase hatayı `{ error }` olarak döndürür ya da ağ hatasında fırlatabilir. */
  remoteSignOut(): Promise<{ error: unknown } | void>;
  /** Yerel kullanıcı verisini ve Wortly bildirimlerini temizler. */
  wipeLocal(): Promise<void>;
  clearSession(): void;
}

export type SignOutResult = { ok: true } | { ok: false; message: string };

export const SIGN_OUT_FAILED_MESSAGE =
  'Çıkış yapılamadı. İnternet bağlantını kontrol edip tekrar dene. Hesabın ve verilerin olduğu gibi duruyor.';

export async function runSignOut(userId: string | null | undefined, deps: SignOutDeps): Promise<SignOutResult> {
  deps.revokeOwner();

  let failed = false;
  try {
    const result = await deps.remoteSignOut();
    failed = !!result && 'error' in result && !!result.error;
  } catch {
    failed = true;
  }

  if (failed) {
    // Oturum hâlâ açık: yerel veriye dokunma, bildirim sahipliğini geri ver.
    if (userId) deps.restoreOwner(userId);
    return { ok: false, message: SIGN_OUT_FAILED_MESSAGE };
  }

  try {
    await deps.wipeLocal();
  } finally {
    // Temizlik hata verse de uzak oturum kapandı; arayüz eski oturumda kalmasın.
    deps.clearSession();
  }
  return { ok: true };
}

// Şifre sıfırlama kapısı (saf).
//
// `supabase.auth.updateUser({ password })` her zaman O ANDA AÇIK OLAN oturumun hesabını günceller. Sıfırlama bağlantısı bu
// cihazda doğrulanmadıysa (kod başka yerde harcandı, doğrulayıcı yok, süre doldu) açık oturum başka bir hesabınki olabilir ve
// yeni şifre YANLIŞ hesaba uygulanır. Bu yüzden şifre formu yalnızca, bu cihazda başarıyla değiştirilmiş bir "recovery" kodunun
// kurduğu oturum için açılır.

/** none: sıfırlama bağlantısı işlenmedi | verifying: kod değişimi sürüyor | ready: doğrulandı | failed: değişim başarısız. */
export type RecoveryStatus = 'none' | 'verifying' | 'ready' | 'failed';
export type ResetGate = 'ready' | 'verifying' | 'blocked';

export function resetGate(input: {
  sessionUserId: string | null | undefined;
  recoveryUserId: string | null | undefined;
  status: RecoveryStatus;
  /** Ekran açıldıktan sonra bağlantının işlenmesi için beklenen kısa süre geçti mi? */
  waited: boolean;
}): ResetGate {
  const { sessionUserId, recoveryUserId, status, waited } = input;
  if (status === 'ready' && sessionUserId && recoveryUserId === sessionUserId) return 'ready';
  if (status === 'verifying') return 'verifying';
  // Bağlantı henüz işlenmemiş olabilir (ekran, bağlantı işleyiciden önce açılabilir): kısa süre "doğrulanıyor" göster.
  if (status === 'none' && !waited) return 'verifying';
  return 'blocked';
}

/** Hangi hesabın sıfırlandığını gösterir ama tam adresi vermez: "bu***@hotmail.com". Geçersiz girdi için boş metin. */
export function maskEmail(email: string | null | undefined): string {
  const value = String(email ?? '');
  const at = value.indexOf('@');
  if (at < 1 || at === value.length - 1) return '';
  return `${value.slice(0, Math.min(2, at))}***${value.slice(at)}`;
}

// Hesap silmenin saf mantığı (Supabase, depolama, bildirim ve ağ API'leri enjekte edilir; test edilebilir).
//
// Sıra ve güvenceler:
//  (1) Çevrimdışıysa HİÇBİR ŞEY başlamaz (yerel veri, oturum ve bildirimler olduğu gibi kalır).
//  (2) Bildirim sahipliği SENKRON geri alınır; sunucu silmesi sürerken yeni bildirim planlanmaz.
//  (3) Sunucu silmesi başarısızsa (ağ, yetki, sunucu) yerel veriye ve oturuma DOKUNULMAZ; bildirim sahipliği geri yüklenir.
//  (4) Sunucu silmesi başarılıysa hesap artık yoktur: yalnızca O hesabın yerel verisi temizlenir ve oturum kapatılır.
//      Yerel temizlik hata verse de oturum kapanır (silinmiş hesapla açık kalınmaz); hata `localCleanupFailed` ile bildirilir.

/** Sunucu işlevine gönderilen bilinçli onay (supabase/functions/delete-account/handler.ts ile aynı olmalı). */
export const ACCOUNT_DELETE_CONFIRM_VALUE = 'DELETE_MY_ACCOUNT';

export type AccountDeletionFailure = 'no-session' | 'offline' | 'network' | 'unauthorized' | 'unavailable' | 'server';

export type RemoteDeleteResult = { ok: true } | { ok: false; reason: Exclude<AccountDeletionFailure, 'no-session' | 'offline'> };

export const ACCOUNT_DELETION_MESSAGES: Record<AccountDeletionFailure, string> = {
  'no-session': 'Oturum bulunamadı. Çıkış yapıp tekrar giriş yap ve yeniden dene.',
  offline: 'İnternet bağlantısı yok. Hesap silme için bağlantı gerekir. Hesabın ve verilerin olduğu gibi duruyor.',
  // Yanıt gelmediyse sunucunun silmeyi bitirip bitirmediği bilinemez: kesin bir ifade kullanılmaz.
  network: 'Bağlantı kesildiği için sonuç doğrulanamadı. Verilerin cihazında duruyor. İnternetini kontrol edip tekrar dene; hesap silinmişse giriş yapılamaz.',
  unauthorized: 'Oturumun doğrulanamadı. Çıkış yapıp tekrar giriş yap ve yeniden dene. Hesabın ve verilerin olduğu gibi duruyor.',
  unavailable: 'Hesap silme hizmetine şu an ulaşılamıyor. Biraz sonra tekrar dene. Hesabın ve verilerin olduğu gibi duruyor.',
  server: 'Hesap silinemedi. Biraz sonra tekrar dene. Hesabın ve verilerin olduğu gibi duruyor.',
};

/** Hesap sunucuda silindi ama yerel temizlik tamamlanamadıysa kullanıcıya gösterilir (tüm yerel verilerin silinmediğini açıkça söyler). */
export const ACCOUNT_DELETED_LOCAL_INCOMPLETE_MESSAGE =
  'Hesabın ve bulut verilerin kalıcı olarak silindi. Ancak bu cihazdaki yerel verilerin tamamı silinemedi; telaffuz kayıtları, hatırlatmalar veya bazı kayıtlar kalmış olabilir. Kalanları silmek için uygulamayı cihazdan kaldır.';

export interface AccountDeletionDeps {
  /** Sunucuya ulaşılabiliyor mu? false ise hiçbir şey başlamaz. */
  isOnline(): Promise<boolean>;
  /** Süren bildirim planlamalarını anında geçersiz kılar. */
  revokeOwner(): void;
  /** Silme başarısız: aynı kullanıcı için yeni bir bildirim sahiplik dönemi başlatır. */
  restoreOwner(userId: string): void;
  /** Sunucuda hesabı siler (kimlik: oturumdaki erişim belirteci). Asla fırlatmamalıdır; fırlatırsa 'network' sayılır. */
  remoteDelete(): Promise<RemoteDeleteResult>;
  /** Yalnızca bu hesabın yerel verisini ve bekleyen eşitleme kayıtlarını temizler. Hata fırlatabilir. */
  wipeLocal(userId: string): Promise<void>;
  /** Yerel Supabase oturumunu kapatır (sunucuda hesap yok; ağ çağrısı yapmaz). Hata fırlatabilir. */
  endSession(): Promise<void>;
  clearSession(): void;
}

export type AccountDeletionResult =
  | { ok: true; localCleanupFailed: boolean }
  | { ok: false; reason: AccountDeletionFailure; message: string };

const failure = (reason: AccountDeletionFailure): AccountDeletionResult => ({
  ok: false, reason, message: ACCOUNT_DELETION_MESSAGES[reason],
});

export async function runAccountDeletion(
  userId: string | null | undefined,
  deps: AccountDeletionDeps,
): Promise<AccountDeletionResult> {
  if (!userId) return failure('no-session');

  let online = false;
  try {
    online = await deps.isOnline();
  } catch {
    online = false;
  }
  if (!online) return failure('offline');

  deps.revokeOwner();

  let remote: RemoteDeleteResult;
  try {
    remote = await deps.remoteDelete();
  } catch {
    remote = { ok: false, reason: 'network' };
  }
  if (!remote.ok) {
    deps.restoreOwner(userId);
    return failure(remote.reason);
  }

  let localCleanupFailed = false;
  try {
    await deps.wipeLocal(userId);
  } catch {
    localCleanupFailed = true;
  }
  try {
    await deps.endSession();
  } catch {
    // Oturum kaydı silinemese bile arayüz oturumu kapatılır; sunucuda hesap zaten yoktur.
  } finally {
    deps.clearSession();
  }
  return { ok: true, localCleanupFailed };
}

// ─── Sunucu yanıtının yorumlanması ───────────────────────────────────────────────────────────────────────

interface InvokeError {
  name?: string;
  context?: { status?: number } | null;
}

/**
 * `supabase.functions.invoke` sonucunu yorumlar. Yalnızca sunucunun açık `{ ok: true }` yanıtı başarıdır;
 * belirsiz her şey başarısızlık sayılır (yerel veri bu durumda silinmez).
 */
export function interpretDeleteResponse(result: { data?: unknown; error?: unknown } | null | undefined): RemoteDeleteResult {
  const error = result?.error as InvokeError | null | undefined;
  if (!error) {
    const data = result?.data as { ok?: unknown } | null | undefined;
    return data && data.ok === true ? { ok: true } : { ok: false, reason: 'server' };
  }
  if (error.name === 'FunctionsHttpError') {
    const status = error.context?.status;
    if (status === 401 || status === 403) return { ok: false, reason: 'unauthorized' };
    if (status === 404 || status === 503) return { ok: false, reason: 'unavailable' };
    return { ok: false, reason: 'server' };
  }
  // FunctionsFetchError (ağ), FunctionsRelayError ve diğer beklenmeyenler.
  return { ok: false, reason: error.name === 'FunctionsRelayError' ? 'unavailable' : 'network' };
}

// ─── Yalnızca bu hesabın yerel verisi ─────────────────────────────────────────────────────────────────────

const LOCAL_PREFIX = '@wortly:';

/** Supabase kullanıcı kimlikleri UUID'dir; bundan kısa/farklı bir değerle anahtar eşleştirmesi yapılmaz (yanlış silme riski). */
export const isSafeUserId = (userId: string | null | undefined): userId is string =>
  typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

/**
 * Silinecek yerel anahtarlar: Wortly anahtarlarından, kullanıcı kimliğini TAM bir parça (':' ile ayrılmış) olarak içerenler.
 * Örnekler: `@wortly:phrasebook:<id>`, `@wortly:scenario-results:<id>`, `@wortly:parked:<id>:words:<zaman>`,
 * `@wortly:pronunciations:<id>:kept`, `@wortly:corrupt:@wortly:phrasebook:<id>:<zaman>`. Başka kullanıcıya ait,
 * cihaz geneli (tema, işlenmiş bildirim dokunuşları) ve Wortly dışı anahtarlar (Supabase oturumu) seçilmez.
 */
export function selectAccountStorageKeys(allKeys: readonly string[], userId: string): string[] {
  if (!isSafeUserId(userId)) return [];
  return allKeys.filter(key => key.startsWith(LOCAL_PREFIX) && key.split(':').includes(userId));
}

interface PendingLike {
  userId: string | null;
}

/** Bekleyen eşitleme kuyruğundan YALNIZCA bu kullanıcının kayıtlarını çıkarır; başkalarına (ve sahibi bilinmeyenlere) dokunmaz. */
export function removeUserPending<T extends PendingLike>(changes: readonly T[], userId: string): T[] {
  return changes.filter(change => change.userId !== userId);
}

/** Bu cihazdaki hesap geçmişinden yalnızca bu kullanıcıyı çıkarır. */
export function removeDeviceAccount(accounts: readonly string[], userId: string): string[] {
  return accounts.filter(account => account !== userId);
}

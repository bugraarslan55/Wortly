import {
  actionFor, Dataset, ParkKind, parkedKey, parkedKeysFor, unwrapParked, verdictFor, wrapParked,
} from './data-ownership';

// Kişisel verinin sahiplik uzlaştırması, park etme ve geri yükleme işlemleri. Depolama bağımlılık olarak ENJEKTE
// edilir (AsyncStorage'a benzer arayüz), bu yüzden okuma/yazma hataları, yarıda kesilme ve eşzamanlılık gerçeğe yakın
// şekilde test edilebilir. Mağaza aynı kodu AsyncStorage adaptörüyle kullanır.
//
// Tasarım ilkeleri (veri kaybını her şeyin üstünde tut):
// - SİLME YOK: başka kullanıcıya ait / sahibi bilinmeyen veri önce park edilir, park DOĞRULANMADAN yerel kopya silinmez.
// - İDEMPOTENT: aynı içerik aynı sahip/küme için ikinci kez park edilmez; geri yükleme birleştirme (kimliğe göre) olduğu için
//   tekrarlanabilir; park kaydı yalnızca geri yükleme BAŞARIYLA uygulandıktan sonra kaldırılır.
// - KESİNTİYE DAYANIKLI: her adım arasında uygulama kapansa bile bir sonraki çalıştırma kaldığı yerden güvenle devam eder
//   (veri ya yerinde ya parkta vardır; ikisi birden olması zararsızdır).

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export const OWNER_KEYS: Record<Dataset, string> = {
  profile: '@wortly:profile-owner',
  words: '@wortly:words-owner',
  review: '@wortly:review-owner',
  sessions: '@wortly:sessions-owner',
};

export type ParkResult = 'parked' | 'duplicate' | 'failed';
export type ReconcileResult = 'kept' | 'adopted' | 'parked' | 'failed';

export interface ReconcileOptions {
  dataset: Dataset;
  userId: string;
  /** Bellekteki/yerel verinin ham (JSON) hali. */
  rawData: string;
  hasData: boolean;
  /** Bu kullanıcı adına kuyruğa alınmış bekleyen değişiklik (sahiplik kanıtı). */
  hasOwnPendingChange: boolean;
  /** Yerel (bellek + depolama) kopyayı boşaltır. Yalnızca park DOĞRULANDIKTAN sonra çağrılır. */
  clearLocal: () => Promise<void>;
  /** Sahibi bu kullanıcı olan park edilmiş veriyi yerel veriye uygular; başarılıysa true (park kaydı o zaman kaldırılır). */
  applyParked: (parsed: unknown) => Promise<boolean>;
}

export function createDataIsolation(storage: KeyValueStorage, now: () => number = Date.now) {
  // Park / uzlaştırma / geri yükleme işlemleri SIRAYLA çalışır: eşzamanlı çağrılar (çift dokunuş, üst üste eşitleme)
  // aynı veriyi iki kez park etmez ve birbirinin yarım kalmış adımını görmez.
  let chain: Promise<unknown> = Promise.resolve();
  function locked<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  }

  const safe = async <T>(task: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await task();
    } catch {
      return fallback;
    }
  };

  async function allKeys(): Promise<readonly string[]> {
    return safe(() => storage.getAllKeys(), [] as readonly string[]);
  }

  async function parkedKeys(ownerId: string, dataset?: ParkKind): Promise<string[]> {
    return parkedKeysFor(await allKeys(), ownerId, dataset);
  }

  async function readParked<T>(key: string): Promise<T | null> {
    const envelope = unwrapParked(await safe(() => storage.getItem(key), null));
    if (!envelope) return null;
    try {
      return JSON.parse(envelope.raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Veriyi sahibinin anahtarıyla park eder. Aynı içerik zaten parktaysa tekrar yazmaz ('duplicate': uygulama park
   * ile yerel temizleme arasında kapanıp yeniden denendiyse). Yazım okunarak DOĞRULANIR; doğrulanamazsa 'failed'.
   */
  async function parkUnlocked(dataset: ParkKind, ownerId: string | null, raw: string): Promise<ParkResult> {
    const owner = ownerId ?? '';
    const existing = await parkedKeys(owner || '__unknown__', dataset);
    for (const key of existing) {
      const envelope = unwrapParked(await safe(() => storage.getItem(key), null));
      if (envelope && envelope.raw === raw) return 'duplicate';
    }
    // Aynı milisaniyede iki farklı içerik park edilirse anahtarlar ÇAKIŞMAZ (biri diğerini ezmez).
    const taken = new Set(await allKeys());
    let at = now();
    while (taken.has(parkedKey(ownerId, dataset, at))) at += 1;
    const key = parkedKey(ownerId, dataset, at);
    const wrapped = wrapParked(raw, now());
    try {
      await storage.setItem(key, wrapped);
    } catch {
      return 'failed';
    }
    const readBack = await safe(() => storage.getItem(key), null);
    return readBack === wrapped ? 'parked' : 'failed';
  }

  /**
   * Bir veri kümesinin sahibini bu kullanıcıyla uzlaştırır (sync başında). Sonuç:
   * - 'kept'/'adopted': veri bu kullanıcının (ya da boş); sahip anahtarı bu kullanıcıya yazıldı.
   * - 'parked': başkasının/bilinmeyen veri park edilip yerel kopya temizlendi.
   * - 'failed': park/sahip yazımı doğrulanamadı → veri YERİNDE bırakıldı, sahip DEĞİŞMEDİ (kapı gizli tutar).
   * Ardından sahibi bu kullanıcı olan park edilmiş veri (A→B→A dönüşü) uygulanır; park kaydı yalnızca uygulama
   * başarılıysa kaldırılır.
   */
  async function reconcileUnlocked(options: ReconcileOptions): Promise<ReconcileResult> {
    const ownerKey = OWNER_KEYS[options.dataset];
    // Sahip anahtarı OKUNAMAZSA karar verilmez: hata "sahibi bilinmiyor" sanılıp kullanıcının kendi verisi park edilmesin.
    let owner: string | null;
    try {
      owner = await storage.getItem(ownerKey);
    } catch {
      return 'failed';
    }
    const verdict = verdictFor({
      owner, userId: options.userId, hasData: options.hasData, hasOwnPendingChange: options.hasOwnPendingChange,
    });
    const action = actionFor(verdict);
    let result: ReconcileResult = action === 'keep' ? 'kept' : 'adopted';

    if (action === 'park-foreign' || action === 'park-unknown') {
      const parked = await parkUnlocked(options.dataset, owner, options.rawData);
      if (parked === 'failed') return 'failed';
      try {
        await options.clearLocal();
      } catch {
        return 'failed';
      }
      result = 'parked';
    }

    try {
      await storage.setItem(ownerKey, options.userId);
    } catch {
      return 'failed';
    }
    if ((await safe(() => storage.getItem(ownerKey), null)) !== options.userId) return 'failed';

    await consumeParkedUnlocked(options.userId, options.dataset, options.applyParked);
    return result;
  }

  /**
   * Bir sahibin park edilmiş kayıtlarını eskiden yeniye uygular; kayıt yalnızca `apply` true dönerse kaldırılır.
   * Uygulama sırasında kapanırsa kayıt durur ve sonraki çalıştırmada (idempotent birleştirme ile) yeniden uygulanır.
   * Bozuk kayıtlar atlanır ve SİLİNMEZ.
   */
  async function consumeParkedUnlocked(ownerId: string, dataset: ParkKind, apply: (parsed: unknown) => Promise<boolean>): Promise<number> {
    let applied = 0;
    for (const key of await parkedKeys(ownerId, dataset)) {
      const parsed = await readParked<unknown>(key);
      if (parsed === null || parsed === undefined) continue;
      let ok = false;
      try {
        ok = await apply(parsed);
      } catch {
        ok = false;
      }
      if (!ok) continue;
      await safe(() => storage.removeItem(key), undefined);
      applied += 1;
    }
    return applied;
  }

  /** Mutasyon anında sahip damgası (oturum açık, veriyi bu kullanıcı oluşturdu). */
  async function stampOwnerUnlocked(dataset: Dataset, userId: string): Promise<boolean> {
    try {
      await storage.setItem(OWNER_KEYS[dataset], userId);
      return true;
    } catch {
      return false;
    }
  }

  return {
    /** Sıralı (kilitli) park. Bir `consumeParked`/`reconcile` geri çağrısı İÇİNDEN `parkInLock` kullanılmalıdır. */
    park: (dataset: ParkKind, ownerId: string | null, raw: string) => locked(() => parkUnlocked(dataset, ownerId, raw)),
    /** Kilit zaten tutulurken (geri çağrı içinden) park. */
    parkInLock: parkUnlocked,
    /** Kilit dışında salt okuma yardımcıları (kayıt silmez/değiştirmez). */
    parkedKeys,
    readParked,
    reconcile: (options: ReconcileOptions) => locked(() => reconcileUnlocked(options)),
    consumeParked: (ownerId: string, dataset: ParkKind, apply: (parsed: unknown) => Promise<boolean>) =>
      locked(() => consumeParkedUnlocked(ownerId, dataset, apply)),
    stampOwner: (dataset: Dataset, userId: string) => locked(() => stampOwnerUnlocked(dataset, userId)),
  };
}

export type DataIsolation = ReturnType<typeof createDataIsolation>;

// ─── Bozuk veri yedeği ───────────────────────────────────────────────────────

export const corruptBackupKey = (key: string, at: number) => `@wortly:corrupt:${key}:${at}`;

/**
 * Ayrıştırılamayan ham veriyi, üzerine yazılmadan ÖNCE yedekler ve okuyarak doğrular. Her yedek ayrı bir anahtardır
 * (önceki yedekler asla ezilmez); aynı ham veri zaten yedeklenmişse tekrar yazılmaz. false: yedek DOĞRULANAMADI —
 * çağıran bu anahtara yazmayı reddetmelidir (bozuk ama kurtarılabilir veri korunur).
 */
export async function backupCorrupt(storage: KeyValueStorage, key: string, raw: string, now: () => number = Date.now): Promise<boolean> {
  try {
    const prefix = `@wortly:corrupt:${key}:`;
    for (const existing of await storage.getAllKeys()) {
      if (existing.startsWith(prefix) && (await storage.getItem(existing)) === raw) return true;
    }
    const backupKey = corruptBackupKey(key, now());
    await storage.setItem(backupKey, raw);
    return (await storage.getItem(backupKey)) === raw;
  } catch {
    return false;
  }
}

// ─── Bekleyen değişiklikler ──────────────────────────────────────────────────

export interface PendingLike {
  entity: string;
  userId: string | null;
}

/**
 * Bir kullanıcıya uygulanacak bekleyen değişiklikler: yalnızca KENDİ kullanıcı kimliğiyle kuyruğa alınanlar; kimliksiz
 * (userId: null) kayıtlar yalnızca o varlığın yerel sahibi bu kullanıcıysa. Başka kullanıcıya ait kayıtlar ASLA uygulanmaz.
 */
export function selectPendingForUser<T extends PendingLike>(
  changes: readonly T[], entity: string, userId: string, ownerId: string | null,
): T[] {
  return changes.filter(item => (
    item.entity === entity && (item.userId === userId || (item.userId === null && ownerId === userId))
  ));
}

// Bildirim planlamasının hesap güvenliği için saf mantığı (expo-notifications bağımlılığı yok).
//
// Sorun: planlama asenkrondur (ayar okuma, izin sorgusu, tek tek bildirim kurma). Kullanıcı bu sırada
// çıkış yapar ya da hesap değiştirirse, eski hesabın devam eden işlemi çıkıştan SONRA bildirim kurabilir.
// Çözüm: her planlama bir sahiplik belirteci (kullanıcı + dönem numarası) taşır; sahiplik değişince
// dönem numarası artar ve eski belirteçler geçersiz olur. Uygulama aşamasında belirteç başta, iptalden
// sonra, HER bildirimden önce ve sonda yeniden doğrulanır; geçersizse kurulanlar temizlenir.

export interface OwnerToken {
  userId: string;
  epoch: number;
}

export function createOwnerGate() {
  let owner: string | null = null;
  let epoch = 0;
  return {
    /** Oturumdaki kullanıcıyı bildirir. Aynı kullanıcı tekrar bildirilirse dönem değişmez (süren plan geçerli kalır). */
    setOwner(userId: string | null) {
      if (userId !== owner) {
        owner = userId;
        epoch += 1;
      }
    },
    /** Çıkış: sahibi kaldırır ve süren tüm işlemleri her koşulda geçersiz kılar. */
    revoke() {
      owner = null;
      epoch += 1;
    },
    /** Yalnızca `userId` şu anki sahipse belirteç verir. */
    token(userId: string | null | undefined): OwnerToken | null {
      return userId && userId === owner ? { userId, epoch } : null;
    },
    isValid(token: OwnerToken | null | undefined): boolean {
      return !!token && token.userId === owner && token.epoch === epoch;
    },
    getOwner: () => owner,
  };
}

export type OwnerGate = ReturnType<typeof createOwnerGate>;

/** İşletim sistemi bildirim API'sini soyutlar; test ve gerçek uygulama aynı akışı kullanır. */
export interface SchedulerAdapter<Item> {
  /** Wortly'nin kurulu (bekleyen) hatırlatmalarını iptal eder; başka bildirimlere dokunmaz. */
  cancelOwn(): Promise<void>;
  /** Bildirim merkezinde duran, `keepUserId` dışındaki hesaplara ait Wortly bildirimlerini kaldırır. */
  dismissForeign(keepUserId: string | null): Promise<void>;
  hasPermission(): Promise<boolean>;
  prepare(): Promise<void>;
  schedule(item: Item): Promise<void>;
}

export type ApplyResult = 'applied' | 'skipped' | 'aborted';

/**
 * Planı güvenli uygular. `isValid` her adımdan önce çağrılır; false dönerse hiçbir yeni bildirim kurulmaz
 * ve o ana kadar kurulanlar iptal edilir. İzin yoksa ya da plan boşsa mevcut hatırlatmalar yine temizlenir.
 */
export async function runGuardedApply<Item>(options: {
  adapter: SchedulerAdapter<Item>;
  plan: Item[];
  userId: string | null;
  isValid: () => boolean;
}): Promise<ApplyResult> {
  const { adapter, plan, userId, isValid } = options;

  const abort = async (): Promise<ApplyResult> => {
    await adapter.cancelOwn();
    await adapter.dismissForeign(null);
    return 'aborted';
  };

  if (!isValid()) return abort();
  await adapter.cancelOwn();
  if (!isValid()) return abort();
  await adapter.dismissForeign(userId);
  if (plan.length === 0) return 'skipped';
  if (!(await adapter.hasPermission())) return isValid() ? 'skipped' : abort();
  if (!isValid()) return abort();
  await adapter.prepare();

  for (const item of plan) {
    if (!isValid()) return abort();
    await adapter.schedule(item);
  }
  // Son bildirim kurulurken sahiplik değişmiş olabilir.
  if (!isValid()) return abort();
  return 'applied';
}

/** Görevleri sırayla çalıştırır; biri hata verse bile sonrakiler çalışır. */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** Uygulama durumu geçişinde yeniden planlama gerekir mi? (arka plan/pasif → öne geliş) */
export function shouldReplanOnAppState(previous: string, next: string): boolean {
  return next === 'active' && previous !== 'active';
}

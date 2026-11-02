// Aynı varlık ve kullanıcı için "tam" ve "hafif" senkronların birbirini ezmesini/atlamasını önler.
//
// Eski `dedupeSync` çalışan herhangi bir isteği paylaşırdı: hafif bir akış sürerken gelen TAM senkron
// isteği sessizce atlanabilir (ilerleme "doğrulandı" işaretlenemez, bulut çekilmezdi). Burada:
// - Aynı kip (full/light) için kuyrukta veya çalışırken bekleyen istek varsa onun sonucu paylaşılır.
// - Farklı kipler sırayla (art arda) çalışır; hiçbiri atlanmaz ve hiçbiri diğerinin yarısında başlamaz.
// - Bir görevin hatası zinciri bozmaz.

export type SyncMode = 'full' | 'light';

interface Slot {
  tail: Promise<void>;
  waiting: Partial<Record<SyncMode, Promise<void>>>;
}

export function createSyncSerializer() {
  const slots = new Map<string, Slot>();

  return function run(key: string, mode: SyncMode, task: () => Promise<void>): Promise<void> {
    const slot = slots.get(key) ?? { tail: Promise.resolve(), waiting: {} };
    slots.set(key, slot);

    const existing = slot.waiting[mode];
    if (existing) return existing;

    const promise: Promise<void> = slot.tail
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (slot.waiting[mode] === promise) delete slot.waiting[mode];
        if (!slot.waiting.full && !slot.waiting.light && slots.get(key) === slot) slots.delete(key);
      });
    slot.waiting[mode] = promise;
    slot.tail = promise;
    return promise;
  };
}

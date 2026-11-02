import type { AudioFocus } from './audio-focus';

// Telaffuz kaydı akışının saf mantığı (expo-audio, dosya sistemi ve AsyncStorage enjekte edilir).
//
// Wortly şu an telaffuzu PUANLAMAZ: kullanıcı referans sesi dinler, kendi kaydını alır, ikisini karşılaştırarak
// çalışır. Konuşma tanıma/puanlama yoktur ve sahte doğruluk üretilmez. İleride otomatik değerlendirme
// eklenecekse bu denetleyiciye `evaluate(uri)` benzeri bir adım eklenir; kayıt/saklama akışı değişmez.
//
// Güvenlik ilkeleri:
// - Aynı anda tek işlem (kilit): hızlı çift dokunuş ikinci kayıt/durdurma/silme başlatmaz.
// - Yeni kayıt doğrulanıp haritaya YAZILMADAN önceki kayıt silinmez; yazım başarısız olursa eskisi kalır.
// - Silme: önce harita güncellenir, başarılıysa dosya silinir.
// - Dosyası olmayan/bozuk eşlemeler çökme yapmaz; temizlenir.
// - Ses dosyaları buluta GÖNDERİLMEZ.

export const MIN_RECORDING_SECONDS = 0.5;
export const MAX_RECORDING_SECONDS = 30;

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping';

export type RecorderErrorCode =
  | 'permission' | 'start-failed' | 'blocked' | 'save-failed' | 'too-short' | 'stop-failed' | 'delete-failed';
export type RecorderNotice = 'background' | 'max-length' | 'interrupted' | 'missing-file' | null;

export interface RecorderState {
  status: RecorderStatus;
  /** Kayıtlı (doğrulanmış) telaffuz dosyası. */
  uri: string | null;
  error: { code: RecorderErrorCode; /** İzin kalıcı reddedildi: cihaz ayarlarına yönlendir. */ needsSettings: boolean } | null;
  notice: RecorderNotice;
}

export const ERROR_MESSAGES: Record<RecorderErrorCode, string> = {
  permission: 'Mikrofon izni kapalı. Telaffuzunu kaydetmek için mikrofon iznini ver.',
  'start-failed': 'Kayıt başlatılamadı. iOS simülatöründe mikrofon desteği sınırlı olabilir; gerçek cihazda dene.',
  blocked: 'Şu an başka bir ses çalıyor. Önce onu durdur, sonra kaydet.',
  'save-failed': 'Kayıt kaydedilemedi. Önceki kaydın korundu; lütfen tekrar dene.',
  'too-short': 'Kayıt çok kısa, lütfen tekrar dene.',
  'stop-failed': 'Kayıt durdurulurken bir sorun oluştu. Lütfen tekrar dene.',
  'delete-failed': 'Kayıt silinemedi. Lütfen tekrar dene.',
};

export const NOTICE_MESSAGES: Record<Exclude<RecorderNotice, null>, string> = {
  background: 'Uygulama arka plana alındığı için kayıt durduruldu.',
  'max-length': `Kayıt ${MAX_RECORDING_SECONDS} saniyede otomatik durduruldu.`,
  interrupted: 'Kayıt kesildi (arama, başka uygulama vb.). O ana kadarki kısım kaydedildi.',
  'missing-file': 'Önceki kaydın dosyası bulunamadı; kayıt listesinden kaldırıldı.',
};

/** AsyncStorage'dan gelen değeri güvenli bir {kelimeId: dosyaUri} haritasına çevirir (bozuk veri çökertmez). */
export function sanitizeRecordingMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0) result[key] = value;
  }
  return result;
}

/** 7.4 sn → "0:07", 65 sn → "1:05". Geçersiz değer "0:00". */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export interface RecorderDeps {
  wordId: string;
  focus: Pick<AudioFocus, 'request' | 'setRecording'>;
  requestPermission(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  /** Kaydı başlatır (ses modunu ayarlar, hazırlar, başlatır). */
  startRecording(): Promise<void>;
  /** Kaydı durdurur; kaydedicinin dosyasını ve süresini (sn) döndürür. */
  stopRecording(): Promise<{ uri: string | null; seconds: number }>;
  /** Kayıt sonrası ses modunu oynatmaya döndürür (hata yok sayılır). */
  restorePlaybackMode(): Promise<void>;
  moveToUniqueFile(uri: string): Promise<string>;
  measureDuration(uri: string): Promise<number | null>;
  fileExists(uri: string): boolean;
  deleteFile(uri: string | null | undefined): void;
  loadMap(): Promise<Record<string, string>>;
  /**
   * Haritayı ATOMİK günceller (okuma-değiştirme-yazma sırayla); başarıyı döndürür (false: yazılamadı).
   * Başka kelimelerin girişlerine dokunulmaz.
   */
  updateMap(mutate: (map: Record<string, string>) => void): Promise<boolean>;
}

export function createPronunciationController(deps: RecorderDeps) {
  let state: RecorderState = { status: 'idle', uri: null, error: null, notice: null };
  const listeners = new Set<() => void>();
  let lock = false;
  let disposed = false;

  const set = (patch: Partial<RecorderState>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const fail = (code: RecorderErrorCode, needsSettings = false) =>
    set({ status: 'idle', error: { code, needsSettings } });

  function persist(uri: string | null): Promise<boolean> {
    return deps.updateMap((map) => {
      if (uri) map[deps.wordId] = uri;
      else delete map[deps.wordId];
    });
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** Kayıtlı telaffuzu yükler; dosyası olmayan eşlemeyi temizler. */
    async load() {
      try {
        const map = sanitizeRecordingMap(await deps.loadMap());
        const stored = map[deps.wordId] ?? null;
        const uri = stored && deps.fileExists(stored) ? stored : null;
        if (stored && !uri) {
          await persist(null);
          if (!disposed) set({ uri: null, notice: 'missing-file' });
          return;
        }
        if (!disposed) set({ uri });
      } catch {
        if (!disposed) set({ uri: null });
      }
    },

    clearMessages() {
      if (state.error || state.notice) set({ error: null, notice: null });
    },

    /** Kaydı başlatır. Mikrofon izni yalnızca burada, kullanıcı kayıt başlatmak isteyince istenir. */
    async start(): Promise<'started' | 'ignored' | 'failed'> {
      if (lock || disposed || state.status !== 'idle') return 'ignored';
      lock = true;
      set({ status: 'starting', error: null, notice: null });
      try {
        const permission = await deps.requestPermission();
        if (!permission.granted) {
          fail('permission', !permission.canAskAgain);
          return 'failed';
        }
        if (disposed) { set({ status: 'idle' }); return 'failed'; } // izin penceresi açıkken ekran kapandı
        // Çalan seslendirme/oynatma durdurulur; başka bir kayıt sürüyorsa başlamaz.
        if (!deps.focus.request('recording')) {
          fail('blocked');
          return 'failed';
        }
        await deps.startRecording();
        if (disposed) {
          // Ekran, kayıt başlarken kapandı: açık mikrofon bırakma.
          try {
            const result = await deps.stopRecording();
            deps.deleteFile(result.uri);
          } catch { /* sessizce geç */ }
          return 'failed';
        }
        deps.focus.setRecording(true);
        set({ status: 'recording' });
        return 'started';
      } catch {
        deps.focus.setRecording(false);
        fail('start-failed');
        return 'failed';
      } finally {
        lock = false;
      }
    },

    /** Kaydı durdurur, doğrular ve kaydeder. `reason`: arka plan/azami süre için kullanıcıya bilgi verir. */
    async stop(reason: 'user' | 'background' | 'max-length' | 'interrupted' = 'user'): Promise<'saved' | 'ignored' | 'failed'> {
      if (lock || state.status !== 'recording') return 'ignored';
      lock = true;
      set({ status: 'stopping' });
      let newUri: string | null = null;
      try {
        const recorded = await deps.stopRecording();
        deps.focus.setRecording(false);
        try { await deps.restorePlaybackMode(); } catch { /* oynatma modu daha sonra yeniden ayarlanır */ }
        if (!recorded.uri) {
          fail('save-failed');
          return 'failed';
        }
        newUri = await deps.moveToUniqueFile(recorded.uri);
        if (recorded.seconds < MIN_RECORDING_SECONDS) {
          deps.deleteFile(newUri);
          fail('too-short');
          return 'failed';
        }
        const measured = await deps.measureDuration(newUri);
        if (measured === null) {
          deps.deleteFile(newUri);
          fail('save-failed');
          return 'failed';
        }
        if (measured < MIN_RECORDING_SECONDS) {
          deps.deleteFile(newUri);
          fail('too-short');
          return 'failed';
        }
        // Yeni kayıt doğrulandı; harita yazılamazsa ESKİ kayıt korunur, yeni dosya atılır.
        const previous = state.uri;
        if (!(await persist(newUri))) {
          deps.deleteFile(newUri);
          fail('save-failed');
          return 'failed';
        }
        set({
          status: 'idle', uri: newUri, error: null,
          notice: reason === 'user' ? null : reason,
        });
        if (previous && previous !== newUri) deps.deleteFile(previous);
        return 'saved';
      } catch {
        deps.focus.setRecording(false);
        if (newUri) deps.deleteFile(newUri);
        fail('stop-failed');
        return 'failed';
      } finally {
        lock = false;
      }
    },

    /** Kullanıcının kaydını AÇIKÇA siler (arayüz onay ister). Önce harita, sonra dosya. */
    async remove(): Promise<boolean> {
      if (lock || state.status !== 'idle' || !state.uri) return false;
      lock = true;
      try {
        const uri = state.uri;
        if (!(await persist(null))) {
          fail('delete-failed');
          return false;
        }
        deps.deleteFile(uri);
        set({ uri: null, error: null, notice: null });
        return true;
      } catch {
        fail('delete-failed');
        return false;
      } finally {
        lock = false;
      }
    },

    /** Ekran kapanırken: sürmekte olan kayıt durdurulur ve yarım kalan geçici dosya atılır (kayıtlı telaffuz korunur). */
    async dispose() {
      disposed = true;
      if (state.status === 'recording' || state.status === 'stopping') {
        try {
          const result = await deps.stopRecording();
          deps.deleteFile(result.uri);
        } catch { /* kaydedici zaten durmuş olabilir */ }
      }
      deps.focus.setRecording(false);
      listeners.clear();
    },
  };
}

export type PronunciationController = ReturnType<typeof createPronunciationController>;

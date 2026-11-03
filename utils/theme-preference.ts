// Tema tercihinin okunması ve geçerli şemanın çözülmesi. Saf mantık: depolama dışarıdan verilir.
// Kayıtlı tercih ASLA bu dosyada silinmez veya üzerine yazılmaz; bozuk/geçersiz değer yalnızca o açılışta "sistem" sayılır.

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeScheme = 'light' | 'dark';

export const THEME_PREFERENCE_KEY = '@wortly:theme-preference';
export const THEME_READ_TIMEOUT_MS = 3000;

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export const parseThemePreference = (raw: unknown): ThemePreference => (isThemePreference(raw) ? raw : 'system');

/** Seçilen tercih ve sistem temasından geçerli şema: "sistem" ise sistem; yoksa kullanıcının seçimi. */
export function resolveScheme(preference: ThemePreference, systemScheme: string | null | undefined): ThemeScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export type ThemeLoadSource = 'stored' | 'default' | 'error' | 'timeout';

export interface ThemeLoadResult {
  preference: ThemePreference;
  source: ThemeLoadSource;
}

/**
 * Kayıtlı tercihi okur. Okuma hata verirse veya süre aşılırsa varsayılan ("sistem") döner; çağıran tarafın ekranı
 * yine açabilmesi için ASLA fırlatmaz ve takılı kalmaz.
 */
export async function loadThemePreference(
  storage: { getItem: (key: string) => Promise<string | null> },
  timeoutMs: number = THEME_READ_TIMEOUT_MS,
): Promise<ThemeLoadResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<'__timeout__'>((resolve) => { timer = setTimeout(() => resolve('__timeout__'), timeoutMs); });
    const raw = await Promise.race([storage.getItem(THEME_PREFERENCE_KEY), timeout]);
    if (raw === '__timeout__') return { preference: 'system', source: 'timeout' };
    if (isThemePreference(raw)) return { preference: raw, source: 'stored' };
    return { preference: 'system', source: 'default' };
  } catch {
    return { preference: 'system', source: 'error' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

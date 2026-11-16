// Sunucuya ulaşılabilirlik kontrolü (hesap silme gibi çevrimdışıyken başlatılmaması gereken işlemler için).
// Yeni bir native bağımlılık eklememek için kendi Supabase adresimizin sağlık ucuna kısa bir istek atılır; veri gönderilmez
// ve gövde okunmaz. Herhangi bir HTTP yanıtı (401 dahil) "ulaşılabilir" demektir; ağ hatası/zaman aşımı "ulaşılamıyor".

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<unknown>;

export const REACHABILITY_TIMEOUT_MS = 8000;

export async function isServerReachable(
  baseUrl: string | undefined,
  apiKey: string | undefined,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs: number = REACHABILITY_TIMEOUT_MS,
): Promise<boolean> {
  if (!baseUrl || !apiKey) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: apiKey },
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// "Hesabımı Sil" sunucu mantığı (saf; Deno/Supabase bağımlılığı yok, Node testlerinde çalışır).
//
// Güvenlik sözleşmesi:
//  - Silinecek hesap İSTEMCİDEN GELEN HİÇBİR ALANDAN alınmaz: yalnızca istekteki erişim belirtecinin (JWT) sunucuda
//    doğrulanmasıyla bulunan kullanıcı silinir. Gövde yalnızca bilinçli onay ifadesini taşır.
//  - `service_role` anahtarı yalnızca sunucuda (index.ts, Edge Function ortamı) bulunur; uygulamaya hiçbir koşulda girmez.
//  - Silme, `auth.users` satırının silinmesidir; tüm kullanıcı tabloları `ON DELETE CASCADE` ile aynı veritabanı
//    işleminde temizlenir. Yarım kalan durum olmaz: ya hesap ve veriler birlikte gider ya da hiçbiri.
//  - Yanıtlar ayrıntı sızdırmaz (belirteç, e-posta, iç hata metni yok) ve önbelleğe alınmaz.

/** İstemcinin gövdede göndermesi gereken bilinçli onay değeri (yanlışlıkla/başka bir istekle silmeyi önler). */
export const CONFIRM_VALUE = 'DELETE_MY_ACCOUNT';

export interface DeleteAccountDeps {
  /** Erişim belirtecini sunucuda doğrular. Geçersiz/süresi dolmuş/kullanıcısı silinmiş belirteç için null döner. */
  verifyUser(accessToken: string): Promise<{ id: string } | null>;
  /** Kullanıcıyı (ve cascade ile tüm verisini) kalıcı siler. Başarısızlıkta fırlatır. */
  deleteUser(userId: string): Promise<void>;
  /** Yalnızca hata türü/adı için; belirteç, e-posta veya kullanıcı verisi İÇERMEMELİ. */
  log?(event: string): void;
}

export type DeleteAccountErrorCode =
  | 'method-not-allowed'
  | 'unauthorized'
  | 'confirmation-required'
  | 'verification-failed'
  | 'delete-failed';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
}

const fail = (status: number, error: DeleteAccountErrorCode) => json(status, { ok: false, error });

/** "Bearer <belirteç>" başlığından belirteci çıkarır; biçim bozuksa null. */
export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/.exec(header.trim());
  return match ? match[1]! : null;
}

async function readConfirmation(request: Request): Promise<boolean> {
  try {
    const body: unknown = await request.json();
    return !!body && typeof body === 'object' && (body as { confirm?: unknown }).confirm === CONFIRM_VALUE;
  } catch {
    return false;
  }
}

export async function handleDeleteAccount(request: Request, deps: DeleteAccountDeps): Promise<Response> {
  const log = deps.log ?? (() => undefined);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return fail(405, 'method-not-allowed');

  const token = readBearerToken(request.headers.get('Authorization'));
  if (!token) return fail(401, 'unauthorized');

  if (!(await readConfirmation(request))) return fail(400, 'confirmation-required');

  let user: { id: string } | null;
  try {
    user = await deps.verifyUser(token);
  } catch {
    // Doğrulama servisine ulaşılamadı: kimse silinmez; istemci güvenle yeniden deneyebilir.
    log('verify-error');
    return fail(503, 'verification-failed');
  }
  if (!user || typeof user.id !== 'string' || !user.id) return fail(401, 'unauthorized');

  try {
    await deps.deleteUser(user.id);
  } catch {
    log('delete-error');
    return fail(500, 'delete-failed');
  }
  log('deleted');
  return json(200, { ok: true });
}

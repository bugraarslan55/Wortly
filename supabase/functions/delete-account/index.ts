// Supabase Edge Function: kimliği doğrulanmış kullanıcının hesabını ve tüm bulut verisini kalıcı siler.
// Dağıtım ve ayrıntılar: docs/account-deletion.md. Bu dosya DAĞITILMADI; yerel testler yalnızca handler.ts'yi sınar.
//
// `service_role` anahtarı Supabase tarafından bu işleve ortam değişkeni olarak enjekte edilir (SUPABASE_SERVICE_ROLE_KEY);
// kaynak koda, uygulamaya veya EXPO_PUBLIC_* değişkenlerine ASLA yazılmaz.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleDeleteAccount } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const admin = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

Deno.serve((request: Request) => handleDeleteAccount(request, {
  async verifyUser(accessToken) {
    if (!admin) throw new Error('missing-environment');
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error) {
      // 4xx: belirteç geçersiz / kullanıcı yok (zaten silinmiş). Diğerleri (ağ, 5xx): doğrulanamadı → fırlat.
      const status = (error as { status?: number }).status;
      if (typeof status === 'number' && status >= 400 && status < 500) return null;
      throw error;
    }
    return data.user ? { id: data.user.id } : null;
  },
  async deleteUser(userId) {
    if (!admin) throw new Error('missing-environment');
    // shouldSoftDelete: false → kalıcı silme; cascade tüm kullanıcı tablolarını aynı işlemde temizler.
    const { error } = await admin.auth.admin.deleteUser(userId, false);
    if (error) throw error;
  },
  log: (event) => console.log(`[delete-account] ${event}`),
}));

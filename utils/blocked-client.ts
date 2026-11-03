// Bağlantı engellendiğinde gerçek Supabase istemcisi YERİNE kullanılan boş istemci.
//
// Hiçbir ağ isteği yapmaz, hiçbir oturum/depolama okumaz. Her zincir (from().select()... ya da auth.*) güvenli bir
// "hata" sonucuna çözülür; oturum her zaman yoktur. Böylece modül düzeyinde bir içe aktarma bile veriye erişemez.
// Kök yerleşim engelli durumda mağazaları/oturumu hiç başlatmaz; bu istemci yalnızca ikinci savunma hattıdır.

export const BLOCKED_ERROR_MESSAGE = 'Bağlantı güvenlik nedeniyle engellendi.';

export function createBlockedClient(): any {
  const result = { data: null, count: null, error: { message: BLOCKED_ERROR_MESSAGE } };
  const subscription = { data: { subscription: { unsubscribe: () => undefined } } };

  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (value: unknown) => unknown) => resolve(result); // await / .then
      if (prop === 'onAuthStateChange') return () => subscription;
      if (prop === 'getSession') return async () => ({ data: { session: null }, error: null });
      if (prop === Symbol.toPrimitive) return () => 'BlockedSupabaseClient';
      return chain;
    },
    apply() { return chain; },
  };
  const chain: any = new Proxy(function blocked() { return undefined; }, handler);
  return chain;
}

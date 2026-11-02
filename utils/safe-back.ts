// Güvenli geri dönüş: yığında önceki ekran yoksa (derin bağlantı, bildirimden soğuk açılış, uygulama yeniden
// başlatılması) `router.back()` hiçbir şey yapmaz ve geri düğmeleri "ölü" kalır. Bu durumda verilen güvenli
// ekrana gidilir.
export interface BackRouter {
  canGoBack(): boolean;
  back(): void;
  replace(href: any): void;
}

export function goBack(router: BackRouter, fallback: string = '/(tabs)'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as any);
}

// "Son istek kazanır" koruması: asenkron okumalar (ör. kullanıcıya özel veriyi depodan yükleme) art arda
// başlatıldığında, ESKİ bir isteğin geç gelen sonucu yeni isteğin sonucunu ezmesin. Hesap değişimi (A → B) veya
// çıkış sırasında eski hesabın verisinin yeni hesaba sızmasını engellemek için kullanılır.
export function createLatestGuard() {
  let current = 0;
  return {
    /** Yeni bir istek başlatır ve belirtecini döndürür; önceki tüm belirteçler geçersiz olur. */
    begin(): number {
      current += 1;
      return current;
    },
    /** Belirteç hâlâ en yeni istekse true. */
    isLatest(token: number): boolean {
      return token === current;
    },
    /** Çıkış/sıfırlama: süren tüm istekleri geçersiz kılar. */
    invalidate() {
      current += 1;
    },
  };
}

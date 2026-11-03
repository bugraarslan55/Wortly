// Bellekteki kişisel verinin oturumdaki kullanıcıya ait olup olmadığı (saf).
//
// - Sahip bilgisi VARSA ve oturumdaki kullanıcıdan farklıysa veri o kullanıcıya gösterilmez.
// - Sahip bilgisi YOKSA (eski sürümden kalan, henüz eşitlenmemiş yerel veri) `allowUnknown` ile kabul edilebilir:
//   bu veriler zaten ilk eşitlemede bu kullanıcıya atanır ve çevrimdışı kullanıcının verisi gizlenmez.
// - Oturum yoksa hiçbir kişisel veri gösterilmez.
export function isOwnedByUser(
  owner: string | null | undefined,
  userId: string | null | undefined,
  allowUnknown = false,
): boolean {
  if (!userId) return false;
  if (owner === null || owner === undefined || owner === '') return allowUnknown;
  return owner === userId;
}

// Kimliğe göre tekilleştirme: aynı kayıt (ör. çift yazılmış/çift senkronize edilmiş oturum) iki kez sayılmasın.
// Kimliği olmayan kayıtlar tekilleştirilemez ve olduğu gibi korunur. Sıra korunur (ilk görülen kalır).
export function uniqueById<T extends { id?: string }>(items: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item) continue;
    if (typeof item.id === 'string' && item.id) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
    }
    out.push(item);
  }
  return out;
}

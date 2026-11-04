export const PROFILE_NAME_MAX_LENGTH = 30; // Onboarding'deki sınırla aynı.

export type ProfileNameResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

/** Görünen adı temizler (baştaki/sondaki ve ardışık boşluklar) ve boş olmadığını doğrular. */
export function validateProfileName(input: string): ProfileNameResult {
  const name = input.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Görünen ad boş olamaz.' };
  if (name.length > PROFILE_NAME_MAX_LENGTH) {
    return { ok: false, error: `Görünen ad en fazla ${PROFILE_NAME_MAX_LENGTH} karakter olabilir.` };
  }
  return { ok: true, name };
}

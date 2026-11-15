import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '../store/auth';
import { usePhrasebookStore } from '../store/phrasebook';
import { isOwnedByUser } from '../utils/ownership';
import {
  PHRASEBOOK_FAILED_MESSAGE, PHRASEBOOK_FULL_MESSAGE, isSaved, phraseId, type Phrase, type PhraseInput,
} from '../utils/phrasebook';

/**
 * İfade Defterim'in oturumdaki kullanıcıya ait görünümü. Mağazadaki kayıt başka bir kullanıcıya aitse (hesap değişimi
 * sırasında) ya da henüz yüklenmediyse ifade listesi BOŞ görünür ve kaydetme kapalıdır.
 */
export function usePhrasebook() {
  const sessionUserId = useAuthStore(state => state.session?.user.id ?? null);
  const storeUserId = usePhrasebookStore(state => state.userId);
  const isLoaded = usePhrasebookStore(state => state.isLoaded);
  const isLocked = usePhrasebookStore(state => state.isLocked);
  const stored = usePhrasebookStore(state => state.items);
  const saveItem = usePhrasebookStore(state => state.save);
  const removeItem = usePhrasebookStore(state => state.remove);

  const owned = isLoaded && isOwnedByUser(storeUserId, sessionUserId);
  const items: Phrase[] = useMemo(() => (owned && !isLocked ? stored : []), [owned, isLocked, stored]);
  const ready = owned && !isLocked;

  const isPhraseSaved = useCallback((german: string) => isSaved(items, phraseId(german)), [items]);

  /** Kayıtlıysa kaldırır, değilse kaydeder. Başarısızlıkta (dolu/yazılamadı) kullanıcıya Türkçe bilgi verir. */
  const toggle = useCallback(async (input: PhraseInput) => {
    if (!ready || !sessionUserId) return;
    if (isSaved(items, phraseId(input.german))) {
      const outcome = await removeItem(sessionUserId, phraseId(input.german));
      if (outcome === 'failed') Alert.alert('İfade kaldırılamadı', PHRASEBOOK_FAILED_MESSAGE);
      return;
    }
    const outcome = await saveItem(sessionUserId, input);
    if (outcome === 'full') Alert.alert('İfade Defterim dolu', PHRASEBOOK_FULL_MESSAGE);
    else if (outcome === 'failed') Alert.alert('İfade kaydedilemedi', PHRASEBOOK_FAILED_MESSAGE);
  }, [ready, sessionUserId, items, saveItem, removeItem]);

  const remove = useCallback(async (id: string) => {
    if (!ready || !sessionUserId) return;
    const outcome = await removeItem(sessionUserId, id);
    if (outcome === 'failed') Alert.alert('İfade silinemedi', PHRASEBOOK_FAILED_MESSAGE);
  }, [ready, sessionUserId, removeItem]);

  return { items, isLoaded: owned, isLocked: owned && isLocked, ready, isPhraseSaved, toggle, remove };
}

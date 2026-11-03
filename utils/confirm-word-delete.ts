import { Alert } from 'react-native';
import { deleteWordPronunciation, hasPronunciationRecording, markRecordingKept } from './pronunciation-storage';

/**
 * Kelime silme onayı. Kelimenin cihazda telaffuz kaydı varsa kullanıcıya AÇIKÇA sorulur:
 * kayıt ancak "Kelimeyi ve kaydı sil" seçilirse silinir. "Kaydı sakla" seçilirse dosyaya dokunulmaz ve kayıt
 * "sakladığın" olarak işaretlenir: Profil > Kayıt depolama bölümünde ayrı listelenir ve yalnızca ayrı bir onayla silinir.
 * Kullanıcı onayı olmadan hiçbir ses dosyası silinmez.
 */
export async function confirmDeleteWord(options: {
  userId: string | null | undefined;
  wordId: string;
  label: string;
  /** Kelimeyi siler (store.deleteWord). */
  onDeleteWord: () => Promise<void> | void;
}): Promise<void> {
  const { userId, wordId, label, onDeleteWord } = options;
  const hasRecording = userId ? await hasPronunciationRecording(userId, wordId).catch(() => false) : false;

  if (!hasRecording || !userId) {
    Alert.alert('Kelimeyi Sil', `"${label}" kelimesini silmek istiyor musun?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => { void onDeleteWord(); } },
    ]);
    return;
  }

  Alert.alert(
    'Kelimeyi Sil',
    `"${label}" kelimesini silmek istiyor musun?\n\nBu kelimenin telaffuz kaydı da var (yalnızca bu cihazda saklanır, geri getirilemez). Kaydı ne yapalım?`,
    [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Kelimeyi sil, kaydı sakla',
        onPress: () => {
          void (async () => {
            // Saklama tercihi kaydedilir: bu kayıt toplu temizlik tekliflerine girmez.
            await markRecordingKept(userId, wordId);
            await onDeleteWord();
          })();
        },
      },
      {
        text: 'Kelimeyi ve kaydı sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await onDeleteWord();
            await deleteWordPronunciation(userId, wordId).catch(() => false);
          })();
        },
      },
    ],
  );
}

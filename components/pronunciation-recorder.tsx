import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useAuthStore } from '../store/auth';
import { AppIcon } from './app-icon';
import { BorderRadius, Colors, Shadows, Spacing } from '../constants/theme';
import {
  deletePronunciationFile,
  measureRecordingDuration,
  moveRecordingToUniqueFile,
  pronunciationFileExists,
  readPronunciationRecordings,
  writePronunciationRecordings,
} from '../utils/pronunciation-storage';

const MIN_RECORDING_SECONDS = 0.5;
const TOO_SHORT_MESSAGE = 'Kayıt çok kısa, lütfen tekrar dene.';

const MIC_DENIED_MESSAGE =
  'Mikrofon izni verilmedi. Telaffuzunu kaydetmek için Ayarlar > Wortly bölümünden mikrofon iznini aç.';

export function PronunciationRecorder({ wordId }: { wordId: string }) {
  const userId = useAuthStore(state => state.session?.user.id ?? 'guest');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const recordingUriRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  const playLockRef = useRef(false);
  const finishedRef = useRef(false);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recorderState = useAudioRecorderState(recorder);
  // pause() sonrası native tarafın oturumu geciktirilmiş şekilde kapatması,
  // hemen ardından başlayan kaydı kesiyordu; oturumu açık tutarak bu yarış önlenir.
  const player = useAudioPlayer(recordingUri ?? undefined, { keepAudioSessionActive: true });
  const playerStatus = useAudioPlayerStatus(player);

  const isRecording = recorderState.isRecording;
  const isPlaying = playerStatus.playing;

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    finishedRef.current = false;
  }, [recordingUri]);

  useEffect(() => {
    if (playerStatus.didJustFinish) finishedRef.current = true;
  }, [playerStatus.didJustFinish]);

  useEffect(() => {
    let active = true;
    setRecordingUri(null);
    recordingUriRef.current = null;
    setError('');
    if (Platform.OS === 'web') return;

    void readPronunciationRecordings(userId).then((recordings) => {
      if (!active) return;
      const stored = recordings[wordId] ?? null;
      // Dosyası artık olmayan eski eşlemeler temizlenir.
      const uri = stored && pronunciationFileExists(stored) ? stored : null;
      if (stored && !uri) {
        delete recordings[wordId];
        void writePronunciationRecordings(userId, recordings);
      }
      recordingUriRef.current = uri;
      setRecordingUri(uri);
    });

    return () => {
      active = false;
    };
  }, [userId, wordId]);

  useEffect(() => () => {
    if (isRecordingRef.current) void recorder.stop().catch(() => undefined);
  }, [recorder]);

  const persist = useCallback(async (uri: string | null) => {
    recordingUriRef.current = uri;
    setRecordingUri(uri);
    if (Platform.OS === 'web') return;
    const recordings = await readPronunciationRecordings(userId);
    if (uri) recordings[wordId] = uri;
    else delete recordings[wordId];
    await writePronunciationRecordings(userId, recordings);
  }, [userId, wordId]);

  const startRecording = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(MIC_DENIED_MESSAGE);
        return;
      }
      if (player.playing) player.pause();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError('Kayıt başlatılamadı. iOS simülatöründe mikrofon desteği sınırlı olabilir; gerçek cihazda dene.');
    } finally {
      setBusy(false);
    }
  };

  const stopRecording = async () => {
    if (busy) return;
    setBusy(true);
    let newUri: string | null = null;
    try {
      // Kaydedicinin kendi süresi; durdurulunca sıfırlandığı için önce okunur.
      const recordedSeconds = recorder.getStatus().durationMillis / 1000;
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const recordedUri = recorder.uri;
      if (!recordedUri) {
        setError('Kayıt kaydedilemedi. Lütfen tekrar dene.');
        return;
      }

      // Her kayıt benzersiz bir dosyaya taşınır ve yeni, ayrı bir player ile ölçülür.
      newUri = await moveRecordingToUniqueFile(recordedUri);
      if (recordedSeconds < MIN_RECORDING_SECONDS) {
        deletePronunciationFile(newUri);
        setError(TOO_SHORT_MESSAGE);
        return;
      }
      const fileSeconds = await measureRecordingDuration(newUri);
      if (fileSeconds === null) {
        deletePronunciationFile(newUri);
        setError('Kayıt kaydedilemedi. Lütfen tekrar dene.');
        return;
      }
      if (fileSeconds < MIN_RECORDING_SECONDS) {
        deletePronunciationFile(newUri);
        setError(TOO_SHORT_MESSAGE);
        return;
      }

      // Doğrulama bitmeden yeni kayıt geçerli kayıt olarak gösterilmez.
      const previous = recordingUriRef.current;
      await persist(newUri);
      if (previous && previous !== newUri) deletePronunciationFile(previous);
    } catch {
      if (newUri) deletePronunciationFile(newUri);
      setError('Kayıt durdurulurken bir sorun oluştu. Lütfen tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const togglePlayback = async () => {
    if (!recordingUri || playLockRef.current || busy) return;
    if (player.playing) {
      player.pause();
      return;
    }
    playLockRef.current = true;
    setError('');
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      // Bitmiş kayıtta play() başa sarma tamamlanmadan çağrılırsa anında durur.
      const atEnd =
        finishedRef.current || (player.duration > 0 && player.currentTime >= player.duration - 0.1);
      if (atEnd) await player.seekTo(0);
      finishedRef.current = false;
      player.play();
    } catch {
      setError('Kayıt oynatılamadı. Lütfen tekrar dene.');
    } finally {
      playLockRef.current = false;
    }
  };

  const deleteRecording = async () => {
    if (busy) return;
    const uri = recordingUriRef.current;
    if (player.playing) player.pause();
    await persist(null);
    deletePronunciationFile(uri);
    setError('');
  };

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <AppIcon name="mic.fill" size={16} color={Colors.secondary} />
        <Text style={styles.title}>Telaffuzum</Text>
      </View>

      {isRecording ? (
        <>
          <Text style={styles.status}>Kaydediliyor… {Math.floor(recorderState.durationMillis / 1000)} sn</Text>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.stopBtn]}
            onPress={stopRecording}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Kaydı durdur"
          >
            <AppIcon name="stop.fill" size={16} color={Colors.primary} />
            <Text style={styles.primaryBtnText}>Kaydı Durdur</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {!recordingUri && (
            <Text style={styles.empty}>Henüz telaffuz kaydın yok. Kelimeyi söyle, kendi sesini dinle.</Text>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.disabled]}
            onPress={startRecording}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Telaffuzumu kaydet"
          >
            <AppIcon name="mic.fill" size={16} color={Colors.primary} />
            <Text style={styles.primaryBtnText}>
              {recordingUri ? 'Yeniden Kaydet' : 'Telaffuzumu Kaydet'}
            </Text>
          </TouchableOpacity>

          {!!recordingUri && (
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isPlaying && styles.secondaryBtnActive]}
                onPress={togglePlayback}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Kaydı duraklat' : 'Kaydımı dinle'}
              >
                <AppIcon name={isPlaying ? 'pause.fill' : 'play.fill'} size={16} color={Colors.primary} />
                <Text style={styles.secondaryBtnText}>{isPlaying ? 'Duraklat' : 'Kaydımı Dinle'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={deleteRecording}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Kaydı sil"
              >
                <AppIcon name="trash" size={16} color={Colors.error} />
                <Text style={styles.deleteBtnText}>Sil</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {!!error && (
        <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: Spacing.md, ...Shadows.level1, gap: Spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  empty: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },
  status: { fontSize: 14, fontWeight: '600', color: Colors.error },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, backgroundColor: Colors.golden, borderRadius: BorderRadius.lg },
  stopBtn: { backgroundColor: Colors.errorContainer },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  disabled: { opacity: 0.55 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 44, backgroundColor: Colors.surfaceContainer, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: 'transparent' },
  secondaryBtnActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.errorContainer },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: Colors.error },
  error: { fontSize: 12, color: Colors.error, fontWeight: '600', lineHeight: 17 },
});

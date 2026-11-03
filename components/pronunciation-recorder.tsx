import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Alert, AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { Word } from '../types';
import { AppIcon } from './app-icon';
import { BorderRadius, Colors, Shadows, Spacing } from '../constants/theme';
import {
  deletePronunciationFile,
  measureRecordingDuration,
  moveRecordingToUniqueFile,
  pronunciationFileExists,
  readPronunciationRecordings,
  updatePronunciationRecordings,
} from '../utils/pronunciation-storage';
import {
  createPronunciationController,
  ERROR_MESSAGES,
  formatDuration,
  MAX_RECORDING_SECONDS,
  NOTICE_MESSAGES,
} from '../utils/pronunciation-controller';
import { audioFocus } from '../utils/audio-focus';
import { createCompareFlow, MANUAL_MESSAGE, referenceTimeoutMs } from '../utils/compare-flow';
import { getGermanSpeechText } from '../utils/german-speech';
import { useGermanSpeech } from '../utils/use-german-speech';

/**
 * Telaffuz çalışma alanı. Wortly telaffuzu PUANLAMAZ ve doğruluk yüzdesi göstermez: kullanıcı Almanca
 * referans sesi dinler, kendi sesini kaydeder ve ikisini karşılaştırarak çalışır.
 * Kayıt/saklama mantığı `utils/pronunciation-controller.ts` içindedir (test edilmiş saf mantık).
 */
export function PronunciationRecorder({ word }: { word: Word }) {
  const wordId = word.id;
  const userId = useAuthStore(state => state.session?.user.id ?? 'guest');
  const playLockRef = useRef(false);
  const finishedRef = useRef(false);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recorderState = useAudioRecorderState(recorder);
  const { speak, speakingRate } = useGermanSpeech();
  // Güncel değerleri döngüler arasında taşıyan referanslar (karşılaştırma akışı bir kez kurulur).
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const speakingRef = useRef(speakingRate);
  speakingRef.current = speakingRate;
  const playRecordingRef = useRef<() => Promise<void>>(async () => undefined);
  const referenceTextRef = useRef(getGermanSpeechText(word));
  referenceTextRef.current = getGermanSpeechText(word);
  const compareFlow = useMemo(() => createCompareFlow({
    speakReference: (callbacks) => speakRef.current(referenceTextRef.current, 'normal', callbacks),
    playRecording: () => playRecordingRef.current(),
    timeoutMs: () => referenceTimeoutMs(referenceTextRef.current),
    isReferenceSpeaking: () => speakingRef.current !== null,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }), []);
  const compareStatus = useSyncExternalStore(compareFlow.subscribe, compareFlow.getStatus, compareFlow.getStatus);

  const controller = useMemo(() => createPronunciationController({
    wordId,
    focus: audioFocus,
    requestPermission: async () => {
      // İzin yalnızca kullanıcı kaydı başlatmak istediğinde istenir.
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      return { granted: permission.granted, canAskAgain: permission.canAskAgain };
    },
    startRecording: async () => {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    },
    stopRecording: async () => {
      // Kaydedicinin kendi süresi; durdurulunca sıfırlandığı için önce okunur.
      const seconds = recorder.getStatus().durationMillis / 1000;
      await recorder.stop();
      return { uri: recorder.uri, seconds };
    },
    restorePlaybackMode: () => setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }),
    moveToUniqueFile: moveRecordingToUniqueFile,
    measureDuration: (uri) => measureRecordingDuration(uri),
    fileExists: pronunciationFileExists,
    deleteFile: deletePronunciationFile,
    loadMap: () => readPronunciationRecordings(userId),
    updateMap: (mutate) => updatePronunciationRecordings(userId, mutate),
  }), [userId, wordId, recorder]);

  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  // pause() sonrası native tarafın oturumu geciktirilmiş şekilde kapatması,
  // hemen ardından başlayan kaydı kesiyordu; oturumu açık tutarak bu yarış önlenir.
  const player = useAudioPlayer(state.uri ?? undefined, { keepAudioSessionActive: true });
  const playerStatus = useAudioPlayerStatus(player);
  const isRecording = state.status === 'recording';
  const isStopping = state.status === 'stopping';
  const isStarting = state.status === 'starting';
  const isPlaying = playerStatus.playing;
  const controlsBusy = isStarting || isStopping;

  useEffect(() => {
    finishedRef.current = false;
  }, [state.uri]);

  useEffect(() => {
    if (playerStatus.didJustFinish) finishedRef.current = true;
  }, [playerStatus.didJustFinish]);

  // Kayıtlı telaffuzu yükle; ekran kapanınca/kelime-kullanıcı değişince kaydı güvenle durdur.
  useEffect(() => {
    if (Platform.OS !== 'web') void controller.load();
    return () => { void controller.dispose(); };
  }, [controller]);

  // Ekran kapanınca/kelime değişince çalışan karşılaştırma iptal edilir (sesler hook'lar tarafından da durdurulur).
  useEffect(() => () => compareFlow.cancel(), [compareFlow]);
  useEffect(() => { compareFlow.cancel(); }, [wordId, userId, compareFlow]);

  // Oynatma durdurma işlevi ses odağına kaydedilir (seslendirme/kayıt başlayınca oynatma durur).
  useEffect(() => audioFocus.register('playback', () => {
    try { player.pause(); } catch { /* player serbest bırakılmış olabilir */ }
  }), [player]);

  // Uygulama arka plana geçince mikrofon açık kalmasın: kayıt durdurulup kaydedilir, oynatma duraklatılır.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') return;
      compareFlow.cancel();
      if (controller.getState().status === 'recording') void controller.stop('background');
      try { player.pause(); } catch { /* sessizce geç */ }
    });
    return () => subscription.remove();
  }, [controller, player, compareFlow]);

  // İşletim sistemi kaydı kesti (arama, ses odağı kaybı...): kaydedici durduğu hâlde arayüz "kaydediyor"
  // göstermesin. Kısa bir tolerans sonrası kaydedici hâlâ kapalıysa o ana kadarki kısım kaydedilir.
  useEffect(() => {
    if (!isRecording || recorderState.isRecording) return;
    const timer = setTimeout(() => {
      if (controller.getState().status === 'recording') void controller.stop('interrupted');
    }, 2500);
    return () => clearTimeout(timer);
  }, [isRecording, recorderState.isRecording, controller]);

  // Çok uzun kayıt depolamayı şişirmesin.
  useEffect(() => {
    if (isRecording && recorderState.durationMillis / 1000 >= MAX_RECORDING_SECONDS) {
      void controller.stop('max-length');
    }
  }, [isRecording, recorderState.durationMillis, controller]);

  const playRecording = async () => {
    if (!state.uri || playLockRef.current) return;
    // Kayıt oynatılmadan önce çalan her referans ses durdurulur; kayıt sürüyorsa oynatma başlamaz.
    if (!audioFocus.request('playback')) return;
    playLockRef.current = true;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      // Bitmiş kayıtta play() başa sarma tamamlanmadan çağrılırsa anında durur.
      const atEnd =
        finishedRef.current || (player.duration > 0 && player.currentTime >= player.duration - 0.1);
      if (atEnd) await player.seekTo(0);
      finishedRef.current = false;
      player.play();
    } catch {
      // Dosya açılamadıysa kullanıcıya bildir; uygulama çökmez.
      Alert.alert('Kayıt oynatılamadı', 'Kayıt dosyası açılamadı. Yeniden kaydetmeyi dene.');
    } finally {
      playLockRef.current = false;
    }
  };

  playRecordingRef.current = playRecording;

  const togglePlayback = async () => {
    if (!state.uri || controlsBusy || isRecording) return;
    compareFlow.cancel();
    if (player.playing) {
      player.pause();
      return;
    }
    controller.clearMessages();
    await playRecording();
  };

  // Karşılaştırma: önce Almanca referans, bitince kendi kaydın. Bitiş geri çağrısı gelmezse zaman aşımıyla
  // "manuel" duruma geçilir (takılı kalmaz); bitiş iki kez gelse bile kayıt bir kez çalar.
  const compare = () => {
    if (!state.uri || controlsBusy || isRecording) return;
    controller.clearMessages();
    if (player.playing) player.pause();
    void compareFlow.start();
  };

  const confirmDelete = () => {
    if (!state.uri || controlsBusy || isRecording) return;
    Alert.alert(
      'Kaydı sil',
      'Bu kelimenin telaffuz kaydı cihazından silinecek. Bu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            compareFlow.cancel();
            if (player.playing) player.pause();
            void controller.remove();
          },
        },
      ],
    );
  };

  const seconds = Math.floor(recorderState.durationMillis / 1000);
  const message = state.error
    ? ERROR_MESSAGES[state.error.code]
    : state.notice
      ? NOTICE_MESSAGES[state.notice]
      : compareStatus === 'manual'
        ? MANUAL_MESSAGE
        : '';

  return (
    <View style={[styles.card, isRecording && styles.cardRecording]}>
      <View style={styles.titleRow}>
        <AppIcon name="mic.fill" size={16} color={Colors.secondary} />
        <Text style={styles.title}>Telaffuz çalışması</Text>
      </View>

      {!isRecording && (
        <Text style={styles.guide}>
          1. Kelimeyi dinle  ·  2. Yavaş dinle  ·  3. Kendi sesini kaydet  ·  4. Karşılaştır
        </Text>
      )}

      {isRecording ? (
        <>
          <View style={styles.recordingRow} accessible accessibilityLabel={`Kayıt sürüyor, ${seconds} saniye`}>
            <View style={styles.recDot} />
            <Text style={styles.recText} maxFontSizeMultiplier={1.5}>
              Kaydediliyor  {formatDuration(seconds)} / {formatDuration(MAX_RECORDING_SECONDS)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.stopBtn]}
            onPress={() => { void controller.stop('user'); }}
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
          {!state.uri && (
            <Text style={styles.empty}>
              Henüz telaffuz kaydın yok. Kelimeyi dinle, sonra kendi sesini kaydedip karşılaştır.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, (controlsBusy || speakingRate !== null) && styles.disabled]}
            onPress={() => { compareFlow.cancel(); controller.clearMessages(); void controller.start(); }}
            disabled={controlsBusy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: controlsBusy }}
            accessibilityLabel={state.uri ? 'Telaffuzumu yeniden kaydet' : 'Telaffuzumu kaydet'}
          >
            <AppIcon name="mic.fill" size={18} color={Colors.primary} />
            <Text style={styles.primaryBtnText}>{state.uri ? 'Yeniden Kaydet' : 'Telaffuzumu Kaydet'}</Text>
          </TouchableOpacity>

          {!!state.uri && (
            <>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, isPlaying && styles.secondaryBtnActive]}
                  onPress={togglePlayback}
                  disabled={controlsBusy}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? 'Kaydı duraklat' : 'Kaydımı dinle'}
                >
                  <AppIcon name={isPlaying ? 'pause.fill' : 'play.fill'} size={16} color={Colors.primary} />
                  <Text style={styles.secondaryBtnText} maxFontSizeMultiplier={1.4}>
                    {isPlaying ? 'Duraklat' : 'Kaydımı Dinle'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryBtn, compareStatus === 'reference' && styles.secondaryBtnActive]}
                  onPress={compare}
                  disabled={controlsBusy}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Önce Almanca sesi, sonra kaydımı dinle"
                >
                  <AppIcon name="speaker.wave.2.fill" size={16} color={Colors.primary} />
                  <Text style={styles.secondaryBtnText} maxFontSizeMultiplier={1.4}>
                    {compareStatus === 'reference' ? 'Referans çalıyor…' : 'Karşılaştır'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={confirmDelete}
                disabled={controlsBusy}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Kaydı sil"
              >
                <AppIcon name="trash" size={16} color={Colors.error} />
                <Text style={styles.deleteBtnText} maxFontSizeMultiplier={1.4}>Kaydı Sil</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      {!!message && (
        <View accessibilityLiveRegion="polite" style={styles.messageBox}>
          <Text style={state.error ? styles.error : styles.notice}>{message}</Text>
          {state.error?.needsSettings && (
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => { void Linking.openSettings(); }}
              accessibilityRole="button"
              accessibilityLabel="Cihaz ayarlarını aç"
            >
              <Text style={styles.settingsBtnText}>Ayarları aç</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.footnote}>
        Wortly telaffuzunu puanlamaz; referans sesle kendi kaydını karşılaştırarak çalışırsın. Kayıtların yalnızca
        bu cihazda saklanır ve buluta gönderilmez.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: Spacing.md, ...Shadows.level1, gap: Spacing.sm },
  cardRecording: { borderWidth: 1.5, borderColor: Colors.error },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  guide: { fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 18 },
  empty: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.error },
  recText: { fontSize: 15, fontWeight: '700', color: Colors.error, flexShrink: 1 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, paddingHorizontal: Spacing.md, backgroundColor: Colors.golden, borderRadius: BorderRadius.lg },
  stopBtn: { backgroundColor: Colors.errorContainer },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primary, flexShrink: 1 },
  disabled: { opacity: 0.55 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  secondaryBtn: { flex: 1, minWidth: 130, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: Spacing.touchTargetMin, paddingHorizontal: Spacing.sm, backgroundColor: Colors.surfaceContainer, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: 'transparent' },
  secondaryBtnActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary, flexShrink: 1 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: Spacing.touchTargetMin, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.errorContainer },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: Colors.error },
  messageBox: { gap: Spacing.sm },
  error: { fontSize: 13, color: Colors.error, fontWeight: '600', lineHeight: 18 },
  notice: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '600', lineHeight: 18 },
  settingsBtn: { alignSelf: 'flex-start', minHeight: Spacing.touchTargetMin, paddingHorizontal: 16, borderRadius: 999, backgroundColor: Colors.golden, alignItems: 'center', justifyContent: 'center' },
  settingsBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  footnote: { fontSize: 11, color: Colors.onSurfaceVariant, lineHeight: 16 },
});

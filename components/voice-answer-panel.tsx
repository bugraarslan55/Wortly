import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useGermanSpeechRecognition } from '../modules/wortly-speech-recognition';
import type { SpeechAvailability, SpeechError } from '../modules/wortly-speech-recognition';
import { audioFocus } from '../utils/audio-focus';
import {
  describeVoice, VOICE_BUSY_MESSAGE, VOICE_IDLE_HINT, VOICE_LISTENING_MESSAGE, VOICE_PRIVACY_NOTE, VOICE_PROCESSING_MESSAGE,
  VOICE_UNAVAILABLE_MESSAGE, type SpeechChoiceOption,
} from '../utils/speech-answer';
import { BorderRadius, Spacing } from '../constants/theme';
import { makeStyles } from '../hooks/use-theme';
import { PrimaryButton } from './ui';

const LETTERS = ['A', 'B'];

interface Props {
  options: readonly SpeechChoiceOption[];
  /** Şu an seçili dal (dokunarak ya da sesle). Elle başka seçim yapılınca eski sesli sonuç gösterilmez. */
  selected: 0 | 1 | undefined;
  /** Tanınan cevap TEK bir seçenekle eşleşince çağrılır (anlık durum başına bir kez). */
  onMatch: (index: 0 | 1) => void;
}

/**
 * Karar noktasında cihaz içi Almanca sesli cevap. Mikrofon yalnızca kullanıcı düğmeye basınca açılır; ses/transkript
 * kaydedilmez ve gönderilmez. Panel yalnızca sesli karar noktalarında bağlanır; kapanınca (unmount), ekran odağı
 * kaybedince ve uygulama arka plana geçince dinleme durur. Hiçbir durumda seçeneklerin kullanımını engellemez.
 */
export function VoiceAnswerPanel({ options, selected, onMatch }: Props) {
  const styles = useStyles();
  const { ready, snapshot, start, stop, cancel, getAvailability } = useGermanSpeechRecognition();
  const [availability, setAvailability] = useState<SpeechAvailability | null>(null);
  const [startError, setStartError] = useState<SpeechError | null>(null);
  const [applied, setApplied] = useState<typeof snapshot | null>(null);
  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;

  useEffect(() => {
    if (!ready) return;
    let active = true;
    getAvailability().then(
      result => { if (active) setAvailability(result); },
      () => {
        if (active) setAvailability({ available: false, reason: 'unknown', message: VOICE_UNAVAILABLE_MESSAGE });
      },
    );
    return () => { active = false; };
  }, [ready, getAvailability]);

  const active = snapshot.status !== 'idle';
  // Mikrofon açıkken seslendirme başlamasın; panel kapanınca ya da dinleme bitince odak bırakılır.
  useEffect(() => {
    if (!active) return;
    audioFocus.setRecording(true);
    return () => audioFocus.setRecording(false);
  }, [active]);

  // Ekran odağı kaybedince (üstüne başka ekran açılınca) ya da kapanınca dinlemeyi durdur.
  useFocusEffect(useCallback(() => () => { void cancel(); }, [cancel]));

  // Kullanıcı seçeneklere dokunduysa süren dinleme gereksizdir.
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (activeRef.current) void cancel();
  }, [selected, cancel]);

  const view = describeVoice({ availability, snapshot, startError, options, dismissed: false });
  useEffect(() => {
    if (view.kind === 'matched' && applied !== snapshot) {
      setApplied(snapshot);
      onMatchRef.current(view.index === 0 ? 0 : 1);
    }
  });
  const stale = view.kind === 'matched' && applied === snapshot && selected !== view.index;
  const shown = stale ? describeVoice({ availability, snapshot, startError, options, dismissed: true }) : view;

  const handlePress = async () => {
    if (snapshot.status === 'stopping' || snapshot.status === 'starting') return;
    if (snapshot.status === 'listening') {
      await stop();
      return;
    }
    setStartError(null);
    // Başka bir mikrofon kullanımı sürüyorsa başlama; seslendirme varsa burada durdurulur.
    if (!audioFocus.request('recording')) {
      setStartError({ code: 'busy', message: VOICE_BUSY_MESSAGE });
      return;
    }
    const result = await start();
    if (!result.ok) setStartError(result.error);
  };

  if (shown.kind === 'checking') return null;
  if (shown.kind === 'unavailable') {
    return (
      <View style={styles.card} accessibilityLabel="Sesli cevap">
        <Text style={styles.note} accessibilityLiveRegion="polite">{shown.message}</Text>
      </View>
    );
  }

  let message = VOICE_IDLE_HINT;
  let heard = '';
  let detail = '';
  let tone: 'normal' | 'error' = 'normal';
  let label = 'Sesle cevapla';
  let icon = 'mic.fill';
  if (shown.kind === 'listening') {
    message = VOICE_LISTENING_MESSAGE;
    heard = shown.interim;
    label = snapshot.status === 'starting' ? 'Hazırlanıyor…' : 'Dinlemeyi bitir';
    icon = 'stop.fill';
  } else if (shown.kind === 'processing') {
    message = VOICE_PROCESSING_MESSAGE;
    heard = shown.interim;
    label = 'İşleniyor…';
  } else if (shown.kind === 'matched') {
    message = `Cevap ${LETTERS[shown.index]} seçildi.`;
    heard = shown.heard;
    label = 'Tekrar söyle';
    icon = 'arrow.clockwise';
  } else if (shown.kind === 'no-match') {
    message = shown.message;
    heard = shown.heard;
    tone = 'error';
    label = 'Tekrar dene';
    icon = 'arrow.clockwise';
  } else if (shown.kind === 'error') {
    message = shown.message;
    detail = shown.detail ?? '';
    tone = 'error';
    label = 'Tekrar dene';
    icon = 'arrow.clockwise';
  }

  return (
    <View style={styles.card} accessibilityLabel="Sesli cevap">
      <Text style={[styles.message, tone === 'error' && styles.messageError]} accessibilityLiveRegion="polite">{message}</Text>
      {!!heard && <Text style={styles.heard}>Duyduğum: “{heard}”</Text>}
      {!!detail && <Text style={styles.note} selectable>Teknik ayrıntı: {detail}</Text>}
      <PrimaryButton
        label={label}
        icon={icon}
        loading={shown.kind === 'processing' || snapshot.status === 'starting'}
        onPress={() => { void handlePress(); }}
        accessibilityHint="Mikrofonu açar; ses cihazında işlenir ve kaydedilmez"
      />
      <Text style={styles.note}>{VOICE_PRIVACY_NOTE}</Text>
    </View>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.xl, padding: Spacing.md, gap: Spacing.sm,
  },
  message: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.primary },
  messageError: { color: Colors.error },
  heard: { fontSize: 13, lineHeight: 18, color: Colors.onSurfaceVariant },
  note: { fontSize: 12, lineHeight: 17, color: Colors.onSurfaceVariant },
}));

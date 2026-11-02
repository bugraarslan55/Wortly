import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useWordStore } from '../../store';
import { useAuthStore } from '../../store/auth';
import { confirmDeleteWord } from '../../utils/confirm-word-delete';
import { KeyboardSafeView } from '../../components/keyboard-safe-view';
import { useActionLock } from '../../components/exercise-ui';
import { useGermanSpeech } from '../../utils/use-german-speech';
import { useRecordingActive } from '../../utils/use-recording-active';
import { getReviewState } from '../../utils/spaced-repetition';
import { ALL_TOPICS } from '../../constants/topics';
import { Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { makeStyles, useColors } from '../../hooks/use-theme';
import { Article, MasteryLevel } from '../../types';
import { AppIcon } from '../../components/app-icon';
import { GermanCharacterBar } from '../../components/german-character-bar';
import { PronunciationRecorder } from '../../components/pronunciation-recorder';
import { ColoredGermanPlural, ColoredGermanWord } from '../../components/colored-german-word';
import { findDuplicateCustomWord, MAX_EXAMPLE_LENGTH } from '../../utils/word-validation';
import { getArticlePalette } from '../../constants/article-colors';
import { getGermanSpeechText } from '../../utils/german-speech';
import { goBack } from '../../utils/safe-back';

const MASTERY_LABELS = ['Yeni', 'Öğreniliyor', 'Bilinçli', 'Öğrenildi'];
const ARTICLES: Article[] = ['der', 'die', 'das', ''];

export default function KelimeDetayScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { words, reviewStates, updateWord, deleteWord } = useWordStore();
  const sessionUserId = useAuthStore(state => state.session?.user.id);

  const builtInTopic = ALL_TOPICS.find(topic =>
    topic.words.some(candidate => candidate.id === id)
  );
  const builtInWord = builtInTopic?.words.find(candidate => candidate.id === id);
  const word = words.find(candidate => candidate.id === id) || builtInWord;
  // Konu kelimelerinin seviyesi reviewStates'te tutulur (kelime nesnesinde hep 0'dır).
  const masteryLevel = word ? getReviewState(word, reviewStates).masteryLevel : 0;
  const germanInputRef = useRef<TextInput>(null);
  const turkishInputRef = useRef<TextInput>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [german, setGerman] = useState(word?.german || '');
  const [article, setArticle] = useState<Article>(word?.article || '');
  const [turkish, setTurkish] = useState(word?.turkish || '');
  const [plural, setPlural] = useState(word?.plural || '');
  const [example, setExample] = useState(word?.example || '');
  const [exampleTurkish, setExampleTurkish] = useState(word?.exampleTurkish || '');
  const [saving, setSaving] = useState(false);
  const saveLock = useActionLock();
  const { speak, speakingRate } = useGermanSpeech();
  // Mikrofon kaydı sürerken referans sesi kayda karışmasın diye dinleme düğmeleri pasiftir.
  const recordingActive = useRecordingActive();
  const [errors, setErrors] = useState<{ german?: string; turkish?: string; duplicate?: string }>({});

  // Almanca okuma hem hazır konu kelimeleri hem kişisel kelimeler için kullanılabilir.
  const canUseSpeech = true;

  const duplicateWord = word
    ? findDuplicateCustomWord(words, german, article, word.id)
    : undefined;

  if (!word) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <AppIcon name="questionmark.circle" size={36} color={colors.outlineVariant} />
          <Text style={styles.emptyText}>Kelime bulunamadı</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => goBack(router)}>
            <Text style={styles.backBtnText}>← Geri</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = async () => {
    if (!saveLock.acquire()) return; // hızlı çift dokunuşta iki kez kaydetme

    const nextErrors = {
      german: german.trim() ? undefined : 'Almanca kelimeyi yazmalısın.',
      turkish: turkish.trim() ? undefined : 'Türkçe anlamını yazmalısın.',
      duplicate: duplicateWord
        ? `${duplicateWord.article ? `${duplicateWord.article} ` : ''}${duplicateWord.german} zaten Kelimelerim listende.`
        : undefined,
    };
    setErrors(nextErrors);

    if (nextErrors.german || nextErrors.duplicate) {
      saveLock.release();
      germanInputRef.current?.focus();
      return;
    }
    if (nextErrors.turkish) {
      saveLock.release();
      turkishInputRef.current?.focus();
      return;
    }

    setSaving(true);
    const result = await updateWord(id, {
      german: german.trim(),
      article,
      turkish: turkish.trim(),
      plural: plural.trim() || undefined,
      example: example.trim() || undefined,
      exampleTurkish: exampleTurkish.trim() || undefined,
    });

    saveLock.release();
    if (!result.ok) {
      setSaving(false);
      setErrors(current => ({
        ...current,
        duplicate: `${result.existing.article ? `${result.existing.article} ` : ''}${result.existing.german} zaten Kelimelerim listende.`,
      }));
      germanInputRef.current?.focus();
      return;
    }

    setSaving(false);
    setErrors({});
    setIsEditing(false);
  };

  const handleDelete = () => {
    // Telaffuz kaydı varsa kullanıcıya ayrıca sorulur; onay olmadan ses dosyası silinmez.
    void confirmDeleteWord({
      userId: sessionUserId,
      wordId: id,
      label: word.german,
      onDeleteWord: async () => {
        await deleteWord(id);
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/kelimelerim' as any);
      },
    });
  };

  const handleSpeak = (mode: 'normal' | 'slow') => {
    if (word) void speak(getGermanSpeechText(word), mode);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router)} style={styles.backBtnHeader}>
          <Text style={styles.backBtnHeaderText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kelime Detayı</Text>
        {word.isCustom && (
          <TouchableOpacity
            onPress={() => isEditing ? handleSave() : setIsEditing(true)}
            style={[styles.editBtn, saving && styles.editBtnDisabled]}
            disabled={saving}
          >
            <Text style={styles.editBtnText}>
              {saving ? 'Kaydediliyor…' : isEditing ? 'Kaydet' : 'Düzenle'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardSafeView>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Main card */}
        <View style={styles.mainCard}>
          {!isEditing ? (
            <>
              <ColoredGermanWord
                article={word.article}
                german={word.german}
                style={styles.germanDisplay}
                articleStyle={styles.articleDisplay}
              />
              <Text style={styles.turkishDisplay}>{word.turkish}</Text>
              {word.plural && (
                <ColoredGermanPlural plural={word.plural} style={styles.metaDisplay} />
              )}
              {canUseSpeech && (
                <View style={styles.speechRow}>
                  <TouchableOpacity
                    style={[styles.speechBtn, speakingRate === 'normal' && styles.speechBtnActive, recordingActive && { opacity: 0.45 }]}
                    disabled={recordingActive}
                    onPress={() => handleSpeak('normal')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Kelimeyi normal hızda dinle"
                  >
                    <AppIcon name="speaker.wave.2.fill" size={17} color={colors.primary} />
                    <Text style={styles.speechBtnText}>Dinle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.speechBtn, speakingRate === 'slow' && styles.speechBtnActive, recordingActive && { opacity: 0.45 }]}
                    disabled={recordingActive}
                    onPress={() => handleSpeak('slow')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Kelimeyi yavaş hızda dinle"
                  >
                    <AppIcon name="tortoise.fill" size={17} color={colors.primary} />
                    <Text style={styles.speechBtnText}>Yavaş</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <View style={styles.editForm}>
              <Text style={styles.editLabel}>Artikel</Text>
              <View style={styles.articleRow}>
                {ARTICLES.map(art => {
                  const palette = getArticlePalette(art, colors);
                  const isActive = article === art;
                  return (
                    <TouchableOpacity
                      key={art || 'none'}
                      style={[
                        styles.articleBtn,
                        isActive && { backgroundColor: palette.background, borderColor: palette.foreground },
                      ]}
                      onPress={() => {
                        setArticle(art);
                        setErrors(current => ({ ...current, duplicate: undefined }));
                      }}
                    >
                      <Text style={[styles.articleBtnText, isActive && { color: palette.foreground }]}>
                        {art || 'Yok'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.editLabel}>Almanca kelime *</Text>
              <TextInput
                ref={germanInputRef}
                style={[styles.editInput, (errors.german || errors.duplicate) && styles.editInputError]}
                value={german}
                onChangeText={(value) => {
                  setGerman(value);
                  setErrors(current => ({ ...current, german: undefined, duplicate: undefined }));
                }}
                onBlur={() => {
                  if (!german.trim()) {
                    setErrors(current => ({ ...current, german: 'Almanca kelimeyi yazmalısın.' }));
                  }
                }}
                placeholder="Almanca"
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => turkishInputRef.current?.focus()}
              />
              <GermanCharacterBar onSelect={(character) => {
                setGerman(value => value + character);
                setErrors(current => ({ ...current, german: undefined, duplicate: undefined }));
              }} />
              {errors.german && <Text style={styles.errorText}>{errors.german}</Text>}
              {(errors.duplicate || duplicateWord) && (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {errors.duplicate || `${duplicateWord?.article ? `${duplicateWord.article} ` : ''}${duplicateWord?.german} zaten Kelimelerim listende.`}
                </Text>
              )}

              <Text style={styles.editLabel}>Türkçe anlamı *</Text>
              <TextInput
                ref={turkishInputRef}
                style={[styles.editInput, errors.turkish && styles.editInputError]}
                value={turkish}
                onChangeText={(value) => {
                  setTurkish(value);
                  setErrors(current => ({ ...current, turkish: undefined }));
                }}
                onBlur={() => {
                  if (!turkish.trim()) {
                    setErrors(current => ({ ...current, turkish: 'Türkçe anlamını yazmalısın.' }));
                  }
                }}
                placeholder="Türkçe"
              />
              {errors.turkish && <Text style={styles.errorText}>{errors.turkish}</Text>}

              <Text style={styles.editLabel}>Çoğul formu (isteğe bağlı)</Text>
              <TextInput style={styles.editInput} value={plural} onChangeText={setPlural} placeholder="Çoğul" />
              <GermanCharacterBar onSelect={(character) => setPlural(value => value + character)} />
            </View>
          )}
        </View>

        {/* Mastery level */}
        <View style={styles.masteryCard}>
          <Text style={styles.masteryLabel}>Öğrenme Seviyesi</Text>
          <Text style={styles.masteryValue}>{MASTERY_LABELS[masteryLevel]}</Text>
          <View style={styles.masteryStars}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.masteryStar, i <= masteryLevel && styles.masteryStarFilled]}>
                <AppIcon name="circle.fill" size={10} color={colors.secondaryFixedDim} />
              </View>
            ))}
          </View>
        </View>

        {/* Example sentence */}
        {(word.example || isEditing) && (
          <View style={styles.exampleCard}>
            <View style={styles.exampleTitleRow}>
              <AppIcon name="text.quote" size={16} color={colors.secondary} />
              <Text style={styles.exampleTitle}>Örnek Cümle</Text>
            </View>
            {!isEditing ? (
              <>
                <Text style={styles.exampleGerman}>{word.example}</Text>
                {word.exampleTurkish && (
                  <Text style={styles.exampleTurkish}>{word.exampleTurkish}</Text>
                )}
              </>
            ) : (
              <>
                <TextInput
                  style={[styles.editInput, { marginBottom: Spacing.sm }]}
                  value={example}
                  onChangeText={setExample}
                  placeholder="Almanca örnek cümle"
                  multiline
                  maxLength={MAX_EXAMPLE_LENGTH}
                />
                <GermanCharacterBar onSelect={(character) => setExample(value => value + character)} />
                <TextInput
                  style={styles.editInput}
                  value={exampleTurkish}
                  onChangeText={setExampleTurkish}
                  placeholder="Türkçe çevirisi"
                  multiline
                  maxLength={MAX_EXAMPLE_LENGTH}
                />
              </>
            )}
          </View>
        )}

        {/* Pronunciation recording (device-only) */}
        {!isEditing && <PronunciationRecorder word={word} />}

        {/* Quiz CTA */}
        <TouchableOpacity
          style={styles.quizBtn}
          onPress={() => router.push(`/alistirma/yazma?wordIds=${word.id}` as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.quizBtnText}>Bu Kelimeyle Çalış</Text>
        </TouchableOpacity>

        {/* Delete */}
        {word.isCustom && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
            <Text style={styles.deleteBtnText}>Kelimeyi Sil</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardSafeView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.md },
  backBtnHeader: { paddingVertical: 6 },
  backBtnHeaderText: { fontSize: 15, color: Colors.onSurfaceVariant, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  editBtn: { backgroundColor: Colors.golden, paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.md },
  editBtnDisabled: { opacity: 0.5 },
  editBtnText: { fontSize: 13, fontWeight: '700', color: Colors.onGolden },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: 60, gap: Spacing.md },
  mainCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 24, padding: Spacing.xl, alignItems: 'center', ...Shadows.level2 },
  articleDisplay: { fontSize: 20, fontWeight: '700' },
  germanDisplay: { fontSize: 36, fontWeight: '700', color: Colors.primary, textAlign: 'center', marginBottom: Spacing.sm },
  turkishDisplay: { fontSize: 20, color: Colors.onSurfaceVariant, textAlign: 'center' },
  metaDisplay: { fontSize: 13, color: Colors.outlineVariant, marginTop: Spacing.sm },
  speechRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  speechBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 108, height: 44, paddingHorizontal: Spacing.md, backgroundColor: Colors.surfaceContainer, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: 'transparent' },
  speechBtnActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  speechBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  editForm: { width: '100%', gap: Spacing.sm },
  editLabel: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  articleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  articleBtn: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceContainer, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent' },
  articleBtnText: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  editInput: { backgroundColor: Colors.surfaceContainer, borderRadius: 12, padding: Spacing.md, fontSize: 15, color: Colors.primary },
  editInputError: { borderWidth: 1.5, borderColor: Colors.error, backgroundColor: Colors.errorContainer },
  errorText: { fontSize: 12, color: Colors.error, fontWeight: '600', lineHeight: 17 },
  masteryCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: Spacing.md, ...Shadows.level1, gap: 6 },
  masteryLabel: { fontSize: 12, fontWeight: '600', color: Colors.outlineVariant, textTransform: 'uppercase' },
  masteryValue: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  masteryStars: { flexDirection: 'row', gap: 4 },
  masteryStar: { opacity: 0.2 },
  masteryStarFilled: { opacity: 1 },
  exampleCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: Spacing.md, ...Shadows.level1, gap: Spacing.sm },
  exampleTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  exampleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  exampleGerman: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  exampleTurkish: { fontSize: 13, color: Colors.onSurfaceVariant },
  quizBtn: { backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, height: 54, alignItems: 'center', justifyContent: 'center' },
  quizBtnText: { fontSize: 15, fontWeight: '700', color: Colors.onGolden },
  deleteBtn: { borderRadius: BorderRadius.lg, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.errorContainer },
  deleteBtnText: { fontSize: 14, color: Colors.error, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyText: { fontSize: 16, color: Colors.onSurfaceVariant },
  backBtn: { backgroundColor: Colors.golden, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: Colors.onGolden },
}));

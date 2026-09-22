import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert, TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useWordStore } from '../../store';
import { ALL_TOPICS } from '../../constants/topics';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Article, MasteryLevel } from '../../types';
import { AppIcon } from '../../components/app-icon';
import { GermanCharacterBar } from '../../components/german-character-bar';
import { ColoredGermanPlural, ColoredGermanWord } from '../../components/colored-german-word';
import { findDuplicateCustomWord } from '../../utils/word-validation';
import { getArticlePalette } from '../../constants/article-colors';
import { getGermanSpeechText } from '../../utils/german-speech';

const MASTERY_LABELS = ['Yeni', 'Öğreniliyor', 'Bilinçli', 'Öğrenildi'];
const ARTICLES: Article[] = ['der', 'die', 'das', ''];

export default function KelimeDetayScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { words, updateWord, deleteWord } = useWordStore();

  const builtInTopic = ALL_TOPICS.find(topic =>
    topic.words.some(candidate => candidate.id === id)
  );
  const builtInWord = builtInTopic?.words.find(candidate => candidate.id === id);
  const word = words.find(candidate => candidate.id === id) || builtInWord;
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
  const [speakingRate, setSpeakingRate] = useState<'normal' | 'slow' | null>(null);
  const [errors, setErrors] = useState<{ german?: string; turkish?: string; duplicate?: string }>({});
  const speechRequestRef = useRef(0);

  const canUseSpeech = builtInTopic?.level === 'A1' || builtInTopic?.level === 'A2';

  useEffect(() => () => {
    speechRequestRef.current += 1;
    void Speech.stop();
  }, []);

  const duplicateWord = word
    ? findDuplicateCustomWord(words, german, article, word.id)
    : undefined;

  if (!word) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <AppIcon name="questionmark.circle" size={36} color={Colors.outlineVariant} />
          <Text style={styles.emptyText}>Kelime bulunamadı</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Geri</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = async () => {
    if (saving) return;

    const nextErrors = {
      german: german.trim() ? undefined : 'Almanca kelimeyi yazmalısın.',
      turkish: turkish.trim() ? undefined : 'Türkçe anlamını yazmalısın.',
      duplicate: duplicateWord
        ? `${duplicateWord.article ? `${duplicateWord.article} ` : ''}${duplicateWord.german} zaten Kelimelerim listende.`
        : undefined,
    };
    setErrors(nextErrors);

    if (nextErrors.german || nextErrors.duplicate) {
      germanInputRef.current?.focus();
      return;
    }
    if (nextErrors.turkish) {
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
    Alert.alert(
      'Kelimeyi Sil',
      `"${word.german}" kelimesini silmek istiyor musun?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: async () => { await deleteWord(id); router.back(); } },
      ]
    );
  };

  const handleSpeak = async (mode: 'normal' | 'slow') => {
    if (!word || !canUseSpeech) return;

    const requestId = speechRequestRef.current + 1;
    speechRequestRef.current = requestId;
    setSpeakingRate(mode);
    await Speech.stop();

    if (speechRequestRef.current !== requestId) return;

    const finish = () => {
      if (speechRequestRef.current === requestId) setSpeakingRate(null);
    };

    Speech.speak(getGermanSpeechText(word), {
      language: 'de-DE',
      rate: mode === 'slow' ? 0.30 : 0.92,
      pitch: 1,
      onDone: finish,
      onError: finish,
      onStopped: finish,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnHeader}>
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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                    style={[styles.speechBtn, speakingRate === 'normal' && styles.speechBtnActive]}
                    onPress={() => handleSpeak('normal')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Kelimeyi normal hızda dinle"
                  >
                    <AppIcon name="speaker.wave.2.fill" size={17} color={Colors.primary} />
                    <Text style={styles.speechBtnText}>Dinle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.speechBtn, speakingRate === 'slow' && styles.speechBtnActive]}
                    onPress={() => handleSpeak('slow')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Kelimeyi yavaş hızda dinle"
                  >
                    <AppIcon name="tortoise.fill" size={17} color={Colors.primary} />
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
                  const palette = getArticlePalette(art);
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
          <Text style={styles.masteryValue}>{MASTERY_LABELS[word.masteryLevel]}</Text>
          <View style={styles.masteryStars}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.masteryStar, i <= word.masteryLevel && styles.masteryStarFilled]}>
                <AppIcon name="circle.fill" size={10} color={Colors.secondaryFixedDim} />
              </View>
            ))}
          </View>
        </View>

        {/* Example sentence */}
        {(word.example || isEditing) && (
          <View style={styles.exampleCard}>
            <View style={styles.exampleTitleRow}>
              <AppIcon name="text.quote" size={16} color={Colors.secondary} />
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
                />
                <GermanCharacterBar onSelect={(character) => setExample(value => value + character)} />
                <TextInput
                  style={styles.editInput}
                  value={exampleTurkish}
                  onChangeText={setExampleTurkish}
                  placeholder="Türkçe çevirisi"
                  multiline
                />
              </>
            )}
          </View>
        )}

        {/* Quiz CTA */}
        <TouchableOpacity
          style={styles.quizBtn}
          onPress={() => router.push(`/alistirma/dogru-yanlis?wordIds=${word.id}` as any)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.md },
  backBtnHeader: { paddingVertical: 6 },
  backBtnHeaderText: { fontSize: 15, color: Colors.onSurfaceVariant, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  editBtn: { backgroundColor: Colors.golden, paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.md },
  editBtnDisabled: { opacity: 0.5 },
  editBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
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
  quizBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  deleteBtn: { borderRadius: BorderRadius.lg, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.errorContainer },
  deleteBtnText: { fontSize: 14, color: Colors.error, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyText: { fontSize: 16, color: Colors.onSurfaceVariant },
  backBtn: { backgroundColor: Colors.golden, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});

import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useWordStore } from '../../store';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Article } from '../../types';
import { GermanCharacterBar } from '../../components/german-character-bar';
import { ColoredGermanPlural, ColoredGermanWord } from '../../components/colored-german-word';
import { findDuplicateCustomWord } from '../../utils/word-validation';
import { getArticlePalette } from '../../constants/article-colors';

const ARTICLES: Article[] = ['der', 'die', 'das', ''];
const ARTICLE_LABELS: Record<Article, string> = {
  'der': 'der', 'die': 'die', 'das': 'das', '': 'Yok',
};

export default function KelimeEkleScreen() {
  const router = useRouter();
  const { addWord, words } = useWordStore();
  const germanInputRef = useRef<TextInput>(null);
  const turkishInputRef = useRef<TextInput>(null);

  const [german, setGerman] = useState('');
  const [article, setArticle] = useState<Article>('');
  const [turkish, setTurkish] = useState('');
  const [plural, setPlural] = useState('');
  const [example, setExample] = useState('');
  const [exampleTurkish, setExampleTurkish] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ german?: string; turkish?: string; duplicate?: string }>({});

  const duplicateWord = findDuplicateCustomWord(words, german, article);
  const isValid = german.trim().length > 0 && turkish.trim().length > 0 && !duplicateWord;

  const updateGerman = (value: string) => {
    setGerman(value);
    setErrors(current => ({ ...current, german: undefined, duplicate: undefined }));
  };

  const updateTurkish = (value: string) => {
    setTurkish(value);
    setErrors(current => ({ ...current, turkish: undefined }));
  };

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
    const result = await addWord({
        german: german.trim(),
        article,
        turkish: turkish.trim(),
        plural: plural.trim() || undefined,
        example: example.trim() || undefined,
        exampleTurkish: exampleTurkish.trim() || undefined,
        isCustom: true,
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

    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>İptal</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Yeni Kelime</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityHint="Zorunlu alanları kontrol edip kelimeyi kaydeder"
          >
            <Text style={styles.saveBtnText}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
          </TouchableOpacity>
        </View>

        {/* Handle bar */}
        <View style={styles.handleBar} />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Almanca Kelime */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Almanca Kelime *</Text>
            <TextInput
              ref={germanInputRef}
              style={[styles.input, (errors.german || errors.duplicate) && styles.inputError]}
              value={german}
              onChangeText={updateGerman}
              onBlur={() => {
                if (!german.trim()) {
                  setErrors(current => ({ ...current, german: 'Almanca kelimeyi yazmalısın.' }));
                }
              }}
              placeholder="örn: Apfel"
              placeholderTextColor={Colors.outlineVariant}
              autoCapitalize="words"
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => turkishInputRef.current?.focus()}
            />
            <GermanCharacterBar onSelect={(character) => updateGerman(german + character)} />
            {errors.german && <Text style={styles.errorText} selectable>{errors.german}</Text>}
            {(errors.duplicate || duplicateWord) && (
              <Text style={styles.errorText} selectable accessibilityLiveRegion="polite">
                {errors.duplicate || `${duplicateWord?.article ? `${duplicateWord.article} ` : ''}${duplicateWord?.german} zaten Kelimelerim listende.`}
              </Text>
            )}
          </View>

          {/* Artikel */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Artikel (Cinsiyet)</Text>
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
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.articleBtnText, isActive && { color: palette.foreground }]}>
                      {ARTICLE_LABELS[art]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Türkçe */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Türkçe Anlamı *</Text>
            <TextInput
              ref={turkishInputRef}
              style={[styles.input, errors.turkish && styles.inputError]}
              value={turkish}
              onChangeText={updateTurkish}
              onBlur={() => {
                if (!turkish.trim()) {
                  setErrors(current => ({ ...current, turkish: 'Türkçe anlamını yazmalısın.' }));
                }
              }}
              placeholder="örn: elma"
              placeholderTextColor={Colors.outlineVariant}
            />
            {errors.turkish && <Text style={styles.errorText} selectable>{errors.turkish}</Text>}
          </View>

          {/* Çoğul */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Çoğul Formu <Text style={styles.optional}>(isteğe bağlı)</Text></Text>
            <TextInput
              style={styles.input}
              value={plural}
              onChangeText={setPlural}
              placeholder="örn: die Äpfel"
              placeholderTextColor={Colors.outlineVariant}
            />
            <GermanCharacterBar onSelect={(character) => setPlural(value => value + character)} />
          </View>

          {/* Örnek Cümle */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Almanca Örnek Cümle <Text style={styles.optional}>(isteğe bağlı)</Text></Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={example}
              onChangeText={setExample}
              placeholder="örn: Ich esse einen Apfel."
              placeholderTextColor={Colors.outlineVariant}
              multiline
              numberOfLines={2}
            />
            <GermanCharacterBar onSelect={(character) => setExample(value => value + character)} />
          </View>

          {/* Örnek Cümle Türkçe */}
          {example.trim().length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Türkçe Çevirisi <Text style={styles.optional}>(isteğe bağlı)</Text></Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={exampleTurkish}
                onChangeText={setExampleTurkish}
                placeholder="örn: Bir elma yiyorum."
                placeholderTextColor={Colors.outlineVariant}
                multiline
                numberOfLines={2}
              />
            </View>
          )}

          {/* Preview */}
          {isValid && (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Önizleme:</Text>
              <View style={styles.previewCard}>
                <ColoredGermanWord
                  article={article}
                  german={german}
                  style={styles.previewGerman}
                  articleStyle={styles.previewArticle}
                />
                <Text style={styles.previewTurkish}>{turkish}</Text>
                {plural ? <ColoredGermanPlural plural={plural} style={styles.previewMeta} /> : null}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.md,
  },
  cancelBtn: { paddingVertical: 6, paddingRight: 12 },
  cancelBtnText: { fontSize: 15, color: Colors.onSurfaceVariant, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  saveBtn: { backgroundColor: Colors.golden, paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.md },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  handleBar: { width: 36, height: 4, backgroundColor: Colors.outlineVariant, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.sm },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: 60, gap: Spacing.md },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  optional: { fontWeight: '400', color: Colors.outlineVariant },
  input: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    padding: Spacing.md, fontSize: 16, color: Colors.primary,
    borderWidth: 1.5, borderColor: Colors.outlineVariant, ...Shadows.level1,
  },
  inputError: { borderColor: Colors.error, backgroundColor: Colors.errorContainer },
  errorText: { fontSize: 12, color: Colors.error, fontWeight: '600', lineHeight: 17 },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  articleRow: { flexDirection: 'row', gap: Spacing.sm },
  articleBtn: {
    flex: 1, height: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceContainer, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  articleBtnText: { fontSize: 14, fontWeight: '600', color: Colors.onSurfaceVariant },
  preview: { gap: Spacing.sm },
  previewLabel: { fontSize: 12, fontWeight: '600', color: Colors.outlineVariant, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 16, padding: Spacing.md, ...Shadows.level1 },
  previewGerman: { fontSize: 22, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  previewArticle: { fontSize: 16, fontWeight: '700' },
  previewTurkish: { fontSize: 15, color: Colors.onSurfaceVariant },
  previewMeta: { fontSize: 12, color: Colors.outlineVariant, marginTop: 4 },
});

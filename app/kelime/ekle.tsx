import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWordStore } from '../../store';
import { Spacing, BorderRadius, getCards } from '../../constants/theme';
import { makeStyles, useColors } from '../../hooks/use-theme';
import { Article } from '../../types';
import { KeyboardSafeView } from '../../components/keyboard-safe-view';
import { GermanCharacterBar } from '../../components/german-character-bar';
import { ColoredGermanPlural, ColoredGermanWord } from '../../components/colored-german-word';
import {
  Card, FormField, PrimaryButton, SectionTitle, SegmentedControl, TextField,
} from '../../components/ui';
import { findDuplicateCustomWord, MAX_EXAMPLE_LENGTH } from '../../utils/word-validation';
import { getArticlePalette } from '../../constants/article-colors';
import { goBack } from '../../utils/safe-back';

const ARTICLES: Article[] = ['der', 'die', 'das', ''];
const ARTICLE_LABELS: Record<Article, string> = {
  'der': 'der', 'die': 'die', 'das': 'das', '': 'Yok',
};

export default function KelimeEkleScreen() {
  const styles = useStyles();
  const colors = useColors();
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
  // state güncellemesi bir sonraki render'da görünür; ardışık hızlı dokunuşları ref ile engelle.
  const savingRef = useRef(false);
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
    if (savingRef.current) return;

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

    savingRef.current = true;
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
      savingRef.current = false;
      setSaving(false);
      setErrors(current => ({
        ...current,
        duplicate: `${result.existing.article ? `${result.existing.article} ` : ''}${result.existing.german} zaten Kelimelerim listende.`,
      }));
      germanInputRef.current?.focus();
      return;
    }

    goBack(router);
  };

  const germanError = errors.german
    || errors.duplicate
    || (duplicateWord
      ? `${duplicateWord.article ? `${duplicateWord.article} ` : ''}${duplicateWord.german} zaten Kelimelerim listende.`
      : undefined);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardSafeView>
        <View style={styles.handleBar} />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => goBack(router)}
            style={styles.cancelBtn}
            accessibilityRole="button"
            accessibilityLabel="İptal"
          >
            <Text style={styles.cancelBtnText}>İptal</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} accessibilityRole="header">Yeni Kelime</Text>
          <View style={styles.cancelBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Kelime */}
          <SectionTitle>Kelime</SectionTitle>
          <Card style={styles.card}>
            <FormField label="Almanca kelime" error={germanError}>
              <TextField
                ref={germanInputRef}
                invalid={!!germanError}
                value={german}
                onChangeText={updateGerman}
                onBlur={() => {
                  if (!german.trim()) {
                    setErrors(current => ({ ...current, german: 'Almanca kelimeyi yazmalısın.' }));
                  }
                }}
                placeholder="örn: Apfel"
                autoCapitalize="words"
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => turkishInputRef.current?.focus()}
                accessibilityLabel="Almanca kelime, zorunlu"
              />
              <GermanCharacterBar onSelect={(character) => updateGerman(german + character)} />
            </FormField>

            <FormField label="Artikel" hint="İsimlerin cinsiyetini belirtir. Emin değilsen “Yok” seç.">
              <SegmentedControl
                options={ARTICLES.map(art => {
                  const palette = getArticlePalette(art, colors);
                  return {
                    value: art,
                    label: ARTICLE_LABELS[art],
                    accessibilityLabel: art ? `Artikel ${art}` : 'Artikel yok',
                    activeBackground: palette.background,
                    activeColor: palette.foreground,
                    activeBorder: palette.foreground,
                  };
                })}
                value={article}
                onChange={(next) => {
                  setArticle(next);
                  setErrors(current => ({ ...current, duplicate: undefined }));
                }}
              />
            </FormField>

            <FormField label="Türkçe anlamı" error={errors.turkish}>
              <TextField
                ref={turkishInputRef}
                invalid={!!errors.turkish}
                value={turkish}
                onChangeText={updateTurkish}
                onBlur={() => {
                  if (!turkish.trim()) {
                    setErrors(current => ({ ...current, turkish: 'Türkçe anlamını yazmalısın.' }));
                  }
                }}
                placeholder="örn: elma"
                accessibilityLabel="Türkçe anlamı, zorunlu"
              />
            </FormField>
          </Card>

          {/* Ek bilgiler */}
          <SectionTitle>Ek bilgiler</SectionTitle>
          <Card style={styles.card}>
            <FormField label="Çoğul formu" optional>
              <TextField
                value={plural}
                onChangeText={setPlural}
                placeholder="örn: die Äpfel"
              />
              <GermanCharacterBar onSelect={(character) => setPlural(value => value + character)} />
            </FormField>

            <FormField
              label="Almanca örnek cümle"
              optional
              hint={`${example.length}/${MAX_EXAMPLE_LENGTH} karakter`}
            >
              <TextField
                value={example}
                onChangeText={setExample}
                placeholder="örn: Ich esse einen Apfel."
                multiline
                numberOfLines={2}
                maxLength={MAX_EXAMPLE_LENGTH}
              />
              <GermanCharacterBar onSelect={(character) => setExample(value => value + character)} />
            </FormField>

            {example.trim().length > 0 && (
              <FormField label="Türkçe çevirisi" optional hint={`${exampleTurkish.length}/${MAX_EXAMPLE_LENGTH} karakter`}>
                <TextField
                  value={exampleTurkish}
                  onChangeText={setExampleTurkish}
                  placeholder="örn: Bir elma yiyorum."
                  multiline
                  numberOfLines={2}
                  maxLength={MAX_EXAMPLE_LENGTH}
                />
              </FormField>
            )}
          </Card>

          {/* Önizleme */}
          {isValid && (
            <View style={styles.preview}>
              <SectionTitle>Önizleme</SectionTitle>
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

        <View style={styles.footer}>
          <PrimaryButton
            label={saving ? 'Kaydediliyor…' : 'Kaydet'}
            onPress={handleSave}
            loading={saving}
            accessibilityHint="Zorunlu alanları kontrol edip kelimeyi kaydeder"
          />
        </View>
      </KeyboardSafeView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  handleBar: {
    width: 36, height: 4, backgroundColor: Colors.outlineVariant, borderRadius: 2,
    alignSelf: 'center', marginTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.sm,
  },
  cancelBtn: { minWidth: 72, minHeight: Spacing.touchTargetMin, justifyContent: 'center' },
  cancelBtnText: { fontSize: 15, color: Colors.onSurfaceVariant, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: Spacing.lg, gap: Spacing.sm },
  card: { gap: Spacing.md },
  preview: { gap: Spacing.sm },
  previewCard: { ...getCards(Colors).surface, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4 },
  previewGerman: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  previewArticle: { fontSize: 16, fontWeight: '700' },
  previewTurkish: { fontSize: 15, color: Colors.onSurfaceVariant },
  previewMeta: { fontSize: 12, color: Colors.outline },
  footer: {
    paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
    backgroundColor: Colors.warmWhite, borderTopWidth: 1, borderTopColor: getCards(Colors).borderColor,
  },
}));

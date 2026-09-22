import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUserStore } from '../store';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { Level } from '../types';
import { AppIcon } from '../components/app-icon';

const LEVELS: { key: Level; label: string; subtitle: string; desc: string }[] = [
  { key: 'A1', label: 'A1', subtitle: 'Başlangıç', desc: 'Temel kelime dağarcığı' },
  { key: 'A2', label: 'A2', subtitle: 'Temel', desc: 'Günlük konuşma kelimeleri' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useUserStore();
  const [step, setStep] = useState<'welcome' | 'name' | 'level'>('welcome');
  const [name, setName] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<Level>('A1');
  const stepIndex = step === 'welcome' ? 0 : step === 'name' ? 1 : 2;

  const handleFinish = async () => {
    if (!name.trim()) return;
    await completeOnboarding(name.trim(), selectedLevel);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.stepRow} accessibilityLabel={`Adım ${stepIndex + 1} / 3`}>
            {[0, 1, 2].map((index) => (
              <View key={index} style={[styles.stepDot, index === stepIndex && styles.stepDotActive]} />
            ))}
          </View>

          {/* Başlık */}
          <View style={styles.header}>
            <Text style={styles.eyebrow}>ALMANCA · A1–A2</Text>
            <Text style={styles.headline}>
              {step === 'welcome'
                ? 'Almanca kelimelerini\ngerçekten öğren.'
                : step === 'name'
                ? 'Sana nasıl seslenelim?'
                : 'Seviyeni seç'}
            </Text>
            <Text style={styles.subtext}>
              {step === 'welcome'
                ? 'Kendi kelimelerini ekle, cümle içinde kullan ve her gün kısa tekrarlarla geliştir.'
                : step === 'name'
                ? 'Adını girerek başlayalım.'
                : 'Seviyene göre içerik hazırlayacağız.'}
            </Text>
          </View>

          {/* STEP: Welcome */}
          {step === 'welcome' && (
            <View style={styles.section}>
              {[
                { icon: 'books.vertical.fill', title: 'Hazır Konular', desc: 'A1 ve A2 seviyesinde kısa, odaklı konu setleri' },
                { icon: 'square.and.pencil', title: 'Kendi Kelimelerin', desc: 'İstediğin kelimeyi ekle ve alıştırmalarla pekiştir' },
                { icon: 'arrow.triangle.2.circlepath', title: 'Akıllı Tekrar', desc: 'Flashcard, yazma ve cümle alıştırmaları' },
              ].map((item) => (
                <View key={item.icon} style={styles.featureCard}>
                  <View style={styles.featureIconBox}>
                    <AppIcon name={item.icon} size={22} color={Colors.secondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{item.title}</Text>
                    <Text style={styles.featureDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* STEP: Name */}
          {step === 'name' && (
            <View style={styles.section}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Adın</Text>
                <TextInput
                  style={styles.input}
                  placeholder="örn: Ahmet"
                  placeholderTextColor={Colors.outlineVariant}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                  maxLength={30}
                />
              </View>
            </View>
          )}

          {/* STEP: Level */}
          {step === 'level' && (
            <View style={styles.section}>
              <View style={styles.levelGrid}>
                {LEVELS.map((lvl) => (
                  <TouchableOpacity
                    key={lvl.key}
                    style={[
                      styles.levelCard,
                      selectedLevel === lvl.key && styles.levelCardActive,
                    ]}
                    onPress={() => setSelectedLevel(lvl.key)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedLevel === lvl.key }}
                    accessibilityLabel={`${lvl.label}, ${lvl.subtitle}, ${lvl.desc}`}
                  >
                    <Text style={styles.levelLabel}>{lvl.label}</Text>
                    {selectedLevel === lvl.key && (
                      <Text style={styles.checkIcon}>✓</Text>
                    )}
                    <Text style={styles.levelSubtitle}>{lvl.subtitle}</Text>
                    <Text style={styles.levelDesc}>{lvl.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* CTA Buttons */}
        <View style={styles.footer}>
          {step !== 'welcome' && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setStep(step === 'level' ? 'name' : 'welcome')}
              activeOpacity={0.7}
            >
              <Text style={styles.backBtnText}>Geri</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.ctaBtn,
              step === 'name' && !name.trim() && styles.ctaBtnDisabled,
            ]}
            onPress={() => {
              if (step === 'welcome') setStep('name');
              else if (step === 'name' && name.trim()) setStep('level');
              else if (step === 'level') handleFinish();
            }}
            activeOpacity={0.85}
            disabled={step === 'name' && !name.trim()}
          >
            <Text style={styles.ctaBtnText}>
              {step === 'level' ? 'Başla' : 'Devam Et'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  container: { flexGrow: 1, paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.lg },
  stepRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  stepDot: { width: 8, height: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.outlineVariant },
  stepDotActive: { width: 24, backgroundColor: Colors.secondaryFixedDim },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  eyebrow: { ...Typography.labelMd, color: Colors.secondary, letterSpacing: 1.2, marginBottom: Spacing.md },
  headline: {
    fontSize: 24, fontWeight: '700', color: Colors.primary,
    textAlign: 'center', lineHeight: 32, marginBottom: Spacing.sm,
  },
  subtext: {
    fontSize: 15, color: Colors.onSurfaceVariant,
    textAlign: 'center', lineHeight: 22, maxWidth: 280,
  },
  section: { width: '100%', gap: Spacing.md },
  featureCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl, padding: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    ...Shadows.level1,
  },
  featureIconBox: {
    width: 44, height: 44, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { fontSize: 15, fontWeight: '600', color: Colors.primary, marginBottom: 2 },
  featureDesc: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  inputWrapper: { gap: Spacing.sm },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.primary, letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    fontSize: 17, color: Colors.primary,
    borderWidth: 1.5, borderColor: Colors.outlineVariant,
    ...Shadows.level1,
  },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  levelCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl, padding: Spacing.md,
    borderWidth: 2, borderColor: 'transparent',
    ...Shadows.level1,
  },
  levelCardActive: { borderColor: Colors.secondaryFixedDim },
  levelLabel: { fontSize: 20, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  checkIcon: { position: 'absolute', top: 12, right: 12, fontSize: 16, color: Colors.golden },
  levelSubtitle: { fontSize: 14, fontWeight: '600', color: Colors.primary, marginBottom: 2 },
  levelDesc: { fontSize: 11, color: Colors.onSurfaceVariant },
  footer: {
    paddingHorizontal: Spacing.marginMain, paddingBottom: 32, paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  ctaBtn: {
    backgroundColor: Colors.golden,
    borderRadius: BorderRadius.lg, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  backBtn: {
    alignItems: 'center', justifyContent: 'center', height: 44,
  },
  backBtnText: { fontSize: 15, color: Colors.onSurfaceVariant, fontWeight: '500' },
});

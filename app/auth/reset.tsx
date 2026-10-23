import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../utils/supabase';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../../constants/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null);

  const handleSubmit = async () => {
    if (!password || !passwordAgain) {
      setMessage('Yeni şifreni ve tekrarını gir.');
      setMessageType('error');
      return;
    }

    if (password.length < 6) {
      setMessage('Şifre en az 6 karakter olmalı.');
      setMessageType('error');
      return;
    }

    if (password !== passwordAgain) {
      setMessage('Şifreler aynı olmalı.');
      setMessageType('error');
      return;
    }

    setMessage('');
    setMessageType(null);
    setIsBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsBusy(false);

    if (error) {
      setMessage('Şifre güncellenemedi. Lütfen tekrar dene.');
      setMessageType('error');
      return;
    }

    setMessage('Şifren başarıyla güncellendi.');
    setMessageType('success');
    setPassword('');
    setPasswordAgain('');
    router.replace('/auth');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.eyebrow}>WORTLY · ŞİFRE SIFIRLAMA</Text>
            <Text style={styles.headline}>Yeni şifreni belirle.</Text>
            <Text style={styles.subtext}>
              Hesabın için yeni bir şifre oluştur.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Yeni şifre</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="En az 6 karakter"
                placeholderTextColor={Colors.outlineVariant}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Yeni şifre (tekrar)</Text>
              <TextInput
                style={styles.input}
                value={passwordAgain}
                onChangeText={setPasswordAgain}
                placeholder="Şifreni tekrar yaz"
                placeholderTextColor={Colors.outlineVariant}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
              />
            </View>

            {!!message && (
              <Text style={[styles.message, messageType === 'success' ? styles.success : styles.error]}>
                {message}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.cta, isBusy && styles.disabled]}
              onPress={handleSubmit}
              disabled={isBusy}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>
                {isBusy ? 'Bekleyin…' : 'Şifreyi Güncelle'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: Spacing.marginMain },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  eyebrow: { ...Typography.labelMd, color: Colors.secondary, letterSpacing: 1.2, marginBottom: Spacing.md },
  headline: { fontSize: 26, fontWeight: '700', color: Colors.primary, textAlign: 'center', lineHeight: 33, marginBottom: Spacing.sm },
  subtext: { fontSize: 15, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  form: { gap: Spacing.md },
  inputWrapper: { gap: Spacing.sm },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.primary, letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg, padding: Spacing.md, fontSize: 17, color: Colors.primary, borderWidth: 1.5, borderColor: Colors.outlineVariant, ...Shadows.level1 },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: Spacing.xs },
  error: { color: Colors.error },
  success: { color: Colors.success },
  cta: { backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  disabled: { opacity: 0.55 },
  ctaText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
});

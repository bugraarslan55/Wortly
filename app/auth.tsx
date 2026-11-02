import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/auth';
import { Spacing } from '../constants/theme';
import { makeStyles } from '../hooks/use-theme';
import { AuthLayout } from '../components/auth-layout';
import { FormField, Notice, PasswordField, PrimaryButton, TextField } from '../components/ui';

type AuthMode = 'signIn' | 'signUp';

const MIN_PASSWORD_LENGTH = 6;

export default function AuthScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { signIn, signUp, resetPasswordForEmail, isBusy } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const passwordAgainRef = useRef<TextInput>(null);
  // Store'daki isBusy bir sonraki render'da görünür; hızlı çift dokunuşu burada engelle.
  const submittingRef = useRef(false);

  const isSignUp = mode === 'signUp';

  const showError = (text: string) => {
    setMessage(text);
    setMessageType('error');
  };

  const switchMode = () => {
    setMode(isSignUp ? 'signIn' : 'signUp');
    setMessage('');
    setMessageType(null);
    setPasswordAgain('');
  };

  const handleSubmit = async () => {
    if (submittingRef.current || isBusy) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      showError('E-posta ve şifre alanlarını doldur.');
      return;
    }

    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      showError(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`);
      return;
    }

    if (isSignUp && password !== passwordAgain) {
      showError('Şifreler aynı olmalı.');
      return;
    }

    submittingRef.current = true;
    setMessage('');
    setMessageType(null);
    try {
      const result = isSignUp
        ? await signUp(normalizedEmail, password)
        : await signIn(normalizedEmail, password);

      if (!result.ok) {
        showError(result.message);
        return;
      }

      if (isSignUp && !result.session) {
        setMessage('Kayıt başarılı. Devam etmek için e-posta adresini doğrula.');
        setMessageType('success');
        setMode('signIn');
        setPassword('');
        setPasswordAgain('');
        return;
      }

      router.replace('/');
    } finally {
      submittingRef.current = false;
    }
  };

  const handleForgotPassword = async () => {
    if (submittingRef.current || isBusy) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      showError('Şifre sıfırlama bağlantısı için önce e-posta adresini gir.');
      return;
    }

    submittingRef.current = true;
    setMessage('');
    setMessageType(null);
    try {
      const result = await resetPasswordForEmail(normalizedEmail);
      setMessage(result.message);
      setMessageType(result.ok ? 'success' : 'error');
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <AuthLayout
      title={isSignUp ? 'Kendi öğrenme alanını oluştur.' : 'Tekrar hoş geldin.'}
      subtitle={
        isSignUp
          ? 'İlerlemeni ve kişisel kelimelerini güvenle saklayalım.'
          : 'İlerlemeni kaldığın yerden sürdür.'
      }
      footer={
        <View style={styles.switchRow}>
          <Text style={styles.switchPrompt}>{isSignUp ? 'Zaten hesabın var mı?' : 'Hesabın yok mu?'}</Text>
          <TouchableOpacity
            style={styles.switchButton}
            onPress={switchMode}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={isSignUp ? 'Giriş yap ekranına geç' : 'Kayıt ol ekranına geç'}
          >
            <Text style={styles.switchText}>{isSignUp ? 'Giriş yap' : 'Kayıt ol'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <FormField label="E-posta">
        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder="ornek@mail.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          accessibilityLabel="E-posta"
        />
      </FormField>

      <FormField label="Şifre" hint={isSignUp ? `En az ${MIN_PASSWORD_LENGTH} karakter.` : undefined}>
        <PasswordField
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder={isSignUp ? `En az ${MIN_PASSWORD_LENGTH} karakter` : 'Şifren'}
          textContentType={isSignUp ? 'newPassword' : 'password'}
          autoComplete={isSignUp ? 'new-password' : 'password'}
          returnKeyType={isSignUp ? 'next' : 'done'}
          onSubmitEditing={() => (isSignUp ? passwordAgainRef.current?.focus() : handleSubmit())}
          accessibilityLabel="Şifre"
        />
      </FormField>

      {isSignUp && (
        <FormField label="Şifre tekrar">
          <PasswordField
            ref={passwordAgainRef}
            value={passwordAgain}
            onChangeText={setPasswordAgain}
            placeholder="Şifreni tekrar yaz"
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            accessibilityLabel="Şifre tekrar"
          />
        </FormField>
      )}

      {!isSignUp && (
        <TouchableOpacity
          style={styles.forgotButton}
          onPress={handleForgotPassword}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel="Şifremi unuttum"
          accessibilityHint="E-posta adresine şifre sıfırlama bağlantısı gönderir"
        >
          <Text style={styles.forgotText}>Şifremi unuttum?</Text>
        </TouchableOpacity>
      )}

      {!!message && messageType && <Notice type={messageType}>{message}</Notice>}

      <PrimaryButton
        label={isBusy ? 'Bekleyin…' : isSignUp ? 'Kayıt Ol' : 'Giriş Yap'}
        onPress={handleSubmit}
        loading={isBusy}
      />
    </AuthLayout>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  forgotButton: { alignSelf: 'flex-end', minHeight: Spacing.touchTargetMin, justifyContent: 'center', marginTop: -Spacing.sm },
  forgotText: { fontSize: 14, color: Colors.secondary, fontWeight: '700' },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  switchPrompt: { fontSize: 14, color: Colors.onSurfaceVariant },
  switchButton: { minHeight: Spacing.touchTargetMin, paddingHorizontal: Spacing.sm, justifyContent: 'center' },
  switchText: { fontSize: 14, color: Colors.secondary, fontWeight: '700' },
}));

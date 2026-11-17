import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../utils/supabase';
import { AuthLayout } from '../../components/auth-layout';
import { FormField, Notice, PasswordField, PrimaryButton } from '../../components/ui';
import { useColors } from '../../hooks/use-theme';
import { useAuthStore } from '../../store/auth';
import { maskEmail, resetGate } from '../../utils/recovery-gate';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const colors = useColors();
  const session = useAuthStore(state => state.session);
  const recoveryStatus = useAuthStore(state => state.recoveryStatus);
  const recoveryUserId = useAuthStore(state => state.recoveryUserId);
  const finishRecovery = useAuthStore(state => state.finishRecovery);
  // Bağlantı işleyicisi ekrandan sonra çalışabilir: kısa süre "doğrulanıyor" gösterilir, sonra engellenir.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  // `updateUser` açık oturumun hesabını günceller; form yalnızca bu cihazda doğrulanmış sıfırlama oturumu için açılır.
  const gate = resetGate({ sessionUserId: session?.user.id, recoveryUserId, status: recoveryStatus, waited });
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null);
  const passwordAgainRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (gate !== 'ready') return;

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

    submittingRef.current = true;
    setMessage('');
    setMessageType(null);
    setIsBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsBusy(false);
    submittingRef.current = false;

    if (error) {
      setMessage('Şifre güncellenemedi. Lütfen tekrar dene.');
      setMessageType('error');
      return;
    }

    finishRecovery();
    setMessage('Şifren başarıyla güncellendi.');
    setMessageType('success');
    setPassword('');
    setPasswordAgain('');
    router.replace('/auth');
  };

  if (gate === 'verifying') {
    return (
      <AuthLayout title="Bağlantı doğrulanıyor…" subtitle="Şifre sıfırlama bağlantın kontrol ediliyor.">
        <ActivityIndicator color={colors.secondary} />
      </AuthLayout>
    );
  }

  if (gate === 'blocked') {
    return (
      <AuthLayout title="Bağlantı doğrulanamadı." subtitle="Hiçbir hesabın şifresi değiştirilmedi.">
        <Notice type="error">
          Bu cihazda doğrulanmış bir şifre sıfırlama bağlantısı bulunamadı. Bağlantı başka bir cihazda ya da tarayıcıda açılmış,
          süresi dolmuş veya daha önce kullanılmış olabilir. "Şifremi unuttum" ile yeni bir bağlantı iste ve e-postadaki
          bağlantıyı bu cihazda aç.
        </Notice>
        <PrimaryButton label="Girişe dön" onPress={() => router.replace('/auth')} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Yeni şifreni belirle."
      subtitle={maskEmail(session?.user.email) ? `Şifresi belirlenecek hesap: ${maskEmail(session?.user.email)}` : 'Hesabın için yeni bir şifre oluştur.'}
    >
      <FormField label="Yeni şifre" hint="En az 6 karakter.">
        <PasswordField
          value={password}
          onChangeText={setPassword}
          placeholder="En az 6 karakter"
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
          onSubmitEditing={() => passwordAgainRef.current?.focus()}
          accessibilityLabel="Yeni şifre"
        />
      </FormField>

      <FormField label="Yeni şifre (tekrar)">
        <PasswordField
          ref={passwordAgainRef}
          value={passwordAgain}
          onChangeText={setPasswordAgain}
          placeholder="Şifreni tekrar yaz"
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          accessibilityLabel="Yeni şifre tekrar"
        />
      </FormField>

      {!!message && messageType && <Notice type={messageType}>{message}</Notice>}

      <PrimaryButton
        label={isBusy ? 'Bekleyin…' : 'Şifreyi Güncelle'}
        onPress={handleSubmit}
        loading={isBusy}
      />
    </AuthLayout>
  );
}

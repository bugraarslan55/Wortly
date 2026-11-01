import React, { useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../utils/supabase';
import { AuthLayout } from '../../components/auth-layout';
import { FormField, Notice, PasswordField, PrimaryButton } from '../../components/ui';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null);
  const passwordAgainRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;

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

    setMessage('Şifren başarıyla güncellendi.');
    setMessageType('success');
    setPassword('');
    setPasswordAgain('');
    router.replace('/auth');
  };

  return (
    <AuthLayout title="Yeni şifreni belirle." subtitle="Hesabın için yeni bir şifre oluştur.">
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

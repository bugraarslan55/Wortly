import { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Colors, Typography } from '../../constants/theme';
import { useAuthStore } from '../../store/auth';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { handleAuthUrl } = useAuthStore();

  useEffect(() => {
    let active = true;

    void Linking.getInitialURL().then(async (url) => {
      if (url) await handleAuthUrl(url);
      if (active) router.replace('/');
    });

    return () => {
      active = false;
    };
  }, [handleAuthUrl, router]);

  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator color={Colors.secondary} />
      <Text style={styles.text}>E-posta doğrulanıyor…</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.warmWhite, gap: 12 },
  text: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
});

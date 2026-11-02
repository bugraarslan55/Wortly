import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Typography } from '../../constants/theme';
import { makeStyles, useColors } from '../../hooks/use-theme';
import { useAuthStore } from '../../store/auth';

export default function AuthCallbackScreen() {
  const styles = useStyles();
  const colors = useColors();
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
      <ActivityIndicator color={colors.secondary} />
      <Text style={styles.text}>E-posta doğrulanıyor…</Text>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.warmWhite, gap: 12 },
  text: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
}));

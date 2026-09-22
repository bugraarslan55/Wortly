import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useUserStore } from '../store';

// Index: Onboarding kontrolü yapıp yönlendir
export default function Index() {
  const router = useRouter();
  const { profile, isLoaded } = useUserStore();

  useEffect(() => {
    if (!isLoaded) return;
    if (profile?.onboardingCompleted) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  }, [isLoaded, profile]);

  return null;
}

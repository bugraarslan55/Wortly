import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useUserStore } from '../store';
import { useAuthStore } from '../store/auth';

// Index: Onboarding kontrolü yapıp yönlendir
export default function Index() {
  const router = useRouter();
  const { profile, isLoaded } = useUserStore();
  const { session, isLoaded: isAuthLoaded } = useAuthStore();

  useEffect(() => {
    if (!isLoaded || !isAuthLoaded) return;
    if (!session) {
      router.replace('/auth' as any);
    } else if (profile?.onboardingCompleted) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  }, [isLoaded, isAuthLoaded, session, profile, router]);

  return null;
}

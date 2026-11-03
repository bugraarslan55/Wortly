import { useEffect } from 'react';
import { useRouter } from '../hooks/use-guarded-router';
import { useUserStore } from '../store';
import { useAuthStore } from '../store/auth';
import { useShallow } from 'zustand/react/shallow';

// Index: Onboarding kontrolü yapıp yönlendir
export default function Index() {
  const router = useRouter();
  const { profile, isLoaded } = useUserStore(useShallow(state => ({ profile: state.profile, isLoaded: state.isLoaded })));
  const { session, isAuthLoaded } = useAuthStore(useShallow(state => ({ session: state.session, isAuthLoaded: state.isLoaded })));

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

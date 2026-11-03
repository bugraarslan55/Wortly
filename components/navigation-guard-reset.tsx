import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { sharedNavigationGuard } from '../utils/navigation-guard';

// Ekran değiştiğinde "ileri" gezinme kilidi sıfırlanır: eski ekranın kilidi yeni ekrandaki bilinçli ilk dokunuşu engellemez.
// Yalnızca bu küçük bileşen yol değişimine abone olur; ekranlar gereksiz yeniden render olmaz. (Geri kilidi sıfırlanmaz.)
export function NavigationGuardReset() {
  const pathname = usePathname();
  useEffect(() => {
    sharedNavigationGuard.resetForward();
  }, [pathname]);
  return null;
}

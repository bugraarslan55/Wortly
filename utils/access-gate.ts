import type { UserProfile } from '../types';
import { Dataset, DatasetState, evaluateLocalAccess, LocalAccess } from './data-ownership';

// Kök düzen (app/_layout.tsx) kapısının KARAR mantığı. Düzen bu işlevi çağırır; böylece aynı karar gerçek mağaza durumuyla
// test edilebilir. Zaman aşımı (forceOpen) yalnızca "eşitleme beklemeyi bırak" demektir: sahiplik doğrulamasını ATLAMAZ.

export interface GateStoreState {
  profile: UserProfile | null | undefined;
  profileOwner: string | null | undefined;
  wordsOwner: string | null | undefined;
  wordCount: number;
  reviewOwner: string | null | undefined;
  reviewCount: number;
  sessionsOwner: string | null | undefined;
  sessionCount: number;
}

export function buildGateDatasets(state: GateStoreState): Record<Dataset, DatasetState> {
  const profile = state.profile;
  const profileHasData = !!profile && (profile.onboardingCompleted || profile.name.length > 0 || profile.streak > 0);
  return {
    profile: { owner: state.profileOwner, hasData: profileHasData },
    words: { owner: state.wordsOwner, hasData: state.wordCount > 0 },
    review: { owner: state.reviewOwner, hasData: state.reviewCount > 0 },
    sessions: { owner: state.sessionsOwner, hasData: state.sessionCount > 0 },
  };
}

export interface GateDecision {
  /** Kişisel ekranlar açılabilir mi? */
  isUserDataSynced: boolean;
  /** Güvenli hata ekranı ("Tekrar dene") gösterilmeli mi? */
  syncProblem: boolean;
  access: LocalAccess;
}

export function computeAccessGate(input: {
  userId: string | null | undefined;
  /** Profil, kelimeler ve oturumlar bu kullanıcı için eşitlendi (başarılı ya da başarısız denemeyle tamamlandı). */
  dataSynced: boolean;
  /** Eşitleme beklemesi zaman aşımına uğradı. */
  forceOpen: boolean;
  state: GateStoreState;
}): GateDecision {
  const access = evaluateLocalAccess({ userId: input.userId, datasets: buildGateDatasets(input.state) });
  if (!input.userId) return { isUserDataSynced: true, syncProblem: false, access };
  const waitedEnough = input.dataSynced || input.forceOpen;
  return {
    isUserDataSynced: waitedEnough && access.verified,
    syncProblem: waitedEnough && !access.verified,
    access,
  };
}

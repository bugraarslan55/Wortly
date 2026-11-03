import type { Level, QuizSession, Word } from '../types';
import type { Scenario } from '../constants/scenarios';
import type { DailyTask } from './achievements';
import type { AnalysisCategory } from './learning-analysis';
import type { LearningReport } from './learning-report';
import { scenarioHistory } from './scenario-engine';
import type { ScenarioResult } from './learning-analysis';

// Açıklanabilir kural tabanlı öneriler. Yapay zekâ veya uzak servis yoktur; her öneri, kullanıcının gerçek
// verisinden çıkan bir kurala dayanır ve nedenini söyler. En çok 3 öneri üretilir.
//
// İlkeler:
// - Kullanıcının hiç yapmadığı bir çalışmadan "başarısız" sonucu çıkarılmaz: zayıf alan yalnızca yeterli cevap
//   (en az 5) ve düşük başarı (%80 altı) varken önerilir.
// - Kilitli seviyedeki senaryo/konu asla önerilmez.
// - Rota her zaman mevcut ve geçerli bir ekrandır (aşağıdaki RouteTarget). Doğrulanamayan konu için '/konular'.
// - Metinler kullanıcının gerçek sayılarını ve başlıklarını içerir; senaryo seçimi güne göre değişir.

export type RecommendationKind =
  | 'due-review' | 'weak-category' | 'daily-task' | 'new-scenario' | 'repeat-scenario' | 'starter';

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  title: string;
  /** Neden bu öneri? Kullanıcının gerçek verisinden. */
  reason: string;
  /** Dokununca gidilecek geçerli rota. */
  route: string;
  /** Eylem düğmesi etiketi. */
  actionLabel: string;
  priority: number;
}

export const MAX_RECOMMENDATIONS = 3;
export const WEAK_RATE_BELOW = 80;
export const MIN_ANSWERS_FOR_WEAK = 5;

export const CATEGORY_NAMES: Record<AnalysisCategory, string> = {
  dinleme: 'Dinleme',
  yazma: 'Yazma',
  'dogru-yanlis': 'Doğru/Yanlış',
  senaryo: 'Senaryo',
};

/** Tekrar bekleyen kelimeler için gidilecek ekran (Ana Sayfa kartı ve bildirimle aynı kural). */
export function reviewRouteForDue(dueWords: readonly Pick<Word, 'isCustom' | 'topicId'>[]): string {
  const first = dueWords[0];
  if (first?.isCustom) return '/kelime/calis';
  if (first?.topicId) return `/konu/${first.topicId}/alistirma`;
  return '/konular';
}

export interface RecommendationInput {
  report: LearningReport;
  level: Level;
  userId?: string | null;
  /** Gün anahtarı (YYYY-MM-DD): senaryo seçimi güne göre döner. */
  dayKey: string;
  tasks: readonly DailyTask[];
  /** İsteğe bağlı; verilmezse rapordaki (en çok geciken sıralı) tekrar listesi kullanılır. */
  dueWords?: readonly Pick<Word, 'isCustom' | 'topicId'>[];
  scenarios: readonly Scenario[];
  scenarioResults: readonly ScenarioResult[] | null | undefined;
  sessions: readonly QuizSession[] | null | undefined;
  /** Kullanıcının seviyesine açık konu kimlikleri (rota doğrulaması için). */
  allowedTopicIds: readonly string[];
}

const LEVEL_ORDER: Level[] = ['A1', 'A2', 'B1'];
const isLocked = (scenarioLevel: Level, userLevel: Level) => LEVEL_ORDER.indexOf(scenarioLevel) > LEVEL_ORDER.indexOf(userLevel);

function dayNumber(dayKey: string): number {
  const stamp = Date.parse(`${dayKey}T00:00:00Z`);
  return Number.isFinite(stamp) ? Math.floor(stamp / 86400000) : 0;
}

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

const wordsText = (count: number) => `${count} kelime`;

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { report, level, dayKey } = input;
  const dueList = input.dueWords ?? report.dueWords;
  const out: Recommendation[] = [];
  const hasData = report.overview.hasAnyData;

  // 1) Tekrarı gelmiş kelimeler
  const dueCount = report.overview.dueCount;
  if (dueCount > 0) {
    const top = report.dueWords[0];
    const late = top && top.overdueDays >= 1 ? ` En çok geciken kelime ${top.overdueDays} gündür bekliyor.` : '';
    out.push({
      id: 'due-review',
      kind: 'due-review',
      title: 'Bugün kelime tekrarı yap',
      reason: `${wordsText(dueCount)} tekrar zamanı geldi; erken tekrar unutmayı azaltır.${late}`,
      route: reviewRouteForDue(dueList),
      actionLabel: 'Tekrara başla',
      priority: 100,
    });
  }

  // 2) Zorlanılan alıştırma türü (yalnızca yeterli cevap ve düşük başarı varsa)
  const weak = report.exercises.weakestCategory;
  if (weak) {
    const stat = report.exercises.categoryRates[weak];
    if (stat.rate !== null && stat.total >= MIN_ANSWERS_FOR_WEAK && stat.rate < WEAK_RATE_BELOW) {
      let route = '/konular';
      if (weak === 'senaryo') {
        route = '/senaryolar';
      } else {
        // Bu türde en son çalışılan, hâlâ erişilebilir konu; yoksa konu listesi.
        const categoryTypes = weak === 'dinleme' ? ['dinle-sec', 'dinle-yaz'] : weak === 'yazma' ? ['yazma', 'cumle'] : ['dogru-yanlis'];
        const recent = [...(input.sessions ?? [])]
          .filter(session => categoryTypes.includes(session.type) && session.topicId && input.allowedTopicIds.includes(session.topicId))
          .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
        if (recent?.topicId) route = `/konu/${recent.topicId}/alistirma`;
      }
      out.push({
        id: `weak-${weak}`,
        kind: 'weak-category',
        title: `${CATEGORY_NAMES[weak]} alıştırmasını tekrar dene`,
        reason: `${CATEGORY_NAMES[weak]} sorularında ${stat.total} cevabın %${stat.rate} doğru. Bu alan şu an en çok desteğe ihtiyaç duyan alanın.`,
        route,
        actionLabel: weak === 'senaryo' ? 'Senaryolara git' : 'Alıştırmaya git',
        priority: 80,
      });
    }
  }

  // 3) Tamamlanmamış günlük görev
  // "5 farklı kelime" görevi, tekrar önerisiyle aynı eylemi istediği için tekrar bekleyen kelime varken atlanır.
  const pending = input.tasks.find(task => !task.completed && !(dueCount > 0 && task.id === 'words'));
  if (pending) {
    {
      const route = '/konular';
      out.push({
        id: `task-${pending.id}`,
        kind: 'daily-task',
        title: pending.title,
        reason: `Günlük görevin ${pending.current}/${pending.target} durumunda; tamamlamak için ${pending.target - pending.current} adım kaldı.`,
        route,
        actionLabel: 'Göreve git',
        priority: 60,
      });
    }
  }

  // 4) Senaryo: önce hiç çalışılmamış (erişilebilir), yoksa en düşük sonuçlu olanı tekrar
  const playable = input.scenarios.filter(scenario => !isLocked(scenario.level, level));
  const untouched = playable.filter(scenario => !scenarioHistory(input.scenarioResults, scenario.id));
  if (untouched.length > 0) {
    // Kullanıcının seviyesine en yakın olanlar önce; günün sayısına ve kullanıcıya göre dönerek seçilir.
    const sameLevel = untouched.filter(scenario => scenario.level === level);
    const pool = sameLevel.length > 0 ? sameLevel : untouched;
    const pick = pool[(dayNumber(dayKey) + hash(input.userId ?? '')) % pool.length]!;
    out.push({
      id: `scenario-${pick.id}`,
      kind: 'new-scenario',
      title: 'Yeni bir diyalog çalış',
      reason: `"${pick.title}" (${pick.level}) senaryosunu henüz çalışmadın. ${untouched.length} senaryo seni bekliyor.`,
      route: `/senaryolar/${pick.id}`,
      actionLabel: 'Diyaloğa başla',
      priority: 50,
    });
  } else if (playable.length > 0) {
    const weakest = report.scenarios.needsWork.find(row => playable.some(scenario => scenario.id === row.id));
    if (weakest) {
      out.push({
        id: `scenario-repeat-${weakest.id}`,
        kind: 'repeat-scenario',
        title: 'Bir senaryoyu tekrar dene',
        reason: `"${weakest.title}" için en iyi sonucun %${weakest.bestPercent}. Tekrar çalışarak geliştirebilirsin.`,
        route: `/senaryolar/${weakest.id}`,
        actionLabel: 'Tekrar dene',
        priority: 40,
      });
    }
  }

  // 5) Başlangıç önerisi (hiç veri yokken)
  if (!hasData) {
    out.push({
      id: 'starter',
      kind: 'starter',
      title: 'Bir konuyla başla',
      reason: `Henüz çalışma kaydın yok. ${level} seviyesindeki bir konunun kelimelerini çalışarak ilerlemeni görmeye başla.`,
      route: '/konular',
      actionLabel: 'Konulara git',
      priority: 70,
    });
  }

  return out
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_RECOMMENDATIONS);
}

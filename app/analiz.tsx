import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { AppIcon } from '../components/app-icon';
import { Card, IconTile, PrimaryButton, ProgressBar, SectionTitle } from '../components/ui';
import { useLearningReport } from '../components/use-learning-report';
import type { LearningReport } from '../utils/learning-report';
import type { Recommendation } from '../utils/study-recommendations';

const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MASTERY_LABELS = ['Yeni', 'Öğreniliyor', 'Bilinçli', 'Öğrenildi'];
const MASTERY_COLORS = [Colors.outlineVariant, Colors.secondaryFixedDim, Colors.golden, Colors.success];
const MAX_BAR_HEIGHT = 84;

export default function AnalysisScreen() {
  const router = useRouter();
  const { status, report, recommendations, retry } = useLearningReport();

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.title} accessibilityRole="header">Öğrenme Analizi</Text>
          <Text style={styles.subtitle}>Ne kadar ilerlediğini, nerede zorlandığını ve bugün ne çalışacağını gör.</Text>
        </View>

        {status === 'signed-out' && (
          <Card style={styles.stateCard}>
            <Text style={styles.stateText} accessibilityLiveRegion="polite">Analizi görmek için giriş yapmalısın.</Text>
          </Card>
        )}

        {status === 'loading' && (
          <Card style={styles.stateCard}>
            <ActivityIndicator color={Colors.secondary} />
            <Text style={styles.stateText} accessibilityLiveRegion="polite">Verilerin yükleniyor…</Text>
          </Card>
        )}

        {status === 'error' && (
          <Card style={styles.stateCard}>
            <AppIcon name="questionmark.circle" size={28} color={Colors.error} />
            <Text style={styles.stateText} accessibilityLiveRegion="polite">
              Analiz hesaplanamadı. Verilerin silinmedi; tekrar deneyebilirsin.
            </Text>
            <PrimaryButton label="Tekrar dene" onPress={retry} style={styles.retryBtn} />
          </Card>
        )}

        {status === 'ready' && report && (
          <>
            <Recommendations items={recommendations} onOpen={(route) => router.push(route as any)} />
            <Overview report={report} />
            <WeeklyActivity report={report} />
            <MasterySection report={report} />
            <DueSection report={report} onStart={(route) => router.push(route as any)} recommendations={recommendations} />
            <ExerciseSection report={report} />
            <ScenarioSection report={report} onOpen={(id) => router.push(`/senaryolar/${id}` as any)} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Öneriler ────────────────────────────────────────────────────────────────

function Recommendations({ items, onOpen }: { items: Recommendation[]; onOpen: (route: string) => void }) {
  if (items.length === 0) {
    return (
      <View style={styles.section}>
        <SectionTitle>Bugün için öneriler</SectionTitle>
        <Card style={styles.stateCard}>
          <Text style={styles.stateText}>Şu an öncelikli bir önerin yok. Hedefini tamamlamaya devam et.</Text>
        </Card>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <SectionTitle>Bugün için öneriler</SectionTitle>
      {items.map((item, index) => (
        <TouchableOpacity
          key={item.id}
          style={styles.recCard}
          onPress={() => onOpen(item.route)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={`Öneri ${index + 1}: ${item.title}. ${item.reason}`}
          accessibilityHint={item.actionLabel}
        >
          <View style={styles.recNumber}><Text style={styles.recNumberText}>{index + 1}</Text></View>
          <View style={styles.recBody}>
            <Text style={styles.recTitle}>{item.title}</Text>
            <Text style={styles.recReason}>{item.reason}</Text>
            <Text style={styles.recAction}>{item.actionLabel} →</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Genel durum ─────────────────────────────────────────────────────────────

function Stat({ icon, value, label, accessibilityLabel }: { icon: string; value: string; label: string; accessibilityLabel: string }) {
  return (
    <View style={styles.statTile} accessible accessibilityLabel={accessibilityLabel}>
      <IconTile name={icon} size={32} />
      <Text style={styles.statValue} maxFontSizeMultiplier={1.3}>{value}</Text>
      <Text style={styles.statLabel} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

function Overview({ report }: { report: LearningReport }) {
  const { overview } = report;
  const completedText = overview.completed.exact ? String(overview.completed.count) : `${overview.completed.count}+`;
  return (
    <View style={styles.section}>
      <SectionTitle>Genel durum</SectionTitle>
      <View style={styles.statGrid}>
        <Stat icon="checkmark.seal.fill" value={String(overview.learned)} label="Öğrenilen kelime (Öğrenildi düzeyi)"
          accessibilityLabel={`Öğrenilen kelime: ${overview.learned}`} />
        <Stat icon="arrow.clockwise" value={String(overview.dueCount)} label="Tekrar bekleyen kelime"
          accessibilityLabel={`Tekrar bekleyen kelime: ${overview.dueCount}`} />
        <Stat icon="flame.fill" value={String(overview.streak)} label="Günlük seri"
          accessibilityLabel={`Günlük seri: ${overview.streak} gün`} />
        <Stat icon="chart.bar.fill" value={completedText} label="Tamamlanan alıştırma (senaryolar dahil)"
          accessibilityLabel={`Tamamlanan alıştırma: ${completedText}`} />
        <Stat icon="bubble.left.and.bubble.right.fill" value={`${overview.scenariosCompleted}/${overview.scenarioTotal}`} label="Farklı senaryo tamamlandı"
          accessibilityLabel={`Tamamlanan senaryo: ${overview.scenarioTotal} senaryodan ${overview.scenariosCompleted}`} />
        <Stat icon="scope" value={`${overview.goal.done}/${overview.goal.target}`} label="Bugün tekrar edilen kelime"
          accessibilityLabel={`Bugün tekrar edilen kelime: ${overview.goal.target} hedefinden ${overview.goal.done}`} />
      </View>
      <Card style={styles.goalCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>Günlük hedef (bugün tekrar edilen farklı kelime)</Text>
          <Text style={styles.cardLabelStrong}>{overview.goal.reached ? 'Tamamlandı' : `${overview.goal.target - overview.goal.done} kelime kaldı`}</Text>
        </View>
        <ProgressBar value={overview.goal.done} max={overview.goal.target} label={`Günlük hedef ${overview.goal.done} / ${overview.goal.target}`} tone={overview.goal.reached ? 'success' : 'gold'} />
      </Card>
      {!overview.hasAnyData && (
        <Text style={styles.note}>
          Henüz yeterli veri yok. Birkaç kelime ve alıştırma tamamladığında burada gerçek ilerlemeni göreceksin.
        </Text>
      )}
    </View>
  );
}

// ─── Haftalık etkinlik ───────────────────────────────────────────────────────

function WeeklyActivity({ report }: { report: LearningReport }) {
  const { activity } = report;
  const max = Math.max(1, ...activity.days.map(day => day.exercises));
  const comparison = activity.comparison;
  return (
    <View style={styles.section}>
      <SectionTitle>Son 7 gün</SectionTitle>
      <Card>
        {activity.empty ? (
          <Text style={styles.note}>Son 7 günde tamamlanan alıştırma yok. İlk alıştırmanı yaptığında burada sütunlar görünecek.</Text>
        ) : (
          <View
            style={styles.chart}
            accessible
            accessibilityLabel={`Son 7 günde ${activity.total} alıştırma. ${activity.days.map(day => `${WEEKDAYS[day.weekday]} ${day.exercises}`).join(', ')}`}
          >
            {activity.days.map(day => (
              <View key={day.dayKey} style={styles.chartCol}>
                <Text style={styles.chartValue} maxFontSizeMultiplier={1.3}>{day.exercises}</Text>
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartBar,
                      { height: day.exercises === 0 ? 3 : Math.max(8, Math.round((day.exercises / max) * MAX_BAR_HEIGHT)) },
                      day.isToday && styles.chartBarToday,
                    ]}
                  />
                </View>
                <Text style={[styles.chartLabel, day.isToday && styles.chartLabelToday]} maxFontSizeMultiplier={1.3}>
                  {day.isToday ? 'Bugün' : WEEKDAYS[day.weekday]}
                </Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>Bu hafta tamamlanan</Text>
          <Text style={styles.cardLabelStrong}>{activity.total} alıştırma</Text>
        </View>
        <Text style={styles.note}>
          {comparison === null
            ? 'Haftalık karşılaştırma için yeterli kayıt yok (cihazda en son 100 kayıt tutulur).'
            : comparison.previous === 0
              ? comparison.current === 0 ? 'Son iki haftada kayıt yok.' : 'Geçen hafta kayıt yok; bu hafta başladın.'
              : `Geçen hafta ${comparison.previous} alıştırma yapmıştın. ${comparison.delta > 0 ? `Bu hafta ${comparison.delta} fazla.` : comparison.delta < 0 ? `Bu hafta ${-comparison.delta} az.` : 'Bu hafta aynı.'}`}
        </Text>
        {activity.mayBeIncomplete && (
          <Text style={styles.note}>Kayıt sınırı nedeniyle son 7 günün bir kısmı eksik olabilir.</Text>
        )}
      </Card>
    </View>
  );
}

// ─── Kelime seviyeleri ───────────────────────────────────────────────────────

function MasterySection({ report }: { report: LearningReport }) {
  const { counts, total } = report.mastery;
  return (
    <View style={styles.section}>
      <SectionTitle>Kelime seviyeleri</SectionTitle>
      <Card>
        {total === 0 ? (
          <Text style={styles.note}>Henüz çalıştığın kelime yok. Bir konuyu çalıştığında kelimelerin seviyeleri burada görünür.</Text>
        ) : (
          <>
            <View
              style={styles.stack}
              accessible
              accessibilityLabel={`Kelime seviyeleri: ${counts.map((count, i) => `${MASTERY_LABELS[i]} ${count}`).join(', ')}`}
            >
              {counts.map((count, index) => count > 0 ? (
                <View key={index} style={{ flex: count, backgroundColor: MASTERY_COLORS[index], height: 14 }} />
              ) : null)}
            </View>
            {counts.map((count, index) => (
              <View key={index} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: MASTERY_COLORS[index] }]} />
                <Text style={styles.legendLabel}>{MASTERY_LABELS[index]}</Text>
                <Text style={styles.legendValue}>{count} · %{Math.round((count / total) * 100)}</Text>
              </View>
            ))}
            <Text style={styles.note}>Yalnızca çalıştığın kelimeler ve kişisel kelimelerin sayılır ({total} kelime). “Öğrenildi”, yukarıdaki “Öğrenilen kelime” ile aynı sayıdır.</Text>
          </>
        )}
      </Card>
    </View>
  );
}

// ─── Tekrar bekleyenler ──────────────────────────────────────────────────────

function DueSection({
  report, onStart, recommendations,
}: { report: LearningReport; onStart: (route: string) => void; recommendations: Recommendation[] }) {
  const due = report.dueWords;
  const reviewRec = recommendations.find(item => item.kind === 'due-review');
  return (
    <View style={styles.section}>
      <SectionTitle>Tekrar bekleyen kelimeler</SectionTitle>
      <Card>
        {report.overview.dueCount === 0 ? (
          <Text style={styles.note}>Şu an tekrar zamanı gelen kelime yok.</Text>
        ) : (
          <>
            {due.map(word => (
              <View key={word.id} style={styles.dueRow} accessible accessibilityLabel={`${word.article} ${word.german}, ${word.turkish}${word.overdueDays > 0 ? `, ${word.overdueDays} gün gecikti` : ''}`}>
                <View style={styles.dueText}>
                  <Text style={styles.dueGerman}>{word.article ? `${word.article} ` : ''}{word.german}</Text>
                  <Text style={styles.dueTurkish}>{word.turkish}</Text>
                </View>
                <Text style={styles.dueMeta}>{word.overdueDays > 0 ? `${word.overdueDays} gün gecikti` : 'Bugün'}</Text>
              </View>
            ))}
            {report.overview.dueCount > due.length && (
              <Text style={styles.note}>… ve {report.overview.dueCount - due.length} kelime daha.</Text>
            )}
            {reviewRec && (
              <PrimaryButton label="Tekrara başla" onPress={() => onStart(reviewRec.route)} />
            )}
          </>
        )}
      </Card>
    </View>
  );
}

// ─── Alıştırma performansı ───────────────────────────────────────────────────

function ExerciseSection({ report }: { report: LearningReport }) {
  const ex = report.exercises;
  const hasAny = ex.total > 0 || ex.flashcardSessions > 0;
  return (
    <View style={styles.section}>
      <SectionTitle>Alıştırma performansı</SectionTitle>
      <Card>
        {!hasAny ? (
          <Text style={styles.note}>Henüz alıştırma sonucu yok. Bir alıştırma tamamladığında doğru ve yanlış sayıların burada görünür.</Text>
        ) : (
          <>
            <View style={styles.rowBetween}>
              <Text style={styles.cardLabel}>Doğru / yanlış</Text>
              <Text style={styles.cardLabelStrong}>{ex.correct} doğru · {ex.wrong} yanlış</Text>
            </View>
            <Text style={styles.cardLabelStrong}>
              Başarı: {ex.successRate === null ? 'Henüz yeterli veri yok' : `%${ex.successRate}`}
            </Text>
            {ex.rows.map(row => (
              <View
                key={row.type}
                style={styles.typeRow}
                accessible
                accessibilityLabel={row.sessions === 0 ? `${row.label}: henüz çalışılmadı` : `${row.label}: ${row.sessions} çalışma, ${row.correct} doğru, ${row.total - row.correct} yanlış${row.rate === null ? ', başarı için yeterli veri yok' : `, yüzde ${row.rate} başarı`}`}
              >
                <View style={styles.rowBetween}>
                  <Text style={styles.typeName}>{row.label}</Text>
                  <Text style={styles.typeRate}>{row.sessions === 0 ? 'Çalışılmadı' : row.rate === null ? 'Az veri' : `%${row.rate}`}</Text>
                </View>
                <ProgressBar value={row.rate ?? 0} max={100} />
                <Text style={styles.typeMeta}>
                  {row.sessions === 0 ? 'Henüz çalışma yok' : `${row.sessions} çalışma · ${row.correct}/${row.total} doğru`}
                </Text>
              </View>
            ))}
            {ex.flashcardSessions > 0 && (
              <Text style={styles.note}>
                Flashcard: {ex.flashcardSessions} çalışma. Sonucu kendi değerlendirmen olduğu için başarı hesabına girmez.
              </Text>
            )}
            {ex.weakestCategory && ex.categoryRates[ex.weakestCategory].rate !== null && (
              <Text style={styles.weak}>
                En çok desteğe ihtiyaç duyan alan: {CATEGORY_NAMES[ex.weakestCategory]} (%{ex.categoryRates[ex.weakestCategory].rate}).
              </Text>
            )}
          </>
        )}
      </Card>
    </View>
  );
}

const CATEGORY_NAMES = { dinleme: 'Dinleme', yazma: 'Yazma', 'dogru-yanlis': 'Doğru/Yanlış', senaryo: 'Senaryo' } as const;

// ─── Senaryo performansı ─────────────────────────────────────────────────────

function ScenarioSection({ report, onOpen }: { report: LearningReport; onOpen: (id: string) => void }) {
  const s = report.scenarios;
  return (
    <View style={styles.section}>
      <SectionTitle>Senaryo performansı</SectionTitle>
      <Card>
        {s.attempts === 0 ? (
          <Text style={styles.note}>Henüz senaryo çalışmadın. Bir diyalog tamamladığında sonuçların burada görünür.</Text>
        ) : (
          <>
            <View style={styles.statGrid}>
              <Stat icon="checkmark.seal.fill" value={String(s.uniqueCompleted)} label="Farklı senaryo"
                accessibilityLabel={`Tamamlanan farklı senaryo: ${s.uniqueCompleted}`} />
              <Stat icon="arrow.clockwise" value={String(s.attempts)} label="Toplam deneme"
                accessibilityLabel={`Toplam senaryo denemesi: ${s.attempts}`} />
              <Stat icon="trophy.fill" value={s.averagePercent === null ? '—' : `%${s.averagePercent}`} label="Ort. en iyi sonuç"
                accessibilityLabel={`Ortalama en iyi sonuç: ${s.averagePercent === null ? 'veri yok' : `yüzde ${s.averagePercent}`}`} />
            </View>
            {s.best.length > 0 && <Text style={styles.cardLabelStrong}>En iyi sonuçların</Text>}
            {s.best.map(row => (
              <TouchableOpacity key={row.id} style={styles.scenarioRow} onPress={() => onOpen(row.id)} accessibilityRole="button"
                accessibilityLabel={`${row.title}, en iyi sonuç yüzde ${row.bestPercent}, ${row.attempts} deneme`}>
                <Text style={styles.scenarioTitle} numberOfLines={2}>{row.title}</Text>
                <Text style={styles.scenarioMeta}>%{row.bestPercent} · {row.attempts} deneme</Text>
              </TouchableOpacity>
            ))}
            {s.needsWork.length > 0 && <Text style={styles.cardLabelStrong}>Geliştirilmesi gerekenler</Text>}
            {s.needsWork.map(row => (
              <TouchableOpacity key={row.id} style={styles.scenarioRow} onPress={() => onOpen(row.id)} accessibilityRole="button"
                accessibilityLabel={`${row.title}, en iyi sonuç yüzde ${row.bestPercent}. Tekrar dene`}>
                <Text style={styles.scenarioTitle} numberOfLines={2}>{row.title}</Text>
                <Text style={[styles.scenarioMeta, styles.scenarioMetaWeak]}>%{row.bestPercent} · tekrar dene</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        <Text style={styles.cardLabelStrong}>Seviye ilerlemesi</Text>
        {s.byLevel.map(level => (
          <View key={level.level} style={styles.levelRow} accessible
            accessibilityLabel={level.locked ? `${level.level} seviyesi kilitli` : `${level.level} seviyesi: ${level.total} senaryodan ${level.completed} tamamlandı`}>
            <View style={styles.rowBetween}>
              <Text style={styles.typeName}>{level.level}</Text>
              <Text style={styles.typeRate}>{level.locked ? 'Kilitli' : `${level.completed}/${level.total}`}</Text>
            </View>
            <ProgressBar value={level.locked ? 0 : level.completed} max={level.total} tone="success" />
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  topBar: { paddingHorizontal: Spacing.marginMain, height: 48, justifyContent: 'center' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: Spacing.xl, gap: Spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  subtitle: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 18 },
  section: { gap: Spacing.sm },
  stateCard: { alignItems: 'center', gap: Spacing.md },
  stateText: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  retryBtn: { alignSelf: 'stretch' },
  note: { fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, flexWrap: 'wrap' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  cardLabelStrong: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  recCard: {
    flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.xl,
    backgroundColor: Colors.navy, borderCurve: 'continuous',
  },
  recNumber: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.golden, alignItems: 'center', justifyContent: 'center',
  },
  recNumberText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  recBody: { flex: 1, gap: 4 },
  recTitle: { fontSize: 16, fontWeight: '700', color: Colors.onPrimary },
  recReason: { fontSize: 13, color: Colors.surfaceContainerHighest, lineHeight: 19 },
  recAction: { fontSize: 13, fontWeight: '700', color: Colors.golden, marginTop: 2 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statTile: {
    flexGrow: 1, flexBasis: '30%', minWidth: 96, gap: 4, padding: Spacing.md, borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.surfaceContainer,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.onSurfaceVariant, lineHeight: 15 },
  goalCard: { gap: Spacing.sm },

  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4, paddingTop: Spacing.sm },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartValue: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  chartTrack: { height: MAX_BAR_HEIGHT, justifyContent: 'flex-end', alignSelf: 'stretch', alignItems: 'center' },
  chartBar: { width: '70%', maxWidth: 28, borderRadius: 6, backgroundColor: Colors.secondaryFixedDim },
  chartBarToday: { backgroundColor: Colors.navy },
  chartLabel: { fontSize: 11, color: Colors.onSurfaceVariant },
  chartLabelToday: { fontWeight: '700', color: Colors.primary },

  stack: { flexDirection: 'row', borderRadius: 7, overflow: 'hidden', backgroundColor: Colors.surfaceContainer },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { flex: 1, fontSize: 13, color: Colors.primary },
  legendValue: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  dueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  dueText: { flex: 1 },
  dueGerman: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  dueTurkish: { fontSize: 12, color: Colors.onSurfaceVariant },
  dueMeta: { fontSize: 12, fontWeight: '600', color: Colors.secondary },

  typeRow: { gap: 6 },
  typeName: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  typeRate: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  typeMeta: { fontSize: 11, color: Colors.onSurfaceVariant },
  weak: { fontSize: 13, fontWeight: '600', color: Colors.secondary, lineHeight: 19 },

  scenarioRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm,
    minHeight: Spacing.touchTargetMin, paddingVertical: 6,
  },
  scenarioTitle: { flex: 1, fontSize: 14, color: Colors.primary },
  scenarioMeta: { fontSize: 12, fontWeight: '700', color: Colors.success },
  scenarioMetaWeak: { color: Colors.secondary },
  levelRow: { gap: 6 },
});

import type { QuizSession, Word } from '../types';
import type { DailyPlan } from './learning-analysis';
import { getReviewState, ReviewStateMap } from './spaced-repetition';

// "Bugünkü Planın" kartının önerdiği çalışmayı gerçek bir oturuma çevirir. Saf fonksiyonlardır:
// depolama veya ağ yoktur. Alıştırmaların kendisi, puanlama ve kayıt mevcut ekranlarda kalır.

/** Karışık konulardan gelen kelime listesini (wordIds) kabul eden alıştırmalar. */
export type PlanStepType = 'dogru-yanlis' | 'yazma';

/** Bir alıştırma ekranının tek seferde sorabileceği en fazla kelime (yazma: 10). */
export const MAX_WORDS_PER_STEP = 10;

export interface PlanStep {
  type: PlanStepType;
  wordIds: string[];
}

export interface StudyPlan {
  words: Word[];
  steps: PlanStep[];
  dueCount: number;
  weakCount: number;
  newCount: number;
}

const normalizePart = (text: string | undefined) => (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const contentKey = (word: Word) => [word.article, word.german, word.turkish].map(normalizePart).join('|');

/** Aynı kimlikli ve aynı içerikli (artikel + Almanca + Türkçe) kelimeleri tek sayar; ilk görülen kalır. */
export function dedupeWords(words: readonly Word[] | null | undefined): Word[] {
  if (!Array.isArray(words)) return [];
  const ids = new Set<string>();
  const contents = new Set<string>();
  const out: Word[] = [];
  for (const word of words) {
    if (!word || ids.has(word.id)) continue;
    const key = contentKey(word);
    if (contents.has(key)) continue;
    ids.add(word.id);
    contents.add(key);
    out.push(word);
  }
  return out;
}

/** Plana girebilecek kelimeler: kullanıcının seviyesine açık konu kelimeleri + kişisel kelimeler, tekilleştirilmiş. */
export function getPlanCandidates(levelTopicWords: readonly Word[], personalWords: readonly Word[]): Word[] {
  return dedupeWords([...levelTopicWords, ...personalWords.filter(word => word.isCustom)]);
}

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

export interface BuildPlanInput {
  candidates: readonly Word[];
  reviewStates: ReviewStateMap;
  /** Tekrarı gelmiş kelimeler (en çok gecikenden başlayarak). Adayların dışındakiler yok sayılır. */
  dueWords: readonly Word[];
  dailyPlan: Pick<DailyPlan, 'wordCount' | 'exerciseCount' | 'focusCategory'>;
  /** Gün anahtarı: yeni kelime seçimi gün içinde sabit, günden güne farklıdır. */
  dayKey: string;
}

export function buildStudyPlan(input: BuildPlanInput): StudyPlan {
  const { reviewStates, dailyPlan, dayKey } = input;
  const candidates = dedupeWords(input.candidates);
  const allowed = new Set(candidates.map(word => word.id));
  const target = Math.max(0, Math.floor(dailyPlan.wordCount));

  const picked = new Map<string, { word: Word; kind: 'due' | 'weak' | 'new' }>();
  const take = (words: readonly Word[], kind: 'due' | 'weak' | 'new') => {
    for (const word of words) {
      if (picked.size >= target) return;
      if (allowed.has(word.id) && !picked.has(word.id)) picked.set(word.id, { word, kind });
    }
  };

  // 1) Tekrarı gelen kelimeler
  take(dedupeWords(input.dueWords), 'due');

  // 2) Zayıf kelimeler: çalışılmış ama henüz "Bilinçli" (2) düzeyine ulaşmamış
  const weak = candidates
    .filter(word => !picked.has(word.id))
    .map(word => ({ word, state: getReviewState(word, reviewStates) }))
    .filter(({ state }) => Boolean(state.lastReviewed) && state.masteryLevel < 2)
    .sort((a, b) => a.state.masteryLevel - b.state.masteryLevel
      || (a.state.lastReviewed ?? 0) - (b.state.lastReviewed ?? 0))
    .map(({ word }) => word);
  take(weak, 'weak');

  // 3) Yeni kelimeler: önce kişisel kelimeler, sonra seviye konuları (güne göre karıştırılmış)
  const fresh = candidates
    .filter(word => !picked.has(word.id) && !getReviewState(word, reviewStates).lastReviewed)
    .sort((a, b) => Number(b.isCustom) - Number(a.isCustom)
      || hash(`${dayKey}:${a.id}`) - hash(`${dayKey}:${b.id}`));
  take(fresh, 'new');

  let entries = [...picked.values()];
  const rounds = Math.min(Math.max(1, Math.floor(dailyPlan.exerciseCount)), entries.length);
  // Her alıştırma en fazla MAX_WORDS_PER_STEP kelime sorar; fazlası sessizce düşmesin diye baştan kırpılır.
  entries = entries.slice(0, rounds * MAX_WORDS_PER_STEP);
  const words = entries.map(entry => entry.word);

  const order: PlanStepType[] = dailyPlan.focusCategory === 'yazma'
    ? ['yazma', 'dogru-yanlis']
    : ['dogru-yanlis', 'yazma'];
  const steps: PlanStep[] = [];
  if (words.length > 0) {
    const base = Math.floor(words.length / rounds);
    const extra = words.length % rounds;
    let cursor = 0;
    for (let i = 0; i < rounds; i += 1) {
      const size = base + (i < extra ? 1 : 0);
      steps.push({ type: order[i % order.length]!, wordIds: words.slice(cursor, cursor + size).map(word => word.id) });
      cursor += size;
    }
  }

  const countOf = (kind: 'due' | 'weak' | 'new') => entries.filter(entry => entry.kind === kind).length;
  return { words, steps, dueCount: countOf('due'), weakCount: countOf('weak'), newCount: countOf('new') };
}

/** Bu adım için, başlatıldıktan sonra kaydedilmiş oturumu (mevcut kayıt akışından) bulur. */
export function findStepSession(
  step: PlanStep,
  startedAt: number | null | undefined,
  sessions: readonly QuizSession[] | null | undefined,
): QuizSession | undefined {
  if (typeof startedAt !== 'number' || !Array.isArray(sessions)) return undefined;
  const allowed = new Set(step.wordIds);
  return sessions.find(session =>
    session.type === step.type
    && typeof session.date === 'number' && session.date >= startedAt
    && Array.isArray(session.wordIds) && session.wordIds.length > 0
    && session.wordIds.every((id: string) => allowed.has(id)));
}

export function summarizeStepSessions(results: readonly (QuizSession | undefined)[]) {
  let correct = 0;
  let total = 0;
  for (const session of results) {
    if (!session) continue;
    correct += Math.max(0, session.score || 0);
    total += Math.max(0, session.total || 0);
  }
  return { correct, total: Math.max(total, correct), percent: total > 0 ? Math.round((Math.min(correct, total) / total) * 100) : 0 };
}

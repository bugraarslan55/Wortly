// Wortly — Veri Tipleri

export type Level = 'A1' | 'A2' | 'B1';
export type Article = 'der' | 'die' | 'das' | '';
export type MasteryLevel = 0 | 1 | 2 | 3;
export type ExerciseType = 'flashcard' | 'yazma' | 'dogru-yanlis' | 'dinle-sec' | 'bosluk' | 'cumle';

export interface Word {
  id: string;
  german: string;         // örn: "Apfel"
  article: Article;       // "der", "die", "das", ""
  turkish: string;        // "elma"
  plural?: string;        // "die Äpfel"
  example?: string;       // "Ich esse einen Apfel."
  exampleTurkish?: string;// "Bir elma yiyorum."
  addedAt: number;        // timestamp ms
  masteryLevel: MasteryLevel;
  lastReviewed?: number;
  isCustom: boolean;      // kullanıcı ekledi mi?
  topicId?: string;       // hangi konuya ait
  needsReview?: boolean;  // çeviri veya kaynak ayrıştırması kontrol bekliyor
}

export interface Topic {
  id: string;
  title: string;
  emoji: string;
  level: Level;
  wordCount: number;
  words: Word[];
}

export interface UserProfile {
  name: string;
  level: Level;
  onboardingCompleted: boolean;
  streak: number;
  lastStudyDate?: string; // YYYY-MM-DD
  totalWordsLearned: number;
  dailyGoal: number;      // günlük hedef kelime sayısı
}

export interface QuizSession {
  id: string;
  type: ExerciseType;
  wordIds: string[];
  score: number;
  total: number;
  date: number;
  topicId?: string;
}

export interface QuizState {
  session: QuizSession | null;
  currentIndex: number;
  answers: { wordId: string; correct: boolean }[];
}

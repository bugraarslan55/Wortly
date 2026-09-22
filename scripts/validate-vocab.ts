// Kelime veritabanı doğrulama scripti.
// Kontrol eder: yinelenen ID, aynı seviyede yinelenen Almanca lemma,
// eksik Almanca/Türkçe alan, geçersiz artikel, yanlış topicId,
// A1/A2/B1 seviyeleri arasında tekrar eden kelimeler.
//
// Çalıştırma: npx tsx scripts/validate-vocab.ts

import { ALL_TOPICS } from '../constants/topics';
import { Article, Word } from '../types';

const VALID_ARTICLES: Article[] = ['der', 'die', 'das', ''];

let hasError = false;
const log = (msg: string) => console.log(msg);
const fail = (msg: string) => { hasError = true; console.log('❌ ' + msg); };

// --- 1. Duplicate ID (across the whole app) ---
const idMap = new Map<string, { word: Word; topicId: string }[]>();
for (const topic of ALL_TOPICS) {
  for (const word of topic.words) {
    if (!idMap.has(word.id)) idMap.set(word.id, []);
    idMap.get(word.id)!.push({ word, topicId: topic.id });
  }
}
const dupIds = [...idMap.entries()].filter(([, v]) => v.length > 1);
log(`\n=== 1. Yinelenen ID ===`);
if (dupIds.length === 0) {
  log('✅ Yinelenen ID yok.');
} else {
  for (const [id, occurrences] of dupIds) {
    fail(`ID "${id}" ${occurrences.length} kez kullanılmış: ${occurrences.map(o => `${o.topicId}/${o.word.german}`).join(', ')}`);
  }
}

// --- 2. Duplicate level + German lemma (within the same level) ---
log(`\n=== 2. Aynı seviyede yinelenen Almanca lemma ===`);
const levelLemma = new Map<string, { word: Word; topicId: string }[]>();
for (const topic of ALL_TOPICS) {
  for (const word of topic.words) {
    // Case-sensitive: German capitalization is meaningful (e.g. "sie" = o/onlar vs "Sie" = siz).
    const key = `${topic.level}::${word.article}::${word.german}`;
    if (!levelLemma.has(key)) levelLemma.set(key, []);
    levelLemma.get(key)!.push({ word, topicId: topic.id });
  }
}
const dupLemmas = [...levelLemma.entries()].filter(([, v]) => v.length > 1);
if (dupLemmas.length === 0) {
  log('✅ Aynı seviyede yinelenen lemma yok.');
} else {
  for (const [key, occurrences] of dupLemmas) {
    fail(`"${key}" ${occurrences.length} kez: ${occurrences.map(o => o.topicId).join(', ')}`);
  }
}

// --- 3. Missing German/Turkish field ---
log(`\n=== 3. Eksik Almanca/Türkçe alan ===`);
let missingCount = 0;
for (const topic of ALL_TOPICS) {
  for (const word of topic.words) {
    if (!word.german || !word.german.trim()) {
      fail(`Eksik Almanca alan: id=${word.id} (topic=${topic.id})`);
      missingCount++;
    }
    if (!word.turkish || !word.turkish.trim()) {
      fail(`Eksik Türkçe alan: id=${word.id}, german="${word.german}" (topic=${topic.id})`);
      missingCount++;
    }
  }
}
if (missingCount === 0) log('✅ Eksik Almanca/Türkçe alan yok.');

// --- 4. Invalid article ---
log(`\n=== 4. Geçersiz artikel ===`);
let invalidArticleCount = 0;
for (const topic of ALL_TOPICS) {
  for (const word of topic.words) {
    if (!VALID_ARTICLES.includes(word.article)) {
      fail(`Geçersiz artikel "${word.article}": id=${word.id}, german="${word.german}"`);
      invalidArticleCount++;
    }
  }
}
if (invalidArticleCount === 0) log('✅ Geçersiz artikel yok.');

// --- 5. Wrong topicId ---
log(`\n=== 5. Yanlış topicId ===`);
let wrongTopicIdCount = 0;
for (const topic of ALL_TOPICS) {
  for (const word of topic.words) {
    if (word.topicId !== topic.id) {
      fail(`Yanlış topicId: id=${word.id} word.topicId="${word.topicId}" ama ${topic.id} konusunda bulunuyor`);
      wrongTopicIdCount++;
    }
  }
}
if (wrongTopicIdCount === 0) log('✅ Yanlış topicId yok.');

// --- 6. Repetition across A1/A2/B1 levels ---
log(`\n=== 6. A1/A2/B1 seviyeleri arasında tekrar ===`);
const crossLevel = new Map<string, Set<string>>();
for (const topic of ALL_TOPICS) {
  for (const word of topic.words) {
    const key = `${word.article}::${word.german}`;
    if (!crossLevel.has(key)) crossLevel.set(key, new Set());
    crossLevel.get(key)!.add(topic.level);
  }
}
const crossLevelDups = [...crossLevel.entries()].filter(([, levels]) => levels.size > 1);
if (crossLevelDups.length === 0) {
  log('✅ Seviyeler arası tekrar yok.');
} else {
  log(`⚠️  ${crossLevelDups.length} kelime birden fazla seviyede geçiyor (bilgi amaçlı, hata değil):`);
  for (const [key, levels] of crossLevelDups) {
    log(`   ${key} -> ${[...levels].join(', ')}`);
  }
}

// --- Summary ---
const totalWords = ALL_TOPICS.reduce((sum, t) => sum + t.words.length, 0);
log(`\n=== ÖZET ===`);
log(`Toplam konu: ${ALL_TOPICS.length}, toplam kelime: ${totalWords}`);
log(hasError ? '\n❌ Doğrulama başarısız oldu.' : '\n✅ Tüm kritik kontroller geçti.');

process.exit(hasError ? 1 : 0);

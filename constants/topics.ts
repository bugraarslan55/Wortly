import { Topic, Word } from '../types';
import { GOETHE_A1_TOPIC } from './goethe-a1';
import { GOETHE_A2_TOPIC } from './goethe-a2';

// Helper: geçici ID üretici. assignDeterministicIds() ile sayfa yenilense de
// değişmeyen, topicId + kelimeye dayalı kararlı ID'lerle değiştirilir.
const makeId = () => Math.random().toString(36).substring(2, 10);
const now = Date.now();

// Almanca karakterleri sadeleştirip URL-güvenli bir slug üretir.
const slugify = (s: string): string =>
  s
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');

// Her kelimeye topicId + kelime içeriğine dayalı, uygulama yeniden başlasa da
// değişmeyen kararlı bir ID atar. Aynı topic içinde çakışma olursa sona
// sayaç ekler (aynı Almanca kelime + artikel ikinci kez geçmesin diye).
function assignDeterministicIds(topics: Topic[]): void {
  for (const topic of topics) {
    const seen = new Map<string, number>();
    for (const word of topic.words) {
      const base = `${topic.id}-${slugify(word.article ? `${word.article}-${word.german}` : word.german)}`;
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      word.id = count === 0 ? base : `${base}-${count + 1}`;
    }
  }
}

// ─── A1 KONULARI ────────────────────────────────────────────────────────────

export const A1_TOPICS: Topic[] = [
  {
    id: 'a1-sayilar',
    title: 'Sayılar',
    emoji: '🔢',
    level: 'A1',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'eins', article: '', turkish: 'bir', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'zwei', article: '', turkish: 'iki', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'drei', article: '', turkish: 'üç', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'vier', article: '', turkish: 'dört', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'fünf', article: '', turkish: 'beş', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'sechs', article: '', turkish: 'altı', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'sieben', article: '', turkish: 'yedi', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'acht', article: '', turkish: 'sekiz', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'neun', article: '', turkish: 'dokuz', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
      { id: makeId(), german: 'zehn', article: '', turkish: 'on', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-sayilar' },
    ],
  },
  {
    id: 'a1-renkler',
    title: 'Renkler',
    emoji: '🎨',
    level: 'A1',
    wordCount: 8,
    words: [
      { id: makeId(), german: 'rot', article: '', turkish: 'kırmızı', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-renkler' },
      { id: makeId(), german: 'blau', article: '', turkish: 'mavi', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-renkler' },
      { id: makeId(), german: 'grün', article: '', turkish: 'yeşil', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-renkler' },
      { id: makeId(), german: 'gelb', article: '', turkish: 'sarı', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-renkler' },
      { id: makeId(), german: 'schwarz', article: '', turkish: 'siyah', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-renkler' },
      { id: makeId(), german: 'weiß', article: '', turkish: 'beyaz', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-renkler' },
      { id: makeId(), german: 'orange', article: '', turkish: 'turuncu', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-renkler' },
      { id: makeId(), german: 'lila', article: '', turkish: 'mor', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-renkler' },
    ],
  },
  {
    id: 'a1-aile',
    title: 'Aile',
    emoji: '👨‍👩‍👧',
    level: 'A1',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'Mutter', article: 'die', turkish: 'anne', plural: 'die Mütter', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Vater', article: 'der', turkish: 'baba', plural: 'die Väter', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Bruder', article: 'der', turkish: 'erkek kardeş', plural: 'die Brüder', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Schwester', article: 'die', turkish: 'kız kardeş', plural: 'die Schwestern', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Kind', article: 'das', turkish: 'çocuk', plural: 'die Kinder', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Großmutter', article: 'die', turkish: 'büyükanne', plural: 'die Großmütter', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Großvater', article: 'der', turkish: 'büyükbaba', plural: 'die Großväter', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Familie', article: 'die', turkish: 'aile', plural: 'die Familien', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Mann', article: 'der', turkish: 'adam / koca', plural: 'die Männer', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
      { id: makeId(), german: 'Frau', article: 'die', turkish: 'kadın / eş', plural: 'die Frauen', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-aile' },
    ],
  },
  {
    id: 'a1-yiyecekler',
    title: 'Yiyecekler',
    emoji: '🍎',
    level: 'A1',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'Apfel', article: 'der', turkish: 'elma', plural: 'die Äpfel', example: 'Ich esse einen Apfel.', exampleTurkish: 'Bir elma yiyorum.', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Brot', article: 'das', turkish: 'ekmek', plural: 'die Brote', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Wasser', article: 'das', turkish: 'su', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Milch', article: 'die', turkish: 'süt', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Käse', article: 'der', turkish: 'peynir', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Ei', article: 'das', turkish: 'yumurta', plural: 'die Eier', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Fleisch', article: 'das', turkish: 'et', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Gemüse', article: 'das', turkish: 'sebze', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Obst', article: 'das', turkish: 'meyve', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
      { id: makeId(), german: 'Kaffee', article: 'der', turkish: 'kahve', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-yiyecekler' },
    ],
  },
  {
    id: 'a1-selamlama',
    title: 'Selamlama',
    emoji: '👋',
    level: 'A1',
    wordCount: 8,
    words: [
      { id: makeId(), german: 'Hallo', article: '', turkish: 'Merhaba', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-selamlama' },
      { id: makeId(), german: 'Guten Morgen', article: '', turkish: 'Günaydın', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-selamlama' },
      { id: makeId(), german: 'Guten Tag', article: '', turkish: 'İyi günler', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-selamlama' },
      { id: makeId(), german: 'Guten Abend', article: '', turkish: 'İyi akşamlar', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-selamlama' },
      { id: makeId(), german: 'Gute Nacht', article: '', turkish: 'İyi geceler', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-selamlama' },
      { id: makeId(), german: 'Tschüss', article: '', turkish: 'Hoşça kal', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-selamlama' },
      { id: makeId(), german: 'Auf Wiedersehen', article: '', turkish: 'Güle güle', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-selamlama' },
      { id: makeId(), german: 'Bitte', article: '', turkish: 'Lütfen / Rica ederim', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a1-selamlama' },
    ],
  },
  GOETHE_A1_TOPIC,
];

// ─── A2 KONULARI ────────────────────────────────────────────────────────────

export const A2_TOPICS: Topic[] = [
  GOETHE_A2_TOPIC,
  {
    id: 'a2-ev',
    title: 'Ev & Eşyalar',
    emoji: '🏠',
    level: 'A2',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'Küche', article: 'die', turkish: 'mutfak', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Wohnzimmer', article: 'das', turkish: 'oturma odası', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Schlafzimmer', article: 'das', turkish: 'yatak odası', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Badezimmer', article: 'das', turkish: 'banyo', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Tisch', article: 'der', turkish: 'masa', plural: 'die Tische', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Stuhl', article: 'der', turkish: 'sandalye', plural: 'die Stühle', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Bett', article: 'das', turkish: 'yatak', plural: 'die Betten', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Fenster', article: 'das', turkish: 'pencere', plural: 'die Fenster', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Tür', article: 'die', turkish: 'kapı', plural: 'die Türen', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
      { id: makeId(), german: 'Schrank', article: 'der', turkish: 'dolap', plural: 'die Schränke', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-ev' },
    ],
  },
  {
    id: 'a2-sehir',
    title: 'Şehir & Ulaşım',
    emoji: '🏙️',
    level: 'A2',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'Bahnhof', article: 'der', turkish: 'tren istasyonu', plural: 'die Bahnhöfe', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Supermarkt', article: 'der', turkish: 'süpermarket', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Krankenhaus', article: 'das', turkish: 'hastane', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Schule', article: 'die', turkish: 'okul', plural: 'die Schulen', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Straße', article: 'die', turkish: 'sokak / cadde', plural: 'die Straßen', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Bus', article: 'der', turkish: 'otobüs', plural: 'die Busse', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Zug', article: 'der', turkish: 'tren', plural: 'die Züge', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Auto', article: 'das', turkish: 'araba', plural: 'die Autos', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Flughafen', article: 'der', turkish: 'havalimanı', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
      { id: makeId(), german: 'Apotheke', article: 'die', turkish: 'eczane', plural: 'die Apotheken', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-sehir' },
    ],
  },
  {
    id: 'a2-meslek',
    title: 'Meslekler',
    emoji: '💼',
    level: 'A2',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'Arzt', article: 'der', turkish: 'doktor (erkek)', plural: 'die Ärzte', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Ärztin', article: 'die', turkish: 'doktor (kadın)', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Lehrer', article: 'der', turkish: 'öğretmen (erkek)', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Lehrerin', article: 'die', turkish: 'öğretmen (kadın)', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Ingenieur', article: 'der', turkish: 'mühendis', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Polizist', article: 'der', turkish: 'polis (erkek)', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Koch', article: 'der', turkish: 'aşçı (erkek)', plural: 'die Köche', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Kellner', article: 'der', turkish: 'garson (erkek)', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Journalist', article: 'der', turkish: 'gazeteci', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
      { id: makeId(), german: 'Student', article: 'der', turkish: 'üniversite öğrencisi', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'a2-meslek' },
    ],
  },
];

// ─── B1 KONULARI ────────────────────────────────────────────────────────────

export const B1_TOPICS: Topic[] = [
  {
    id: 'b1-duygular',
    title: 'Duygular & Düşünceler',
    emoji: '💭',
    level: 'B1',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'Freude', article: 'die', turkish: 'sevinç', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Trauer', article: 'die', turkish: 'üzüntü', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Angst', article: 'die', turkish: 'korku / kaygı', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Wut', article: 'die', turkish: 'öfke', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Hoffnung', article: 'die', turkish: 'umut', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Enttäuschung', article: 'die', turkish: 'hayal kırıklığı', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Überraschung', article: 'die', turkish: 'sürpriz / şaşkınlık', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Stolz', article: 'der', turkish: 'gurur', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Scham', article: 'die', turkish: 'utanç', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
      { id: makeId(), german: 'Neugier', article: 'die', turkish: 'merak', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-duygular' },
    ],
  },
  {
    id: 'b1-is-hayati',
    title: 'İş Hayatı',
    emoji: '📊',
    level: 'B1',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'Bewerbung', article: 'die', turkish: 'iş başvurusu', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Gehalt', article: 'das', turkish: 'maaş', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Kündigung', article: 'die', turkish: 'işten çıkarma / istifa', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Besprechung', article: 'die', turkish: 'toplantı', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Kollege', article: 'der', turkish: 'erkek meslektaş', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Kollegin', article: 'die', turkish: 'kadın meslektaş', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Vorgesetzte', article: 'die', turkish: 'üst / amir (kadın)', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Erfahrung', article: 'die', turkish: 'deneyim', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Fähigkeit', article: 'die', turkish: 'yetenek / beceri', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
      { id: makeId(), german: 'Verantwortung', article: 'die', turkish: 'sorumluluk', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-is-hayati' },
    ],
  },
  {
    id: 'b1-cevre',
    title: 'Çevre & Doğa',
    emoji: '🌿',
    level: 'B1',
    wordCount: 10,
    words: [
      { id: makeId(), german: 'Klimawandel', article: 'der', turkish: 'iklim değişikliği', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Umwelt', article: 'die', turkish: 'çevre', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Nachhaltigkeit', article: 'die', turkish: 'sürdürülebilirlik', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Verschmutzung', article: 'die', turkish: 'kirlilik / kirlenme', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Energie', article: 'die', turkish: 'enerji', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Recycling', article: 'das', turkish: 'geri dönüşüm', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Wald', article: 'der', turkish: 'orman', plural: 'die Wälder', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Meer', article: 'das', turkish: 'deniz', plural: 'die Meere', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Temperatur', article: 'die', turkish: 'sıcaklık', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
      { id: makeId(), german: 'Naturkatastrophe', article: 'die', turkish: 'doğal afet', addedAt: now, masteryLevel: 0, isCustom: false, topicId: 'b1-cevre' },
    ],
  },
];

// ─── YARDIMCI ───────────────────────────────────────────────────────────────

// Goethe A1 listesi zaten kendi dosyasında elle atanmış kararlı ID'lere sahip;
// burada üzerine yazılmaz, yalnızca bu dosyada tanımlı konular normalize edilir.
assignDeterministicIds(A1_TOPICS.filter(t => t.id !== GOETHE_A1_TOPIC.id));
assignDeterministicIds(A2_TOPICS);
assignDeterministicIds(B1_TOPICS);

export const ALL_TOPICS: Topic[] = [...A1_TOPICS, ...A2_TOPICS, ...B1_TOPICS];

export const getTopicsForLevel = (level: string): Topic[] => {
  switch (level) {
    case 'A1': return A1_TOPICS;
    case 'A2': return [...A1_TOPICS, ...A2_TOPICS];
    case 'B1': return ALL_TOPICS;
    default: return A1_TOPICS;
  }
};

export const getTopicById = (id: string): Topic | undefined =>
  ALL_TOPICS.find(t => t.id === id);

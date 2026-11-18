import type { Level } from '../types';

export type GrammarTopic = 'adjective' | 'preposition';

export type GrammarQuestion = {
  prompt: string;
  options: [string, string, string];
  correctIndex: 0 | 1 | 2;
  explanation: string;
};

export type GrammarLesson = {
  id: string;
  level: Level;
  topic: GrammarTopic;
  title: string;
  summary: string;
  rule: string;
  tip: string;
  examples: { german: string; turkish: string }[];
  questions: GrammarQuestion[];
};

// Dersler yalnızca öğrenme içeriğidir. Kelime ilerlemesine, seriye veya buluta yazılmaz.
export const GRAMMAR_LESSONS: GrammarLesson[] = [
  {
    id: 'a1-basic-adjectives', level: 'A1', topic: 'adjective',
    title: 'Temel sıfatlar', summary: 'Bir kişiyi veya nesneyi basitçe tanımla.',
    rule: 'Sıfat, sein fiilinden sonra kullanıldığında sonuna çekim eki gelmez: Das Haus ist groß. İsimden önce gelirse bir son ek alır: ein großes Haus.',
    tip: 'Önce “Das ist …” ve “… ist …” kalıplarıyla çalış; isimden önceki son ekleri sonraki derslerde göreceksin.',
    examples: [
      { german: 'Das Zimmer ist hell.', turkish: 'Oda aydınlık.' },
      { german: 'Der Kaffee ist heiß.', turkish: 'Kahve sıcak.' },
      { german: 'Die Tasche ist klein.', turkish: 'Çanta küçük.' },
    ],
    questions: [
      { prompt: 'Das Zimmer ist ___. (Oda aydınlık.)', options: ['hell', 'helle', 'helles'], correctIndex: 0, explanation: 'sein fiilinden sonra sıfat yalın biçimdedir: ist hell.' },
      { prompt: 'Der Kaffee ist ___. (Kahve sıcak.)', options: ['heiße', 'heiß', 'heißes'], correctIndex: 1, explanation: 'Burada sıfat isimden sonra yüklemdir; bu nedenle ek almaz: ist heiß.' },
      { prompt: 'Die Tasche ist ___. (Çanta küçük.)', options: ['kleine', 'kleines', 'klein'], correctIndex: 2, explanation: 'Yüklem olan sıfata artikelden bağımsız olarak ek gelmez: ist klein.' },
      { prompt: 'Das Buch ist ___. (Kitap yeni.)', options: ['neues', 'neu', 'neue'], correctIndex: 1, explanation: 'sein fiilinden sonraki doğru biçim neu sözcüğüdür.' },
    ],
  },
  {
    id: 'a1-basic-prepositions', level: 'A1', topic: 'preposition',
    title: 'für, ohne ve mit', summary: 'Edatın ardından gelen ismin hâlini tanı.',
    rule: 'für (için) ve ohne (olmadan) Akkusativ ister; mit (ile) Dativ ister. Örneğin der Freund → für den Freund / mit dem Freund.',
    tip: 'Edatı tek başına ezberlemek yerine “für den”, “ohne den”, “mit dem” gibi artikel ile birlikte öğren.',
    examples: [
      { german: 'Das Geschenk ist für den Freund.', turkish: 'Hediye arkadaş için.' },
      { german: 'Ich komme ohne meinen Bruder.', turkish: 'Erkek kardeşim olmadan geliyorum.' },
      { german: 'Ich fahre mit dem Bus.', turkish: 'Otobüsle gidiyorum.' },
    ],
    questions: [
      { prompt: 'Das Geschenk ist für ___ Freund.', options: ['der', 'den', 'dem'], correctIndex: 1, explanation: 'für Akkusativ ister; eril artikel der → den olur.' },
      { prompt: 'Ich fahre mit ___ Bus.', options: ['dem', 'den', 'der'], correctIndex: 0, explanation: 'mit Dativ ister; der Bus → dem Bus.' },
      { prompt: 'Sie kommt ohne ___ Bruder.', options: ['ihr', 'ihrem', 'ihren'], correctIndex: 2, explanation: 'ohne Akkusativ ister; ihr Bruder → ihren Bruder.' },
      { prompt: 'Das ist für ___ Kind.', options: ['das', 'dem', 'des'], correctIndex: 0, explanation: 'für Akkusativ ister; nötr das Kind için artikel das olarak kalır.' },
    ],
  },
  {
    id: 'a2-comparison', level: 'A2', topic: 'adjective',
    title: 'Sıfatlarla karşılaştırma', summary: 'Daha … ve en … yapılarını kur.',
    rule: 'Karşılaştırmada sıfata çoğunlukla -er eklenir ve als kullanılır: schneller als. En üstün derece için am …-sten kullanılır: am schnellsten. gut → besser → am besten gibi düzensiz biçimler de vardır.',
    tip: 'İki şeyi karşılaştırırken als, eşitlik bildirirken so … wie kullanılır.',
    examples: [
      { german: 'Der Zug ist schneller als der Bus.', turkish: 'Tren otobüsten daha hızlı.' },
      { german: 'Heute ist es wärmer als gestern.', turkish: 'Bugün dünden daha sıcak.' },
      { german: 'Dieses Café ist am besten.', turkish: 'Bu kafe en iyisi.' },
    ],
    questions: [
      { prompt: 'Der Zug ist ___ als der Bus.', options: ['schnell', 'schneller', 'am schnellsten'], correctIndex: 1, explanation: 'als ile iki şey karşılaştırılır: schneller als.' },
      { prompt: 'Heute ist es ___ als gestern.', options: ['wärmer', 'warm', 'am wärmsten'], correctIndex: 0, explanation: 'warm sıfatının karşılaştırma biçimi wärmer olur.' },
      { prompt: 'Dieses Café ist ___. (en iyi)', options: ['am besser', 'am gut', 'am besten'], correctIndex: 2, explanation: 'gut → besser → am besten. “am” ile bu sıfatın üstünlük biçimi besten olur.' },
      { prompt: 'Mein Zimmer ist so groß ___ deins.', options: ['als', 'wie', 'mit'], correctIndex: 1, explanation: 'Eşitlik için so … wie kullanılır.' },
    ],
  },
  {
    id: 'a2-adjective-endings', level: 'A2', topic: 'adjective',
    title: 'Sıfat sonlarına giriş', summary: 'Sıfatın isimden önce nasıl değiştiğini gör.',
    rule: 'Sıfat isimden önceyse artikel, cinsiyet ve hâle göre son ek alır. Basit örnekler: der alte Mann, die alte Frau, das alte Haus; ein alter Mann, eine alte Frau, ein altes Haus.',
    tip: 'Önce Nominativ örnekleriyle başla. Akkusativ erilde “den alten Mann / einen alten Mann” biçimini ayrıca öğren.',
    examples: [
      { german: 'Der alte Mann wartet.', turkish: 'Yaşlı adam bekliyor.' },
      { german: 'Ein altes Haus steht hier.', turkish: 'Burada eski bir ev var.' },
      { german: 'Ich sehe den alten Mann.', turkish: 'Yaşlı adamı görüyorum.' },
    ],
    questions: [
      { prompt: 'Der ___ Mann wartet.', options: ['alter', 'alten', 'alte'], correctIndex: 2, explanation: 'Belirli artikel der ile Nominativ erilde sıfat -e alır.' },
      { prompt: 'Ein ___ Haus steht hier.', options: ['altes', 'alten', 'alte'], correctIndex: 0, explanation: 'ein + nötr Nominativ isim öncesinde altes kullanılır.' },
      { prompt: 'Ich sehe den ___ Mann.', options: ['alte', 'alten', 'alter'], correctIndex: 1, explanation: 'den + eril Akkusativ isim öncesinde sıfat -en alır.' },
      { prompt: 'Eine ___ Frau kommt.', options: ['netter', 'netten', 'nette'], correctIndex: 2, explanation: 'eine + dişil Nominativ isim öncesinde nette kullanılır.' },
    ],
  },
  {
    id: 'a2-two-way-prepositions', level: 'A2', topic: 'preposition',
    title: 'Wo? Wohin?', summary: 'Konum ve yönelme için doğru hâli seç.',
    rule: 'in, an, auf gibi iki yönlü edatlar konum sorusu wo? için Dativ, hedefe yönelme sorusu wohin? için Akkusativ alır. Hareketin varlığı tek başına hâli belirlemez; bir yere yönelip yönelmediğine bak.',
    tip: 'Dokuz iki yönlü edat: an, auf, hinter, in, neben, über, unter, vor, zwischen. “Nerede?” → in der Schule; “nereye?” → in die Schule.',
    examples: [
      { german: 'Ich bin in der Schule.', turkish: 'Okuldayım.' },
      { german: 'Ich gehe in die Schule.', turkish: 'Okula gidiyorum.' },
      { german: 'Das Buch liegt auf dem Tisch.', turkish: 'Kitap masanın üzerinde duruyor.' },
    ],
    questions: [
      { prompt: 'Ich bin in ___ Schule. (Nerede?)', options: ['die', 'der', 'den'], correctIndex: 1, explanation: 'Konum bildirir; in + Dativ: die Schule → der Schule.' },
      { prompt: 'Ich gehe in ___ Schule. (Nereye?)', options: ['die', 'der', 'dem'], correctIndex: 0, explanation: 'Hedefe yönelme bildirir; in + Akkusativ: die Schule.' },
      { prompt: 'Das Buch liegt auf ___ Tisch.', options: ['den', 'der', 'dem'], correctIndex: 2, explanation: 'Kitabın konumu anlatılır; auf + Dativ: dem Tisch.' },
      { prompt: 'Ich lege das Buch auf ___ Tisch.', options: ['dem', 'den', 'des'], correctIndex: 1, explanation: 'Kitabı masaya yerleştirme hedefi vardır; auf + Akkusativ: den Tisch.' },
    ],
  },
  {
    id: 'b1-adjective-declension', level: 'B1', topic: 'adjective',
    title: 'Sıfat çekimini pekiştir', summary: 'Dativ, Genitiv ve çoğulda son ekleri kullan.',
    rule: 'İsimden önceki sıfatın eki artikel ve hâle bağlıdır. Dativ: mit einem neuen Lehrer, der netten Frau. Genitiv: des alten Hauses. Çoğul Nominativ: die kleinen Kinder; artikelsizse kleine Kinder.',
    tip: 'İsmi sıfat ve artikel ile birlikte öğren: einem neuen Lehrer, des alten Hauses, kleine Kinder.',
    examples: [
      { german: 'Ich spreche mit einem neuen Lehrer.', turkish: 'Yeni bir öğretmenle konuşuyorum.' },
      { german: 'Die kleinen Kinder spielen.', turkish: 'Küçük çocuklar oynuyor.' },
      { german: 'Kleine Kinder spielen.', turkish: 'Küçük çocuklar oynuyor.' },
      { german: 'Die Tür des alten Hauses ist offen.', turkish: 'Eski evin kapısı açık.' },
    ],
    questions: [
      { prompt: 'Ich spreche mit einem ___ Lehrer.', options: ['neue', 'neuen', 'neuer'], correctIndex: 1, explanation: 'mit + Dativ; einem artikelinden sonra sıfat -en alır: neuen.' },
      { prompt: '___ Kinder spielen. (Artikelsiz çoğul)', options: ['Kleine', 'Kleinen', 'Kleines'], correctIndex: 0, explanation: 'Artikelsiz çoğul Nominativ: kleine Kinder.' },
      { prompt: 'Die Tür des ___ Hauses ist offen.', options: ['alten', 'alte', 'altes'], correctIndex: 0, explanation: 'des + Genitiv isim öncesinde sıfat -en alır: des alten Hauses.' },
      { prompt: 'Ich helfe der ___ Frau.', options: ['nette', 'netten', 'netter'], correctIndex: 1, explanation: 'helfen Dativ ister; der + Dativ isim öncesinde netten gelir.' },
    ],
  },
  {
    id: 'b1-verb-prepositions', level: 'B1', topic: 'preposition',
    title: 'Fiil + edat kalıpları', summary: 'Fiili edatı ve hâliyle birlikte öğren.',
    rule: 'Bazı fiiller sabit bir edatla kullanılır. warten auf + Akkusativ, sich interessieren für + Akkusativ, sprechen mit + Dativ, denken an + Akkusativ.',
    tip: '“warten” sözcüğünü tek başına değil, “auf den Bus warten” şeklinde öğren.',
    examples: [
      { german: 'Ich warte auf den Bus.', turkish: 'Otobüsü bekliyorum.' },
      { german: 'Sie interessiert sich für Musik.', turkish: 'Müzikle ilgileniyor.' },
      { german: 'Wir sprechen mit dem Lehrer.', turkish: 'Öğretmenle konuşuyoruz.' },
    ],
    questions: [
      { prompt: 'Ich warte ___ den Bus.', options: ['mit', 'auf', 'für'], correctIndex: 1, explanation: 'warten auf + Akkusativ: auf den Bus.' },
      { prompt: 'Sie interessiert sich ___ Musik.', options: ['für', 'mit', 'an'], correctIndex: 0, explanation: 'sich interessieren für kalıbı kullanılır.' },
      { prompt: 'Wir sprechen ___ dem Lehrer.', options: ['auf', 'für', 'mit'], correctIndex: 2, explanation: 'Biriyle konuşmak: sprechen mit + Dativ.' },
      { prompt: 'Denkst du ___ mich?', options: ['an', 'mit', 'auf'], correctIndex: 0, explanation: 'Birini düşünmek: denken an + Akkusativ.' },
    ],
  },
  {
    id: 'b1-genitive-prepositions', level: 'B1', topic: 'preposition',
    title: 'wegen ve trotz', summary: 'Neden ve karşıtlık bildiren edatları kullan.',
    rule: 'Standart yazı dilinde wegen (… yüzünden) ve trotz (… rağmen) Genitiv ile kurulur: wegen des Regens, trotz des Regens. Eril ve nötr tekil isimler çoğunlukla -(e)s eki de alır: der Regen → des Regens. Günlük konuşmada Dativ biçimleri duyulabilir; bu ders yazı dilindeki biçimi öğretir.',
    tip: 'Eril ve nötr isimlerde des; dişil ve çoğul isimlerde der biçimini gözlemle. Dişil ve çoğulda Dativ ile Genitiv artikelleri aynı görünebilir.',
    examples: [
      { german: 'Wegen des Regens bleiben wir zu Hause.', turkish: 'Yağmur yüzünden evde kalıyoruz.' },
      { german: 'Trotz des Regens gehen wir spazieren.', turkish: 'Yağmura rağmen yürüyüşe çıkıyoruz.' },
      { german: 'Wegen der Arbeit komme ich später.', turkish: 'İş yüzünden daha geç geleceğim.' },
    ],
    questions: [
      { prompt: 'Wegen ___ Regens bleiben wir zu Hause. (Yazı dili)', options: ['dem', 'den', 'des'], correctIndex: 2, explanation: 'Standart yazı dilinde wegen + Genitiv: des Regens.' },
      { prompt: 'Trotz ___ Regens gehen wir spazieren. (Yazı dili)', options: ['des', 'dem', 'der'], correctIndex: 0, explanation: 'Standart yazı dilinde trotz + Genitiv: des Regens.' },
      { prompt: 'Wegen ___ Arbeit komme ich später. (Yazı dili)', options: ['die', 'der', 'den'], correctIndex: 1, explanation: 'die Arbeit için Genitiv artikel der olur; dişilde Dativ de aynı biçimde görünür.' },
      { prompt: 'Trotz ___ Probleme blieb sie ruhig. (Yazı dili)', options: ['die', 'den', 'der'], correctIndex: 2, explanation: 'Çoğul Genitiv artikel der olur: trotz der Probleme.' },
    ],
  },
];

const LEVEL_ORDER: Level[] = ['A1', 'A2', 'B1'];

export function isGrammarLevelLocked(lessonLevel: Level, userLevel: Level | null | undefined): boolean {
  const userIndex = LEVEL_ORDER.indexOf(userLevel ?? 'A1');
  return LEVEL_ORDER.indexOf(lessonLevel) > Math.max(userIndex, 0);
}

export function getGrammarLesson(id: string): GrammarLesson | undefined {
  return GRAMMAR_LESSONS.find(lesson => lesson.id === id);
}

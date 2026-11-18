import { Level } from '../types';

export type SayStep = {
  type: 'say';
  speaker: string;
  german: string;
  turkish: string;
};

export type ReplyStep = {
  type: 'reply';
  prompt: string;
  german: string;
  turkish: string;
  wrongOptions: [string, string];
  /** İsteğe bağlı: yanlış seçeneklerin Türkçe anlamları (wrongOptions ile aynı sırada). */
  wrongTurkish?: [string, string];
  /** İsteğe bağlı: yanlış seçeneklerin neden uymadığını anlatan kısa notlar (aynı sırada). */
  wrongNotes?: [string, string];
  /** İsteğe bağlı: doğru cevap için kısa dil bilgisi / kullanım notu. */
  note?: string;
};

export type ChoiceOption = {
  /** Kullanıcının söyleyebileceği doğal ve geçerli Almanca cevap. */
  german: string;
  turkish: string;
  /** Karşı tarafın BU seçime verdiği yanıt (konuşan, adımın `speaker` alanıdır). */
  responseGerman: string;
  responseTurkish: string;
  /**
   * Yalnızca sesli cevap açık karar noktalarında: `german` dışında, söylendiğinde AYNI dalı seçen kısa/doğal alternatifler.
   * Seçenekler arasında çakışmamalıdır (validateScenario denetler).
   */
  accepted?: string[];
};

/**
 * Karar noktası: karşı taraf bir soru sorar; kullanıcı iki doğal cevaptan birini seçer ve karşı tarafın yanıtı seçime göre
 * değişir. Doğru/yanlış YOKTUR: puanlanmaz, "yanlışlarımı tekrar et" listesine ve kayda girmez. Akış sonraki (ortak) konuşma
 * satırıyla devam eder; bu yüzden bir karar noktasını her zaman bir `say` adımı izler.
 */
export type ChoiceStep = {
  type: 'choice';
  speaker: string;
  /** Karşı tarafın sorusu. */
  german: string;
  turkish: string;
  /** Kullanıcıya görev metni (Türkçe). */
  prompt: string;
  /**
   * İsteğe bağlı pilot: true ise kullanıcı iki seçenekten birini cihaz içi Almanca tanımayla SÖYLEYEBİLİR. Dokunarak seçim
   * her zaman kullanılabilir kalır; tanıma yoksa/başarısızsa yalnızca seçenekler çalışır. Puanlamayı etkilemez.
   */
  voice?: boolean;
  options: [ChoiceOption, ChoiceOption];
};

export type ScenarioStep = SayStep | ReplyStep | ChoiceStep;

export interface Scenario {
  id: string;
  level: Level;
  title: string;
  description: string;
  place: string;
  steps: ScenarioStep[];
}

export const SCENARIO_LEVELS: Level[] = ['A1', 'A2', 'B1'];

export const isScenarioLevelLocked = (level: Level, userLevel: Level | undefined): boolean =>
  SCENARIO_LEVELS.indexOf(level) > SCENARIO_LEVELS.indexOf(userLevel ?? 'A1');

export const SCENARIOS: Scenario[] = [
  // ─── A1 ───────────────────────────────────────────────────────────────────
  {
    id: 'kafede-siparis',
    level: 'A1',
    title: 'Kafede Sipariş',
    description: 'İçecek ve yiyecek sipariş et, hesabı iste.',
    place: 'Kafe',
    steps: [
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Guten Tag! Was möchten Sie trinken?',
        turkish: 'İyi günler! Ne içmek istersiniz?',
      },
      {
        type: 'reply',
        prompt: 'Bir kahve ve bir su istediğini söyle.',
        german: 'Ich möchte einen Kaffee und ein Wasser, bitte.',
        turkish: 'Bir kahve ve bir su istiyorum, lütfen.',
        wrongOptions: ['Ich habe einen Kaffee und ein Wasser.', 'Wo ist der Kaffee, bitte?'],
      },
      {
        type: 'choice',
        speaker: 'Garson',
        german: 'Möchten Sie Ihren Kaffee mit Milch?',
        turkish: 'Kahvenizi sütlü ister misiniz?',
        prompt: 'Kahveni sütlü mü sütsüz mü istediğini seç.',
        voice: true,
        options: [
          {
            german: 'Ja, mit Milch, bitte.',
            turkish: 'Evet, sütlü olsun, lütfen.',
            responseGerman: 'Alles klar, ein Kaffee mit Milch.',
            responseTurkish: 'Tamam, sütlü bir kahve.',
            accepted: ['Mit Milch, bitte.', 'Ja, bitte.', 'Mit Milch.'],
          },
          {
            german: 'Nein, ohne Milch, bitte.',
            turkish: 'Hayır, sütsüz olsun, lütfen.',
            responseGerman: 'Alles klar, ein schwarzer Kaffee.',
            responseTurkish: 'Tamam, sade bir kahve.',
            accepted: ['Ohne Milch, bitte.', 'Nein, danke.', 'Ohne Milch.'],
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Gern. Möchten Sie auch etwas essen?',
        turkish: 'Memnuniyetle. Bir şey de yemek ister misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Bir dilim kek istediğini söyle.',
        german: 'Ja, ein Stück Kuchen, bitte.',
        turkish: 'Evet, bir dilim kek, lütfen.',
        wrongOptions: ['Nein, danke. Ich möchte nichts essen.', 'Wo ist der Kuchen, bitte?'],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Hier, bitte. Möchten Sie noch etwas?',
        turkish: 'Buyurun. Başka bir şey ister misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Hayır teşekkür ettiğini ve hesabı istediğini söyle.',
        german: 'Nein, danke. Die Rechnung, bitte.',
        turkish: 'Hayır, teşekkürler. Hesap, lütfen.',
        wrongOptions: ['Ja, noch einen Kaffee, bitte.', 'Entschuldigung, wo ist die Toilette?'],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Das macht vier Euro fünfzig.',
        turkish: 'Tutarı dört euro elli.',
      },
      {
        type: 'reply',
        prompt: 'Beş euro verdiğini ve üstünün kalmasını söyle.',
        german: 'Hier sind fünf Euro. Stimmt so.',
        turkish: 'Buyurun, beş euro. Üstü kalsın.',
        wrongOptions: ['Ich habe keinen Hunger mehr.', 'Der Kaffee ist sehr heiß.'],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Vielen Dank! Einen schönen Tag noch!',
        turkish: 'Çok teşekkürler! Size güzel bir gün dilerim!',
      },
    ],
  },
  {
    id: 'tren-istasyonu',
    level: 'A1',
    title: 'Tren İstasyonunda Yol Sorma',
    description: 'Peronu, bilet almayı ve tren saatini sor.',
    place: 'Tren istasyonu',
    steps: [
      {
        type: 'say',
        speaker: 'Görevli',
        german: 'Guten Tag. Kann ich Ihnen helfen?',
        turkish: 'İyi günler. Size yardımcı olabilir miyim?',
      },
      {
        type: 'reply',
        prompt: '3. peronun nerede olduğunu sor.',
        german: 'Entschuldigung, wo ist Gleis drei?',
        turkish: 'Afedersiniz, 3. peron nerede?',
        wrongOptions: ['Entschuldigung, wie heißen Sie?', 'Entschuldigung, wo ist der Bus?'],
      },
      {
        type: 'say',
        speaker: 'Görevli',
        german: 'Gleis drei ist dort links.',
        turkish: '3. peron şurada solda.',
      },
      {
        type: 'reply',
        prompt: 'Bileti nereden alabileceğini sor.',
        german: 'Und wo kaufe ich eine Fahrkarte?',
        turkish: 'Peki bileti nereden alırım?',
        wrongOptions: ['Und wo wohnen Sie?', 'Und wo ist das Hotel?'],
      },
      {
        type: 'choice',
        speaker: 'Görevli',
        german: 'Fahren Sie einfach oder hin und zurück?',
        turkish: 'Tek yön mü gidiyorsunuz, yoksa gidiş-dönüş mü?',
        prompt: 'Nasıl bir bilet istediğini seç.',
        voice: true,
        options: [
          {
            german: 'Nur einfach, bitte.',
            turkish: 'Sadece tek yön, lütfen.',
            responseGerman: 'Gut, dann brauchen Sie eine einfache Fahrkarte.',
            responseTurkish: 'İyi, o zaman tek yön bir bilete ihtiyacınız var.',
            accepted: ['Einfach, bitte.', 'Nur einfach.', 'Eine einfache Fahrkarte, bitte.'],
          },
          {
            german: 'Hin und zurück, bitte.',
            turkish: 'Gidiş-dönüş, lütfen.',
            responseGerman: 'Gut, dann brauchen Sie eine Rückfahrkarte.',
            responseTurkish: 'İyi, o zaman gidiş-dönüş bir bilete ihtiyacınız var.',
            accepted: ['Hin und zurück.', 'Eine Rückfahrkarte, bitte.', 'Rückfahrkarte, bitte.'],
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Görevli',
        german: 'Der Automat ist rechts. Dort können Sie die Fahrkarte kaufen.',
        turkish: 'Bilet makinesi sağda. Bileti orada alabilirsiniz.',
      },
      {
        type: 'reply',
        prompt: 'Berlin treninin ne zaman kalktığını sor.',
        german: 'Wann fährt der Zug nach Berlin?',
        turkish: 'Berlin treni ne zaman kalkıyor?',
        wrongOptions: ['Wo ist der Zug nach Berlin?', 'Wann essen wir in Berlin?'],
      },
      {
        type: 'say',
        speaker: 'Görevli',
        german: 'Der Zug fährt um zehn Uhr dreißig.',
        turkish: 'Tren saat on otuzda kalkıyor.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür edip vedalaş.',
        german: 'Vielen Dank! Auf Wiedersehen!',
        turkish: 'Çok teşekkürler! Hoşça kalın!',
        wrongOptions: ['Guten Morgen! Ich heiße Anna.', 'Entschuldigung, wo ist die Toilette?'],
      },
    ],
  },

  {
    id: 'markette-alisveris',
    level: 'A1',
    title: 'Markette Alışveriş',
    description: 'Bir ürünün yerini sor, fiyatını öğren ve kasada öde.',
    place: 'Süpermarket',
    steps: [
      {
        type: 'say',
        speaker: 'Satış görevlisi',
        german: 'Guten Tag! Kann ich Ihnen helfen?',
        turkish: 'İyi günler! Size yardımcı olabilir miyim?',
      },
      {
        type: 'reply',
        prompt: 'Sütün nerede olduğunu sor.',
        german: 'Ja, bitte. Wo finde ich die Milch?',
        turkish: 'Evet, lütfen. Sütü nerede bulabilirim?',
        wrongOptions: ['Ja, bitte. Ich finde die Milch nicht gut.', 'Nein, danke. Ich möchte nur schauen.'],
        wrongTurkish: ['Evet, lütfen. Sütü pek beğenmiyorum.', 'Hayır, teşekkürler. Sadece bakmak istiyorum.'],
        wrongNotes: [
          'Burada "finden" "beğenmek" anlamında. Bir şeyin yerini sormak için "Wo finde ich ...?" kullanılır.',
          'Yardımı geri çeviriyor; oysa sen sütün yerini soracaksın.',
        ],
        note: '"Wo finde ich ...?" = "... nerede bulabilirim?" kalıbıdır. "die Milch" dişildir.',
      },
      {
        type: 'say',
        speaker: 'Satış görevlisi',
        german: 'Die Milch ist in Gang drei, neben dem Käse.',
        turkish: 'Süt üçüncü koridorda, peynirin yanında.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve bir litre sütün fiyatını sor.',
        german: 'Danke schön. Was kostet ein Liter Milch?',
        turkish: 'Çok teşekkürler. Bir litre süt ne kadar?',
        wrongOptions: ['Bitte schön. Das kostet zu viel.', 'Danke schön. Wo wohnen Sie?'],
        wrongTurkish: ['Rica ederim. Bu çok pahalı.', 'Çok teşekkürler. Nerede oturuyorsunuz?'],
        wrongNotes: [
          '"Bitte schön" teşekkür edilince verilen cevaptır; teşekkür eden sensin.',
          'Fiyat sorman gerekiyordu; bu soru konuyla ilgisiz.',
        ],
        note: '"Was kostet ...?" fiyat sorar. "ein Liter Milch": ölçü sözcüğünden sonra "Milch" ek almaz.',
      },
      {
        type: 'say',
        speaker: 'Satış görevlisi',
        german: 'Ein Liter kostet einen Euro neunzig.',
        turkish: 'Bir litresi bir euro doksan.',
      },
      {
        type: 'reply',
        prompt: 'İki litre süt alacağını söyle.',
        german: 'Dann nehme ich zwei Liter, bitte.',
        turkish: 'O zaman iki litre alıyorum, lütfen.',
        wrongOptions: ['Dann nehme ich zwei Liter Käse, bitte.', 'Das ist zu teuer. Auf Wiedersehen!'],
        wrongTurkish: ['O zaman iki litre peynir alıyorum, lütfen.', 'Bu çok pahalı. Hoşça kalın!'],
        wrongNotes: [
          'Süt alacaktın; peynir litreyle ölçülmez.',
          'Fiyatı kabul edip süt alacaktın; veda etmek görevle uyuşmuyor.',
        ],
        note: '"Ich nehme ..." satın alma kararını bildirir: "... alıyorum".',
      },
      {
        type: 'say',
        speaker: 'Kasiyer',
        german: 'Das macht drei Euro achtzig. Zahlen Sie bar oder mit Karte?',
        turkish: 'Toplam üç euro seksen. Nakit mi, kartla mı ödersiniz?',
      },
      {
        type: 'reply',
        prompt: 'Kartla ödeyeceğini söyle.',
        german: 'Mit Karte, bitte.',
        turkish: 'Kartla, lütfen.',
        wrongOptions: ['Bar, bitte.', 'Nein, ich zahle morgen.'],
        wrongTurkish: ['Nakit, lütfen.', 'Hayır, yarın ödeyeceğim.'],
        wrongNotes: [
          '"Bar" nakit demektir; kartla ödeyeceğini söylemen gerekiyordu.',
          'Markette ödeme sonraya bırakılmaz.',
        ],
        note: '"mit Karte" = kartla ("mit" her zaman Dativ ister). "bar" = nakit.',
      },
      {
        type: 'choice',
        speaker: 'Kasiyer',
        german: 'Brauchen Sie eine Tüte?',
        turkish: 'Poşet ister misiniz?',
        prompt: 'Poşet isteyip istemediğini seç.',
        voice: true,
        options: [
          {
            german: 'Ja, bitte. Eine Tüte.',
            turkish: 'Evet, lütfen. Bir poşet.',
            responseGerman: 'Gern. Die Tüte kostet zehn Cent.',
            responseTurkish: 'Tabii. Poşet on sent.',
            accepted: ['Ja, bitte.', 'Eine Tüte, bitte.'],
          },
          {
            german: 'Nein, danke. Ich habe eine Tasche.',
            turkish: 'Hayır, teşekkürler. Çantam var.',
            responseGerman: 'Sehr gut. Das ist gut für die Umwelt.',
            responseTurkish: 'Çok iyi. Bu çevre için iyi.',
            accepted: ['Nein, danke.', 'Ich habe eine Tasche.', 'Ich brauche keine Tüte.'],
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Kasiyer',
        german: 'Bitte schön. Hier ist Ihr Kassenbon.',
        turkish: 'Buyurun. İşte fişiniz.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve güzel bir gün dile.',
        german: 'Danke schön. Einen schönen Tag noch!',
        turkish: 'Çok teşekkürler. Size de güzel bir gün!',
        wrongOptions: ['Guten Morgen! Bis später.', 'Entschuldigung, wo ist die Milch?'],
        wrongTurkish: ['Günaydın! Sonra görüşürüz.', 'Afedersiniz, süt nerede?'],
        wrongNotes: [
          '"Guten Morgen" selamlaşmadır; vedalaşırken "Einen schönen Tag noch!" gibi bir dilek söylenir.',
          'Sütü zaten aldın; şimdi teşekkür edip güzel bir gün dileyeceksin.',
        ],
        note: '"Einen schönen Tag noch!" = Güzel bir gün geçirin! Ayrılırken söylenen kibar bir dilektir.',
      },
      {
        type: 'say',
        speaker: 'Kasiyer',
        german: 'Danke, Ihnen auch! Auf Wiedersehen!',
        turkish: 'Teşekkürler, size de! Hoşça kalın!',
      },
    ],
  },
  {
    id: 'yeni-tanisma',
    level: 'A1',
    title: 'Yeni Biriyle Tanışma',
    description: 'Adını, nereli olduğunu ve mesleğini söyle.',
    place: 'Dil kursu',
    steps: [
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Hallo! Ich bin Anna. Wie heißt du?',
        turkish: 'Merhaba! Ben Anna. Senin adın ne?',
      },
      {
        type: 'reply',
        prompt: 'Adının Deniz olduğunu söyle ve memnun olduğunu belirt.',
        german: 'Ich heiße Deniz. Freut mich!',
        turkish: 'Adım Deniz. Memnun oldum!',
        wrongOptions: ['Ich komme aus der Türkei. Freut mich!', 'Ich bin neunundzwanzig Jahre alt.'],
        wrongTurkish: ['Türkiye\'denim. Memnun oldum!', 'Yirmi dokuz yaşındayım.'],
        wrongNotes: [
          'Adın soruldu; memleketini söylemek bu soruya cevap değil.',
          'Adın soruldu; yaş söylemek bu soruya cevap değil.',
        ],
        note: '"heißen" = adı olmak: ich heiße, du heißt. "Freut mich" = memnun oldum.',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Freut mich, Deniz! Woher kommst du?',
        turkish: 'Memnun oldum Deniz! Nerelisin?',
      },
      {
        type: 'reply',
        prompt: 'İstanbul\'dan, Türkiye\'den geldiğini söyle.',
        german: 'Ich komme aus Istanbul, aus der Türkei.',
        turkish: 'İstanbul\'dan, Türkiye\'den geliyorum.',
        wrongOptions: ['Ich komme in Istanbul, in der Türkei.', 'Ich arbeite in einer Bäckerei.'],
        wrongTurkish: ['İstanbul\'da geliyorum (hatalı kullanım).', 'Bir fırında çalışıyorum.'],
        wrongNotes: [
          'Nereden geldiğini söylemek için "kommen aus" kullanılır; "in" yanlış.',
          'Nerelisin sorusunun cevabı değil; çalıştığın yeri söylüyor.',
        ],
        note: '"kommen aus + yer" = ...-den gelmek. "die Türkei" dişil olduğu için "aus der Türkei" denir.',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Und was bist du von Beruf?',
        turkish: 'Peki mesleğin ne?',
      },
      {
        type: 'reply',
        prompt: 'Öğrenci olduğunu söyle.',
        german: 'Ich bin Student.',
        turkish: 'Ben öğrenciyim.',
        wrongOptions: ['Ich habe Student.', 'Ich heiße Student.'],
        wrongTurkish: ['Öğrencim var (hatalı kullanım).', 'Adım Öğrenci.'],
        wrongNotes: [
          'Meslek söylerken "sein" (olmak) fiili kullanılır, "haben" değil.',
          '"heißen" ad söylemek içindir; meslek için "sein" kullan.',
        ],
        note: 'Kadınsan "Ich bin Studentin" dersin. Meslekte "sein" kullanılır: ich bin ...',
      },
      {
        type: 'choice',
        speaker: 'Anna',
        german: 'Hast du ein Hobby?',
        turkish: 'Bir hobin var mı?',
        prompt: 'Hobini seç.',
        options: [
          {
            german: 'Ja, ich spiele gern Fußball.',
            turkish: 'Evet, futbol oynamayı severim.',
            responseGerman: 'Cool! Ich spiele auch manchmal Fußball.',
            responseTurkish: 'Harika! Ben de ara sıra futbol oynarım.',
          },
          {
            german: 'Ja, ich lese gern Bücher.',
            turkish: 'Evet, kitap okumayı severim.',
            responseGerman: 'Schön! Ich lese gern Krimis.',
            responseTurkish: 'Güzel! Ben polisiye romanları severek okurum.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Das ist toll! Sprichst du schon gut Deutsch?',
        turkish: 'Harika! Almancan şimdiden iyi mi?',
      },
      {
        type: 'reply',
        prompt: 'Biraz Almanca konuştuğunu ve hâlâ öğrendiğini söyle.',
        german: 'Ein bisschen. Ich lerne noch.',
        turkish: 'Biraz. Hâlâ öğreniyorum.',
        wrongOptions: ['Nein, ich spreche kein Wort Deutsch.', 'Doch, ich habe keinen Hunger.'],
        wrongTurkish: ['Hayır, tek kelime Almanca konuşmuyorum.', 'Aksine, acıkmadım.'],
        wrongNotes: [
          'Zaten Almanca konuşuyorsun; bu cevap durumu doğru anlatmıyor.',
          'Soruyla ilgisi olmayan bir cümle.',
        ],
        note: '"ein bisschen" = biraz. "noch" = hâlâ.',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Das klingt gut. Wir können zusammen üben.',
        turkish: 'Kulağa güzel geliyor. Birlikte pratik yapabiliriz.',
      },
      {
        type: 'reply',
        prompt: 'Kabul et ve sonra görüşmek üzere vedalaş.',
        german: 'Gern! Bis später, Anna.',
        turkish: 'Memnuniyetle! Sonra görüşürüz, Anna.',
        wrongOptions: ['Nein, ich möchte allein bleiben.', 'Guten Morgen, Anna. Wie heißt du?'],
        wrongTurkish: ['Hayır, yalnız kalmak istiyorum.', 'Günaydın Anna. Senin adın ne?'],
        wrongNotes: [
          'Teklifi kabul edecektin; bu cevap reddediyor.',
          'Adını zaten öğrendin; tekrar sormak konuşmanın akışına uymuyor.',
        ],
        note: '"Gern!" = memnuniyetle. "Bis später" = sonra görüşürüz.',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Tschüss, Deniz! Bis später!',
        turkish: 'Hoşça kal Deniz! Sonra görüşürüz!',
      },
    ],
  },
  {
    id: 'otelde-giris',
    level: 'A1',
    title: 'Otelde Giriş Yapma',
    description: 'Rezervasyonunu söyle, kahvaltı saatini ve Wi-Fi şifresini sor.',
    place: 'Otel resepsiyonu',
    steps: [
      {
        type: 'say',
        speaker: 'Resepsiyonist',
        german: 'Guten Abend! Willkommen im Hotel Sonne. Wie kann ich Ihnen helfen?',
        turkish: 'İyi akşamlar! Hotel Sonne\'ye hoş geldiniz. Size nasıl yardımcı olabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Rezervasyonun olduğunu ve adının Yılmaz olduğunu söyle.',
        german: 'Guten Abend! Ich habe eine Reservierung. Mein Name ist Yılmaz.',
        turkish: 'İyi akşamlar! Rezervasyonum var. Adım Yılmaz.',
        wrongOptions: ['Guten Abend! Ich möchte keine Reservierung.', 'Guten Abend! Ich suche den Bahnhof.'],
        wrongTurkish: ['İyi akşamlar! Rezervasyon istemiyorum.', 'İyi akşamlar! İstasyonu arıyorum.'],
        wrongNotes: [
          'Rezervasyonun var; "ich habe eine Reservierung" demen gerekiyordu.',
          'Otelde olduğun için istasyon sormak durumla uyuşmuyor.',
        ],
        note: '"eine Reservierung" dişildir. "Mein Name ist ..." = adım ...',
      },
      {
        type: 'say',
        speaker: 'Resepsiyonist',
        german: 'Ja, ich sehe es. Sie haben ein Doppelzimmer für zwei Nächte. Stimmt das?',
        turkish: 'Evet, görüyorum. İki gece için çift kişilik odanız var. Doğru mu?',
      },
      {
        type: 'reply',
        prompt: 'Bilginin doğru olduğunu söyle.',
        german: 'Ja, das stimmt.',
        turkish: 'Evet, doğru.',
        wrongOptions: ['Ja, das schmeckt gut.', 'Nein, danke. Ich bin müde.'],
        wrongTurkish: ['Evet, lezzetli.', 'Hayır, teşekkürler. Yorgunum.'],
        wrongNotes: [
          '"schmecken" tadı olmak demektir; "doğru" için "stimmen" kullanılır.',
          'Sorulan şeye (doğru mu?) cevap vermiyor.',
        ],
        note: '"Das stimmt." = Doğru. / Bu doğru.',
      },
      {
        type: 'choice',
        speaker: 'Resepsiyonist',
        german: 'Brauchen Sie Hilfe mit dem Gepäck?',
        turkish: 'Bagajınız için yardıma ihtiyacınız var mı?',
        prompt: 'Bagaj için yardım isteyip istemediğini seç.',
        options: [
          {
            german: 'Ja, gern. Vielen Dank!',
            turkish: 'Evet, memnuniyetle. Çok teşekkürler!',
            responseGerman: 'Gern. Mein Kollege bringt die Koffer aufs Zimmer.',
            responseTurkish: 'Rica ederim. Meslektaşım bavulları odaya getirir.',
          },
          {
            german: 'Nein, danke. Das geht schon.',
            turkish: 'Hayır, teşekkürler. Ben hallederim.',
            responseGerman: 'Kein Problem. Der Aufzug ist dort rechts.',
            responseTurkish: 'Sorun değil. Asansör şurada sağda.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Resepsiyonist',
        german: 'Hier ist Ihr Schlüssel. Das Zimmer ist im zweiten Stock, Zimmer 205.',
        turkish: 'İşte anahtarınız. Oda ikinci katta, 205 numara.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve kahvaltının saat kaçta olduğunu sor.',
        german: 'Danke. Um wie viel Uhr gibt es Frühstück?',
        turkish: 'Teşekkürler. Kahvaltı saat kaçta?',
        wrongOptions: ['Danke. Das Frühstück ist sehr gut.', 'Danke. Gibt es heute Abend ein Taxi?'],
        wrongTurkish: ['Teşekkürler. Kahvaltı çok güzel.', 'Teşekkürler. Bu akşam taksi var mı?'],
        wrongNotes: [
          'Saat sormadın; kahvaltıyı övüyorsun.',
          'Kahvaltı saatini soracaktın; bu soru farklı bir konuda.',
        ],
        note: '"Um wie viel Uhr ...?" = saat kaçta? "es gibt" = var.',
      },
      {
        type: 'say',
        speaker: 'Resepsiyonist',
        german: 'Das Frühstück gibt es von sieben bis zehn Uhr im Restaurant.',
        turkish: 'Kahvaltı restoranda saat yedi ile on arasında.',
      },
      {
        type: 'reply',
        prompt: 'Nazikçe Wi-Fi şifresinin ne olduğunu sor.',
        german: 'Entschuldigung, wie ist das WLAN-Passwort?',
        turkish: 'Afedersiniz, Wi-Fi şifresi nedir?',
        wrongOptions: ['Entschuldigung, wer ist das WLAN-Passwort?', 'Entschuldigung, wo ist die Toilette?'],
        wrongTurkish: ['Afedersiniz, Wi-Fi şifresi kim? (hatalı kullanım)', 'Afedersiniz, tuvalet nerede?'],
        wrongNotes: [
          '"wer" kişileri sorar ("kim"); bir şeyin nasıl olduğu için "wie ist ...?" kullanılır.',
          'Şifreyi soracaktın; bu soru farklı bir konuda.',
        ],
        note: '"das WLAN-Passwort" nötrdür. "Entschuldigung" dikkat çekmek için kibar bir girişdir.',
      },
      {
        type: 'say',
        speaker: 'Resepsiyonist',
        german: 'Das Passwort steht auf der Karte. Haben Sie noch eine Frage?',
        turkish: 'Şifre kartın üzerinde yazıyor. Başka sorunuz var mı?',
      },
      {
        type: 'reply',
        prompt: 'Başka sorun olmadığını söyle ve iyi geceler dile.',
        german: 'Nein, danke. Gute Nacht!',
        turkish: 'Hayır, teşekkürler. İyi geceler!',
        wrongOptions: ['Nein, danke. Guten Morgen!', 'Ja, die Rechnung, bitte.'],
        wrongTurkish: ['Hayır, teşekkürler. Günaydın!', 'Evet, hesabı lütfen.'],
        wrongNotes: [
          'Akşam olduğu için "Guten Morgen" (günaydın) uygun değil.',
          'Henüz giriş yaptın; hesap isteme zamanı değil ve başka sorun yoktu.',
        ],
        note: '"Gute Nacht" geceleri, yatmadan önce söylenir.',
      },
      {
        type: 'say',
        speaker: 'Resepsiyonist',
        german: 'Gute Nacht, Herr Yılmaz!',
        turkish: 'İyi geceler, Bay Yılmaz!',
      },
    ],
  },
  {
    id: 'yol-tarifi',
    level: 'A1',
    title: 'Yol Tarifi Sorma',
    description: 'Postanenin yerini sor, yönleri anla ve teyit et.',
    place: 'Sokak',
    steps: [
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Guten Tag! Kann ich Ihnen helfen?',
        turkish: 'İyi günler! Size yardımcı olabilir miyim?',
      },
      {
        type: 'reply',
        prompt: 'Postanenin nerede olduğunu sor.',
        german: 'Ja, bitte. Wo ist die Post?',
        turkish: 'Evet, lütfen. Postane nerede?',
        wrongOptions: ['Ja, bitte. Wo ist der Post?', 'Ja, bitte. Wie heißt die Post?'],
        wrongTurkish: ['Evet, lütfen. Postane nerede? (hatalı artikel)', 'Evet, lütfen. Postanenin adı ne?'],
        wrongNotes: [
          '"Post" dişildir: "die Post". "der Post" yanlış.',
          'Yer sormak gerekiyordu; bu soru adını soruyor.',
        ],
        note: '"Wo ist ...?" yer sorar. "die Post" = postane (dişil).',
      },
      {
        type: 'choice',
        speaker: 'Yoldan geçen',
        german: 'Möchten Sie Briefmarken kaufen oder ein Paket abholen?',
        turkish: 'Pul mu almak istiyorsunuz, yoksa paket mi teslim alacaksınız?',
        prompt: 'Postaneye neden gittiğini seç.',
        options: [
          {
            german: 'Ich möchte Briefmarken kaufen.',
            turkish: 'Pul almak istiyorum.',
            responseGerman: 'Gut. Briefmarken bekommen Sie am Schalter eins.',
            responseTurkish: 'İyi. Pulları bir numaralı gişeden alırsınız.',
          },
          {
            german: 'Ich möchte ein Paket abholen.',
            turkish: 'Bir paket teslim almak istiyorum.',
            responseGerman: 'Gut. Ihr Paket bekommen Sie am Schalter zwei.',
            responseTurkish: 'İyi. Paketinizi iki numaralı gişeden alırsınız.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Gehen Sie hier geradeaus bis zur Ampel. Dann biegen Sie links ab.',
        turkish: 'Buradan ışıklara kadar düz gidin. Sonra sola dönün.',
      },
      {
        type: 'reply',
        prompt: 'Kibarca bunu daha yavaş tekrar etmesini iste.',
        german: 'Können Sie das bitte langsamer wiederholen?',
        turkish: 'Bunu lütfen daha yavaş tekrar edebilir misiniz?',
        wrongOptions: ['Können Sie das bitte schneller wiederholen?', 'Wiederholen Sie das! Sofort!'],
        wrongTurkish: ['Bunu lütfen daha hızlı tekrar edebilir misiniz?', 'Bunu tekrar edin! Hemen!'],
        wrongNotes: [
          '"schneller" daha hızlı demektir; yavaş için "langsamer" kullanılır.',
          'Çok kaba bir emir; kibar soru kalıbı ve "bitte" kullan.',
        ],
        note: '"langsamer" = daha yavaş, "schneller" = daha hızlı. "Können Sie ...?" kibar rica kalıbıdır.',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Natürlich. Gehen Sie geradeaus bis zur Ampel. Dort biegen Sie links ab.',
        turkish: 'Tabii. Işıklara kadar düz gidin. Orada sola dönün.',
      },
      {
        type: 'reply',
        prompt: 'Anladığını teyit et: ışıklara kadar düz, sonra sola.',
        german: 'Also geradeaus bis zur Ampel und dann links?',
        turkish: 'Yani ışıklara kadar düz, sonra sola mı?',
        wrongOptions: ['Also geradeaus bis zur Ampel und dann rechts?', 'Also links bis zur Ampel und dann geradeaus?'],
        wrongTurkish: ['Yani ışıklara kadar düz, sonra sağa mı?', 'Yani ışıklara kadar sola, sonra düz mü?'],
        wrongNotes: [
          'Duyduğun yön "links" (sol); "rechts" sağ demektir.',
          'Sıra ters: önce düz gidilecek, sonra sola dönülecek.',
        ],
        note: '"geradeaus" = düz, "links" = sol, "rechts" = sağ, "abbiegen" = dönmek.',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Genau. Die Post ist dann auf der rechten Seite, neben der Bank.',
        turkish: 'Aynen. Postane o zaman sağ tarafta, bankanın yanında.',
      },
      {
        type: 'reply',
        prompt: 'Buradan uzak olup olmadığını sor.',
        german: 'Ist es weit von hier?',
        turkish: 'Buradan uzak mı?',
        wrongOptions: ['Ist es weit zu hier?', 'Ist es heute geöffnet?'],
        wrongTurkish: ['Buraya uzak mı? (hatalı kullanım)', 'Bugün açık mı?'],
        wrongNotes: [
          '"Buradan" için "von hier" denir; "zu hier" Almancada kullanılmaz.',
          'Uzaklığı soracaktın; bu soru açılış saatiyle ilgili.',
        ],
        note: '"weit" = uzak. "von hier" = buradan.',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Nein, nur fünf Minuten zu Fuß.',
        turkish: 'Hayır, yürüyerek sadece beş dakika.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve iyi günler dile.',
        german: 'Vielen Dank! Einen schönen Tag noch!',
        turkish: 'Çok teşekkürler! Size de güzel bir gün!',
        wrongOptions: ['Bitte schön! Das ist weit.', 'Guten Abend! Wo ist die Post?'],
        wrongTurkish: ['Rica ederim! Bu uzak.', 'İyi akşamlar! Postane nerede?'],
        wrongNotes: [
          'Teşekkür eden sensin; "Bitte schön" cevap olarak söylenir.',
          'Yolu zaten öğrendin; aynı soruyu tekrar sormak akışa uymuyor.',
        ],
        note: '"Einen schönen Tag noch!" = Güzel bir gün geçirin! (veda ederken)',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Gern geschehen! Tschüss!',
        turkish: 'Rica ederim! Hoşça kal!',
      },
    ],
  },
  {
    id: 'restoranda-siparis',
    level: 'A1',
    title: 'Restoranda Sipariş',
    description: 'Masa iste, yemek ve içecek sipariş et, hesabı iste.',
    place: 'Restoran',
    steps: [
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Guten Abend! Haben Sie reserviert?',
        turkish: 'İyi akşamlar! Rezervasyonunuz var mı?',
      },
      {
        type: 'reply',
        prompt: 'Rezervasyonun olmadığını ve iki kişilik masa olup olmadığını sor.',
        german: 'Nein, wir haben nicht reserviert. Haben Sie einen Tisch für zwei Personen?',
        turkish: 'Hayır, rezervasyon yaptırmadık. İki kişilik masanız var mı?',
        wrongOptions: [
          'Ja, wir haben einen Tisch für zwei Personen reserviert.',
          'Nein, ich habe keinen Tisch. Auf Wiedersehen!',
        ],
        wrongTurkish: ['Evet, iki kişilik masa ayırttık.', 'Hayır, masam yok. Hoşça kalın!'],
        wrongNotes: [
          'Rezervasyonunuz yok; "Ja" demek durumu yanlış anlatır.',
          'Masa isteyecektin; vedalaşmak görevle uyuşmuyor.',
        ],
        note: '"Haben Sie ...?" ile bir şeyin müsait olup olmadığı sorulur. "der Tisch" eril: Akkusativ "einen Tisch".',
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Ja, gern. Hier ist die Speisekarte. Was möchten Sie trinken?',
        turkish: 'Evet, memnuniyetle. Buyurun menü. Ne içmek istersiniz?',
      },
      {
        type: 'reply',
        prompt: 'Bir su ve bir elma suyu iste.',
        german: 'Ein Wasser und einen Apfelsaft, bitte.',
        turkish: 'Bir su ve bir elma suyu, lütfen.',
        wrongOptions: ['Ein Wasser und ein Apfelsaft, bitte.', 'Ein Wasser und eine Rechnung, bitte.'],
        wrongTurkish: ['Bir su ve bir elma suyu, lütfen. (hatalı artikel)', 'Bir su ve bir hesap, lütfen.'],
        wrongNotes: [
          '"der Apfelsaft" erildir; sipariş verirken Akkusativ "einen Apfelsaft" denir.',
          'Henüz hesap istemiyorsun; içecek siparişi veriyorsun.',
        ],
        note: 'Sipariş: "Ein/Eine/Einen ..., bitte." "der Saft" eril olduğu için "einen".',
      },
      {
        type: 'choice',
        speaker: 'Garson',
        german: 'Möchten Sie das Wasser mit oder ohne Kohlensäure?',
        turkish: 'Suyu gazlı mı gazsız mı istersiniz?',
        prompt: 'Suyunu gazlı mı gazsız mı istediğini seç.',
        options: [
          {
            german: 'Mit Kohlensäure, bitte.',
            turkish: 'Gazlı, lütfen.',
            responseGerman: 'Sehr gut, ein Sprudelwasser.',
            responseTurkish: 'Çok iyi, gazlı bir su.',
          },
          {
            german: 'Ohne Kohlensäure, bitte.',
            turkish: 'Gazsız, lütfen.',
            responseGerman: 'Sehr gut, ein stilles Wasser.',
            responseTurkish: 'Çok iyi, gazsız bir su.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Gern. Und was möchten Sie essen?',
        turkish: 'Memnuniyetle. Peki ne yemek istersiniz?',
      },
      {
        type: 'reply',
        prompt: 'Pilavlı tavuk istediğini söyle.',
        german: 'Ich möchte das Hähnchen mit Reis, bitte.',
        turkish: 'Pilavlı tavuğu istiyorum, lütfen.',
        wrongOptions: ['Ich möchte die Hähnchen mit Reis, bitte.', 'Ich bin das Hähnchen mit Reis.'],
        wrongTurkish: ['Pilavlı tavuğu istiyorum, lütfen. (hatalı artikel)', 'Ben pilavlı tavuğum.'],
        wrongNotes: [
          '"das Hähnchen" nötrdür; "die" çoğul/dişil içindir.',
          'Yemek siparişinde "ich möchte" kullanılır; "ich bin" "ben ...im" demektir.',
        ],
        note: '"Ich möchte ..." = ... istiyorum. "das Hähnchen" nötr.',
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Sehr gern. Hier ist Ihr Essen. Guten Appetit!',
        turkish: 'Memnuniyetle. İşte yemeğiniz. Afiyet olsun!',
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Hat es Ihnen geschmeckt?',
        turkish: '(Yemekten sonra) Beğendiniz mi? Lezzetli miydi?',
      },
      {
        type: 'reply',
        prompt: 'Çok lezzetli olduğunu söyle.',
        german: 'Ja, es war sehr lecker, danke.',
        turkish: 'Evet, çok lezzetliydi, teşekkürler.',
        wrongOptions: ['Ja, ich schmecke sehr gut.', 'Nein, danke. Ich habe Hunger.'],
        wrongTurkish: ['Evet, ben çok güzel tadıyorum? (hatalı kullanım)', 'Hayır, teşekkürler. Açım.'],
        wrongNotes: [
          '"schmecken" yemeğin tadını anlatır: "Es schmeckt gut." Kişi özne olmaz.',
          'Yemeği yemiş olduğun için bu cevap duruma uymuyor.',
        ],
        note: '"lecker" = lezzetli. "es war ..." geçmişte (idi) anlatır.',
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Das freut mich. Möchten Sie noch einen Nachtisch?',
        turkish: 'Sevindim. Bir tatlı ister misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Tatlı istemediğini söyle ve ödemek istediğini belirt.',
        german: 'Nein, danke. Wir möchten bitte zahlen.',
        turkish: 'Hayır, teşekkürler. Ödemek istiyoruz, lütfen.',
        wrongOptions: ['Ja, ich möchte nicht zahlen.', 'Nein, danke. Wir möchten bitte bestellen.'],
        wrongTurkish: ['Evet, ödemek istemiyorum.', 'Hayır, teşekkürler. Sipariş vermek istiyoruz, lütfen.'],
        wrongNotes: [
          'Tatlı istemiyorsun ve ödemek istiyorsun; "Ja" ve "nicht zahlen" bunun tersini söylüyor.',
          '"bestellen" sipariş vermektir; ödemek için "zahlen" kullanılır.',
        ],
        note: '"zahlen" = ödemek. "Wir möchten bitte zahlen." restoranda hesabı istemenin kibar yoludur.',
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Natürlich. Das macht zweiundzwanzig Euro.',
        turkish: 'Tabii. Toplam yirmi iki euro.',
      },
    ],
  },
  {
    id: 'kiyafet-magazasi',
    level: 'A1',
    title: 'Kıyafet Mağazasında Alışveriş',
    description: 'Bir kıyafet ara, bedenini söyle, dene ve fiyatını öğren.',
    place: 'Kıyafet mağazası',
    steps: [
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Guten Tag! Suchen Sie etwas Bestimmtes?',
        turkish: 'İyi günler! Belirli bir şey mi arıyorsunuz?',
      },
      {
        type: 'reply',
        prompt: 'Bir ceket aradığını söyle.',
        german: 'Ja, ich suche eine Jacke.',
        turkish: 'Evet, bir ceket arıyorum.',
        wrongOptions: ['Ja, ich habe eine Jacke.', 'Nein, ich möchte nur bezahlen.'],
        wrongTurkish: ['Evet, bir ceketim var.', 'Hayır, sadece ödemek istiyorum.'],
        wrongNotes: [
          '"haben" sahip olmak demektir; sen ceketi arıyorsun, zaten bir ceketin yok.',
          'Henüz bir şey seçmedin; önce ne aradığını söylemelisin.',
        ],
        note: '"Ich suche ..." = "... arıyorum". "eine Jacke": "Jacke" dişildir, "bir ceket" demek için "eine" kullanılır.',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Gern. Welche Größe haben Sie?',
        turkish: 'Memnuniyetle. Hangi bedeni giyiyorsunuz?',
      },
      {
        type: 'reply',
        prompt: 'M beden giydiğini söyle.',
        german: 'Ich habe Größe M.',
        turkish: 'Ben M beden giyiyorum.',
        wrongOptions: ['Ich habe zwei Jacken.', 'Die Jacke ist sehr groß.'],
        wrongTurkish: ['İki ceketim var.', 'Ceket çok büyük.'],
        wrongNotes: [
          'Bedenini soruyor; sahip olduğun ceket sayısını değil.',
          'Henüz ceketi denemedin; beden sorusuna cevap vermelisin.',
        ],
        note: '"Ich habe Größe ..." = "... beden giyiyorum". Harfli bedenlerde "Größe M, Größe L" denir.',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Hier ist eine Jacke in Größe M. Sie ist schwarz.',
        turkish: 'İşte M beden bir ceket. Siyah.',
      },
      {
        type: 'choice',
        speaker: 'Satış danışmanı',
        german: 'Gefällt Ihnen die Farbe?',
        turkish: 'Rengi beğendiniz mi?',
        prompt: 'Rengi beğenip beğenmediğini seç.',
        options: [
          {
            german: 'Ja, die Farbe gefällt mir.',
            turkish: 'Evet, rengi beğendim.',
            responseGerman: 'Schön, die Farbe ist im Moment sehr beliebt.',
            responseTurkish: 'Güzel, bu renk şu sıralar çok tutuluyor.',
          },
          {
            german: 'Nein, ich möchte lieber eine blaue Jacke.',
            turkish: 'Hayır, daha çok mavi bir ceket isterim.',
            responseGerman: 'Kein Problem. Hier ist die Jacke in Blau.',
            responseTurkish: 'Sorun değil. İşte ceketin mavisi.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Möchten Sie die Jacke anprobieren?',
        turkish: 'Ceketi denemek ister misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Kabul et ve deneme kabininin nerede olduğunu sor.',
        german: 'Ja, gern. Wo ist die Umkleidekabine?',
        turkish: 'Evet, memnuniyetle. Deneme kabini nerede?',
        wrongOptions: ['Ja, gern. Wo ist die Kasse?', 'Nein, danke. Ich möchte nur Brot kaufen.'],
        wrongTurkish: ['Evet, memnuniyetle. Kasa nerede?', 'Hayır, teşekkürler. Sadece ekmek almak istiyorum.'],
        wrongNotes: [
          'Önce deneyeceksin; kasaya ödeme yaparken gidersin.',
          'Kıyafet mağazasındasın; ekmek almak konuyla ilgisiz.',
        ],
        note: '"Wo ist ...?" bir yerin nerede olduğunu sorar. "die Umkleidekabine" = deneme kabini. "anprobieren" = denemek.',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Dort links. Sagen Sie mir bitte, ob die Jacke passt.',
        turkish: 'Şurada solda. Lütfen ceketin uyup uymadığını söyleyin.',
      },
      {
        type: 'reply',
        prompt: 'Ceketin uyduğunu söyle ve fiyatını sor.',
        german: 'Sie passt gut. Was kostet sie?',
        turkish: 'Uyuyor. Ne kadar?',
        wrongOptions: ['Sie ist zu klein. Was kostet sie?', 'Sie passt gut. Wo wohnen Sie?'],
        wrongTurkish: ['Çok küçük. Ne kadar?', 'Uyuyor. Nerede oturuyorsunuz?'],
        wrongNotes: [
          'Ceketin uyduğunu söylemen gerekiyordu; "zu klein" çok küçük demektir.',
          'Fiyatı sorman gerekiyordu; bu soru konuyla ilgisiz.',
        ],
        note: '"Sie passt gut" = (ceket) iyi oluyor. "Was kostet sie?" fiyat sorar; "sie" burada "die Jacke" yerine geçer.',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Sie kostet neunundvierzig Euro.',
        turkish: 'Kırk dokuz euro.',
      },
      {
        type: 'reply',
        prompt: 'Ceketi alacağını ve kartla ödeyeceğini söyle.',
        german: 'Gut, ich nehme sie. Ich zahle mit Karte.',
        turkish: 'İyi, alıyorum. Kartla ödeyeceğim.',
        wrongOptions: ['Das ist zu teuer. Ich nehme sie nicht.', 'Gut, ich nehme sie. Ich zahle morgen.'],
        wrongTurkish: ['Bu çok pahalı. Almıyorum.', 'İyi, alıyorum. Yarın öderim.'],
        wrongNotes: [
          'Almaya karar vermiştin; bu cevap vazgeçmek anlamına gelir.',
          'Mağazada ödeme sonraya bırakılmaz.',
        ],
        note: '"Ich nehme sie" = alıyorum. "mit Karte" = kartla; nakit için "bar" denir.',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Vielen Dank! Hier ist Ihre Tüte.',
        turkish: 'Çok teşekkürler! İşte poşetiniz.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve vedalaş.',
        german: 'Danke! Auf Wiedersehen!',
        turkish: 'Teşekkürler! Hoşça kalın!',
        wrongOptions: ['Guten Morgen! Ich suche eine Jacke.', 'Entschuldigung, wo ist die Umkleidekabine?'],
        wrongTurkish: ['Günaydın! Bir ceket arıyorum.', 'Afedersiniz, deneme kabini nerede?'],
        wrongNotes: [
          'Alışveriş bitti; yeni bir arama başlatmıyorsun, vedalaşıyorsun.',
          'Ceketi zaten denedin ve aldın.',
        ],
        note: '"Auf Wiedersehen" = hoşça kalın. Mağazadan çıkarken kullanılan kibar bir veda kalıbıdır.',
      },
    ],
  },
  {
    id: 'hobi-sohbeti',
    level: 'A1',
    title: 'Hobi ve Boş Zaman Sohbeti',
    description: 'Boş zamanında ne yaptığını anlat ve ne sıklıkla yaptığını söyle.',
    place: 'Park',
    steps: [
      {
        type: 'say',
        speaker: 'Jonas',
        german: 'Hallo! Was machst du in deiner Freizeit?',
        turkish: 'Merhaba! Boş zamanında ne yapıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Yüzmeyi sevdiğini söyle.',
        german: 'Ich schwimme gern.',
        turkish: 'Yüzmeyi severim.',
        wrongOptions: ['Ich arbeite gern im Büro.', 'Ich wohne gern in Berlin.'],
        wrongTurkish: ['Ofiste çalışmayı severim.', 'Berlin\'de oturmayı severim.'],
        wrongNotes: [
          '"Freizeit" boş zamandır; iş yerinde çalışmak boş zaman etkinliği değildir.',
          'Soru boş zamanda ne yaptığını soruyor; nerede oturduğunu değil.',
        ],
        note: '"gern" fiilin yanında "-meyi severim" anlamı katar: "Ich schwimme gern" = yüzmeyi severim.',
      },
      {
        type: 'say',
        speaker: 'Jonas',
        german: 'Schwimmen ist toll! Wie oft schwimmst du?',
        turkish: 'Yüzmek harika! Ne sıklıkla yüzüyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Haftada iki kez yüzdüğünü söyle.',
        german: 'Ich schwimme zweimal pro Woche.',
        turkish: 'Haftada iki kez yüzerim.',
        wrongOptions: ['Ich schwimme zwei Wochen.', 'Ich schwimme im Hotel.'],
        wrongTurkish: ['İki hafta yüzerim.', 'Otelde yüzerim.'],
        wrongNotes: [
          '"zwei Wochen" süre bildirir; sıklık için "pro Woche" (haftada) denir.',
          '"Wie oft?" sıklığı sorar; yer söylemek soruyu cevaplamaz.',
        ],
        note: '"zweimal pro Woche" = haftada iki kez. Sıklık için: einmal, zweimal, jeden Tag.',
      },
      {
        type: 'choice',
        speaker: 'Jonas',
        german: 'Schwimmst du lieber allein oder mit Freunden?',
        turkish: 'Yalnız mı yoksa arkadaşlarla mı yüzmeyi tercih ediyorsun?',
        prompt: 'Yalnız mı arkadaşlarla mı yüzmeyi tercih ettiğini seç.',
        options: [
          {
            german: 'Ich schwimme lieber allein.',
            turkish: 'Yalnız yüzmeyi tercih ederim.',
            responseGerman: 'Das verstehe ich. Allein kann man sich gut entspannen.',
            responseTurkish: 'Anlıyorum. Yalnızken insan iyi dinlenebilir.',
          },
          {
            german: 'Ich schwimme lieber mit Freunden.',
            turkish: 'Arkadaşlarla yüzmeyi tercih ederim.',
            responseGerman: 'Das ist schön. Zusammen macht es mehr Spaß.',
            responseTurkish: 'Bu güzel. Birlikte daha eğlenceli oluyor.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Jonas',
        german: 'Ich habe auch ein Hobby: Ich spiele Gitarre. Hast du noch ein Hobby?',
        turkish: 'Benim de bir hobim var: Gitar çalıyorum. Senin başka bir hobin var mı?',
      },
      {
        type: 'reply',
        prompt: 'Fotoğraf çekmeyi de sevdiğini söyle.',
        german: 'Ja, ich fotografiere auch gern.',
        turkish: 'Evet, fotoğraf çekmeyi de severim.',
        wrongOptions: ['Nein, ich habe kein Auto.', 'Nein, ich fotografiere nicht gern.'],
        wrongTurkish: ['Hayır, arabam yok.', 'Hayır, fotoğraf çekmeyi sevmem.'],
        wrongNotes: [
          'Soru hobiyle ilgili; araba sahibi olup olmadığınla ilgili değil.',
          'Fotoğraf çekmeyi sevdiğini söyleyecektin; bu cevap tam tersini söylüyor.',
        ],
        note: '"auch" = de/da. "fotografieren" fotoğraf çekmek; "gern" ile birlikte "fotoğraf çekmeyi severim" olur.',
      },
      {
        type: 'say',
        speaker: 'Jonas',
        german: 'Super! Machst du das am Wochenende?',
        turkish: 'Harika! Bunu hafta sonu mu yapıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Evet, hep pazar günü yaptığını söyle.',
        german: 'Ja, immer am Sonntag.',
        turkish: 'Evet, hep pazar günü.',
        wrongOptions: ['Ja, immer im Sonntag.', 'Nein, immer im Park.'],
        wrongTurkish: ['Evet, hep pazarda (yanlış edat).', 'Hayır, hep parkta.'],
        wrongNotes: [
          'Gün adlarıyla "im" değil "am" kullanılır: "am Sonntag".',
          'Zamanı soruyor (ne zaman?); yer söylemek soruyu cevaplamaz.',
        ],
        note: '"immer" = her zaman, hep. Gün adlarıyla "am" kullanılır: am Sonntag, am Montag.',
      },
      {
        type: 'say',
        speaker: 'Jonas',
        german: 'Cool! Vielleicht können wir am Sonntag zusammen Fotos machen. Hast du Lust?',
        turkish: 'Harika! Belki pazar günü birlikte fotoğraf çekebiliriz. İster misin?',
      },
      {
        type: 'reply',
        prompt: 'Daveti kabul et ve sabırsızlandığını söyle.',
        german: 'Ja, gern! Ich freue mich darauf.',
        turkish: 'Evet, memnuniyetle! Sabırsızlanıyorum.',
        wrongOptions: ['Entschuldigung, ich verstehe nicht.', 'Gern! Ich habe Hunger.'],
        wrongTurkish: ['Afedersiniz, anlamıyorum.', 'Memnuniyetle! Açım.'],
        wrongNotes: [
          'Soruyu anlamıştın ve daveti kabul edecektin.',
          'Açlık davetle ilgisiz; sevinçle kabul etmelisin.',
        ],
        note: '"Gern!" = memnuniyetle. "Ich freue mich darauf" = sabırsızlanıyorum, dört gözle bekliyorum; "Ich freue mich" tek başına "sevindim" demektir.',
      },
      {
        type: 'say',
        speaker: 'Jonas',
        german: 'Prima! Bis Sonntag!',
        turkish: 'Harika! Pazar günü görüşürüz!',
      },
    ],
  },
  {
    id: 'gunluk-rutin',
    level: 'A1',
    title: 'Günlük Rutini Anlatma',
    description: 'Gününü saatlerle anlat: kalkma, işe başlama, öğle yemeği ve akşam.',
    place: 'Kafeterya',
    steps: [
      {
        type: 'say',
        speaker: 'Emma',
        german: 'Hallo! Du siehst müde aus. Wann stehst du morgens auf?',
        turkish: 'Merhaba! Yorgun görünüyorsun. Sabahları saat kaçta kalkıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Saat altıda kalktığını söyle.',
        german: 'Ich stehe um sechs Uhr auf.',
        turkish: 'Saat altıda kalkarım.',
        wrongOptions: ['Ich schlafe um sechs Uhr.', 'Ich esse um sechs Uhr.'],
        wrongTurkish: ['Saat altıda uyurum.', 'Saat altıda yerim.'],
        wrongNotes: [
          '"schlafen" uyumak demektir; kalkmak için "aufstehen" kullanılır.',
          'Kalkma saatini soruyor; yemek yeme saatini değil.',
        ],
        note: '"aufstehen" ayrılabilen fiildir: "Ich stehe um sechs Uhr auf." "um ... Uhr" = saat kaçta.',
      },
      {
        type: 'say',
        speaker: 'Emma',
        german: 'So früh! Und was machst du danach?',
        turkish: 'Çok erken! Peki sonra ne yapıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Önce duş aldığını, sonra kahvaltı ettiğini söyle.',
        german: 'Zuerst dusche ich, dann frühstücke ich.',
        turkish: 'Önce duş alırım, sonra kahvaltı ederim.',
        wrongOptions: ['Zuerst gehe ich ins Bett, dann frühstücke ich.', 'Zuerst frühstücke ich, dann schlafe ich.'],
        wrongTurkish: [
          'Önce yatağa giderim, sonra kahvaltı ederim.',
          'Önce kahvaltı ederim, sonra uyurum.',
        ],
        wrongNotes: [
          'Sabah yeni kalktın; yatmaya gitmezsin. Önce duş, sonra kahvaltı olacaktı.',
          'Duştan hiç söz etmiyor ve kahvaltıdan sonra uyumak sabah rutinine uymuyor; doğru sıra: önce duş, sonra kahvaltı.',
        ],
        note: '"zuerst" ... "dann" sıralama bildirir. Cümle zarfla başlayınca fiil ikinci sırada kalır: "Zuerst dusche ich".',
      },
      {
        type: 'say',
        speaker: 'Emma',
        german: 'Ich fange um acht Uhr an. Wann fängst du an?',
        turkish: 'Ben saat sekizde başlıyorum. Sen ne zaman başlıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Saat dokuzda başladığını söyle.',
        german: 'Ich fange um neun Uhr an.',
        turkish: 'Ben saat dokuzda başlıyorum.',
        wrongOptions: ['Ich höre um neun Uhr auf.', 'Ich esse um neun Uhr zu Mittag.'],
        wrongTurkish: ['Saat dokuzda bırakırım.', 'Saat dokuzda öğle yemeği yerim.'],
        wrongNotes: [
          '"aufhören" bitirmek, bırakmak demektir; başlamak için "anfangen" kullanılır.',
          'İşe başlama saatini soruyor; öğle yemeği o saatte yenmez.',
        ],
        note: '"anfangen" ayrılabilen fiildir: "Ich fange um neun Uhr an." = dokuzda başlarım.',
      },
      {
        type: 'choice',
        speaker: 'Emma',
        german: 'Isst du mittags in der Kantine oder bringst du etwas mit?',
        turkish: 'Öğlen kantinde mi yersin yoksa yanında bir şey mi getirirsin?',
        prompt: 'Öğle yemeğini nerede yediğini seç.',
        options: [
          {
            german: 'Ich esse in der Kantine.',
            turkish: 'Kantinde yerim.',
            responseGerman: 'Gut. Das Essen dort ist nicht teuer.',
            responseTurkish: 'İyi. Oradaki yemek pahalı değil.',
          },
          {
            german: 'Ich bringe etwas von zu Hause mit.',
            turkish: 'Evden bir şey getiririm.',
            responseGerman: 'Das ist gesund. Das mache ich manchmal auch.',
            responseTurkish: 'Bu sağlıklı. Ben de bazen yapıyorum.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Emma',
        german: 'Gut. Wann hast du Feierabend?',
        turkish: 'İyi. İş çıkışın saat kaçta?',
      },
      {
        type: 'reply',
        prompt: 'İş çıkışının saat beşte olduğunu söyle.',
        german: 'Ich habe um fünf Uhr Feierabend.',
        turkish: 'İş çıkışım saat beşte.',
        wrongOptions: ['Ich habe um fünf Uhr Urlaub.', 'Ich fange um fünf Uhr an.'],
        wrongTurkish: ['Saat beşte izinliyim.', 'Saat beşte başlarım.'],
        wrongNotes: [
          '"Feierabend" iş çıkışıdır; "Urlaub" tatil/izin demektir.',
          'Çıkış saatini soruyor; başlama saatini değil.',
        ],
        note: '"Feierabend haben" = iş çıkışı olmak, işi bitirmek.',
      },
      {
        type: 'say',
        speaker: 'Emma',
        german: 'Und was machst du am Abend?',
        turkish: 'Peki akşamları ne yapıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Akşamları yemek yapıp televizyon izlediğini söyle.',
        german: 'Am Abend koche ich und sehe fern.',
        turkish: 'Akşamları yemek yaparım ve televizyon izlerim.',
        wrongOptions: ['Am Abend gehe ich zur Arbeit und frühstücke.', 'Am Morgen koche ich und sehe fern.'],
        wrongTurkish: [
          'Akşamları işe giderim ve kahvaltı ederim.',
          'Sabahları yemek yaparım ve televizyon izlerim.',
        ],
        wrongNotes: [
          'Akşam kahvaltı edilmez; iş çıkışından sonra işe gidilmez.',
          'Soru akşamı soruyor; "am Morgen" sabah demektir.',
        ],
        note: '"fernsehen" ayrılabilen fiildir: "ich sehe fern". "am Abend" = akşamları, akşam.',
      },
      {
        type: 'say',
        speaker: 'Emma',
        german: 'Du hast einen langen Tag! Wann gehst du ins Bett?',
        turkish: 'Uzun bir günün var! Saat kaçta yatıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Saat on birde yattığını söyle.',
        german: 'Ich gehe um elf Uhr ins Bett.',
        turkish: 'Saat on birde yatarım.',
        wrongOptions: ['Ich stehe um elf Uhr auf.', 'Ich gehe um elf Uhr in die Kantine.'],
        wrongTurkish: ['Saat on birde kalkarım.', 'Saat on birde kantine giderim.'],
        wrongNotes: [
          '"aufstehen" kalkmak demektir; yatmak için "ins Bett gehen" kullanılır.',
          'Yatma saatini soruyor; kantin konuyla ilgisiz.',
        ],
        note: '"ins Bett gehen" = yatmaya gitmek. Saat için "um ... Uhr" kullanılır.',
      },
      {
        type: 'say',
        speaker: 'Emma',
        german: 'Kein Wunder, dass du müde bist! Schlaf heute Nacht gut!',
        turkish: 'Yorgun olman şaşırtıcı değil! Bu gece iyi uyu!',
      },
    ],
  },
  {
    id: 'aile-tanitma',
    level: 'A1',
    title: 'Aile ve Akrabaları Tanıtma',
    description: 'Ailenden bahset: anne, baba, kardeş, yaş ve meslek.',
    place: 'Arkadaşının evi',
    steps: [
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Oh, ein schönes Foto! Ist das deine Familie?',
        turkish: 'Ah, güzel bir fotoğraf! Bu senin ailen mi?',
      },
      {
        type: 'reply',
        prompt: 'Evet, bunun senin ailen olduğunu söyle.',
        german: 'Ja, das ist meine Familie.',
        turkish: 'Evet, bu benim ailem.',
        wrongOptions: ['Nein, das ist meine Schule.', 'Ja, das ist mein Familie.'],
        wrongTurkish: ['Hayır, bu benim okulum.', 'Evet, bu benim ailem (yanlış artikel).'],
        wrongNotes: [
          'Fotoğraftakiler senin ailen; "Schule" okul demektir.',
          '"Familie" dişildir; "mein" değil "meine" kullanılır.',
        ],
        note: '"die Familie" dişil olduğu için "meine Familie" denir. Eril ve nötr isimlerde "mein" kullanılır: mein Vater, mein Kind.',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Wer ist die Frau neben dir?',
        turkish: 'Yanındaki kadın kim?',
      },
      {
        type: 'reply',
        prompt: 'Onun annen olduğunu ve adının Elif olduğunu söyle.',
        german: 'Das ist meine Mutter. Sie heißt Elif.',
        turkish: 'Bu annem. Adı Elif.',
        wrongOptions: ['Das ist meine Schwester. Sie heißt Elif.', 'Das ist meine Mutter. Er heißt Elif.'],
        wrongTurkish: ['Bu kız kardeşim. Adı Elif.', 'Bu annem. Onun adı Elif (er = erkek).'],
        wrongNotes: [
          'Annen olduğunu söylemen gerekiyordu; "Schwester" kız kardeş demektir.',
          '"Mutter" kadındır; kadın için "sie heißt" kullanılır, "er" erkekler içindir.',
        ],
        note: '"Sie heißt ..." = (kadın) adı ... "Er heißt ..." = (erkek) adı ... Aile üyeleri: die Mutter, der Vater, die Schwester, der Bruder.',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Und wer ist der Mann dort? Ist das dein Vater?',
        turkish: 'Peki şuradaki adam kim? Baban mı?',
      },
      {
        type: 'reply',
        prompt: 'Evet, babanın bu olduğunu ve mühendis olarak çalıştığını söyle.',
        german: 'Ja, das ist mein Vater. Er arbeitet als Ingenieur.',
        turkish: 'Evet, bu babam. Mühendis olarak çalışıyor.',
        wrongOptions: ['Ja, das ist mein Vater. Sie arbeitet als Ingenieur.', 'Nein, das ist mein Bruder. Er arbeitet als Ingenieur.'],
        wrongTurkish: ['Evet, bu babam. O (kadın) mühendis olarak çalışıyor.', 'Hayır, bu erkek kardeşim. Mühendis olarak çalışıyor.'],
        wrongNotes: [
          'Baba erkektir: "er arbeitet". "Sie" kadınlar için kullanılır.',
          'Babanı tanıtman gerekiyordu; "Bruder" erkek kardeş demektir.',
        ],
        note: '"arbeiten als ..." = ... olarak çalışmak: "Er arbeitet als Ingenieur."',
      },
      {
        type: 'choice',
        speaker: 'Anna',
        german: 'Hast du Geschwister?',
        turkish: 'Kardeşin var mı?',
        prompt: 'Kardeşin olup olmadığını seç.',
        options: [
          {
            german: 'Ja, ich habe einen Bruder.',
            turkish: 'Evet, bir erkek kardeşim var.',
            responseGerman: 'Das ist schön. Mit einem Bruder ist es nie langweilig.',
            responseTurkish: 'Bu güzel. Bir erkek kardeşin olunca asla sıkılmazsın.',
          },
          {
            german: 'Nein, ich habe keine Geschwister.',
            turkish: 'Hayır, kardeşim yok.',
            responseGerman: 'Verstehe. Dann hast du bestimmt viel Zeit für dich.',
            responseTurkish: 'Anlıyorum. O zaman kendine ayıracak çok vaktin vardır.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Und wie alt sind deine Eltern?',
        turkish: 'Peki anne babanın yaşı kaç?',
      },
      {
        type: 'reply',
        prompt: 'Annenin elli, babanın elli dört yaşında olduğunu söyle.',
        german: 'Meine Mutter ist fünfzig und mein Vater ist vierundfünfzig.',
        turkish: 'Annem elli, babam elli dört yaşında.',
        wrongOptions: [
          'Meine Mutter hat fünfzig und mein Vater hat vierundfünfzig.',
          'Meine Mutter ist fünfzehn und mein Vater ist vierundfünfzig.',
        ],
        wrongTurkish: [
          'Annemin elli, babamın elli dördü var.',
          'Annem on beş, babam elli dört yaşında.',
        ],
        wrongNotes: [
          'Yaş söylerken "haben" değil "sein" kullanılır: "ist fünfzig".',
          'Annen elli yaşında; "fünfzehn" on beş, "fünfzig" elli demektir.',
        ],
        note: 'Yaş için "sein" kullanılır: "Meine Mutter ist fünfzig." Sayılar: fünfzehn = 15, fünfzig = 50.',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Wohnst du noch bei deinen Eltern?',
        turkish: 'Hâlâ anne babanla mı yaşıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Hayır, yalnız yaşadığını ve ailenin başka bir şehirde oturduğunu söyle.',
        german: 'Nein, ich wohne allein. Meine Familie wohnt in einer anderen Stadt.',
        turkish: 'Hayır, yalnız yaşıyorum. Ailem başka bir şehirde yaşıyor.',
        wrongOptions: [
          'Ja, ich wohne allein. Meine Familie wohnt auch hier.',
          'Nein, ich wohne allein. Meine Familie ist sehr groß.',
        ],
        wrongTurkish: [
          'Evet, yalnız yaşıyorum. Ailem de burada yaşıyor.',
          'Hayır, yalnız yaşıyorum. Ailem çok büyük.',
        ],
        wrongNotes: [
          '"Ja" ile "allein" çelişir; yalnız yaşıyorsan cevap "Nein" olmalı.',
          'Ailenin nerede yaşadığını söylemen gerekiyordu; büyüklüğü sorulmadı.',
        ],
        note: '"allein" = yalnız. "in einer anderen Stadt" = başka bir şehirde (die Stadt dişil, Dativ: "einer").',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Das ist eine nette Familie! Ich möchte sie gern einmal kennenlernen.',
        turkish: 'Güzel bir aile! Onlarla bir gün tanışmak isterim.',
      },
      {
        type: 'reply',
        prompt: 'Memnuniyetle de ve yazın seni ziyaret edebileceğini söyle.',
        german: 'Gern! Du kannst uns im Sommer besuchen.',
        turkish: 'Memnuniyetle! Yazın bizi ziyaret edebilirsin.',
        wrongOptions: ['Gern! Du kannst meine Familie nicht besuchen.', 'Gern! Ich besuche dich im Sommer.'],
        wrongTurkish: ['Memnuniyetle! Ailemi ziyaret edemezsin.', 'Memnuniyetle! Yazın seni ziyaret ederim.'],
        wrongNotes: [
          'Davet ediyorsun; "nicht besuchen" daveti geri çevirir.',
          'Rolleri tersine çevirdin: o seni ziyaret edecek, sen onu değil.',
        ],
        note: '"besuchen" = ziyaret etmek (Akkusativ): "uns besuchen" = bizi ziyaret etmek. "im Sommer" = yazın.',
      },
      {
        type: 'say',
        speaker: 'Anna',
        german: 'Super, sehr gern! Danke für die Einladung!',
        turkish: 'Harika, çok isterim! Davet için teşekkürler!',
      },
    ],
  },
  {
    id: 'ev-tanitma',
    level: 'A1',
    title: 'Ev ve Odaları Tanıtma',
    description: 'Evini tanıt: odaları, eşyaları ve en sevdiğin yeri anlat.',
    place: 'Evin',
    steps: [
      {
        type: 'say',
        speaker: 'Lukas',
        german: 'Hallo! Danke für die Einladung. Du hast eine schöne Wohnung!',
        turkish: 'Merhaba! Davet için teşekkürler. Çok güzel bir dairen var!',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve dairenin üç odası olduğunu söyle.',
        german: 'Danke! Die Wohnung hat drei Zimmer.',
        turkish: 'Teşekkürler! Dairenin üç odası var.',
        wrongOptions: ['Danke! Die Wohnung ist drei Zimmer.', 'Danke! Die Wohnung hat drei Katzen.'],
        wrongTurkish: ['Teşekkürler! Daire üç odadır.', 'Teşekkürler! Dairenin üç kedisi var.'],
        wrongNotes: [
          'Oda sayısı "haben" ile söylenir; "ist" burada yanlıştır.',
          'Odaları sayman gerekiyordu; kedi konuyla ilgisiz.',
        ],
        note: '"Die Wohnung hat ..." = Dairenin ... var. Oda sayısı: "drei Zimmer" ("Zimmer" çoğulda aynı kalır).',
      },
      {
        type: 'say',
        speaker: 'Lukas',
        german: 'Oh, drei Zimmer! Kannst du mir alles zeigen?',
        turkish: 'Vay, üç oda! Bana hepsini gösterebilir misin?',
      },
      {
        type: 'reply',
        prompt: 'Kabul et; önce oturma odasını göster ve orada bir kanepe ile bir televizyon olduğunu söyle.',
        german: 'Gern! Hier ist das Wohnzimmer. Es gibt ein Sofa und einen Fernseher.',
        turkish: 'Memnuniyetle! İşte oturma odası. Bir kanepe ve bir televizyon var.',
        wrongOptions: [
          'Gern! Hier ist das Badezimmer. Es gibt ein Sofa und einen Fernseher.',
          'Nein, danke. Ich zeige dir nichts.',
        ],
        wrongTurkish: [
          'Memnuniyetle! İşte banyo. Bir kanepe ve bir televizyon var.',
          'Hayır, teşekkürler. Sana hiçbir şey göstermem.',
        ],
        wrongNotes: [
          'Kanepe ve televizyon banyoda değil, oturma odasında olur.',
          'Evi gezdirmeyi kabul edecektin.',
        ],
        note: '"Es gibt + Akkusativ" = ... var. "ein Sofa" nötrdür; "der Fernseher" eril olduğundan "einen Fernseher" denir.',
      },
      {
        type: 'say',
        speaker: 'Lukas',
        german: 'Sehr gemütlich! Und wo schläfst du?',
        turkish: 'Çok rahat! Peki sen nerede uyuyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Yatak odasının koridorun sonunda olduğunu söyle.',
        german: 'Das Schlafzimmer ist am Ende vom Flur.',
        turkish: 'Yatak odası koridorun sonunda.',
        wrongOptions: ['Das Schlafzimmer ist in der Küche.', 'Das Schlafzimmer ist teuer.'],
        wrongTurkish: ['Yatak odası mutfakta.', 'Yatak odası pahalı.'],
        wrongNotes: [
          'Yatak odası mutfakta olmaz; doğru yer koridorun sonu.',
          'Nerede olduğunu soruyor; fiyatını değil.',
        ],
        note: '"am Ende von ..." = ...in sonunda. Yer söylerken "ist" + yer ifadesi kullanılır: "Das Schlafzimmer ist ...".',
      },
      {
        type: 'choice',
        speaker: 'Lukas',
        german: 'Was ist dein Lieblingsplatz in der Wohnung? Der Balkon oder die Küche?',
        turkish: 'Evde en sevdiğin yer neresi? Balkon mu mutfak mı?',
        prompt: 'En sevdiğin yeri seç.',
        options: [
          {
            german: 'Mein Lieblingsplatz ist der Balkon.',
            turkish: 'En sevdiğim yer balkon.',
            responseGerman: 'Das kann ich verstehen. Dort hat man bestimmt eine schöne Aussicht.',
            responseTurkish: 'Anlayabiliyorum. Orada kesinlikle güzel bir manzara vardır.',
          },
          {
            german: 'Mein Lieblingsplatz ist die Küche.',
            turkish: 'En sevdiğim yer mutfak.',
            responseGerman: 'Das kann ich verstehen. In der Küche ist es immer gemütlich.',
            responseTurkish: 'Anlayabiliyorum. Mutfakta her zaman rahat bir hava olur.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Lukas',
        german: 'Und die Küche? Was gibt es dort?',
        turkish: 'Peki mutfak? Orada neler var?',
      },
      {
        type: 'reply',
        prompt: 'Mutfakta bir buzdolabı, bir ocak ve bir kahve makinesi olduğunu söyle.',
        german: 'In der Küche gibt es einen Kühlschrank, einen Herd und eine Kaffeemaschine.',
        turkish: 'Mutfakta bir buzdolabı, bir ocak ve bir kahve makinesi var.',
        wrongOptions: [
          'In der Küche gibt es einen Kühlschrank, einen Herd und ein Bett.',
          'In der Küche gibt es keinen Kühlschrank, keinen Herd und keine Kaffeemaschine.',
        ],
        wrongTurkish: [
          'Mutfakta bir buzdolabı, bir ocak ve bir yatak var.',
          'Mutfakta ne buzdolabı, ne ocak, ne de kahve makinesi var.',
        ],
        wrongNotes: [
          'Yatak mutfakta olmaz; kahve makinesini söylemen gerekiyordu.',
          'Bu cevap mutfağın boş olduğunu söylüyor; eşyaları saymalıydın.',
        ],
        note: '"es gibt" + Akkusativ: einen Kühlschrank (der), einen Herd (der), eine Kaffeemaschine (die).',
      },
      {
        type: 'say',
        speaker: 'Lukas',
        german: 'Super! Und das Badezimmer? Ist es groß?',
        turkish: 'Harika! Peki banyo? Büyük mü?',
      },
      {
        type: 'reply',
        prompt: 'Banyonun küçük ama çok temiz olduğunu söyle.',
        german: 'Es ist klein, aber sehr sauber.',
        turkish: 'Küçük ama çok temiz.',
        wrongOptions: ['Es ist klein, aber sehr schmutzig.', 'Es ist groß, aber sehr klein.'],
        wrongTurkish: ['Küçük ama çok kirli.', 'Büyük ama çok küçük.'],
        wrongNotes: [
          'Temiz olduğunu söyleyecektin; "schmutzig" kirli demektir.',
          'Cümle kendi içinde çelişiyor: aynı şey hem büyük hem küçük olamaz.',
        ],
        note: '"..., aber ..." = ..., ama ... İki zıt özelliği bağlar: "klein, aber sauber".',
      },
      {
        type: 'say',
        speaker: 'Lukas',
        german: 'Deine Wohnung gefällt mir wirklich gut. Wie lange wohnst du schon hier?',
        turkish: 'Dairen gerçekten hoşuma gitti. Ne kadardır burada yaşıyorsun?',
      },
      {
        type: 'reply',
        prompt: 'İki yıldır burada yaşadığını söyle.',
        german: 'Ich wohne seit zwei Jahren hier.',
        turkish: 'İki yıldır burada yaşıyorum.',
        wrongOptions: ['Ich wohne in zwei Jahren hier.', 'Ich bin zwei Jahre alt und wohne hier.'],
        wrongTurkish: ['İki yıl sonra burada yaşıyorum.', 'İki yaşındayım ve burada yaşıyorum.'],
        wrongNotes: [
          '"in zwei Jahren" iki yıl sonra demektir; süre için "seit" kullanılır.',
          'Ne kadardır yaşadığını soruyor; yaşını değil.',
        ],
        note: '"seit" + Dativ: "seit zwei Jahren" = iki yıldır. Süreyi soran kalıp: "Wie lange?"',
      },
      {
        type: 'say',
        speaker: 'Lukas',
        german: 'Das ist ja schon lange! Danke für die Führung!',
        turkish: 'Bu epey uzun bir süre! Gezdirdiğin için teşekkürler!',
      },
    ],
  },
  {
    id: 'dogum-gunu-daveti',
    level: 'A1',
    title: 'Doğum Günü veya Parti Daveti',
    description: 'Bir arkadaşını doğum günü partisine davet et; gün, saat ve adres ver.',
    place: 'Sokak',
    steps: [
      {
        type: 'say',
        speaker: 'Mia',
        german: 'Hallo! Schön, dich zu sehen. Was gibt es Neues?',
        turkish: 'Merhaba! Seni görmek güzel. Ne var ne yok?',
      },
      {
        type: 'reply',
        prompt: 'Bir doğum günü partisi yaptığını ve onu davet ettiğini söyle.',
        german: 'Ich mache eine Geburtstagsparty. Ich lade dich ein.',
        turkish: 'Bir doğum günü partisi yapıyorum. Seni davet ediyorum.',
        wrongOptions: ['Ich mache eine Hochzeit. Ich lade dich ein.', 'Ich habe keine Zeit. Ich lade dich nicht ein.'],
        wrongTurkish: ['Bir düğün yapıyorum. Seni davet ediyorum.', 'Zamanım yok. Seni davet etmiyorum.'],
        wrongNotes: [
          'Doğum günü partisi veriyorsun; "Hochzeit" düğün demektir.',
          'Davet edecektin; bu cevap davet etmeyi reddediyor.',
        ],
        note: '"einladen" ayrılabilen fiildir: "Ich lade dich ein." ("dich" = seni, Akkusativ). "die Geburtstagsparty" = doğum günü partisi.',
      },
      {
        type: 'say',
        speaker: 'Mia',
        german: 'Oh, wie schön! Wann ist die Party denn?',
        turkish: 'Ah, ne güzel! Parti ne zaman?',
      },
      {
        type: 'reply',
        prompt: 'Partinin cumartesi akşam saat sekizde olduğunu söyle.',
        german: 'Sie ist am Samstag um acht Uhr abends.',
        turkish: 'Cumartesi akşam saat sekizde.',
        wrongOptions: ['Sie ist am Montag um acht Uhr morgens.', 'Sie ist gestern um acht Uhr abends.'],
        wrongTurkish: ['Pazartesi sabah saat sekizde.', 'Dün akşam saat sekizde.'],
        wrongNotes: [
          'Parti cumartesi akşam; farklı bir gün ve zaman söyledin.',
          'Parti henüz olmadı; "gestern" dün demektir.',
        ],
        note: '"am Samstag" = cumartesi günü, "um acht Uhr" = saat sekizde, "abends" = akşamları.',
      },
      {
        type: 'say',
        speaker: 'Mia',
        german: 'Super! Und wo feierst du?',
        turkish: 'Harika! Peki nerede kutluyorsun?',
      },
      {
        type: 'reply',
        prompt: 'Partinin senin evinde olduğunu ve adresin Bahnhofstraße 5 olduğunu söyle.',
        german: 'Bei mir zu Hause, in der Bahnhofstraße fünf.',
        turkish: 'Benim evimde, Bahnhofstraße 5 numarada.',
        wrongOptions: ['Bei mir zu Hause, in der Bahnhofstraße fünfzig.', 'Im Restaurant, in der Bahnhofstraße fünf.'],
        wrongTurkish: ['Benim evimde, Bahnhofstraße 50 numarada.', 'Restoranda, Bahnhofstraße 5 numarada.'],
        wrongNotes: [
          'Adres numarası beş; "fünfzig" elli demektir.',
          'Parti senin evinde; restoranda değil.',
        ],
        note: '"bei mir zu Hause" = benim evimde. Adres için "in der ...straße" + sayı kullanılır.',
      },
      {
        type: 'choice',
        speaker: 'Mia',
        german: 'Kann ich etwas mitbringen? Einen Kuchen oder Getränke?',
        turkish: 'Bir şey getirebilir miyim? Pasta mı yoksa içecek mi?',
        prompt: 'Ne getirmesini istediğini seç.',
        options: [
          {
            german: 'Bring bitte einen Kuchen mit.',
            turkish: 'Lütfen bir pasta getir.',
            responseGerman: 'Gern! Ich backe einen Schokoladenkuchen.',
            responseTurkish: 'Memnuniyetle! Çikolatalı bir pasta yapacağım.',
          },
          {
            german: 'Bring bitte Getränke mit.',
            turkish: 'Lütfen içecek getir.',
            responseGerman: 'Gern! Ich bringe Limonade und Saft mit.',
            responseTurkish: 'Memnuniyetle! Limonata ve meyve suyu getiriyorum.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Mia',
        german: 'Alles klar. Wie viele Gäste kommen denn?',
        turkish: 'Tamam. Kaç misafir geliyor?',
      },
      {
        type: 'reply',
        prompt: 'Yaklaşık on kişinin geleceğini söyle.',
        german: 'Es kommen ungefähr zehn Personen.',
        turkish: 'Yaklaşık on kişi geliyor.',
        wrongOptions: ['Es kommen ungefähr zehn Euro.', 'Es kommt niemand zur Party.'],
        wrongTurkish: ['Yaklaşık on euro geliyor.', 'Partiye kimse gelmiyor.'],
        wrongNotes: [
          'Misafir sayısı kişi ile söylenir; "Euro" para birimidir.',
          'On kişinin geleceğini söyleyecektin; bu cevap kimsenin gelmeyeceğini söylüyor.',
        ],
        note: '"die Person" çoğulda "Personen" olur. "ungefähr" = yaklaşık.',
      },
      {
        type: 'say',
        speaker: 'Mia',
        german: 'Das wird eine tolle Party! Was machen wir dort?',
        turkish: 'Harika bir parti olacak! Orada ne yapacağız?',
      },
      {
        type: 'reply',
        prompt: 'Müzik olacağını ve dans edeceğinizi söyle.',
        german: 'Es gibt Musik und wir tanzen.',
        turkish: 'Müzik olacak ve dans edeceğiz.',
        wrongOptions: ['Es gibt keine Musik und wir schlafen.', 'Es gibt Musik und wir kochen Suppe.'],
        wrongTurkish: ['Müzik olmayacak ve uyuyacağız.', 'Müzik olacak ve çorba pişireceğiz.'],
        wrongNotes: [
          'Partide müzik ve dans söylemen gerekiyordu; uyumak partiye uymuyor.',
          'Görev dans etmekten söz etmek; çorba pişirmek bunun yerini tutmaz.',
        ],
        note: '"es gibt" = ... var / ... olacak. "tanzen" = dans etmek: "wir tanzen".',
      },
      {
        type: 'say',
        speaker: 'Mia',
        german: 'Prima! Dann bis Samstag. Ich freue mich schon!',
        turkish: 'Harika! O zaman cumartesi görüşürüz. Şimdiden sabırsızlanıyorum!',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve cumartesi görüşmek üzere vedalaş.',
        german: 'Danke, Mia! Bis Samstag!',
        turkish: 'Teşekkürler, Mia! Cumartesi görüşürüz!',
        wrongOptions: ['Danke, Mia! Bis Montag!', 'Entschuldigung, Mia! Ich komme nicht.'],
        wrongTurkish: ['Teşekkürler, Mia! Pazartesi görüşürüz!', 'Özür dilerim, Mia! Gelmiyorum.'],
        wrongNotes: [
          'Parti cumartesi günü; cumartesi görüşmek üzere vedalaşmalısın.',
          'Parti sende; gelmemek hem çelişkili hem konuşmaya uymuyor.',
        ],
        note: '"Bis Samstag!" = cumartesi görüşürüz. "bis" + gün adı, bir sonraki görüşme gününü bildirir.',
      },
    ],
  },
  {
    id: 'firin-kasap',
    level: 'A1',
    title: 'Fırın ve Kasaptan Alışveriş',
    description: 'Fırında ekmek al, kasapta gram söyleyerek et ürünleri iste ve öde.',
    place: 'Fırın ve kasap',
    steps: [
      {
        type: 'say',
        speaker: 'Fırıncı',
        german: 'Guten Morgen! Was darf es sein?',
        turkish: 'Günaydın! Ne arzu edersiniz?',
      },
      {
        type: 'reply',
        prompt: 'Altı küçük ekmek (Brötchen) istediğini söyle.',
        german: 'Guten Morgen! Ich hätte gern sechs Brötchen.',
        turkish: 'Günaydın! Altı küçük ekmek rica ediyorum.',
        wrongOptions: ['Guten Morgen! Ich hätte gern sechs Kilo Brötchen.', 'Guten Morgen! Ich hätte gern sechs Briefe.'],
        wrongTurkish: ['Günaydın! Altı kilo küçük ekmek rica ediyorum.', 'Günaydın! Altı mektup rica ediyorum.'],
        wrongNotes: [
          'Küçük ekmekler adetle alınır; altı kilo gerçekçi değil.',
          'Fırındasın; mektup konuyla ilgisiz.',
        ],
        note: '"Ich hätte gern ..." = ... rica ederim. "das Brötchen" çoğulda "die Brötchen" olur.',
      },
      {
        type: 'say',
        speaker: 'Fırıncı',
        german: 'Sehr gern. Sonst noch etwas?',
        turkish: 'Memnuniyetle. Başka bir şey?',
      },
      {
        type: 'reply',
        prompt: 'Bir de bir somun ekmek (Brot) istediğini söyle.',
        german: 'Ja, und ein Brot, bitte.',
        turkish: 'Evet, bir de bir somun ekmek, lütfen.',
        wrongOptions: ['Nein, danke. Das ist alles.', 'Ja, und einen Kuchen, bitte.'],
        wrongTurkish: ['Hayır, teşekkürler. Hepsi bu kadar.', 'Evet, bir de pasta, lütfen.'],
        wrongNotes: [
          'Ekmek istediğini söyleyecektin; "das ist alles" siparişi bitirir.',
          'Somun ekmek istiyorsun; pasta değil.',
        ],
        note: '"das Brot" nötrdür: "ein Brot". "und ..." ile siparişe ekleme yapılır.',
      },
      {
        type: 'choice',
        speaker: 'Fırıncı',
        german: 'Möchten Sie das Brot geschnitten oder im Ganzen?',
        turkish: 'Ekmeği dilimli mi yoksa bütün mü istersiniz?',
        prompt: 'Ekmeğin dilimli mi bütün mü olmasını istediğini seç.',
        options: [
          {
            german: 'Bitte geschnitten.',
            turkish: 'Dilimli olsun, lütfen.',
            responseGerman: 'Gern, ich schneide es gleich für Sie.',
            responseTurkish: 'Memnuniyetle, hemen sizin için dilimliyorum.',
          },
          {
            german: 'Bitte im Ganzen.',
            turkish: 'Bütün olsun, lütfen.',
            responseGerman: 'Gern, ich packe es so ein.',
            responseTurkish: 'Memnuniyetle, öyle paketliyorum.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Fırıncı',
        german: 'So, das macht vier Euro zwanzig.',
        turkish: 'Tamam, toplam dört euro yirmi.',
      },
      {
        type: 'reply',
        prompt: 'Kartla ödeyip ödeyemeyeceğini sor.',
        german: 'Kann ich mit Karte zahlen?',
        turkish: 'Kartla ödeyebilir miyim?',
        wrongOptions: ['Kann ich mit Karte essen?', 'Kann ich morgen zahlen?'],
        wrongTurkish: ['Kartla yiyebilir miyim?', 'Yarın ödeyebilir miyim?'],
        wrongNotes: [
          'Ödeme yöntemini soruyorsun; "essen" yemek demektir.',
          'Ödemeyi ertelemek değil, kartla ödeyip ödeyemeyeceğini sormalısın.',
        ],
        note: '"mit Karte zahlen" = kartla ödemek. "Kann ich ...?" bir imkânı sorar.',
      },
      {
        type: 'say',
        speaker: 'Fırıncı',
        german: 'Leider nur bar. Die Kartenzahlung funktioniert heute nicht.',
        turkish: 'Maalesef yalnızca nakit. Kartla ödeme bugün çalışmıyor.',
      },
      {
        type: 'reply',
        prompt: 'Sorun olmadığını söyle ve beş euro ver.',
        german: 'Kein Problem. Hier sind fünf Euro.',
        turkish: 'Sorun değil. Buyurun, beş euro.',
        wrongOptions: ['Kein Problem. Hier sind fünfzig Euro.', 'Das ist ein Problem. Ich gehe wieder.'],
        wrongTurkish: ['Sorun değil. Buyurun, elli euro.', 'Bu bir sorun. Tekrar gidiyorum.'],
        wrongNotes: [
          'Dört euro yirmi için elli euro verilmez; beş euro yeterli.',
          'Sorun etmeden nakit ödeyecektin.',
        ],
        note: '"Kein Problem" = sorun değil. Para verirken "Hier sind ..." denir: "Hier sind fünf Euro."',
      },
      {
        type: 'say',
        speaker: 'Fırıncı',
        german: 'Danke! Hier ist Ihr Rückgeld. Auf Wiedersehen!',
        turkish: 'Teşekkürler! İşte para üstünüz. Hoşça kalın!',
      },
      {
        type: 'say',
        speaker: 'Kasap',
        german: 'Guten Tag! Was kann ich für Sie tun?',
        turkish: 'İyi günler! Sizin için ne yapabilirim?',
      },
      {
        type: 'reply',
        prompt: 'İki yüz gram jambon istediğini söyle.',
        german: 'Guten Tag. Ich möchte zweihundert Gramm Schinken, bitte.',
        turkish: 'İyi günler. İki yüz gram jambon istiyorum, lütfen.',
        wrongOptions: [
          'Guten Tag. Ich möchte zweihundert Kilo Schinken, bitte.',
          'Guten Tag. Ich möchte zweihundert Gramm Brötchen, bitte.',
        ],
        wrongTurkish: [
          'İyi günler. İki yüz kilo jambon istiyorum, lütfen.',
          'İyi günler. İki yüz gram küçük ekmek istiyorum, lütfen.',
        ],
        wrongNotes: [
          'İki yüz kilo çok fazla; gram demelisin.',
          'Kasaptasın; jambon istiyorsun, küçük ekmek değil.',
        ],
        note: '"Gramm" sayıdan sonra çoğul eki almaz: "zweihundert Gramm" ("Gramme" denmez); ardından ürün adı gelir: "Gramm Schinken".',
      },
      {
        type: 'say',
        speaker: 'Kasap',
        german: 'Gern. Darf es noch etwas sein? Wir haben heute frisches Hähnchen.',
        turkish: 'Memnuniyetle. Başka bir şey olsun mu? Bugün taze tavuğumuz var.',
      },
      {
        type: 'reply',
        prompt: 'Tavuk istemediğini ama yarım kilo kıyma aldığını söyle.',
        german: 'Kein Hähnchen, danke. Aber ich nehme ein Pfund Hackfleisch.',
        turkish: 'Tavuk istemiyorum, teşekkürler. Ama yarım kilo kıyma alıyorum.',
        wrongOptions: [
          'Ja, danke. Aber ich nehme kein Hackfleisch.',
          'Kein Hähnchen, danke. Aber ich nehme ein Pfund Brötchen.',
        ],
        wrongTurkish: [
          'Evet, teşekkürler. Ama kıyma almıyorum.',
          'Tavuk istemiyorum, teşekkürler. Ama yarım kilo küçük ekmek alıyorum.',
        ],
        wrongNotes: [
          'Tavuğu reddedip kıyma alacaktın; bu cevap tam tersini söylüyor.',
          'Kasaptan küçük ekmek alınmaz; kıyma alacaktın.',
        ],
        note: '"ein Pfund" = 500 gram (yarım kilo). "das Hackfleisch" = kıyma. "nehmen" = almak.',
      },
      {
        type: 'say',
        speaker: 'Kasap',
        german: 'Bitte schön. Das macht zusammen sieben Euro fünfzig. Schönen Tag noch!',
        turkish: 'Buyurun. Toplam yedi euro elli. İyi günler!',
      },
    ],
  },
  {
    id: 'saat-acilis-kapanis',
    level: 'A1',
    title: 'Saat ve Açılış-Kapanış Saatlerini Sorma',
    description: 'Saati sor, eczanenin ve marketin açılış ve kapanış saatlerini öğren.',
    place: 'Sokak',
    steps: [
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Hallo! Brauchen Sie Hilfe?',
        turkish: 'Merhaba! Yardıma ihtiyacınız var mı?',
      },
      {
        type: 'reply',
        prompt: 'Afedersiniz diyerek saatin kaç olduğunu sor.',
        german: 'Entschuldigung, wie spät ist es?',
        turkish: 'Afedersiniz, saat kaç?',
        wrongOptions: ['Entschuldigung, wie alt sind Sie?', 'Entschuldigung, wie heißt die Uhr?'],
        wrongTurkish: ['Afedersiniz, kaç yaşındasınız?', 'Afedersiniz, saatin adı ne?'],
        wrongNotes: [
          'Saati soracaksın; yaşını sormak kibar değil.',
          '"Wie spät ist es?" saati sorar; saatin adını değil.',
        ],
        note: '"Wie spät ist es?" = saat kaç? Aynı anlamda "Wie viel Uhr ist es?" da kullanılır.',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Es ist Viertel nach drei.',
        turkish: 'Saat üçü çeyrek geçiyor.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve eczanenin kaça kadar açık olduğunu sor.',
        german: 'Danke! Bis wann ist die Apotheke geöffnet?',
        turkish: 'Teşekkürler! Eczane kaça kadar açık?',
        wrongOptions: ['Danke! Wie viel kostet die Apotheke?', 'Danke! Wie spät ist es jetzt?'],
        wrongTurkish: ['Teşekkürler! Eczane ne kadar?', 'Teşekkürler! Şimdi saat kaç?'],
        wrongNotes: [
          'Çalışma saatini soruyorsun; fiyat sorulmaz.',
          'Saati zaten öğrendin; şimdi eczanenin kapanış saatini soruyorsun.',
        ],
        note: '"bis wann" = ne zamana kadar. "geöffnet" = açık: "Bis wann ist ... geöffnet?"',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Die Apotheke ist von acht bis achtzehn Uhr geöffnet.',
        turkish: 'Eczane sekizden on sekize kadar açık.',
      },
      {
        type: 'choice',
        speaker: 'Yoldan geçen',
        german: 'Möchten Sie heute noch hingehen oder erst morgen?',
        turkish: 'Bugün mü gitmek istersiniz yoksa yarın mı?',
        prompt: 'Eczaneye ne zaman gideceğini seç.',
        options: [
          {
            german: 'Ich gehe heute noch hin.',
            turkish: 'Bugün gideceğim.',
            responseGerman: 'Dann haben Sie noch fast drei Stunden Zeit.',
            responseTurkish: 'O zaman neredeyse üç saatiniz var.',
          },
          {
            german: 'Ich gehe erst morgen hin.',
            turkish: 'Yarın gideceğim.',
            responseGerman: 'Gut. Morgen öffnet sie schon um acht Uhr.',
            responseTurkish: 'İyi. Yarın sekizde açılıyor.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Ach ja, und der Supermarkt dort drüben ist am Sonntag geschlossen.',
        turkish: 'Bu arada, şuradaki market pazar günü kapalı.',
      },
      {
        type: 'reply',
        prompt: 'Bilgi için teşekkür et ve marketin cumartesi ne zaman kapandığını sor.',
        german: 'Danke für die Information. Wann schließt der Supermarkt am Samstag?',
        turkish: 'Bilgi için teşekkürler. Market cumartesi ne zaman kapanıyor?',
        wrongOptions: [
          'Danke für die Information. Wann öffnet der Supermarkt am Samstag?',
          'Danke für die Information. Wo schließt der Supermarkt am Samstag?',
        ],
        wrongTurkish: [
          'Bilgi için teşekkürler. Market cumartesi ne zaman açılıyor?',
          'Bilgi için teşekkürler. Market cumartesi nerede kapanıyor?',
        ],
        wrongNotes: [
          'Kapanış saatini soruyorsun; "öffnet" açılış saatidir.',
          '"Wann" ne zaman sorar; "Wo" yer sorar.',
        ],
        note: '"schließen" kapanmak, "öffnen" açılmak demektir: "Wann schließt/öffnet ...?"',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Am Samstag schließt er um zwanzig Uhr.',
        turkish: 'Cumartesi yirmide kapanıyor.',
      },
      {
        type: 'reply',
        prompt: 'Marketin saat kaçta açıldığını sor.',
        german: 'Und um wie viel Uhr öffnet er?',
        turkish: 'Peki saat kaçta açılıyor?',
        wrongOptions: ['Und um wie viel Uhr schließt er?', 'Und wie heißt er?'],
        wrongTurkish: ['Peki saat kaçta kapanıyor?', 'Peki adı ne?'],
        wrongNotes: [
          'Kapanışı zaten öğrendin; şimdi açılış saatini soruyorsun.',
          'Marketin adını değil, açılış saatini soruyorsun.',
        ],
        note: '"um wie viel Uhr?" = saat kaçta? "Und ..." soruyu bir öncekine bağlar.',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Er öffnet um sieben Uhr morgens.',
        turkish: 'Sabah yedide açılıyor.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve bankanın hafta sonu açık olup olmadığını sor.',
        german: 'Danke. Ist die Bank am Wochenende geöffnet?',
        turkish: 'Teşekkürler. Banka hafta sonu açık mı?',
        wrongOptions: ['Danke. Wo ist die Bank am Wochenende?', 'Danke. Ist die Bank am Montag geöffnet?'],
        wrongTurkish: ['Teşekkürler. Banka hafta sonu nerede?', 'Teşekkürler. Banka pazartesi açık mı?'],
        wrongNotes: [
          'Açık olup olmadığını soruyorsun; yerini değil.',
          'Hafta sonunu soracaktın; pazartesi hafta içidir.',
        ],
        note: '"Ist ... geöffnet?" = ... açık mı? "am Wochenende" = hafta sonu.',
      },
      {
        type: 'say',
        speaker: 'Yoldan geçen',
        german: 'Nein, am Wochenende ist die Bank leider geschlossen. Sie ist nur von Montag bis Freitag geöffnet.',
        turkish: 'Hayır, banka hafta sonu maalesef kapalı. Yalnızca pazartesiden cumaya kadar açık.',
      },
      {
        type: 'reply',
        prompt: 'Nazik olduğu için teşekkür et ve vedalaş.',
        german: 'Das ist sehr nett von Ihnen. Danke und auf Wiedersehen!',
        turkish: 'Çok naziksiniz. Teşekkürler ve hoşça kalın!',
        wrongOptions: ['Das ist schlecht. Ich komme nie wieder.', 'Das ist sehr nett von Ihnen. Wie spät ist es?'],
        wrongTurkish: ['Bu kötü. Bir daha asla gelmem.', 'Çok naziksiniz. Saat kaç?'],
        wrongNotes: [
          'Nazik olmayan bir tepki; teşekkür edip veda etmelisin.',
          'Saati zaten öğrendin; teşekkür edip vedalaşmalısın.',
        ],
        note: '"Das ist nett von Ihnen" = çok naziksiniz. "Auf Wiedersehen" = hoşça kalın (nazik, resmî veda).',
      },
    ],
  },
  // ─── A2 ───────────────────────────────────────────────────────────────────
  {
    id: 'doktor-randevu',
    level: 'A2',
    title: 'Doktordan Randevu Alma',
    description: 'Telefonla muayenehaneden randevu al.',
    place: 'Doktor muayenehanesi (telefon)',
    steps: [
      {
        type: 'say',
        speaker: 'Sekreter',
        german: 'Praxis Dr. Meier, guten Tag. Wie kann ich Ihnen helfen?',
        turkish: 'Dr. Meier\'in muayenehanesi, iyi günler. Size nasıl yardımcı olabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Randevu almak istediğini, ateşin olduğunu ve dün evde kalmak zorunda kaldığını söyle.',
        german: 'Guten Tag, ich möchte einen Termin machen. Ich habe Fieber und musste gestern zu Hause bleiben.',
        turkish: 'İyi günler, bir randevu almak istiyorum. Ateşim var ve dün evde kalmak zorunda kaldım.',
        wrongOptions: [
          'Guten Tag, ich möchte meinen Termin absagen. Ich bin gesund.',
          'Guten Tag, ich suche eine Wohnung in der Nähe.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Sekreter',
        german: 'Waren Sie schon einmal bei uns in der Praxis?',
        turkish: 'Daha önce muayenehanemize geldiniz mi?',
        prompt: 'Daha önce bu muayenehaneye gelip gelmediğini seç.',
        options: [
          {
            german: 'Ja, ich war letztes Jahr schon einmal bei Ihnen.',
            turkish: 'Evet, geçen yıl bir kez size gelmiştim.',
            responseGerman: 'Gut, dann finde ich Ihre Daten im Computer.',
            responseTurkish: 'İyi, o zaman bilgilerinizi bilgisayarda bulurum.',
          },
          {
            german: 'Nein, ich war noch nie bei Ihnen.',
            turkish: 'Hayır, daha önce hiç gelmedim.',
            responseGerman: 'Dann brauche ich später einige Angaben von Ihnen.',
            responseTurkish: 'O zaman sizden biraz sonra bazı bilgiler almam gerekecek.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Sekreter',
        german: 'Das tut mir leid. Können Sie morgen um neun Uhr kommen?',
        turkish: 'Çok üzüldüm. Yarın saat dokuzda gelebilir misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Yarın sabah olmadığını söyle ve öğleden sonra olup olmayacağını sor.',
        german: 'Morgen früh kann ich leider nicht. Geht es auch am Nachmittag?',
        turkish: 'Yarın sabah maalesef olmuyor. Öğleden sonra da olur mu?',
        wrongOptions: ['Ja, morgen um neun Uhr passt mir sehr gut.', 'Ich muss heute Abend ins Kino gehen.'],
      },
      {
        type: 'say',
        speaker: 'Sekreter',
        german: 'Ja, um vierzehn Uhr ist noch ein Termin frei. Wie ist Ihr Name?',
        turkish: 'Evet, saat on dörtte hâlâ boş bir randevu var. Adınız nedir?',
      },
      {
        type: 'reply',
        prompt: 'Adının Anna Weber olduğunu söyle ve saatin sana uyduğunu belirt.',
        german: 'Mein Name ist Anna Weber. Vierzehn Uhr passt mir gut.',
        turkish: 'Adım Anna Weber. Saat on dört bana uyar.',
        wrongOptions: ['Mein Name ist Dr. Meier. Ich arbeite hier.', 'Ich habe leider keine Zeit am Nachmittag.'],
      },
      {
        type: 'say',
        speaker: 'Sekreter',
        german: 'Bitte bringen Sie Ihre Versichertenkarte mit.',
        turkish: 'Lütfen sigorta kartınızı yanınızda getirin.',
      },
      {
        type: 'reply',
        prompt: 'Kartı getireceğini ve zamanında orada olacağını söyle.',
        german: 'Ja, ich bringe sie mit. Ich werde pünktlich sein. Vielen Dank!',
        turkish: 'Evet, getiririm. Zamanında orada olacağım. Çok teşekkürler!',
        wrongOptions: ['Nein, die Karte bringe ich nicht mit.', 'Ich war gestern pünktlich, danke.'],
      },
    ],
  },
  {
    id: 'ev-gorme',
    level: 'A2',
    title: 'Ev Görmeye Gitme',
    description: 'Kiralık daireyi gez, oda sayısını ve kirayı sor.',
    place: 'Kiralık daire',
    steps: [
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german: 'Guten Tag! Schön, dass Sie da sind. Kommen Sie bitte herein.',
        turkish: 'İyi günler! Geldiğinize sevindim. Lütfen içeri buyurun.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve dairenin kaç odası olduğunu sor.',
        german: 'Vielen Dank. Wie viele Zimmer hat die Wohnung?',
        turkish: 'Çok teşekkürler. Dairenin kaç odası var?',
        wrongOptions: [
          'Vielen Dank. Wie viele Kinder haben Sie?',
          'Vielen Dank. Ich habe die Wohnung gestern verkauft.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Ev sahibi',
        german: 'Gern. Möchten Sie zuerst die Küche oder das Wohnzimmer sehen?',
        turkish: 'Memnuniyetle. Önce mutfağı mı yoksa oturma odasını mı görmek istersiniz?',
        prompt: 'Önce hangi odayı görmek istediğini seç.',
        options: [
          {
            german: 'Ich möchte zuerst die Küche sehen.',
            turkish: 'Önce mutfağı görmek istiyorum.',
            responseGerman: 'Dann kommen Sie mit. Die Küche ist hier links und ganz neu.',
            responseTurkish: 'O zaman gelin. Mutfak burada solda ve tamamen yeni.',
          },
          {
            german: 'Ich möchte zuerst das Wohnzimmer sehen.',
            turkish: 'Önce oturma odasını görmek istiyorum.',
            responseGerman: 'Dann kommen Sie mit. Das Wohnzimmer ist hier rechts und sehr hell.',
            responseTurkish: 'O zaman gelin. Oturma odası burada sağda ve çok aydınlık.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german: 'Die Wohnung hat drei Zimmer, eine Küche und einen kleinen Balkon.',
        turkish: 'Dairede üç oda, bir mutfak ve küçük bir balkon var.',
      },
      {
        type: 'reply',
        prompt: 'Kiranın ne kadar olduğunu ve ek giderlerin dahil olup olmadığını sor.',
        german: 'Wie hoch ist die Miete? Sind die Nebenkosten schon dabei?',
        turkish: 'Kira ne kadar? Ek giderler dahil mi?',
        wrongOptions: ['Ich möchte die Wohnung heute noch kaufen.', 'Wo kann ich hier gut essen gehen?'],
      },
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german:
          'Die Miete beträgt siebenhundertfünfzig Euro. Die Nebenkosten sind nicht dabei, sie kosten hundertzwanzig Euro im Monat.',
        turkish: 'Kira yedi yüz elli euro. Ek giderler dahil değil, ayda yüz yirmi euro tutuyor.',
      },
      {
        type: 'reply',
        prompt: 'Dairenin hoşuna gittiğini ve hafta sonuna kadar düşünmek istediğini söyle.',
        german: 'Die Wohnung gefällt mir sehr. Ich möchte bis zum Wochenende darüber nachdenken.',
        turkish: 'Daire çok hoşuma gitti. Hafta sonuna kadar bunun üzerine düşünmek istiyorum.',
        wrongOptions: [
          'Die Wohnung gefällt mir nicht, aber ich nehme sie sofort.',
          'Ich muss jetzt leider zum Arzt gehen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german: 'Das ist kein Problem. Rufen Sie mich einfach an, wenn Sie sich entschieden haben.',
        turkish: 'Sorun değil. Karar verdiğinizde beni aramanız yeterli.',
      },
      {
        type: 'reply',
        prompt: 'Pazartesi arayacağını söyle ve evi gezdirdiği için teşekkür et.',
        german: 'Gut, ich werde Sie am Montag anrufen. Danke für die Besichtigung!',
        turkish: 'Tamam, pazartesi sizi arayacağım. Evi gezdirdiğiniz için teşekkürler!',
        wrongOptions: ['Ich habe Sie gestern angerufen, aber niemand war da.', 'Ich möchte die Wohnung nicht besichtigen.'],
      },
    ],
  },
  {
    id: 'eczane-ilac',
    level: 'A2',
    title: 'Eczanede İlaç Alma',
    description: 'Şikâyetini anlat, ilacın kullanımını ve fiyatını öğren.',
    place: 'Eczane',
    steps: [
      {
        type: 'say',
        speaker: 'Eczacı',
        german: 'Guten Tag! Wie kann ich Ihnen helfen?',
        turkish: 'İyi günler! Size nasıl yardımcı olabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Üç gündür başının ağrıdığını ve sık sık öksürdüğünü söyle.',
        german: 'Ich habe seit drei Tagen Kopfschmerzen und muss oft husten.',
        turkish: 'Üç gündür başım ağrıyor ve sık sık öksürüyorum.',
        wrongOptions: [
          'Ich habe seit drei Tagen Hunger und möchte ein Brot kaufen.',
          'Ich hatte gestern Kopfschmerzen, aber heute geht es mir wieder gut.',
        ],
      },
      {
        type: 'say',
        speaker: 'Eczacı',
        german: 'Haben Sie auch Fieber? Und nehmen Sie schon andere Medikamente?',
        turkish: 'Ateşiniz de var mı? Ve zaten başka ilaç kullanıyor musunuz?',
      },
      {
        type: 'reply',
        prompt: 'Ateşin olmadığını ve yalnızca yüksek tansiyon için hap kullandığını söyle.',
        german: 'Nein, Fieber habe ich nicht. Ich nehme nur Tabletten gegen hohen Blutdruck.',
        turkish: 'Hayır, ateşim yok. Sadece yüksek tansiyon için hap kullanıyorum.',
        wrongOptions: [
          'Ja, ich habe hohes Fieber und nehme viele andere Medikamente.',
          'Nein, ich möchte nur eine Zahnbürste und eine Zahnpasta kaufen.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Eczacı',
        german: 'Haben Sie eine Allergie gegen Medikamente?',
        turkish: 'İlaçlara karşı alerjiniz var mı?',
        prompt: 'İlaç alerjin olup olmadığını seç.',
        options: [
          {
            german: 'Ja, ich habe eine Allergie gegen Penicillin.',
            turkish: 'Evet, penisiline alerjim var.',
            responseGerman: 'Danke, das ist wichtig. Ich schreibe es auf.',
            responseTurkish: 'Teşekkürler, bu önemli. Not alıyorum.',
          },
          {
            german: 'Nein, ich habe keine Allergie.',
            turkish: 'Hayır, alerjim yok.',
            responseGerman: 'Gut, dann gibt es hier kein Problem.',
            responseTurkish: 'İyi, o zaman bu konuda bir sorun yok.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Eczacı',
        german:
          'Dann empfehle ich Ihnen diese Tabletten. Sie sollten zweimal am Tag eine Tablette nach dem Essen nehmen.',
        turkish: 'O zaman size bu hapları öneririm. Günde iki kez, yemekten sonra birer tablet almalısınız.',
      },
      {
        type: 'reply',
        prompt: 'İlacın yan etkisi olup olmadığını ve reçete gerekip gerekmediğini sor.',
        german: 'Hat das Medikament Nebenwirkungen? Brauche ich dafür ein Rezept?',
        turkish: 'İlacın yan etkileri var mı? Bunun için reçeteye ihtiyacım var mı?',
        wrongOptions: [
          'Kann ich die Tabletten auch morgen im Supermarkt kaufen?',
          'Wo ist die nächste Bushaltestelle? Ich brauche ein Ticket.',
        ],
      },
      {
        type: 'say',
        speaker: 'Eczacı',
        german: 'Nein, ein Rezept brauchen Sie nicht. Das macht zwölf Euro fünfzig. Gute Besserung!',
        turkish: 'Hayır, reçeteye gerek yok. Tutar on iki euro elli. Geçmiş olsun!',
      },
      {
        type: 'reply',
        prompt: 'Hapları alacağını söyle ve kartla ödeyip ödeyemeyeceğini sor.',
        german: 'Gut, dann nehme ich die Tabletten. Kann ich mit Karte bezahlen?',
        turkish: 'Tamam, o zaman hapları alıyorum. Kartla ödeyebilir miyim?',
        wrongOptions: [
          'Nein, danke. Ich möchte lieber ein Rezept vom Arzt holen.',
          'Entschuldigung, ich habe das Geld zu Hause vergessen und muss jetzt gehen.',
        ],
      },
    ],
  },
  {
    id: 'banka-hesap',
    level: 'A2',
    title: 'Bankada Hesap Açma',
    description: 'Yeni bir vadesiz hesap aç, ücretleri ve kartı sor.',
    place: 'Banka',
    steps: [
      {
        type: 'say',
        speaker: 'Banka danışmanı',
        german: 'Guten Morgen! Womit kann ich Ihnen heute helfen?',
        turkish: 'Günaydın! Bugün size nasıl yardımcı olabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Hesap açmak istediğini ve geçen ay Almanya\'ya taşındığını söyle.',
        german: 'Guten Morgen! Ich möchte ein Konto eröffnen. Ich bin letzten Monat nach Deutschland gezogen.',
        turkish: "Günaydın! Bir hesap açmak istiyorum. Geçen ay Almanya'ya taşındım.",
        wrongOptions: [
          'Guten Morgen! Ich möchte Geld wechseln. Ich fahre nächsten Monat nach Spanien.',
          'Guten Morgen! Ich möchte mein Konto schließen. Ich bin letzten Monat ausgezogen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Banka danışmanı',
        german: 'Gern. Haben Sie Ihren Ausweis und eine Meldebescheinigung dabei?',
        turkish: 'Memnuniyetle. Kimliğiniz ve ikametgâh belgeniz yanınızda mı?',
      },
      {
        type: 'reply',
        prompt: 'İkisinin de yanında olduğunu söyle ve belgeleri uzat.',
        german: 'Ja, ich habe beides dabei. Hier sind meine Unterlagen.',
        turkish: 'Evet, ikisi de yanımda. İşte belgelerim.',
        wrongOptions: [
          'Nein, ich habe beides zu Hause gelassen. Ich komme morgen wieder.',
          'Ja, ich habe beides gestern verloren. Hier sind meine Schlüssel.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Banka danışmanı',
        german: 'Möchten Sie die Unterlagen auf Deutsch oder auf Englisch bekommen?',
        turkish: 'Belgeleri Almanca mı yoksa İngilizce mi almak istersiniz?',
        prompt: 'Belgelerin hangi dilde olmasını istediğini seç.',
        options: [
          {
            german: 'Auf Deutsch, bitte. Ich möchte üben.',
            turkish: 'Almanca, lütfen. Pratik yapmak istiyorum.',
            responseGerman: 'Sehr gut. Dann gebe ich Ihnen die deutschen Unterlagen.',
            responseTurkish: 'Çok iyi. O zaman size Almanca belgeleri veririm.',
          },
          {
            german: 'Auf Englisch, bitte. Das ist einfacher für mich.',
            turkish: 'İngilizce, lütfen. Bu benim için daha kolay.',
            responseGerman: 'Kein Problem. Wir haben die Unterlagen auch auf Englisch.',
            responseTurkish: 'Sorun değil. Belgelerimiz İngilizce olarak da var.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Banka danışmanı',
        german: 'Danke. Möchten Sie ein Girokonto mit Bankkarte und Online-Banking?',
        turkish: 'Teşekkürler. Banka kartı ve internet bankacılığı olan bir vadesiz hesap mı istersiniz?',
      },
      {
        type: 'reply',
        prompt: 'Evet istediğini söyle ve hesabın her ay ücretli olup olmadığını sor.',
        german: 'Ja, das möchte ich. Gibt es jeden Monat eine Gebühr für das Konto?',
        turkish: 'Evet, onu istiyorum. Hesap için her ay bir ücret var mı?',
        wrongOptions: [
          'Nein, ich möchte lieber ein Sparbuch für meine Kinder haben.',
          'Ja, das möchte ich. Wann bekomme ich meinen Pass zurück?',
        ],
      },
      {
        type: 'say',
        speaker: 'Banka danışmanı',
        german: 'Das Konto kostet fünf Euro im Monat. Die Karte schicken wir Ihnen in einer Woche per Post.',
        turkish: 'Hesap ayda beş euro tutuyor. Kartı size bir hafta içinde postayla göndereceğiz.',
      },
      {
        type: 'reply',
        prompt: 'Bunun uygun olduğunu söyle ve kart gelene kadar nasıl para çekebileceğini sor.',
        german: 'Das ist in Ordnung. Wie kann ich bis dahin Geld abheben?',
        turkish: 'Bu uygun. O zamana kadar nasıl para çekebilirim?',
        wrongOptions: [
          'Das ist in Ordnung. Ich habe gestern schon Geld abgehoben, danke.',
          'Das ist zu teuer. Ich möchte ein Auto kaufen und bar bezahlen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Banka danışmanı',
        german: 'Am Schalter können Sie Bargeld bekommen, wenn Sie Ihren Ausweis zeigen. Willkommen bei unserer Bank!',
        turkish: 'Kimliğinizi gösterirseniz gişeden nakit alabilirsiniz. Bankamıza hoş geldiniz!',
      },
    ],
  },
  {
    id: 'kayip-esya',
    level: 'A2',
    title: 'Kayıp Eşya Bürosu',
    description: 'Tramvayda unuttuğun çantayı tarif et ve geri almayı ayarla.',
    place: 'Kayıp eşya bürosu (Fundbüro)',
    steps: [
      {
        type: 'say',
        speaker: 'Görevli',
        german: 'Fundbüro, guten Tag. Was haben Sie verloren?',
        turkish: 'Kayıp eşya bürosu, iyi günler. Ne kaybettiniz?',
      },
      {
        type: 'reply',
        prompt: 'Dün tramvayda siyah sırt çantanı unuttuğunu söyle.',
        german: 'Ich habe gestern in der Straßenbahn meinen schwarzen Rucksack vergessen.',
        turkish: 'Dün tramvayda siyah sırt çantamı unuttum.',
        wrongOptions: [
          'Ich habe gestern in der Straßenbahn einen schwarzen Rucksack gefunden.',
          'Ich suche einen Rucksack, den ich morgen im Geschäft kaufen will.',
        ],
      },
      {
        type: 'say',
        speaker: 'Görevli',
        german: 'In welcher Linie waren Sie, und um wie viel Uhr sind Sie ausgestiegen?',
        turkish: 'Hangi hattaydınız ve saat kaçta indiniz?',
      },
      {
        type: 'reply',
        prompt: 'Üç numaralı hatta olduğunu ve yaklaşık on sekizde indiğini söyle.',
        german: 'Ich war in der Linie drei und bin gegen achtzehn Uhr ausgestiegen.',
        turkish: 'Üç numaralı hattaydım ve yaklaşık saat on sekizde indim.',
        wrongOptions: [
          'Ich werde in der Linie drei sein und steige morgen um achtzehn Uhr aus.',
          'Ich bin mit dem Bus gefahren und war um sechs Uhr morgens im Bett.',
        ],
      },
      {
        type: 'say',
        speaker: 'Görevli',
        german: 'Moment, ich schaue nach. Was war im Rucksack?',
        turkish: 'Bir saniye, bakıyorum. Çantanın içinde ne vardı?',
      },
      {
        type: 'reply',
        prompt: 'İçinde bir dizüstü bilgisayar ve mavi bir cüzdan olduğunu söyle.',
        german: 'Darin waren ein Laptop und eine blaue Geldbörse.',
        turkish: 'İçinde bir dizüstü bilgisayar ve mavi bir cüzdan vardı.',
        wrongOptions: [
          'Darin waren ein Apfel und ein roter Regenschirm.',
          'Dort habe ich einen Laptop und eine blaue Geldbörse gekauft.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Görevli',
        german: 'Hat Ihr Rucksack ein besonderes Zeichen, zum Beispiel einen Anhänger?',
        turkish: 'Sırt çantanızın özel bir işareti var mı, örneğin bir süs ya da anahtarlık?',
        prompt: 'Çantanın özel bir işareti olup olmadığını seç.',
        options: [
          {
            german: 'Ja, am Reißverschluss hängt ein roter Anhänger.',
            turkish: 'Evet, fermuarda kırmızı bir süs asılı.',
            responseGerman: 'Das hilft mir. Ich suche nach einem roten Anhänger.',
            responseTurkish: 'Bu bana yardımcı olur. Kırmızı bir süs arıyorum.',
          },
          {
            german: 'Nein, er hat kein besonderes Zeichen.',
            turkish: 'Hayır, özel bir işareti yok.',
            responseGerman: 'Kein Problem. Ich prüfe dann die Beschreibung.',
            responseTurkish: 'Sorun değil. O zaman tarifi kontrol ederim.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Görevli',
        german:
          'Ja, wir haben einen schwarzen Rucksack gefunden. Können Sie mir Ihren Namen und Ihre Telefonnummer sagen?',
        turkish: 'Evet, siyah bir sırt çantası bulduk. Bana adınızı ve telefon numaranızı söyleyebilir misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Memnuniyetle vereceğini söyle ve çantayı bugün alıp alamayacağını sor.',
        german: 'Natürlich, gern. Kann ich den Rucksack noch heute abholen?',
        turkish: 'Tabii, memnuniyetle. Sırt çantasını bugün gelip alabilir miyim?',
        wrongOptions: [
          'Natürlich, gern. Ich habe den Rucksack gestern abgeholt.',
          'Natürlich, gern. Darf ich den Rucksack als Geschenk behalten?',
        ],
      },
      {
        type: 'say',
        speaker: 'Görevli',
        german: 'Ja, wir sind bis siebzehn Uhr geöffnet. Bringen Sie bitte Ihren Ausweis mit.',
        turkish: 'Evet, on yediye kadar açığız. Lütfen kimliğinizi getirin.',
      },
    ],
  },
  {
    id: 'tren-gecikme',
    level: 'A2',
    title: 'Tren Gecikmesi',
    description: 'Tren gecikince aktarmanı kaçır, yeni bir bağlantı bul.',
    place: 'Tren istasyonu bilgi masası',
    steps: [
      {
        type: 'say',
        speaker: 'Bilgi masası',
        german: 'Guten Abend. Kann ich Ihnen helfen?',
        turkish: 'İyi akşamlar. Size yardımcı olabilir miyim?',
      },
      {
        type: 'reply',
        prompt: 'Trenin kırk dakika gecikmeli olduğunu ve aktarma trenini kaçıracağını söyle.',
        german: 'Mein Zug hat vierzig Minuten Verspätung. Ich werde meinen Anschlusszug verpassen.',
        turkish: 'Trenim kırk dakika gecikmeli. Aktarma trenimi kaçıracağım.',
        wrongOptions: [
          'Mein Zug war pünktlich. Ich möchte nur eine Fahrkarte kaufen.',
          'Mein Zug hat einen Fahrplan. Ich werde meinen Koffer verlieren.',
        ],
      },
      {
        type: 'say',
        speaker: 'Bilgi masası',
        german: 'Wohin müssen Sie denn fahren?',
        turkish: 'Peki nereye gitmeniz gerekiyor?',
      },
      {
        type: 'reply',
        prompt: 'Münih\'e gitmen gerektiğini ve yarın sabah önemli bir randevun olduğunu söyle.',
        german: 'Ich muss nach München fahren. Morgen früh habe ich einen wichtigen Termin.',
        turkish: "Münih'e gitmem gerekiyor. Yarın sabah önemli bir randevum var.",
        wrongOptions: [
          'Ich bin gestern nach München gefahren. Heute habe ich keinen Termin.',
          'Ich möchte nach München fahren, aber ich habe keine Lust auf einen Termin.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Bilgi masası',
        german: 'Möchten Sie die Informationen auch per SMS bekommen?',
        turkish: 'Bilgileri SMS ile de almak ister misiniz?',
        prompt: 'Bilgileri SMS ile isteyip istemediğini seç.',
        options: [
          {
            german: 'Ja, bitte. Das ist praktisch.',
            turkish: 'Evet, lütfen. Bu pratik.',
            responseGerman: 'Gern. Ich brauche nur Ihre Handynummer.',
            responseTurkish: 'Memnuniyetle. Yalnızca cep telefonu numaranıza ihtiyacım var.',
          },
          {
            german: 'Nein, danke. Ich schaue auf die Anzeigetafel.',
            turkish: 'Hayır, teşekkürler. Bilgi ekranına bakarım.',
            responseGerman: 'Gut. Die Anzeigetafel ist dort drüben.',
            responseTurkish: 'İyi. Bilgi ekranı şurada.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Bilgi masası',
        german: 'Es gibt einen Zug um einundzwanzig Uhr zehn. Sie müssen in Nürnberg umsteigen.',
        turkish: "Saat 21.10'da bir tren var. Nürnberg'de aktarma yapmanız gerekiyor.",
      },
      {
        type: 'reply',
        prompt: 'Bu trene biletinle binip binemeyeceğini ve ekstra ödeme gerekip gerekmediğini sor.',
        german: 'Kann ich mit meiner Fahrkarte in diesem Zug fahren? Muss ich extra bezahlen?',
        turkish: 'Biletimle bu trene binebilir miyim? Ekstra ödeme yapmam gerekir mi?',
        wrongOptions: [
          'Wo ist das Gleis für den Bus? Ich habe keine Fahrkarte gekauft.',
          'Darf ich meine Fahrkarte zurückgeben? Ich möchte lieber zu Fuß gehen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Bilgi masası',
        german:
          'Ja, wegen der Verspätung gilt Ihre Fahrkarte auch in diesem Zug. Sie müssen nichts zahlen. Gleis sieben, bitte.',
        turkish:
          'Evet, gecikme nedeniyle biletiniz bu trende de geçerli. Hiçbir şey ödemenize gerek yok. Yedinci peron, lütfen.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve yedinci perona nasıl gidebileceğini sor.',
        german: 'Vielen Dank für Ihre Hilfe. Wie komme ich zu Gleis sieben?',
        turkish: 'Yardımınız için çok teşekkürler. Yedinci perona nasıl gidebilirim?',
        wrongOptions: [
          'Vielen Dank. Ich bin gestern schon zu Gleis sieben gegangen.',
          'Vielen Dank, aber ich bleibe lieber hier und warte bis morgen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Bilgi masası',
        german: 'Gehen Sie die Treppe hinunter und dann links. Gute Reise!',
        turkish: 'Merdivenlerden aşağı inin, sonra sola gidin. İyi yolculuklar!',
      },
    ],
  },
  {
    id: 'restoran-sikayet',
    level: 'A2',
    title: 'Restoranda Şikâyet',
    description: 'Soğuk gelen yemek için nazikçe şikâyet et.',
    place: 'Restoran',
    steps: [
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Guten Abend! Schmeckt Ihnen das Essen?',
        turkish: 'İyi akşamlar! Yemek lezzetli mi?',
      },
      {
        type: 'reply',
        prompt: 'Çorbanın soğuk olduğunu ve onu yirmi dakika beklediğini söyle.',
        german: 'Leider nicht. Die Suppe ist kalt, und ich habe schon zwanzig Minuten darauf gewartet.',
        turkish: 'Maalesef değil. Çorba soğuk ve onu yirmi dakikadır bekliyordum.',
        wrongOptions: [
          'Ja, die Suppe ist sehr lecker. Ich möchte noch eine Portion.',
          'Leider nicht. Ich habe die Suppe gestern zu heiß gekocht.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Garson',
        german: 'Moment, möchten Sie lieber an einem anderen Tisch sitzen? Hier ist es etwas kühl.',
        turkish: 'Bir dakika, başka bir masada oturmak ister misiniz? Burası biraz serin.',
        prompt: 'Masa değiştirip değiştirmeyeceğini seç.',
        options: [
          {
            german: 'Ja, bitte. Hier ist es mir zu kühl.',
            turkish: 'Evet, lütfen. Burası bana fazla serin.',
            responseGerman: 'Natürlich. Der Tisch am Fenster ist frei.',
            responseTurkish: 'Tabii. Pencere kenarındaki masa boş.',
          },
          {
            german: 'Nein, danke. Ich bleibe hier.',
            turkish: 'Hayır, teşekkürler. Burada kalıyorum.',
            responseGerman: 'Gut. Dann bleiben Sie bitte hier.',
            responseTurkish: 'İyi. O zaman lütfen burada kalın.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Das tut mir wirklich leid. Soll ich die Suppe in die Küche zurückbringen?',
        turkish: 'Gerçekten çok üzgünüm. Çorbayı mutfağa geri götüreyim mi?',
      },
      {
        type: 'reply',
        prompt: 'Yeni bir çorba istediğini ve içeceğin de hâlâ gelmediğini söyle.',
        german: 'Ja, bitte bringen Sie mir eine neue Suppe. Mein Getränk ist übrigens auch noch nicht gekommen.',
        turkish: 'Evet, lütfen bana yeni bir çorba getirin. Bu arada içeceğim de hâlâ gelmedi.',
        wrongOptions: [
          'Nein, bitte nicht. Ich habe mein Getränk gestern schon bekommen.',
          'Ja, bitte bringen Sie mir die Rechnung. Das Getränk ist übrigens sehr lecker.',
        ],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Natürlich, sofort. Als Entschuldigung bekommen Sie das Getränk von uns.',
        turkish: 'Elbette, hemen. Özür olarak içecek bizden.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve vejetaryen olduğunu, et yemediğini hatırlat.',
        german: 'Das ist nett, danke. Ich bin Vegetarier und esse kein Fleisch.',
        turkish: 'Bu çok nazik, teşekkürler. Ben vejetaryenim ve et yemiyorum.',
        wrongOptions: [
          'Das ist nett, danke. Ich bin Vegetarier und esse am liebsten Fleisch.',
          'Das ist nicht nett. Ich bezahle das Getränk auf keinen Fall.',
        ],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Oh, Entschuldigung! Ich habe Hähnchen aufgeschrieben. Ich bringe Ihnen stattdessen eine Gemüsepfanne.',
        turkish: 'Ah, pardon! Tavuk yazmışım. Onun yerine size sebze sote getireyim.',
      },
      {
        type: 'reply',
        prompt: 'Bunun iyi olduğunu söyle ve bu sefer yemeğin sıcak gelmesini rica et.',
        german: 'Das ist gut. Aber bitte bringen Sie das Essen diesmal warm.',
        turkish: 'Bu iyi. Ama lütfen bu sefer yemeği sıcak getirin.',
        wrongOptions: [
          'Das ist schlecht. Ich möchte doch das Hähnchen essen.',
          'Das ist gut. Aber bitte bringen Sie mir nur die Rechnung, ich habe keinen Hunger mehr.',
        ],
      },
      {
        type: 'say',
        speaker: 'Garson',
        german: 'Selbstverständlich. Es dauert nur zehn Minuten. Danke für Ihre Geduld.',
        turkish: 'Elbette. Yalnızca on dakika sürer. Sabrınız için teşekkürler.',
      },
    ],
  },
  {
    id: 'kurs-kayit',
    level: 'A2',
    title: 'Kurs Kaydı',
    description: 'Akşam Almanca kursuna kaydol, saat ve ücreti öğren.',
    place: 'Dil okulu',
    steps: [
      {
        type: 'say',
        speaker: 'Okul danışması',
        german: 'Guten Tag! Möchten Sie sich für einen Kurs anmelden?',
        turkish: 'İyi günler! Bir kursa kaydolmak ister misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Akşam bir Almanca kursu aradığını ve gündüzleri çalıştığını söyle.',
        german: 'Ja, ich suche einen Deutschkurs am Abend, denn tagsüber muss ich arbeiten.',
        turkish: 'Evet, akşam saatlerinde bir Almanca kursu arıyorum, çünkü gündüzleri çalışmam gerekiyor.',
        wrongOptions: [
          'Nein, ich möchte keinen Kurs, ich spreche schon perfekt Deutsch.',
          'Ja, ich suche einen Kochkurs am Morgen, denn ich habe tagsüber frei.',
        ],
      },
      {
        type: 'say',
        speaker: 'Okul danışması',
        german: 'Welches Niveau haben Sie? Haben Sie schon einmal Deutsch gelernt?',
        turkish: 'Hangi seviyedesiniz? Daha önce hiç Almanca öğrendiniz mi?',
      },
      {
        type: 'reply',
        prompt: 'Bir yıl önce A1 kursunu yaptığını ve şimdi A2\'ye başlamak istediğini söyle.',
        german: 'Ich habe vor einem Jahr den A1-Kurs gemacht. Jetzt möchte ich mit A2 anfangen.',
        turkish: "Bir yıl önce A1 kursunu yaptım. Şimdi A2'ye başlamak istiyorum.",
        wrongOptions: [
          'Ich habe noch nie Deutsch gelernt. Ich möchte sofort mit B2 anfangen.',
          'Ich habe vor einem Jahr den A1-Kurs gemacht. Jetzt möchte ich aufhören.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Okul danışması',
        german: 'Möchten Sie lieber in einer kleinen oder in einer großen Gruppe lernen?',
        turkish: 'Küçük bir grupta mı yoksa büyük bir grupta mı öğrenmeyi tercih edersiniz?',
        prompt: 'Grup büyüklüğü tercihini seç.',
        options: [
          {
            german: 'In einer kleinen Gruppe. Dann kann ich mehr sprechen.',
            turkish: 'Küçük bir grupta. O zaman daha çok konuşabilirim.',
            responseGerman: 'Gut. Unsere Gruppen haben höchstens zwölf Teilnehmer.',
            responseTurkish: 'İyi. Gruplarımızda en fazla on iki katılımcı var.',
          },
          {
            german: 'Das ist mir egal.',
            turkish: 'Fark etmez.',
            responseGerman: 'Kein Problem. Dann passt jeder Kurs zu Ihnen.',
            responseTurkish: 'Sorun değil. O zaman her kurs size uyar.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Okul danışması',
        german:
          'Der A2-Kurs findet montags und mittwochs von achtzehn bis zwanzig Uhr statt. Er beginnt am ersten Oktober.',
        turkish: "A2 kursu pazartesi ve çarşamba günleri on sekizden yirmiye kadar yapılıyor. Bir Ekim'de başlıyor.",
      },
      {
        type: 'reply',
        prompt: 'Saatlerin uygun olduğunu söyle ve kursun ücretini ile kitabın dahil olup olmadığını sor.',
        german: 'Die Zeiten passen mir gut. Was kostet der Kurs, und ist das Buch schon dabei?',
        turkish: 'Saatler bana uyuyor. Kurs ne kadar, kitap dahil mi?',
        wrongOptions: [
          'Die Zeiten passen mir nicht. Was kostet das Buch, und ist der Kurs schon dabei?',
          'Die Zeiten passen mir gut. Wo ist die Toilette, und wann gibt es Mittagessen?',
        ],
      },
      {
        type: 'say',
        speaker: 'Okul danışması',
        german: 'Der Kurs kostet zweihundertvierzig Euro. Das Buch müssen Sie leider selbst kaufen.',
        turkish: 'Kurs iki yüz kırk euro. Kitabı maalesef kendiniz almalısınız.',
      },
      {
        type: 'reply',
        prompt: 'Kaydolmak istediğini söyle ve hangi formu doldurman gerektiğini sor.',
        german: 'Gut, ich möchte mich anmelden. Welches Formular muss ich ausfüllen?',
        turkish: 'Tamam, kayıt olmak istiyorum. Hangi formu doldurmam gerekiyor?',
        wrongOptions: [
          'Gut, ich möchte mich abmelden. Welches Formular habe ich ausgefüllt?',
          'Gut, ich habe mich schon angemeldet. Ich brauche kein Formular.',
        ],
      },
      {
        type: 'say',
        speaker: 'Okul danışması',
        german: 'Dieses hier. Bitte schreiben Sie Ihren Namen und Ihre Adresse darauf.',
        turkish: 'Şu burada. Lütfen üzerine adınızı ve adresinizi yazın.',
      },
    ],
  },
  {
    id: 'tasinma-gunu',
    level: 'A2',
    title: 'Taşınma Günü',
    description: 'Yeni komşunla tanış, koltuğu taşımak için yardım iste.',
    place: 'Apartman merdiveni',
    steps: [
      {
        type: 'say',
        speaker: 'Komşu',
        german: 'Hallo! Sind Sie neu hier? Ich wohne im zweiten Stock.',
        turkish: 'Merhaba! Buraya yeni mi taşındınız? Ben ikinci katta oturuyorum.',
      },
      {
        type: 'reply',
        prompt: 'Bugün taşındığını söyle ve kendini tanıt.',
        german: 'Ja, ich bin heute eingezogen. Mein Name ist Ali Yılmaz. Freut mich!',
        turkish: 'Evet, bugün taşındım. Adım Ali Yılmaz. Memnun oldum!',
        wrongOptions: [
          'Nein, ich wohne schon seit zehn Jahren hier. Wie heißen Sie?',
          'Ja, ich ziehe morgen aus. Mein Name ist Ali Yılmaz, tschüss!',
        ],
      },
      {
        type: 'say',
        speaker: 'Komşu',
        german: 'Freut mich auch! Brauchen Sie Hilfe? Das Sofa passt leider nicht durch die Tür.',
        turkish: 'Ben de memnun oldum! Yardıma ihtiyacınız var mı? Koltuk maalesef kapıdan sığmıyor.',
      },
      {
        type: 'reply',
        prompt: 'Yardımı kabul et ve koltuğu birlikte taşıyıp taşıyamayacağınızı sor.',
        german: 'Ja, gern! Können wir das Sofa zusammen tragen? Es ist ziemlich schwer.',
        turkish: 'Evet, memnuniyetle! Koltuğu birlikte taşıyabilir miyiz? Oldukça ağır.',
        wrongOptions: [
          'Nein, danke. Ich brauche keine Hilfe, ich bin gestern schon fertig geworden.',
          'Ja, gern! Können wir das Sofa zusammen kaufen? Es ist ziemlich billig.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Komşu',
        german: 'Soll ich noch meinen Mann holen? Zu dritt geht es leichter.',
        turkish: 'Eşimi de çağırayım mı? Üç kişi olunca daha kolay olur.',
        prompt: 'Yardım için bir kişi daha çağrılsın mı, seç.',
        options: [
          {
            german: 'Ja, bitte. Das ist eine gute Idee.',
            turkish: 'Evet, lütfen. Bu iyi bir fikir.',
            responseGerman: 'Gut, ich hole ihn schnell. Dann kann es losgehen.',
            responseTurkish: 'Tamam, hemen onu çağırırım. O zaman başlayabiliriz.',
          },
          {
            german: 'Nein, danke. Zu zweit schaffen wir das.',
            turkish: 'Hayır, teşekkürler. İkimiz bunu başarırız.',
            responseGerman: 'Gut, dann fangen wir gleich an.',
            responseTurkish: 'Tamam, o zaman hemen başlayalım.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Komşu',
        german: 'Klar. Stellen wir es erst einmal in den Flur. Wo soll es später stehen?',
        turkish: 'Tabii. Önce koridora koyalım. Daha sonra nerede durmalı?',
      },
      {
        type: 'reply',
        prompt: 'Oturma odasında, pencerenin yanında durmalı de ve sonra bir kahve içmeyi öner.',
        german: 'Im Wohnzimmer, neben dem Fenster. Danach können wir einen Kaffee trinken.',
        turkish: 'Oturma odasında, pencerenin yanında. Sonra bir kahve içebiliriz.',
        wrongOptions: [
          'Im Badezimmer, neben der Waschmaschine. Danach muss ich sofort weiterarbeiten.',
          'In der Küche, auf dem Balkon. Danach möchte ich lieber allein sein.',
        ],
      },
      {
        type: 'say',
        speaker: 'Komşu',
        german: 'Gern! Übrigens, am Freitag ist Hausversammlung. Haben Sie schon die Hausordnung bekommen?',
        turkish: 'Memnuniyetle! Bu arada cuma günü apartman toplantısı var. Ev düzeni kurallarını aldınız mı?',
      },
      {
        type: 'reply',
        prompt: 'Henüz almadığını söyle ve onu komşudan alıp alamayacağını sor.',
        german: 'Nein, die habe ich noch nicht bekommen. Kann ich sie vielleicht von Ihnen haben?',
        turkish: 'Hayır, henüz almadım. Belki sizden alabilir miyim?',
        wrongOptions: [
          'Ja, die habe ich schon gelesen. Ich kenne alle Regeln.',
          'Nein, ich möchte am Freitag lieber im Garten arbeiten.',
        ],
      },
      {
        type: 'say',
        speaker: 'Komşu',
        german: 'Ich bringe sie Ihnen heute Abend vorbei. Willkommen im Haus!',
        turkish: 'Bu akşam size getiririm. Eve hoş geldiniz!',
      },
    ],
  },
  {
    id: 'is-randevusu',
    level: 'A2',
    title: 'İş İçin Randevu Alma',
    description: 'İlan için telefonla ara, deneyimini anlat, görüşme günü belirle.',
    place: 'Telefon görüşmesi',
    steps: [
      {
        type: 'say',
        speaker: 'Şirket asistanı',
        german: 'Firma Schneider, guten Tag. Sie sprechen mit Frau Keller.',
        turkish: 'Schneider Şirketi, iyi günler. Frau Keller konuşuyor.',
      },
      {
        type: 'reply',
        prompt: 'Kendini tanıt, ilanı internette okuduğunu ve satış pozisyonuyla ilgilendiğini söyle.',
        german:
          'Guten Tag, hier ist Ali Yılmaz. Ich habe Ihre Anzeige im Internet gelesen und interessiere mich für die Stelle im Verkauf.',
        turkish:
          'İyi günler, ben Ali Yılmaz. İlanınızı internette okudum ve satış pozisyonuyla ilgileniyorum.',
        wrongOptions: [
          'Guten Tag, hier ist Ali Yılmaz. Ich habe Ihre Anzeige gestern geschrieben und suche einen Mitarbeiter.',
          'Guten Tag, hier ist Ali Yılmaz. Ich möchte eine Bestellung für Montag aufgeben.',
        ],
      },
      {
        type: 'say',
        speaker: 'Şirket asistanı',
        german: 'Schön! Haben Sie schon Erfahrung im Verkauf?',
        turkish: 'Güzel! Satışta daha önce deneyiminiz oldu mu?',
      },
      {
        type: 'reply',
        prompt: 'İki yıl bir süpermarkette çalıştığını ve müşterilerle konuşmayı sevdiğini söyle.',
        german: 'Ja, ich habe zwei Jahre in einem Supermarkt gearbeitet. Ich spreche gern mit Kunden.',
        turkish: 'Evet, iki yıl bir süpermarkette çalıştım. Müşterilerle konuşmayı severim.',
        wrongOptions: [
          'Ja, ich habe zwei Jahre in einem Krankenhaus gearbeitet. Ich mag keine Kunden.',
          'Nein, ich habe noch nie gearbeitet und möchte auch nicht arbeiten.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Şirket asistanı',
        german: 'Sprechen Sie noch andere Sprachen außer Deutsch?',
        turkish: 'Almancanın dışında başka diller de konuşuyor musunuz?',
        prompt: 'Hangi dilleri konuştuğunu seç.',
        options: [
          {
            german: 'Ja, ich spreche Türkisch und ein bisschen Englisch.',
            turkish: 'Evet, Türkçe ve biraz İngilizce konuşuyorum.',
            responseGerman: 'Das ist sehr gut für unsere Kunden.',
            responseTurkish: 'Bu müşterilerimiz için çok iyi.',
          },
          {
            german: 'Ich spreche nur Deutsch und Türkisch.',
            turkish: 'Yalnızca Almanca ve Türkçe konuşuyorum.',
            responseGerman: 'Das reicht für die Stelle auch aus.',
            responseTurkish: 'Bu pozisyon için o da yeterli.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Şirket asistanı',
        german: 'Gut. Können Sie nächste Woche zu einem Gespräch kommen? Am Dienstag oder am Donnerstag?',
        turkish: 'İyi. Gelecek hafta bir görüşmeye gelebilir misiniz? Salı mı yoksa perşembe mi?',
      },
      {
        type: 'reply',
        prompt: 'Salı günü kursun olduğunu, perşembe öğleden sonra gelebileceğini söyle.',
        german: 'Am Dienstag habe ich leider einen Kurs. Am Donnerstagnachmittag kann ich kommen.',
        turkish: 'Salı günü maalesef kursum var. Perşembe öğleden sonra gelebilirim.',
        wrongOptions: [
          'Am Donnerstag habe ich leider einen Kurs. Am Dienstag kann ich nicht kommen.',
          'Am Dienstag und am Donnerstag möchte ich keinen Termin haben.',
        ],
      },
      {
        type: 'say',
        speaker: 'Şirket asistanı',
        german: 'Donnerstag um fünfzehn Uhr passt gut. Bitte bringen Sie Ihren Lebenslauf mit.',
        turkish: 'Perşembe saat on beş iyi. Lütfen özgeçmişinizi getirin.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et, özgeçmişi getireceğini söyle ve ofisin tam yerini sor.',
        german: 'Danke schön. Ich bringe meinen Lebenslauf mit. Wo genau finde ich Ihr Büro?',
        turkish: 'Teşekkür ederim. Özgeçmişimi getireceğim. Ofisinizi tam olarak nerede bulabilirim?',
        wrongOptions: [
          'Danke schön. Ich habe meinen Lebenslauf zu Hause vergessen und komme nicht.',
          'Danke schön. Ich möchte lieber eine neue Arbeit im Büro suchen und gehen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Şirket asistanı',
        german: 'Wir sind in der Hauptstraße 12, im dritten Stock. Bis Donnerstag, Herr Yılmaz!',
        turkish: "Hauptstraße 12'deyiz, üçüncü kat. Perşembeye kadar, Herr Yılmaz!",
      },
    ],
  },

  {
    id: 'arkadasla-sohbet',
    level: 'A2',
    title: 'Arkadaşla Hafta Sonu Sohbeti',
    description: 'Hafta sonunu anlat ve birlikte sinemaya gitmeyi planla.',
    place: 'Kafe',
    steps: [
      {
        type: 'say',
        speaker: 'Lena',
        german: 'Hallo, Deniz! Wie war dein Wochenende?',
        turkish: 'Merhaba Deniz! Hafta sonun nasıldı?',
      },
      {
        type: 'reply',
        prompt: 'Hafta sonunun güzel geçtiğini ve arkadaşlarınla parkta olduğunu söyle.',
        german: 'Es war schön. Ich war mit Freunden im Park.',
        turkish: 'Güzeldi. Arkadaşlarımla parktaydım.',
        wrongOptions: ['Es war schön. Ich bin mit Freunden im Park.', 'Es war schön. Ich arbeite morgen im Park.'],
        wrongTurkish: ['Güzeldi. Arkadaşlarımla parktayım. (zaman uyumsuz)', 'Güzeldi. Yarın parkta çalışıyorum.'],
        wrongNotes: [
          'Hafta sonu geçti; "ich bin" şimdiki zamandır. Geçmiş için "ich war" kullanılır.',
          'Geçmişte nerede olduğunu anlatacaktın; "morgen" (yarın) geleceği anlatır.',
        ],
        note: '"Wie war ...?" geçmişi sorar; cevap da geçmişte olur: "Es war ...", "Ich war ...".',
      },
      {
        type: 'say',
        speaker: 'Lena',
        german: 'Schön! Was habt ihr dort gemacht?',
        turkish: 'Güzel! Orada ne yaptınız?',
      },
      {
        type: 'reply',
        prompt: 'Futbol oynadığınızı ve sonra dondurma yediğinizi söyle.',
        german: 'Wir haben Fußball gespielt und danach Eis gegessen.',
        turkish: 'Futbol oynadık ve ardından dondurma yedik.',
        wrongOptions: [
          'Wir haben Fußball spielen und danach Eis gegessen.',
          'Wir sind Fußball gespielt und danach Eis gegessen.',
        ],
        wrongTurkish: [
          'Futbol oynadık ve ardından dondurma yedik. (hatalı biçim)',
          'Futbol oynadık ve ardından dondurma yedik. (hatalı yardımcı fiil)',
        ],
        wrongNotes: [
          'Perfekt\'te fiil sonda Partizip II olur: "gespielt", "spielen" değil.',
          '"spielen" ve "essen" haben ile kurulur; "sind" yanlış yardımcı fiildir.',
        ],
        note: 'Perfekt: haben + Partizip II (en sonda). spielen → gespielt, essen → gegessen.',
      },
      {
        type: 'choice',
        speaker: 'Lena',
        german: 'Und wie war das Wetter bei euch?',
        turkish: 'Peki sizde hava nasıldı?',
        prompt: 'Havanın nasıl olduğunu anlat.',
        options: [
          {
            german: 'Es war sonnig. Wir hatten viel Glück.',
            turkish: 'Hava güneşliydi. Çok şanslıydık.',
            responseGerman: 'Wie schön! Bei mir hat es leider geregnet.',
            responseTurkish: 'Ne güzel! Benim tarafta ne yazık ki yağmur yağdı.',
          },
          {
            german: 'Es hat ein bisschen geregnet.',
            turkish: 'Biraz yağmur yağdı.',
            responseGerman: 'Oh, schade! Bei mir war es zum Glück sonnig.',
            responseTurkish: 'Ah, yazık! Benim tarafta neyse ki hava güneşliydi.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Lena',
        german: 'Das klingt toll! Hast du am Samstag schon etwas vor?',
        turkish: 'Harika! Cumartesi için bir planın var mı?',
      },
      {
        type: 'reply',
        prompt: 'Henüz planın olmadığını söyle ve sinemaya gitmek ister mi diye sor.',
        german: 'Nein, noch nicht. Hast du Lust, ins Kino zu gehen?',
        turkish: 'Hayır, henüz yok. Sinemaya gitmek ister misin?',
        wrongOptions: [
          'Nein, noch nicht. Hast du Lust, ins Kino gehen?',
          'Ja, ich habe heute schon Kino gesehen.',
        ],
        wrongTurkish: [
          'Hayır, henüz yok. Sinemaya gitmek ister misin? (hatalı kalıp)',
          'Evet, bugün zaten sinemada bir şey izledim.',
        ],
        wrongNotes: [
          '"Lust haben" kalıbından sonra "zu + mastar" gerekir: "..., ins Kino zu gehen".',
          'Planın olmadığını söyleyecektin; "Ja" bunun tersini söylüyor.',
        ],
        note: '"Lust haben, ... zu + mastar" = ...-mek istemek. "ins Kino" = sinemaya (in das → ins).',
      },
      {
        type: 'say',
        speaker: 'Lena',
        german: 'Gern! Welcher Film läuft denn?',
        turkish: 'Memnuniyetle! Peki hangi film oynuyor?',
      },
      {
        type: 'reply',
        prompt: 'Bir komedi olduğunu ve saat 19.00\'da başladığını söyle.',
        german: 'Es ist eine Komödie. Sie fängt um neunzehn Uhr an.',
        turkish: 'Bir komedi. Saat 19.00\'da başlıyor.',
        wrongOptions: [
          'Es ist ein Komödie. Er fängt um neunzehn Uhr an.',
          'Es ist eine Komödie. Sie fängt um neunzehn Uhr aus.',
        ],
        wrongTurkish: [
          'Bir komedi. Saat 19.00\'da başlıyor. (hatalı artikel)',
          'Bir komedi. Saat 19.00\'da başlıyor. (hatalı ayrılabilir fiil)',
        ],
        wrongNotes: [
          '"Komödie" dişildir: "eine Komödie", zamir de "sie".',
          '"anfangen" ayrılabilir fiildir; ön eki "an" cümle sonunda kalır: "fängt ... an".',
        ],
        note: '"anfangen" = başlamak (ayrılabilir): "Der Film fängt um 19 Uhr an."',
      },
      {
        type: 'say',
        speaker: 'Lena',
        german: 'Perfekt! Treffen wir uns um halb sieben vor dem Kino?',
        turkish: 'Mükemmel! Altı buçukta sinemanın önünde buluşalım mı?',
      },
      {
        type: 'reply',
        prompt: 'Kabul et ve sabırsızlandığını söyle.',
        german: 'Ja, gern. Ich freue mich schon darauf!',
        turkish: 'Evet, memnuniyetle. Şimdiden sabırsızlanıyorum!',
        wrongOptions: ['Nein, ich habe keine Lust. Ich freue mich darauf.', 'Ja, gern. Ich freue mich auf gestern.'],
        wrongTurkish: ['Hayır, canım istemiyor. Sabırsızlanıyorum.', 'Evet, memnuniyetle. Dünü iple çekiyorum.'],
        wrongNotes: [
          'İki cümle birbiriyle çelişiyor: önce reddediyor, sonra sabırsızlanıyor.',
          '"sich freuen auf" gelecekteki şey için kullanılır; "gestern" (dün) geçmiştir.',
        ],
        note: '"sich freuen auf + Akkusativ" = (gelecekteki) bir şeyi iple çekmek.',
      },
      {
        type: 'say',
        speaker: 'Lena',
        german: 'Ich auch! Bis Samstag!',
        turkish: 'Ben de! Cumartesi görüşürüz!',
      },
    ],
  },
  {
    id: 'randevu-erteleme',
    level: 'A2',
    title: 'Randevuyu Erteleme',
    description: 'Kuaför randevunu ertele, sebebini söyle ve yeni bir gün belirle.',
    place: 'Kuaför (telefon)',
    steps: [
      {
        type: 'say',
        speaker: 'Frau Keller',
        german: 'Friseursalon Keller, guten Tag. Was kann ich für Sie tun?',
        turkish: 'Keller Kuaför, iyi günler. Sizin için ne yapabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Cuma günü randevun olduğunu ama onu ertelemek istediğini söyle.',
        german: 'Guten Tag. Ich habe am Freitag einen Termin, aber ich möchte ihn verschieben.',
        turkish: 'İyi günler. Cuma günü randevum var ama onu ertelemek istiyorum.',
        wrongOptions: [
          'Guten Tag. Ich habe am Freitag einen Termin und möchte ihn absagen.',
          'Guten Tag. Ich war am Freitag bei Ihnen und möchte danke sagen.',
        ],
        wrongTurkish: [
          'İyi günler. Cuma günü randevum var ve onu iptal etmek istiyorum.',
          'İyi günler. Cuma günü sizdeydim ve teşekkür etmek istiyorum.',
        ],
        wrongNotes: [
          '"absagen" randevuyu tamamen iptal etmektir; erteleme için "verschieben" denir.',
          'Randevunu ertelemek istiyorsun; teşekkür etmek değil.',
        ],
        note: '"einen Termin verschieben" = randevuyu ertelemek. "ihn" burada "der Termin" yerine geçer (Akkusativ).',
      },
      {
        type: 'say',
        speaker: 'Frau Keller',
        german: 'Das ist kein Problem. Unter welchem Namen ist der Termin?',
        turkish: 'Sorun değil. Randevu hangi isimle?',
      },
      {
        type: 'reply',
        prompt: 'Randevunun Selin Kaya adına ve cuma günü saat on beşte olduğunu söyle.',
        german: 'Unter Selin Kaya, am Freitag um fünfzehn Uhr.',
        turkish: 'Selin Kaya adına, cuma günü saat on beşte.',
        wrongOptions: [
          'Unter Selin Kaya, am Montag um zehn Uhr.',
          'Ich habe keinen Namen, aber einen Termin.',
        ],
        wrongTurkish: [
          'Selin Kaya adına, pazartesi günü saat onda.',
          'Adım yok ama bir randevum var.',
        ],
        wrongNotes: [
          'Randevun cuma günü saat on beşte; farklı bir gün ve saat söyledin.',
          'Randevunun hangi adla alındığını söylemen gerekiyordu.',
        ],
        note: '"Unter ..." randevunun hangi adla alındığını söyler. Gün için "am", saat için "um" kullanılır.',
      },
      {
        type: 'say',
        speaker: 'Frau Keller',
        german: 'Gut, ich sehe Ihren Termin. Warum können Sie nicht kommen?',
        turkish: 'Tamam, randevunuzu görüyorum. Neden gelemiyorsunuz?',
      },
      {
        type: 'reply',
        prompt: 'Cuma günü işte toplantın olduğunu, bu yüzden gelemediğini söyle (deshalb).',
        german: 'Ich habe am Freitag eine Besprechung bei der Arbeit, deshalb kann ich nicht kommen.',
        turkish: 'Cuma günü işte bir toplantım var, bu yüzden gelemiyorum.',
        wrongOptions: [
          'Ich habe am Freitag eine Besprechung bei der Arbeit, weil ich kommen möchte.',
          'Ich war am Freitag krank, deshalb kann ich nicht kommen.',
        ],
        wrongTurkish: [
          'Cuma günü işte bir toplantım var, çünkü gelmek istiyorum.',
          'Cuma günü hastaydım, bu yüzden gelemiyorum.',
        ],
        wrongNotes: [
          'Gerekçe tutmuyor: toplantın olduğu için gelemiyorsun, gelmek istediğin için değil.',
          'Randevu cuma günü ve henüz gelmedi; "war" (idi) geçmişi anlatıyor, oysa toplantın cuma günü.',
        ],
        note: '"deshalb" = bu yüzden. Ardından fiil hemen ikinci sırada gelir: "deshalb kann ich nicht kommen".',
      },
      {
        type: 'choice',
        speaker: 'Frau Keller',
        german: 'Möchten Sie lieber am Vormittag oder am Nachmittag kommen?',
        turkish: 'Sabah mı yoksa öğleden sonra mı gelmek istersiniz?',
        prompt: 'Yeni randevu için sabahı mı öğleden sonrayı mı tercih ettiğini seç.',
        options: [
          {
            german: 'Am Vormittag passt mir besser.',
            turkish: 'Sabah bana daha uygun.',
            responseGerman: 'Dann habe ich nächsten Dienstag um zehn Uhr einen Termin frei.',
            responseTurkish: 'O zaman gelecek salı saat onda boş bir randevum var.',
          },
          {
            german: 'Am Nachmittag passt mir besser.',
            turkish: 'Öğleden sonra bana daha uygun.',
            responseGerman: 'Dann habe ich nächsten Dienstag um vierzehn Uhr einen Termin frei.',
            responseTurkish: 'O zaman gelecek salı saat on dörtte boş bir randevum var.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Frau Keller',
        german: 'Soll ich den Termin für Sie eintragen?',
        turkish: 'Randevuyu sizin için yazayım mı?',
      },
      {
        type: 'reply',
        prompt: 'Salı gününün uygun olduğunu söyle ve randevuyu yazmasını iste.',
        german: 'Dienstag passt mir gut. Ja, bitte tragen Sie den Termin ein.',
        turkish: 'Salı bana uyuyor. Evet, lütfen randevuyu yazın.',
        wrongOptions: [
          'Dienstag passt mir nicht. Nein, danke.',
          'Freitag passt mir gut. Ja, bitte tragen Sie den Termin ein.',
        ],
        wrongTurkish: [
          'Salı bana uymuyor. Hayır, teşekkürler.',
          'Cuma bana uyuyor. Evet, lütfen randevuyu yazın.',
        ],
        wrongNotes: [
          'Yeni randevuyu kabul edecektin; bu cevap teklifi reddediyor.',
          'Cuma günü gelemiyorsun; teklif edilen gün salı.',
        ],
        note: '"eintragen" ayrılabilen fiildir: "Tragen Sie den Termin ein." Nazik rica için "bitte" eklenir.',
      },
      {
        type: 'say',
        speaker: 'Frau Keller',
        german: 'Gut, der Termin ist verschoben. Bitte rufen Sie rechtzeitig an, wenn Sie wieder nicht kommen können.',
        turkish: 'Tamam, randevu ertelendi. Tekrar gelemezseniz lütfen zamanında arayın.',
      },
      {
        type: 'reply',
        prompt: 'Zahmet için özür dile, teşekkür et ve telefonda vedalaş.',
        german: 'Entschuldigen Sie die Umstände und vielen Dank. Auf Wiederhören!',
        turkish: 'Zahmet için özür dilerim ve çok teşekkürler. Görüşmek üzere!',
        wrongOptions: [
          'Ich komme am Freitag doch. Bis morgen!',
          'Das ist mir egal. Tschüss!',
        ],
        wrongTurkish: [
          'Cuma günü yine de geliyorum. Yarın görüşürüz!',
          'Bu benim için fark etmez. Hoşça kal!',
        ],
        wrongNotes: [
          'Randevu ertelendi; cuma günü gelmeyeceksin.',
          'Nazik olmayan bir cevap; özür dileyip teşekkür etmelisin.',
        ],
        note: '"Auf Wiederhören!" telefonda kullanılan veda kalıbıdır; yüz yüze "Auf Wiedersehen" denir.',
      },
    ],
  },
  {
    id: 'havaalani-pasaport',
    level: 'A2',
    title: 'Havaalanında Pasaport Kontrolü',
    description: 'Pasaportunu uzat, seyahatinin amacını, süresini ve kalacağın yeri söyle.',
    place: 'Havalimanı',
    steps: [
      {
        type: 'say',
        speaker: 'Pasaport görevlisi',
        german: 'Guten Tag. Ihren Reisepass, bitte.',
        turkish: 'İyi günler. Pasaportunuzu rica ederim.',
      },
      {
        type: 'reply',
        prompt: 'Selam ver ve pasaportunu uzat.',
        german: 'Guten Tag. Hier ist mein Reisepass.',
        turkish: 'İyi günler. İşte pasaportum.',
        wrongOptions: [
          'Guten Tag. Ich habe meinen Reisepass verloren.',
          'Guten Tag. Wo ist der Reisepass?',
        ],
        wrongTurkish: [
          'İyi günler. Pasaportumu kaybettim.',
          'İyi günler. Pasaport nerede?',
        ],
        wrongNotes: [
          'Pasaportun yanında; kaybettiğini söylemek gerçeğe uymuyor.',
          'Pasaportu görevli istiyor; sen onu uzatmalısın, yerini sormak anlamsız.',
        ],
        note: '"Hier ist ..." = işte ... Pasaport veya kimlik uzatırken kullanılır. "der Reisepass" = pasaport.',
      },
      {
        type: 'say',
        speaker: 'Pasaport görevlisi',
        german: 'Danke. Was ist der Zweck Ihrer Reise?',
        turkish: 'Teşekkürler. Seyahatinizin amacı nedir?',
      },
      {
        type: 'reply',
        prompt: 'Bir arkadaşını ziyaret ettiğini söyle.',
        german: 'Ich besuche einen Freund.',
        turkish: 'Bir arkadaşımı ziyaret ediyorum.',
        wrongOptions: [
          'Ich arbeite hier als Arzt.',
          'Ich fliege morgen nach Hause.',
        ],
        wrongTurkish: [
          'Burada doktor olarak çalışıyorum.',
          'Yarın eve uçuyorum.',
        ],
        wrongNotes: [
          'Arkadaş ziyaretine geldin; burada çalışmıyorsun.',
          'Şimdi geldin ve amacı soruluyor; dönüş uçuşu sorulmuyor.',
        ],
        note: '"besuchen" ziyaret etmek demektir ve doğrudan Akkusativ ister: "einen Freund besuchen". Amaç için: Besuch, Urlaub, Arbeit.',
      },
      {
        type: 'say',
        speaker: 'Pasaport görevlisi',
        german: 'Wie lange bleiben Sie in Deutschland?',
        turkish: 'Almanya\'da ne kadar kalacaksınız?',
      },
      {
        type: 'reply',
        prompt: 'Bir hafta kalacağını söyle.',
        german: 'Ich bleibe eine Woche in Deutschland.',
        turkish: 'Almanya\'da bir hafta kalacağım.',
        wrongOptions: [
          'Ich war eine Woche in Deutschland.',
          'Ich komme aus Deutschland.',
        ],
        wrongTurkish: [
          'Almanya\'da bir hafta kaldım.',
          'Almanya\'dan geliyorum.',
        ],
        wrongNotes: [
          '"war" geçmiş zamandır; daha yeni geldin ve kalacağın süre soruluyor.',
          'Süreyi soruyor; nereli olduğunu değil.',
        ],
        note: '"Wie lange?" süre sorar. "bleiben" kalmak demektir; süre Akkusativ ile söylenir: "eine Woche".',
      },
      {
        type: 'choice',
        speaker: 'Pasaport görevlisi',
        german: 'Wo übernachten Sie? Im Hotel oder bei Ihrem Freund?',
        turkish: 'Nerede kalacaksınız? Otelde mi yoksa arkadaşınızın yanında mı?',
        prompt: 'Nerede kalacağını seç.',
        options: [
          {
            german: 'Ich übernachte bei meinem Freund.',
            turkish: 'Arkadaşımın yanında kalacağım.',
            responseGerman: 'Verstehe. Dann freut sich Ihr Freund sicher auf Sie.',
            responseTurkish: 'Anlıyorum. O zaman arkadaşınız sizi eminim sabırsızlıkla bekliyordur.',
          },
          {
            german: 'Ich übernachte in einem Hotel.',
            turkish: 'Bir otelde kalacağım.',
            responseGerman: 'Verstehe. Dann haben Sie sicher eine schöne Unterkunft.',
            responseTurkish: 'Anlıyorum. O zaman eminim güzel bir konaklamanız vardır.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Pasaport görevlisi',
        german: 'Gut. Haben Sie auch ein Rückflugticket?',
        turkish: 'İyi. Dönüş uçak biletiniz de var mı?',
      },
      {
        type: 'reply',
        prompt: 'Dönüş biletin olduğunu ve telefonda gösterebileceğini söyle.',
        german: 'Ja, ich habe ein Rückflugticket. Ich kann es Ihnen auf dem Handy zeigen.',
        turkish: 'Evet, dönüş biletim var. Size telefonda gösterebilirim.',
        wrongOptions: [
          'Nein, ich habe kein Ticket. Ich bleibe für immer.',
          'Ja, ich habe ein Rückflugticket. Ich kann es Ihnen nicht zeigen.',
        ],
        wrongTurkish: [
          'Hayır, biletim yok. Sonsuza kadar kalacağım.',
          'Evet, dönüş biletim var. Size gösteremem.',
        ],
        wrongNotes: [
          'Bir haftalık seyahat planınla çelişiyor; dönüş biletin var.',
          'Görevliye karşı işbirlikçi değil; bileti göstermeyi teklif etmelisin.',
        ],
        note: '"das Rückflugticket" = dönüş uçak bileti. "zeigen" göstermek: "Ich kann es Ihnen zeigen." = size gösterebilirim.',
      },
      {
        type: 'say',
        speaker: 'Pasaport görevlisi',
        german: 'Danke, alles in Ordnung. Haben Sie weiteres Gepäck?',
        turkish: 'Teşekkürler, her şey yolunda. Başka bagajınız var mı?',
      },
      {
        type: 'reply',
        prompt: 'Başka bagajın olmadığını, sadece bir valizin olduğunu söyle.',
        german: 'Nein, ich habe nur einen Koffer.',
        turkish: 'Hayır, sadece bir valizim var.',
        wrongOptions: [
          'Ja, ich habe noch zwei Koffer.',
          'Nein, ich habe drei Koffer und zwei Taschen.',
        ],
        wrongTurkish: [
          'Evet, iki valizim daha var.',
          'Hayır, üç valizim ve iki çantam var.',
        ],
        wrongNotes: [
          'Başka bagajın olmadığını söyleyecektin; "Ja" ve "noch" ek bagaj olduğunu gösterir.',
          '"Nein" dedikten sonra çok sayıda bagaj saymak çelişkilidir.',
        ],
        note: '"nur" = sadece. "der Koffer" eril olduğundan Akkusativ\'de "einen Koffer" denir.',
      },
      {
        type: 'say',
        speaker: 'Pasaport görevlisi',
        german: 'Gut. Dann willkommen in Deutschland! Einen schönen Aufenthalt!',
        turkish: 'İyi. O zaman Almanya\'ya hoş geldiniz! Güzel bir konaklama dilerim!',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve karşılık olarak güzel bir gün dile.',
        german: 'Vielen Dank! Ihnen auch einen schönen Tag!',
        turkish: 'Çok teşekkürler! Size de güzel bir gün!',
        wrongOptions: [
          'Guten Abend! Ich suche meinen Koffer.',
          'Das war sehr lang. Ich bin müde.',
        ],
        wrongTurkish: [
          'İyi akşamlar! Valizimi arıyorum.',
          'Çok uzun sürdü. Yorgunum.',
        ],
        wrongNotes: [
          'Kontrol bitti; yeni bir soru açmıyorsun, teşekkür edip vedalaşıyorsun.',
          'Nazik olmayan bir tepki; teşekkür edip iyi dilek iletmelisin.',
        ],
        note: '"Ihnen auch" = size de; bir dilek karşılığında kullanılır.',
      },
    ],
  },
  {
    id: 'rica-izin-isteme',
    level: 'A2',
    title: 'Günlük Ricalar ve İzin İsteme',
    description: 'Nazikçe izin ve yardım iste: pencereyi açma, şarj aleti, erken çıkma.',
    place: 'Ofis',
    steps: [
      {
        type: 'say',
        speaker: 'Frau Wolf',
        german: 'Guten Morgen! Wie kann ich Ihnen helfen?',
        turkish: 'Günaydın! Size nasıl yardımcı olabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Pencereyi açıp açamayacağını sor ve burasının çok sıcak olduğunu söyle.',
        german: 'Guten Morgen! Darf ich das Fenster öffnen? Es ist sehr warm hier.',
        turkish: 'Günaydın! Pencereyi açabilir miyim? Burası çok sıcak.',
        wrongOptions: [
          'Guten Morgen! Muss ich das Fenster öffnen? Es ist sehr warm hier.',
          'Guten Morgen! Wo ist das Fenster? Es ist sehr warm hier.',
        ],
        wrongTurkish: [
          'Günaydın! Pencereyi açmak zorunda mıyım? Burası çok sıcak.',
          'Günaydın! Pencere nerede? Burası çok sıcak.',
        ],
        wrongNotes: [
          '"müssen" zorunluluk bildirir; izin istemek için "dürfen" kullanılır.',
          'Pencerenin yerini değil, açma iznini istiyorsun.',
        ],
        note: '"Darf ich ...?" = ...ebilir miyim? (izin ister). Fiil cümlenin sonuna gider: "öffnen".',
      },
      {
        type: 'say',
        speaker: 'Frau Wolf',
        german: 'Natürlich, machen Sie ruhig auf. Brauchen Sie sonst noch etwas?',
        turkish: 'Tabii, rahatça açın. Başka bir şeye ihtiyacınız var mı?',
      },
      {
        type: 'reply',
        prompt: 'Telefonunun şarjının bittiğini söyle ve şarj aletini ödünç vermesini nazikçe rica et.',
        german: 'Mein Handy ist leer. Könnten Sie mir bitte Ihr Ladegerät leihen?',
        turkish: 'Telefonumun şarjı bitti. Şarj aletinizi bana ödünç verebilir misiniz, lütfen?',
        wrongOptions: [
          'Mein Handy ist leer. Ich leihe Ihnen mein Ladegerät.',
          'Mein Handy ist neu. Könnten Sie mir bitte das Ladegerät verkaufen?',
        ],
        wrongTurkish: [
          'Telefonumun şarjı bitti. Size şarj aletimi ödünç veririm.',
          'Telefonum yeni. Şarj aletini bana satar mısınız, lütfen?',
        ],
        wrongNotes: [
          'Rolleri karıştırdın: telefonu biten sensin, sen rica edeceksin.',
          'Ödünç almak istiyorsun, satın almak değil.',
        ],
        note: '"Könnten Sie mir bitte ... leihen?" kibar bir rica kalıbıdır. "leer" = boş; telefonun şarjı bitti.',
      },
      {
        type: 'say',
        speaker: 'Frau Wolf',
        german: 'Klar, das Kabel liegt dort neben dem Computer.',
        turkish: 'Tabii, kablo şurada bilgisayarın yanında duruyor.',
      },
      {
        type: 'choice',
        speaker: 'Frau Wolf',
        german: 'Ich hole mir einen Kaffee. Möchten Sie auch etwas trinken?',
        turkish: 'Kendime bir kahve alıyorum. Siz de bir şey içmek ister misiniz?',
        prompt: 'Kahve mi çay mı istediğini seç.',
        options: [
          {
            german: 'Einen Kaffee, bitte.',
            turkish: 'Bir kahve, lütfen.',
            responseGerman: 'Gern. Der Kaffee in der Küche ist heute besonders gut.',
            responseTurkish: 'Memnuniyetle. Mutfaktaki kahve bugün özellikle güzel.',
          },
          {
            german: 'Lieber einen Tee, bitte.',
            turkish: 'Tercihen bir çay, lütfen.',
            responseGerman: 'Gern. Ich habe heute Pfefferminztee mitgebracht.',
            responseTurkish: 'Memnuniyetle. Bugün nane çayı getirdim.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Frau Wolf',
        german: 'So, bitte schön. Sie sehen müde aus. Ist alles in Ordnung?',
        turkish: 'Buyurun. Yorgun görünüyorsunuz. Her şey yolunda mı?',
      },
      {
        type: 'reply',
        prompt: 'Başının ağrıdığını söyle ve bugün daha erken eve gidip gidemeyeceğini sor.',
        german: 'Ich habe Kopfschmerzen. Darf ich heute früher nach Hause gehen?',
        turkish: 'Başım ağrıyor. Bugün daha erken eve gidebilir miyim?',
        wrongOptions: [
          'Ich habe Kopfschmerzen. Muss ich heute früher nach Hause gehen?',
          'Ich habe Kopfschmerzen. Ich bleibe heute bis zehn Uhr abends.',
        ],
        wrongTurkish: [
          'Başım ağrıyor. Bugün daha erken eve gitmek zorunda mıyım?',
          'Başım ağrıyor. Bugün akşam ona kadar kalıyorum.',
        ],
        wrongNotes: [
          'İzin istemen gerekiyordu; "müssen" zorunluluk sorusudur.',
          'Erken çıkmak için izin isteyeceksin; geç saate kadar kalmak görevle uyuşmuyor.',
        ],
        note: '"früher" = daha erken. "nach Hause gehen" = eve gitmek. İzin için "Darf ich ...?" kullanılır.',
      },
      {
        type: 'say',
        speaker: 'Frau Wolf',
        german: 'Natürlich. Ruhen Sie sich aus. Brauchen Sie sonst noch etwas?',
        turkish: 'Tabii. Dinlenin. Başka bir şeye ihtiyacınız var mı?',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve yarın ancak saat onda gelip gelemeyeceğini sor.',
        german: 'Danke. Darf ich morgen erst um zehn Uhr kommen?',
        turkish: 'Teşekkürler. Yarın ancak saat onda gelebilir miyim?',
        wrongOptions: [
          'Danke. Muss ich morgen um zehn Uhr kommen?',
          'Danke. Ich komme morgen nicht mehr.',
        ],
        wrongTurkish: [
          'Teşekkürler. Yarın saat onda gelmek zorunda mıyım?',
          'Teşekkürler. Yarın artık gelmeyeceğim.',
        ],
        wrongNotes: [
          'Zorunluluk sorusu soruyor; oysa daha geç gelmek için izin istiyorsun.',
          'İzin istemiyorsun, hiç gelmeyeceğini bildiriyorsun; bu doğru değil.',
        ],
        note: '"erst um zehn Uhr" = ancak saat onda (daha geç). "Darf ich ...?" izin sorar.',
      },
      {
        type: 'say',
        speaker: 'Frau Wolf',
        german: 'Das ist in Ordnung. Gute Besserung!',
        turkish: 'Sorun değil. Geçmiş olsun!',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve yarın görüşmek üzere vedalaş.',
        german: 'Vielen Dank. Bis morgen!',
        turkish: 'Çok teşekkürler. Yarın görüşürüz!',
        wrongOptions: [
          'Vielen Dank. Ich bleibe noch bis zehn Uhr.',
          'Gute Besserung! Bis morgen!',
        ],
        wrongTurkish: [
          'Çok teşekkürler. Saat ona kadar daha kalıyorum.',
          'Geçmiş olsun! Yarın görüşürüz!',
        ],
        wrongNotes: [
          'Eve gidiyorsun; vedalaşman gerekiyor.',
          '"Gute Besserung" hasta olan kişiye söylenir; hasta olan sensin, ona teşekkür etmelisin.',
        ],
        note: '"Gute Besserung!" = geçmiş olsun. "Bis morgen!" = yarın görüşürüz.',
      },
    ],
  },
  {
    id: 'postane-paket',
    level: 'A2',
    title: 'Postanede Paket Gönderme',
    description: 'Paketi tart, gönderim türünü seç, formu doldur ve ücreti öde.',
    place: 'Postane',
    steps: [
      {
        type: 'say',
        speaker: 'Postane görevlisi',
        german: 'Guten Tag. Was kann ich für Sie tun?',
        turkish: 'İyi günler. Sizin için ne yapabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Türkiye\'ye bir paket göndermek istediğini söyle.',
        german: 'Guten Tag. Ich möchte ein Paket in die Türkei schicken.',
        turkish: 'İyi günler. Türkiye\'ye bir paket göndermek istiyorum.',
        wrongOptions: [
          'Guten Tag. Ich möchte ein Paket aus der Türkei abholen.',
          'Guten Tag. Ich möchte eine Briefmarke für die Türkei kaufen.',
        ],
        wrongTurkish: [
          'İyi günler. Türkiye\'den bir paket teslim almak istiyorum.',
          'İyi günler. Türkiye için bir pul almak istiyorum.',
        ],
        wrongNotes: [
          'Paket göndereceksin; teslim almayacaksın.',
          'Pul mektup içindir; sen paket göndermek istiyorsun.',
        ],
        note: '"in die Türkei" = Türkiye\'ye (ülke adı "die Türkei" artikelle kullanılır). "schicken" = göndermek.',
      },
      {
        type: 'say',
        speaker: 'Postane görevlisi',
        german: 'Gern. Legen Sie das Paket bitte auf die Waage. Was ist drin?',
        turkish: 'Memnuniyetle. Paketi lütfen teraziye koyun. İçinde ne var?',
      },
      {
        type: 'reply',
        prompt: 'İçinde kitaplar ve bir kazak olduğunu söyle.',
        german: 'Es sind Bücher und ein Pullover drin.',
        turkish: 'İçinde kitaplar ve bir kazak var.',
        wrongOptions: [
          'Es ist nichts drin. Das Paket ist leer.',
          'Es sind Schuhe und eine Jacke drin.',
        ],
        wrongTurkish: [
          'İçinde hiçbir şey yok. Paket boş.',
          'İçinde ayakkabılar ve bir ceket var.',
        ],
        wrongNotes: [
          'Paket göndereceksin; içindekileri söylemen gerekiyor.',
          'Kitaplar ve bir kazak olduğunu söylemen gerekiyordu; farklı eşyalar saydın.',
        ],
        note: '"Es sind ... drin" = içinde ... var; çoğul için "sind", tekil için "ist" kullanılır.',
      },
      {
        type: 'choice',
        speaker: 'Postane görevlisi',
        german: 'Das Paket wiegt drei Kilo. Möchten Sie es normal oder per Express schicken?',
        turkish: 'Paket üç kilo geliyor. Normal mi yoksa ekspres mi göndermek istersiniz?',
        prompt: 'Gönderim türünü seç.',
        options: [
          {
            german: 'Normal, bitte. Das ist günstiger.',
            turkish: 'Normal, lütfen. Bu daha ucuz.',
            responseGerman: 'Gut. Das kostet zwanzig Euro und dauert etwa eine Woche.',
            responseTurkish: 'İyi. Fiyatı yirmi euro ve yaklaşık bir hafta sürüyor.',
          },
          {
            german: 'Per Express, bitte. Es ist eilig.',
            turkish: 'Ekspres, lütfen. Acil.',
            responseGerman: 'Gut. Das kostet fünfunddreißig Euro und dauert etwa drei Tage.',
            responseTurkish: 'İyi. Fiyatı otuz beş euro ve yaklaşık üç gün sürüyor.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Postane görevlisi',
        german: 'Bitte füllen Sie dieses Formular aus. Ich brauche Ihren Namen und die Adresse des Empfängers.',
        turkish: 'Lütfen bu formu doldurun. Adınıza ve alıcının adresine ihtiyacım var.',
      },
      {
        type: 'reply',
        prompt: 'Kabul et ve bir kalem isteyip isteyemeyeceğini sor.',
        german: 'Natürlich. Kann ich bitte einen Stift haben?',
        turkish: 'Tabii. Bir kalem alabilir miyim, lütfen?',
        wrongOptions: [
          'Natürlich. Kann ich bitte eine Briefmarke haben?',
          'Nein, danke. Ich fülle das Formular nicht aus.',
        ],
        wrongTurkish: [
          'Tabii. Bir pul alabilir miyim, lütfen?',
          'Hayır, teşekkürler. Formu doldurmayacağım.',
        ],
        wrongNotes: [
          'Formu doldurmak için kalem gerekir; pul mektuplar içindir.',
          'Formu doldurmadan paket gönderilemez.',
        ],
        note: '"Kann ich bitte ... haben?" = ... alabilir miyim, lütfen? Nesne Akkusativ\'dedir: "einen Stift".',
      },
      {
        type: 'say',
        speaker: 'Postane görevlisi',
        german: 'Danke, das Formular ist vollständig. Möchten Sie bar oder mit Karte zahlen?',
        turkish: 'Teşekkürler, form tamam. Nakit mi yoksa kartla mı ödemek istersiniz?',
      },
      {
        type: 'reply',
        prompt: 'Kartla ödeyeceğini söyle ve bir makbuz rica et.',
        german: 'Mit Karte, bitte. Ich hätte gern einen Beleg.',
        turkish: 'Kartla, lütfen. Bir makbuz rica ediyorum.',
        wrongOptions: [
          'Mit Karte, bitte. Ich hätte gern eine Briefmarke.',
          'Nein, ich zahle nicht. Das Paket ist ein Geschenk.',
        ],
        wrongTurkish: [
          'Kartla, lütfen. Bir pul rica ediyorum.',
          'Hayır, ödemeyeceğim. Paket bir hediye.',
        ],
        wrongNotes: [
          'Makbuz istiyorsun; pul gerekmiyor.',
          'Postada gönderim ücreti ödenir; paketin hediye olması ücreti kaldırmaz.',
        ],
        note: '"Ich hätte gern ..." = ... rica ederim (kibar istek). "der Beleg" = makbuz.',
      },
      {
        type: 'say',
        speaker: 'Postane görevlisi',
        german: 'Hier ist Ihr Beleg. Mit der Sendungsnummer können Sie das Paket online verfolgen.',
        turkish: 'İşte makbuzunuz. Gönderi numarasıyla paketi internetten takip edebilirsiniz.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve vedalaş.',
        german: 'Vielen Dank für Ihre Hilfe. Auf Wiedersehen!',
        turkish: 'Yardımınız için çok teşekkürler. Hoşça kalın!',
        wrongOptions: [
          'Entschuldigung, wo ist die Post?',
          'Das war zu teuer. Das Paket schicke ich nicht.',
        ],
        wrongTurkish: [
          'Afedersiniz, postane nerede?',
          'Bu çok pahalıydı. Paketi göndermiyorum.',
        ],
        wrongNotes: [
          'Zaten postanedesin; işlem bitti, teşekkür edip vedalaşmalısın.',
          'Ödeme tamamlandı; bu cümle işlemi geri alır ve nazik değil.',
        ],
        note: '"Vielen Dank für ..." = ... için çok teşekkürler ("für" Akkusativ ister).',
      },
    ],
  },
  {
    id: 'ozur-mazeret',
    level: 'A2',
    title: 'Özür Dileme ve Mazeret Bildirme',
    description: 'Toplantıya geç kaldığın için özür dile, mazeretini anlat ve telafi öner.',
    place: 'Ofis',
    steps: [
      {
        type: 'say',
        speaker: 'Herr Braun',
        german: 'Guten Morgen. Es ist schon zehn Uhr. Die Besprechung hat um halb zehn angefangen.',
        turkish: 'Günaydın. Saat zaten on. Toplantı dokuz buçukta başladı.',
      },
      {
        type: 'reply',
        prompt: 'Özür dile ve geç geldiğini söyle.',
        german: 'Entschuldigung, ich bin zu spät gekommen.',
        turkish: 'Özür dilerim, geç geldim.',
        wrongOptions: ['Entschuldigung, ich bin zu früh gekommen.', 'Danke, ich bin zu spät gekommen.'],
        wrongTurkish: ['Özür dilerim, erken geldim.', 'Teşekkürler, geç geldim.'],
        wrongNotes: [
          'Toplantı başlamış; erken değil, geç kaldın.',
          'Geç kaldığın için teşekkür etmez, özür dilersin.',
        ],
        note: '"zu spät kommen" = geç gelmek (Perfekt: "bin zu spät gekommen"). Özür için "Entschuldigung" kullanılır.',
      },
      {
        type: 'say',
        speaker: 'Herr Braun',
        german: 'Kein Problem, aber was ist passiert?',
        turkish: 'Sorun değil ama ne oldu?',
      },
      {
        type: 'reply',
        prompt: 'Otobüsün gecikmeli olduğunu ve bu yüzden geç kaldığını söyle (deshalb).',
        german: 'Der Bus hatte Verspätung, deshalb bin ich zu spät.',
        turkish: 'Otobüs gecikti, bu yüzden geç kaldım.',
        wrongOptions: [
          'Ich hatte Verspätung, deshalb hat der Bus gewartet.',
          'Der Bus hatte Verspätung, aber ich habe keine Zeit.',
        ],
        wrongTurkish: [
          'Ben gecikmiştim, bu yüzden otobüs bekledi.',
          'Otobüs gecikti ama vaktim yok.',
        ],
        wrongNotes: [
          'Gecikme otobüsün; sebep ve sonuç ters kurulmuş.',
          '"deshalb" ile sonucu söylemen gerekiyordu; "aber" bunu sağlamaz.',
        ],
        note: '"deshalb" = bu yüzden; ardından fiil ikinci sırada gelir: "deshalb bin ich zu spät". "die Verspätung" = gecikme.',
      },
      {
        type: 'choice',
        speaker: 'Herr Braun',
        german: 'Möchten Sie die Zusammenfassung vom Anfang jetzt hören oder nach der Besprechung?',
        turkish: 'Başlangıcın özetini şimdi mi yoksa toplantıdan sonra mı dinlemek istersiniz?',
        prompt: 'Özeti ne zaman dinlemek istediğini seç.',
        options: [
          {
            german: 'Bitte jetzt. Ich möchte alles verstehen.',
            turkish: 'Lütfen şimdi. Her şeyi anlamak istiyorum.',
            responseGerman: 'Gut, dann fasse ich kurz zusammen: Es geht um das neue Projekt.',
            responseTurkish: 'İyi, o zaman kısaca özetleyeyim: Konu yeni proje.',
          },
          {
            german: 'Bitte nach der Besprechung. Ich möchte nicht stören.',
            turkish: 'Lütfen toplantıdan sonra. Rahatsız etmek istemiyorum.',
            responseGerman: 'Gut, dann sprechen wir danach kurz darüber.',
            responseTurkish: 'İyi, o zaman toplantıdan sonra kısaca konuşuruz.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Herr Braun',
        german: 'Übrigens: Haben Sie die Unterlagen für heute mitgebracht?',
        turkish: 'Bu arada: Bugünün belgelerini getirdiniz mi?',
      },
      {
        type: 'reply',
        prompt: 'Belgeleri evde unuttuğunu söyle ve üzüldüğünü belirt.',
        german: 'Es tut mir leid, ich habe die Unterlagen zu Hause vergessen.',
        turkish: 'Üzgünüm, belgeleri evde unuttum.',
        wrongOptions: [
          'Das ist nicht mein Problem. Die Unterlagen sind zu Hause.',
          'Es tut mir leid, ich habe die Unterlagen im Büro vergessen.',
        ],
        wrongTurkish: [
          'Bu benim sorunum değil. Belgeler evde.',
          'Üzgünüm, belgeleri ofiste unuttum.',
        ],
        wrongNotes: [
          'Nazik olmayan bir cevap; özür dilemelisin.',
          'Belgeleri evde unuttun; ofis yanlış yer.',
        ],
        note: '"Es tut mir leid" = üzgünüm. "vergessen" = unutmak: "Ich habe ... vergessen" (Perfekt).',
      },
      {
        type: 'say',
        speaker: 'Herr Braun',
        german: 'Das kann passieren. Können Sie die Unterlagen später per E-Mail schicken?',
        turkish: 'Olabilir. Belgeleri daha sonra e-postayla gönderebilir misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Kabul et ve saat on ikiye kadar göndereceğini söyle.',
        german: 'Ja, natürlich. Ich schicke sie Ihnen bis zwölf Uhr.',
        turkish: 'Evet, tabii. Size saat on ikiye kadar gönderirim.',
        wrongOptions: [
          'Nein, ich schicke sie nie.',
          'Ja, natürlich. Ich schicke sie Ihnen seit zwölf Uhr.',
        ],
        wrongTurkish: [
          'Hayır, hiç göndermem.',
          'Evet, tabii. Size saat on ikiden beri gönderiyorum.',
        ],
        wrongNotes: [
          'Rica edileni kabul edecektin; bu cevap reddediyor.',
          '"bis" son zamanı bildirir; "seit" başlangıçtan beri demektir.',
        ],
        note: '"bis zwölf Uhr" = saat on ikiye kadar. "schicken" = göndermek.',
      },
      {
        type: 'say',
        speaker: 'Herr Braun',
        german: 'Gut. Und bitte kommen Sie morgen pünktlich.',
        turkish: 'İyi. Ve lütfen yarın zamanında gelin.',
      },
      {
        type: 'reply',
        prompt: 'Söz ver ve bunun bir daha olmayacağını söyle.',
        german: 'Ich verspreche es. Das passiert nicht noch einmal.',
        turkish: 'Söz veriyorum. Bir daha olmayacak.',
        wrongOptions: [
          'Ich verspreche es nicht. Das passiert bestimmt wieder.',
          'Ich verspreche es. Das ist gestern passiert.',
        ],
        wrongTurkish: [
          'Söz vermiyorum. Muhtemelen tekrar olur.',
          'Söz veriyorum. Bu dün oldu.',
        ],
        wrongNotes: [
          'Özür dilerken tekrarlanmayacağına söz vermelisin.',
          'Gelecek için söz veriyorsun; geçmişten söz etmek uyumsuz.',
        ],
        note: '"versprechen" = söz vermek. "nicht noch einmal" = bir daha olmaz.',
      },
      {
        type: 'say',
        speaker: 'Herr Braun',
        german: 'Danke. Dann gehen wir jetzt wieder in den Konferenzraum.',
        turkish: 'Teşekkürler. O zaman şimdi tekrar toplantı odasına gidiyoruz.',
      },
    ],
  },
  {
    id: 'telefon-gorusmesi',
    level: 'A2',
    title: 'Telefon Görüşmesi Başlatma ve Bitirme',
    description: 'Telefonda biriyle görüşmek iste, mesaj bırak ve görüşmeyi nazikçe bitir.',
    place: 'Telefon',
    steps: [
      {
        type: 'say',
        speaker: 'Frau Peters',
        german: 'Firma Weber, guten Tag. Peters am Apparat.',
        turkish: 'Weber Şirketi, iyi günler. Peters konuşuyor.',
      },
      {
        type: 'reply',
        prompt: 'Kendini Ali Demir olarak tanıt ve Herr Becker ile görüşmek istediğini söyle.',
        german: 'Guten Tag, hier spricht Ali Demir. Kann ich bitte Herrn Becker sprechen?',
        turkish: 'İyi günler, ben Ali Demir. Herr Becker ile görüşebilir miyim, lütfen?',
        wrongOptions: [
          'Guten Tag, hier spricht Herr Becker. Kann ich bitte Ali Demir sprechen?',
          'Guten Tag, hier ist die Firma. Wo ist Herr Becker?',
        ],
        wrongTurkish: [
          'İyi günler, ben Herr Becker. Ali Demir ile görüşebilir miyim, lütfen?',
          'İyi günler, burası şirket. Herr Becker nerede?',
        ],
        wrongNotes: [
          'Aranan kişi Becker; kendini Ali Demir olarak tanıtmalısın.',
          'Kendini tanıtmadın ve kaba biçimde yerini sordun; nazik bir rica kullanmalısın.',
        ],
        note: '"Hier spricht ..." = (telefonda) ben ... "Kann ich bitte ... sprechen?" kibar bir rica kalıbıdır. "Herrn": eril isimde Akkusativ -n alır.',
      },
      {
        type: 'say',
        speaker: 'Frau Peters',
        german: 'Einen Moment, bitte. Leider ist Herr Becker gerade in einer Besprechung.',
        turkish: 'Bir saniye, lütfen. Maalesef Herr Becker şu anda toplantıda.',
      },
      {
        type: 'reply',
        prompt: 'Anladığını söyle ve ona ne zaman ulaşabileceğini sor.',
        german: 'Das verstehe ich. Wann kann ich ihn erreichen?',
        turkish: 'Anlıyorum. Ona ne zaman ulaşabilirim?',
        wrongOptions: [
          'Das verstehe ich. Wo kann ich ihn erreichen?',
          'Das ist mir egal. Wann kann ich ihn erreichen?',
        ],
        wrongTurkish: [
          'Anlıyorum. Ona nerede ulaşabilirim?',
          'Bu benim için fark etmez. Ona ne zaman ulaşabilirim?',
        ],
        wrongNotes: [
          'Zamanı soracaktın; "Wo" yer sorar.',
          'Nazik olmayan bir tepki; önce anladığını göstermelisin.',
        ],
        note: '"erreichen" = ulaşmak. "ihn" = onu (Akkusativ). "Wann?" zaman sorar.',
      },
      {
        type: 'say',
        speaker: 'Frau Peters',
        german: 'Er ist ab vierzehn Uhr wieder im Büro.',
        turkish: 'On dörtten sonra yine ofiste.',
      },
      {
        type: 'choice',
        speaker: 'Frau Peters',
        german: 'Möchten Sie später noch einmal anrufen oder soll er Sie zurückrufen?',
        turkish: 'Daha sonra tekrar mı aramak istersiniz yoksa sizi o mu geri arasın?',
        prompt: 'Tekrar mı arayacağını yoksa geri aranmak mı istediğini seç.',
        options: [
          {
            german: 'Ich rufe später noch einmal an.',
            turkish: 'Daha sonra tekrar ararım.',
            responseGerman: 'Gut, ab vierzehn Uhr erreichen Sie ihn bestimmt.',
            responseTurkish: 'İyi, on dörtten sonra ona kesinlikle ulaşırsınız.',
          },
          {
            german: 'Er soll mich bitte zurückrufen.',
            turkish: 'Lütfen beni geri arasın.',
            responseGerman: 'Gut, ich gebe ihm gleich Bescheid.',
            responseTurkish: 'İyi, ona hemen haber veririm.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Frau Peters',
        german: 'Möchten Sie eine Nachricht hinterlassen?',
        turkish: 'Bir mesaj bırakmak ister misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Mesaj bırakmak istediğini ve ona numaranı vereceğini söyle.',
        german: 'Ja, bitte. Ich gebe Ihnen meine Nummer.',
        turkish: 'Evet, lütfen. Size numaramı vereyim.',
        wrongOptions: [
          'Nein, danke. Ich gebe Ihnen keine Nummer.',
          'Ja, bitte. Ich gebe Ihnen seine Nummer.',
        ],
        wrongTurkish: [
          'Hayır, teşekkürler. Size numara vermem.',
          'Evet, lütfen. Size onun numarasını vereyim.',
        ],
        wrongNotes: [
          'Mesaj bırakma teklifini kabul edip numaranı vermelisin; bu cevap teklifi reddediyor.',
          'Kendi numaranı vereceksin; onun numarasını değil.',
        ],
        note: '"Ich gebe Ihnen meine Nummer" = size numaramı vereyim. "Ihnen" = size (Dativ), "meine Nummer" Akkusativ\'dedir.',
      },
      {
        type: 'say',
        speaker: 'Frau Peters',
        german: 'Gut, bitte sagen Sie mir die Nummer. Ich schreibe mit.',
        turkish: 'Tamam, numarayı söyleyin lütfen. Not alıyorum.',
      },
      {
        type: 'reply',
        prompt: 'Numaranı söyle: sıfır bir beş bir, iki üç dört beş altı yedi.',
        german: 'Meine Nummer ist null eins fünf eins, zwei drei vier fünf sechs sieben.',
        turkish: 'Numaram sıfır bir beş bir, iki üç dört beş altı yedi.',
        wrongOptions: [
          'Meine Nummer ist null eins fünf eins, zwei drei vier fünf sechs acht.',
          'Meine Adresse ist null eins fünf eins, zwei drei vier fünf sechs sieben.',
        ],
        wrongTurkish: [
          'Numaram sıfır bir beş bir, iki üç dört beş altı sekiz.',
          'Adresim sıfır bir beş bir, iki üç dört beş altı yedi.',
        ],
        wrongNotes: [
          'Son rakam yedi; sekiz değil.',
          'Telefon numarası söylemen gerekiyordu; adres değil.',
        ],
        note: 'Telefon numaraları rakam rakam okunur: null, eins, zwei, drei... "sechs" = 6, "sieben" = 7.',
      },
      {
        type: 'say',
        speaker: 'Frau Peters',
        german: 'Danke, ich habe alles notiert. Wie war Ihr Name noch einmal? Können Sie ihn bitte buchstabieren?',
        turkish: 'Teşekkürler, hepsini not ettim. Adınız neydi? Lütfen harflerini söyler misiniz?',
      },
      {
        type: 'reply',
        prompt: 'Soyadının Demir olduğunu söyle ve harflerini tek tek hecele.',
        german: 'Mein Nachname ist Demir: D, E, M, I, R.',
        turkish: 'Soyadım Demir: D, E, M, I, R.',
        wrongOptions: [
          'Mein Nachname ist Demir: D, E, M, I, S.',
          'Mein Vorname ist Demir: D, E, M, I, R.',
        ],
        wrongTurkish: [
          'Soyadım Demir: D, E, M, I, S.',
          'Adım Demir: D, E, M, I, R.',
        ],
        wrongNotes: [
          'Son harf R; S değil.',
          '"Vorname" adı, "Nachname" soyadı demektir; Demir senin soyadın.',
        ],
        note: 'Ad hecelemek için harfler tek tek söylenir. "der Nachname" = soyadı, "der Vorname" = adı.',
      },
      {
        type: 'say',
        speaker: 'Frau Peters',
        german: 'Vielen Dank, Herr Demir. Ich richte es Herrn Becker aus.',
        turkish: 'Çok teşekkürler Herr Demir. Mesajınızı Herr Becker\'e ileteceğim.',
      },
      {
        type: 'reply',
        prompt: 'Yardımı için teşekkür et, iyi günler dile ve telefonu nazikçe kapat.',
        german: 'Vielen Dank für Ihre Hilfe. Einen schönen Tag noch und auf Wiederhören!',
        turkish: 'Yardımınız için çok teşekkürler. İyi günler ve görüşmek üzere!',
        wrongOptions: [
          'Das war langweilig. Tschüss!',
          'Hallo, hier spricht Ali Demir. Einen schönen Tag noch!',
        ],
        wrongTurkish: [
          'Sıkıcıydı. Hoşça kal!',
          'Merhaba, ben Ali Demir. İyi günler!',
        ],
        wrongNotes: [
          'Nazik olmayan bir kapanış; teşekkür edip kapatmalısın.',
          'Görüşmeyi yeniden başlatır gibi; kapanışta teşekkür edilip "Auf Wiederhören" denir.',
        ],
        note: '"Auf Wiederhören!" telefonda kullanılan veda kalıbıdır. "Einen schönen Tag noch!" güzel bir gün dileğidir.',
      },
    ],
  },
  {
    id: 'muze-bileti',
    level: 'A2',
    title: 'Müze veya Sinema Bileti Alma',
    description: 'Müze gişesinde giriş bileti al, öğrenci indirimini ve vestiyeri sor.',
    place: 'Müze',
    steps: [
      {
        type: 'say',
        speaker: 'Gişe görevlisi',
        german: 'Guten Tag! Willkommen im Stadtmuseum.',
        turkish: 'İyi günler! Şehir Müzesi\'ne hoş geldiniz.',
      },
      {
        type: 'reply',
        prompt: 'İki giriş bileti istediğini söyle.',
        german: 'Guten Tag. Ich hätte gern zwei Eintrittskarten, bitte.',
        turkish: 'İyi günler. İki giriş bileti rica ediyorum, lütfen.',
        wrongOptions: [
          'Guten Tag. Ich hätte gern zwei Fahrkarten, bitte.',
          'Guten Tag. Ich hätte gern zwei Museen, bitte.',
        ],
        wrongTurkish: [
          'İyi günler. İki ulaşım bileti rica ediyorum, lütfen.',
          'İyi günler. İki müze rica ediyorum, lütfen.',
        ],
        wrongNotes: [
          'Müzedesin; ulaşım bileti değil, giriş bileti istiyorsun.',
          'Müze satın alınmaz; giriş bileti istemelisin.',
        ],
        note: '"die Eintrittskarte" = giriş bileti. "zwei Eintrittskarten": çoğul "-n" alır.',
      },
      {
        type: 'say',
        speaker: 'Gişe görevlisi',
        german: 'Gern. Sind Sie Studenten? Dann gibt es eine Ermäßigung.',
        turkish: 'Memnuniyetle. Öğrenci misiniz? O zaman indirim var.',
      },
      {
        type: 'reply',
        prompt: 'İkinizin de öğrenci olduğunu ve kimliklerinizin yanınızda olduğunu söyle.',
        german: 'Ja, wir sind Studenten. Wir haben unsere Studentenausweise dabei.',
        turkish: 'Evet, öğrenciyiz. Öğrenci kimliklerimiz yanımızda.',
        wrongOptions: [
          'Ja, wir sind Lehrer. Wir haben unsere Ausweise dabei.',
          'Nein, wir haben keine Ausweise, aber wir sind Studenten.',
        ],
        wrongTurkish: [
          'Evet, öğretmeniz. Kimliklerimiz yanımızda.',
          'Hayır, kimliğimiz yok ama öğrenciyiz.',
        ],
        wrongNotes: [
          'Öğrenci olduğunuzu söylemeniz gerekiyordu; "Lehrer" öğretmen demektir.',
          'İndirim için kimliklerin yanında olduğunu söylemelisin.',
        ],
        note: '"dabei haben" = yanında olmak. "der Studentenausweis" = öğrenci kimliği; "unsere" çoğul için kullanılır.',
      },
      {
        type: 'say',
        speaker: 'Gişe görevlisi',
        german: 'Sehr gut. Dann kostet jede Karte sechs Euro statt zehn Euro.',
        turkish: 'Çok iyi. O zaman her bilet on euro yerine altı euro.',
      },
      {
        type: 'choice',
        speaker: 'Gişe görevlisi',
        german: 'Möchten Sie auch einen Audioguide für drei Euro?',
        turkish: 'Üç euroya bir sesli rehber de ister misiniz?',
        prompt: 'Sesli rehber isteyip istemediğini seç.',
        options: [
          {
            german: 'Ja, wir nehmen zwei Audioguides.',
            turkish: 'Evet, iki sesli rehber alıyoruz.',
            responseGerman: 'Gut, dann sind es insgesamt achtzehn Euro.',
            responseTurkish: 'İyi, o zaman toplam on sekiz euro.',
          },
          {
            german: 'Nein, danke. Wir brauchen keinen Audioguide.',
            turkish: 'Hayır, teşekkürler. Sesli rehbere ihtiyacımız yok.',
            responseGerman: 'Gut, dann sind es insgesamt zwölf Euro.',
            responseTurkish: 'İyi, o zaman toplam on iki euro.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Gişe görevlisi',
        german: 'Hier sind Ihre Karten. Das Museum ist heute bis achtzehn Uhr geöffnet.',
        turkish: 'İşte biletleriniz. Müze bugün on sekize kadar açık.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve vestiyerin nerede olduğunu sor.',
        german: 'Danke schön. Wo ist die Garderobe?',
        turkish: 'Çok teşekkürler. Vestiyer nerede?',
        wrongOptions: ['Danke schön. Wann ist die Garderobe?', 'Danke schön. Wo ist die Küche?'],
        wrongTurkish: ['Çok teşekkürler. Vestiyer ne zaman?', 'Çok teşekkürler. Mutfak nerede?'],
        wrongNotes: [
          '"Wann" zaman sorar; yer sormak için "Wo" kullanılır.',
          'Müzede mutfak sormak konuyla ilgisiz; vestiyeri sormalıydın.',
        ],
        note: '"die Garderobe" = vestiyer. "Wo ist ...?" bir yerin nerede olduğunu sorar.',
      },
      {
        type: 'say',
        speaker: 'Gişe görevlisi',
        german: 'Die Garderobe ist dort rechts, neben dem Eingang.',
        turkish: 'Vestiyer şurada sağda, girişin yanında.',
      },
      {
        type: 'reply',
        prompt: 'Burada fotoğraf çekmenin serbest olup olmadığını sor.',
        german: 'Darf man hier fotografieren?',
        turkish: 'Burada fotoğraf çekmek serbest mi?',
        wrongOptions: ['Muss man hier fotografieren?', 'Darf man hier schlafen?'],
        wrongTurkish: ['Burada fotoğraf çekmek zorunlu mu?', 'Burada uyumak serbest mi?'],
        wrongNotes: [
          '"müssen" zorunluluk bildirir; izin sormak için "dürfen" kullanılır.',
          'Fotoğraf çekmeyi soracaktın; uyumak konuyla ilgisiz.',
        ],
        note: '"Darf man ...?" = ...mak serbest mi? "man" genel olarak herkesi anlatır.',
      },
      {
        type: 'say',
        speaker: 'Gişe görevlisi',
        german: 'Ja, aber ohne Blitz, bitte. Im ersten Stock gibt es eine besondere Ausstellung über Geschichte.',
        turkish: 'Evet, ama lütfen flaşsız. Birinci katta tarih hakkında özel bir sergi var.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve sergiye girişin ücretsiz olup olmadığını sor.',
        german: 'Danke. Ist der Eintritt zur Ausstellung kostenlos?',
        turkish: 'Teşekkürler. Sergiye giriş ücretsiz mi?',
        wrongOptions: [
          'Danke. Ist die Ausstellung heute geschlossen?',
          'Danke. Was kostet ein Kaffee in der Ausstellung?',
        ],
        wrongTurkish: [
          'Teşekkürler. Sergi bugün kapalı mı?',
          'Teşekkürler. Sergide bir kahve ne kadar?',
        ],
        wrongNotes: [
          'Ücret soruyorsun; kapalı olup olmadığını değil.',
          'Sergiye giriş ücretini soruyorsun; kahve fiyatını değil.',
        ],
        note: '"kostenlos" = ücretsiz. "der Eintritt zur ..." = ...e giriş.',
      },
      {
        type: 'say',
        speaker: 'Gişe görevlisi',
        german: 'Sie kostet nichts extra, die Ausstellung ist im Preis enthalten. Viel Spaß!',
        turkish: 'Ekstra ücret yok, sergi fiyata dahil. İyi gezmeler!',
      },
      {
        type: 'reply',
        prompt: 'Sevindiğini söyle, teşekkür et ve karşılık olarak güzel bir gün dile.',
        german: 'Das ist toll. Vielen Dank, Ihnen noch einen schönen Tag!',
        turkish: 'Harika. Çok teşekkürler, size de güzel bir gün!',
        wrongOptions: [
          'Das ist schade. Dann gehe ich nicht hinein.',
          'Das ist toll. Wo ist die Garderobe?',
        ],
        wrongTurkish: [
          'Yazık. O zaman içeri girmiyorum.',
          'Harika. Vestiyer nerede?',
        ],
        wrongNotes: [
          'Sergi fiyata dahil; vazgeçmek mantıksız ve nazik değil.',
          'Vestiyeri zaten sordun; teşekkür edip veda etmelisin.',
        ],
        note: '"Ihnen noch einen schönen Tag!" = size de güzel bir gün! Veda ederken kullanılan kibar dilektir.',
      },
    ],
  },
  {
    id: 'sehir-tanitimi',
    level: 'A2',
    title: 'Şehir ve Memleket Tanıtımı',
    description: 'Memleketini tanıt: konumu, nüfusu, görülecek yerler, hava ve yemekler.',
    place: 'Kafe',
    steps: [
      {
        type: 'say',
        speaker: 'Sophie',
        german: 'Du kommst aus der Türkei, oder? Aus welcher Stadt genau?',
        turkish: 'Türkiye\'den geliyorsun, değil mi? Tam olarak hangi şehirden?',
      },
      {
        type: 'reply',
        prompt: 'İzmirli olduğunu ve şehrin Ege Denizi kıyısında olduğunu söyle.',
        german: 'Ich komme aus Izmir. Die Stadt liegt am Ägäischen Meer.',
        turkish: 'Ben İzmirliyim. Şehir Ege Denizi kıyısında.',
        wrongOptions: [
          'Ich komme aus Izmir. Die Stadt liegt in den Bergen.',
          'Ich komme aus Berlin. Die Stadt liegt am Ägäischen Meer.',
        ],
        wrongTurkish: [
          'Ben İzmirliyim. Şehir dağların içinde.',
          'Ben Berlinliyim. Şehir Ege Denizi kıyısında.',
        ],
        wrongNotes: [
          'İzmir Ege kıyısındadır; dağların içinde değil.',
          'İzmirli olduğunu söylemen gerekiyordu; Berlin başka bir şehir.',
        ],
        note: '"aus ..." = ...li olmak/...den gelmek. "liegen" = bir yerde bulunmak: "Die Stadt liegt am Meer."',
      },
      {
        type: 'say',
        speaker: 'Sophie',
        german: 'Interessant! Wie viele Einwohner hat Izmir?',
        turkish: 'İlginç! İzmir\'in nüfusu kaç?',
      },
      {
        type: 'reply',
        prompt: 'Yaklaşık dört milyon nüfusu olduğunu söyle.',
        german: 'Izmir hat ungefähr vier Millionen Einwohner.',
        turkish: 'İzmir\'in yaklaşık dört milyon nüfusu var.',
        wrongOptions: [
          'Izmir hat ungefähr vier Millionen Autos.',
          'Izmir hat ungefähr vierhundert Einwohner.',
        ],
        wrongTurkish: [
          'İzmir\'in yaklaşık dört milyon arabası var.',
          'İzmir\'in yaklaşık dört yüz nüfusu var.',
        ],
        wrongNotes: [
          'Nüfus soruluyor ("Einwohner"); araba sayısı değil.',
          '"vierhundert" dört yüz demektir; dört milyon olduğunu söylemelisin.',
        ],
        note: '"die Einwohner" = nüfus/sakinler. "Millionen" çoğuldur: "vier Millionen".',
      },
      {
        type: 'say',
        speaker: 'Sophie',
        german: 'Und was kann man dort besichtigen?',
        turkish: 'Peki orada neler gezilebilir?',
      },
      {
        type: 'reply',
        prompt: 'Saat Kulesi ile eski çarşının gezilebileceğini söyle.',
        german: 'Man kann den Uhrturm und den alten Basar besichtigen.',
        turkish: 'Saat Kulesi ile eski çarşı gezilebilir.',
        wrongOptions: [
          'Man kann den Uhrturm und den alten Basar nicht besichtigen.',
          'Man kann den Uhrturm und den alten Basar essen.',
        ],
        wrongTurkish: [
          'Saat Kulesi ile eski çarşı gezilemez.',
          'Saat Kulesi ile eski çarşı yenebilir.',
        ],
        wrongNotes: [
          'Gezilebilir demen gerekiyordu; bu cevap tersini söylüyor.',
          '"besichtigen" gezip görmek demektir; "essen" yemek.',
        ],
        note: '"man kann ..." = ...ebilir (genel). "besichtigen" = gezip görmek (Akkusativ).',
      },
      {
        type: 'choice',
        speaker: 'Sophie',
        german: 'Und wie ist das Wetter im Sommer? Ist es dort sehr heiß?',
        turkish: 'Peki yazın hava nasıl? Orası çok sıcak mı?',
        prompt: 'Yazın havanın nasıl olduğunu seç.',
        options: [
          {
            german: 'Ja, im Sommer ist es dort sehr heiß.',
            turkish: 'Evet, yazın orası çok sıcak.',
            responseGerman: 'Dann ist das Meer bestimmt eine gute Abkühlung.',
            responseTurkish: 'O zaman deniz kesinlikle iyi bir serinlik olur.',
          },
          {
            german: 'Ja, aber am Meer weht oft ein kühler Wind.',
            turkish: 'Evet, ama deniz kıyısında sık sık serin bir rüzgâr eser.',
            responseGerman: 'Das klingt perfekt für einen Urlaub.',
            responseTurkish: 'Bu tatil için mükemmel olur.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Sophie',
        german: 'Und was isst man in Izmir besonders gern?',
        turkish: 'Peki İzmir\'de özellikle ne yenir?',
      },
      {
        type: 'reply',
        prompt: 'Orada taze balık ve zeytinyağlı sebze yenildiğini söyle.',
        german: 'Man isst dort frischen Fisch und Gemüse mit Olivenöl.',
        turkish: 'Orada taze balık ve zeytinyağlı sebze yenir.',
        wrongOptions: [
          'Man isst dort frischen Schnee und Gemüse mit Olivenöl.',
          'Man trinkt dort frischen Fisch und Gemüse mit Olivenöl.',
        ],
        wrongTurkish: [
          'Orada taze kar ve zeytinyağlı sebze yenir.',
          'Orada taze balık ve zeytinyağlı sebze içilir.',
        ],
        wrongNotes: [
          'Kar yenmez; taze balık demeliydin.',
          '"trinken" içmek demektir; yemek için "essen" kullanılır.',
        ],
        note: '"man isst" = (genel olarak) yenir. "frischen Fisch": "der Fisch" eril, Akkusativ\'de sıfat sonu -en alır.',
      },
      {
        type: 'say',
        speaker: 'Sophie',
        german: 'Das klingt lecker! Gibt es viele Touristen?',
        turkish: 'Lezzetli görünüyor! Çok turist var mı?',
      },
      {
        type: 'reply',
        prompt: 'Evet, yazın çok turist geldiğini söyle.',
        german: 'Ja, im Sommer kommen viele Touristen.',
        turkish: 'Evet, yazın çok turist geliyor.',
        wrongOptions: [
          'Ja, im Sommer kommen keine Touristen.',
          'Ja, im Winter kommen viele Touristen.',
        ],
        wrongTurkish: [
          'Evet, yazın hiç turist gelmiyor.',
          'Evet, kışın çok turist geliyor.',
        ],
        wrongNotes: [
          '"Ja" ile "keine" çelişir.',
          'Yazın çok turist geldiğini söyleyecektin; kışı söyledin.',
        ],
        note: '"viele" = çok (sayılabilir çoğul isimlerle). "im Sommer" = yazın.',
      },
      {
        type: 'say',
        speaker: 'Sophie',
        german: 'Ich möchte unbedingt einmal nach Izmir reisen. Wann ist die beste Reisezeit?',
        turkish: 'Bir gün mutlaka İzmir\'e gitmek istiyorum. En iyi seyahat zamanı ne zaman?',
      },
      {
        type: 'reply',
        prompt: 'Sonbaharın en iyisi olduğunu, çünkü havanın ılık ve sakin olduğunu söyle (weil).',
        german: 'Der Herbst ist am besten, weil es warm und ruhig ist.',
        turkish: 'Sonbahar en iyisi, çünkü hava ılık ve sakin.',
        wrongOptions: [
          'Der Herbst ist am schlechtesten, weil es kalt und laut ist.',
          'Der Herbst ist am besten, weil es regnet und schneit.',
        ],
        wrongTurkish: [
          'Sonbahar en kötüsü, çünkü soğuk ve gürültülü.',
          'Sonbahar en iyisi, çünkü yağmur ve kar yağıyor.',
        ],
        wrongNotes: [
          'Sonbaharı önerecektin; bu cevap tersini söylüyor.',
          'Gerekçe uyumsuz: havanın ılık ve sakin olduğunu söylemelisin.',
        ],
        note: '"am besten" = en iyisi. "weil" yan cümlesinde fiil sona gider: "weil es warm und ruhig ist".',
      },
      {
        type: 'say',
        speaker: 'Sophie',
        german: 'Dann komme ich im Herbst! Danke für die Tipps.',
        turkish: 'O zaman sonbaharda geliyorum! İpuçları için teşekkürler.',
      },
    ],
  },
  {
    id: 'taksi-cagirma',
    level: 'A2',
    title: 'Taksi Çağırma ve Adres Verme',
    description: 'Telefonla taksi çağır, adresini ve gideceğin yeri söyle.',
    place: 'Telefon (taksi)',
    steps: [
      {
        type: 'say',
        speaker: 'Taksi merkezi',
        german: 'Taxizentrale Berlin, guten Tag. Wie kann ich helfen?',
        turkish: 'Berlin Taksi Merkezi, iyi günler. Nasıl yardımcı olabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Bir taksi çağırmak istediğini söyle.',
        german: 'Guten Tag. Ich möchte ein Taxi bestellen.',
        turkish: 'İyi günler. Bir taksi çağırmak istiyorum.',
        wrongOptions: ['Guten Tag. Ich möchte ein Taxi kaufen.', 'Guten Tag. Ich möchte ein Taxi fahren.'],
        wrongTurkish: ['İyi günler. Bir taksi satın almak istiyorum.', 'İyi günler. Bir taksi sürmek istiyorum.'],
        wrongNotes: [
          '"bestellen" çağırmak/sipariş etmek demektir; taksi satın alınmaz.',
          'Taksi çağıracaksın; sürücü değilsin.',
        ],
        note: '"ein Taxi bestellen" = taksi çağırmak. "das Taxi" nötrdür.',
      },
      {
        type: 'say',
        speaker: 'Taksi merkezi',
        german: 'Gern. Wie ist Ihre Adresse?',
        turkish: 'Memnuniyetle. Adresiniz nedir?',
      },
      {
        type: 'reply',
        prompt: 'Lindenstraße 8 numarada oturduğunu söyle.',
        german: 'Ich wohne in der Lindenstraße acht.',
        turkish: 'Lindenstraße 8 numarada oturuyorum.',
        wrongOptions: ['Ich wohne in der Lindenstraße achtzig.', 'Ich arbeite in der Lindenstraße acht.'],
        wrongTurkish: ['Lindenstraße 80 numarada oturuyorum.', 'Lindenstraße 8 numarada çalışıyorum.'],
        wrongNotes: [
          'Numara sekiz; "achtzig" seksen demektir.',
          'Evinden alınacaksın; "wohnen" oturmak, "arbeiten" çalışmak demektir.',
        ],
        note: '"in der ...straße" + numara adres verir. "acht" = 8, "achtzig" = 80.',
      },
      {
        type: 'say',
        speaker: 'Taksi merkezi',
        german: 'Und wohin möchten Sie fahren?',
        turkish: 'Peki nereye gitmek istiyorsunuz?',
      },
      {
        type: 'reply',
        prompt: 'Ana tren istasyonuna gitmek istediğini söyle.',
        german: 'Ich möchte zum Hauptbahnhof fahren.',
        turkish: 'Ana tren istasyonuna gitmek istiyorum.',
        wrongOptions: ['Ich möchte vom Hauptbahnhof fahren.', 'Ich möchte zum Hauptbahnhof schwimmen.'],
        wrongTurkish: ['Ana tren istasyonundan gitmek istiyorum.', 'Ana tren istasyonuna yüzmek istiyorum.'],
        wrongNotes: [
          '"vom" çıkış yerini bildirir; sen oraya gidiyorsun, "zum" kullanılır.',
          'Taksiyle "fahren" (gitmek) kullanılır; "schwimmen" yüzmek demektir.',
        ],
        note: '"zu" + Dativ gidilen yeri bildirir: "zum Hauptbahnhof" (zu dem). "fahren" = (araçla) gitmek.',
      },
      {
        type: 'choice',
        speaker: 'Taksi merkezi',
        german: 'Möchten Sie das Taxi sofort oder zu einer bestimmten Uhrzeit?',
        turkish: 'Taksiyi hemen mi yoksa belirli bir saatte mi istersiniz?',
        prompt: 'Taksiyi ne zaman istediğini seç.',
        options: [
          {
            german: 'Ich brauche das Taxi sofort.',
            turkish: 'Taksiye hemen ihtiyacım var.',
            responseGerman: 'Gut, ein Fahrer ist in zehn Minuten bei Ihnen.',
            responseTurkish: 'İyi, bir şoför on dakika içinde yanınızda olur.',
          },
          {
            german: 'Ich brauche das Taxi um acht Uhr.',
            turkish: 'Taksiye saat sekizde ihtiyacım var.',
            responseGerman: 'Gut, ich notiere acht Uhr für Sie.',
            responseTurkish: 'İyi, sizin için saat sekizi not ediyorum.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Taksi merkezi',
        german: 'Wie viele Personen fahren mit, und haben Sie Gepäck?',
        turkish: 'Kaç kişi gidiyor ve bagajınız var mı?',
      },
      {
        type: 'reply',
        prompt: 'İki kişi olduğunuzu ve bir valiziniz olduğunu söyle.',
        german: 'Wir sind zu zweit und haben einen Koffer.',
        turkish: 'İki kişiyiz ve bir valizimiz var.',
        wrongOptions: ['Wir sind zu dritt und haben einen Koffer.', 'Wir sind zu zweit und haben einen Hund.'],
        wrongTurkish: ['Üç kişiyiz ve bir valizimiz var.', 'İki kişiyiz ve bir köpeğimiz var.'],
        wrongNotes: [
          'İki kişisiniz; "zu dritt" üç kişi demektir.',
          'Bagajı soruyor; köpek bagaj değildir.',
        ],
        note: '"zu zweit" = iki kişi olarak ("zu dritt" = üç kişi). "der Koffer" eril olduğundan "einen Koffer" denir.',
      },
      {
        type: 'say',
        speaker: 'Taksi merkezi',
        german: 'Alles klar. Die Fahrt kostet ungefähr fünfzehn Euro. Ist das in Ordnung?',
        turkish: 'Tamam. Yolculuk yaklaşık on beş euro tutar. Uygun mu?',
      },
      {
        type: 'reply',
        prompt: 'Uygun olduğunu söyle ve taksi içinde kartla ödeyip ödeyemeyeceğini sor.',
        german: 'Ja, das ist in Ordnung. Kann ich im Taxi mit Karte zahlen?',
        turkish: 'Evet, uygun. Taksi içinde kartla ödeyebilir miyim?',
        wrongOptions: [
          'Nein, das ist zu teuer. Kann ich im Taxi mit Karte zahlen?',
          'Ja, das ist in Ordnung. Wo ist die Kasse im Taxi?',
        ],
        wrongTurkish: [
          'Hayır, bu çok pahalı. Taksi içinde kartla ödeyebilir miyim?',
          'Evet, uygun. Taksideki kasa nerede?',
        ],
        wrongNotes: [
          'Fiyatı kabul edecektin; "zu teuer" teklifi reddeder.',
          'Ödeme yöntemini soracaktın; taksilerde kasa yoktur.',
        ],
        note: '"in Ordnung" = uygun, tamam. "mit Karte zahlen" = kartla ödemek.',
      },
      {
        type: 'say',
        speaker: 'Taksi merkezi',
        german: 'Ja, das geht. Das Taxi ist pünktlich bei Ihnen. Auf Wiederhören!',
        turkish: 'Evet, olur. Taksi tam zamanında yanınızda olur. Görüşmek üzere!',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve telefonda vedalaş.',
        german: 'Vielen Dank. Auf Wiederhören!',
        turkish: 'Çok teşekkürler. Görüşmek üzere!',
        wrongOptions: [
          'Vielen Dank. Ich warte nicht auf das Taxi.',
          'Hallo, ich möchte ein Taxi bestellen.',
        ],
        wrongTurkish: [
          'Çok teşekkürler. Taksiyi beklemeyeceğim.',
          'Merhaba, bir taksi çağırmak istiyorum.',
        ],
        wrongNotes: [
          'Taksi çağırdın; beklemeyeceğini söylemek çelişkili.',
          'Taksi zaten çağrıldı; görüşmeyi yeniden başlatma, teşekkür edip kapat.',
        ],
        note: '"Auf Wiederhören!" telefonda kullanılan veda kalıbıdır.',
      },
    ],
  },
  // ─── B1 ───────────────────────────────────────────────────────────────────
  {
    id: 'is-gorusmesi',
    level: 'B1',
    title: 'İş Görüşmesi',
    description: 'Kendini tanıt, motivasyonunu ve güçlü yönlerini anlat.',
    place: 'Şirket görüşme odası',
    steps: [
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german: 'Guten Morgen und herzlich willkommen. Bitte erzählen Sie uns kurz etwas über sich.',
        turkish: 'Günaydın ve hoş geldiniz. Lütfen bize kendinizden kısaca bahsedin.',
      },
      {
        type: 'reply',
        prompt: 'Mühendis olduğunu ve beş yıldır otomotiv sektöründe çalıştığını söyle.',
        german:
          'Ich bin Ingenieur und arbeite seit fünf Jahren in der Automobilbranche. Deshalb kenne ich die Abläufe sehr gut.',
        turkish:
          'Ben mühendisim ve beş yıldır otomotiv sektöründe çalışıyorum. Bu yüzden süreçleri çok iyi biliyorum.',
        wrongOptions: [
          'Ich habe gerade erst die Schule beendet und suche ein Praktikum.',
          'Ich bin nicht sicher, ob ich überhaupt arbeiten möchte.',
        ],
      },
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german: 'Warum möchten Sie bei uns arbeiten?',
        turkish: 'Neden bizim şirketimizde çalışmak istiyorsunuz?',
      },
      {
        type: 'reply',
        prompt: 'Şirketin çok yenilikçi olduğunu ve çok şey öğrenmek istediğini söyle (weil kullan).',
        german:
          'Ich möchte bei Ihnen arbeiten, weil Ihr Unternehmen sehr innovativ ist und ich viel Neues lernen möchte.',
        turkish:
          'Sizin şirketinizde çalışmak istiyorum, çünkü şirketiniz çok yenilikçi ve ben çok yeni şeyler öğrenmek istiyorum.',
        wrongOptions: [
          'Ich möchte bei Ihnen arbeiten, weil Ihr Unternehmen ist sehr innovativ.',
          'Ich weiß nicht, was Ihr Unternehmen macht.',
        ],
      },
      {
        type: 'choice',
        speaker: 'İK Uzmanı',
        german: 'Würden Sie lieber in einem kleinen Team oder in einer großen Abteilung arbeiten?',
        turkish: 'Küçük bir ekipte mi yoksa büyük bir departmanda mı çalışmayı tercih edersiniz?',
        prompt: 'Çalışma ortamı tercihini gerekçesiyle seç.',
        options: [
          {
            german: 'Ich würde lieber in einem kleinen Team arbeiten, weil man sich dort schneller abstimmen kann.',
            turkish: 'Küçük bir ekipte çalışmayı tercih ederim, çünkü orada insan daha hızlı anlaşabilir.',
            responseGerman: 'Das verstehe ich. Bei uns haben die meisten Teams nur fünf bis acht Mitarbeiter.',
            responseTurkish: 'Bunu anlıyorum. Bizde çoğu ekipte yalnızca beş ila sekiz çalışan var.',
          },
          {
            german: 'Ich würde lieber in einer großen Abteilung arbeiten, weil man dort mehr von anderen lernen kann.',
            turkish: 'Büyük bir departmanda çalışmayı tercih ederim, çünkü orada insan başkalarından daha çok şey öğrenebilir.',
            responseGerman: 'Das sehen wir ähnlich. Unsere größte Abteilung hat über vierzig Mitarbeiter.',
            responseTurkish: 'Biz de benzer düşünüyoruz. En büyük departmanımızda kırktan fazla çalışan var.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german: 'Was sind Ihre größten Stärken?',
        turkish: 'En büyük güçlü yönleriniz nelerdir?',
      },
      {
        type: 'reply',
        prompt: 'Takımda iyi çalıştığını ve zor durumlarda sakin kaldığını söyle (dass kullan).',
        german: 'Ich denke, dass ich gut im Team arbeite und auch in schwierigen Situationen ruhig bleibe.',
        turkish: 'Bence takım içinde iyi çalışıyorum ve zor durumlarda da sakin kalıyorum.',
        wrongOptions: [
          'Ich denke, dass ich arbeite gut im Team.',
          'Ich arbeite am liebsten allein, deshalb habe ich keine Stärken.',
        ],
      },
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german: 'Haben Sie noch Fragen an uns?',
        turkish: 'Bize sormak istediğiniz başka bir şey var mı?',
      },
      {
        type: 'reply',
        prompt: 'Çalışma saatlerinin esnek olup olmadığını öğrenmek istediğini söyle (ob kullan).',
        german: 'Ja, ich würde gern wissen, ob die Arbeitszeiten flexibel sind.',
        turkish: 'Evet, çalışma saatlerinin esnek olup olmadığını bilmek isterdim.',
        wrongOptions: [
          'Ja, ich würde gern wissen, wenn die Arbeitszeiten flexibel sind.',
          'Nein, ich habe keine Zeit für ein Gespräch.',
        ],
      },
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german:
          'Obwohl noch andere Bewerber da sind, haben Sie einen sehr guten Eindruck gemacht. Wir melden uns nächste Woche.',
        turkish:
          'Başka adaylar da olmasına rağmen çok iyi bir izlenim bıraktınız. Gelecek hafta size dönüş yapacağız.',
      },
      {
        type: 'reply',
        prompt: 'Görüşme için teşekkür et ve haber bekleyeceğini söyle.',
        german: 'Vielen Dank für das Gespräch. Ich freue mich darauf, bald von Ihnen zu hören.',
        turkish: 'Görüşme için çok teşekkürler. Yakında sizden haber almayı dört gözle bekliyorum.',
        wrongOptions: [
          'Das Gespräch war lang, deshalb gehe ich jetzt schlafen.',
          'Entschuldigung, ich habe meinen Termin vergessen.',
        ],
      },
    ],
  },
  {
    id: 'resmi-daire',
    level: 'B1',
    title: 'Resmî Dairede İşlem Yapma',
    description: 'İkametini kaydettir, eksik belgeyi açıkla, yeni randevu al.',
    place: 'Belediye hizmet binası (Bürgeramt)',
    steps: [
      {
        type: 'say',
        speaker: 'Memur',
        german: 'Guten Tag. Nehmen Sie bitte Platz. Was kann ich für Sie tun?',
        turkish: 'İyi günler. Lütfen oturun. Sizin için ne yapabilirim?',
      },
      {
        type: 'reply',
        prompt: 'İki hafta önce taşındığını ve ikametini kaydettirmek istediğini söyle.',
        german: 'Guten Tag. Ich bin vor zwei Wochen umgezogen und möchte mich anmelden.',
        turkish: 'İyi günler. İki hafta önce taşındım ve ikametimi kaydettirmek istiyorum.',
        wrongOptions: [
          'Guten Tag. Ich möchte mich abmelden, weil ich nach Hause fliege.',
          'Guten Tag. Ich habe meinen Pass verloren und suche ein Hotel.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Memur',
        german: 'Möchten Sie das Formular auf Deutsch oder auf Englisch ausfüllen?',
        turkish: 'Formu Almanca mı yoksa İngilizce mi doldurmak istersiniz?',
        prompt: 'Formu hangi dilde dolduracağını seç.',
        options: [
          {
            german: 'Auf Deutsch, bitte. Wenn ich eine Frage habe, melde ich mich.',
            turkish: 'Almanca, lütfen. Bir sorum olursa haber veririm.',
            responseGerman: 'Gut, dann gebe ich Ihnen das deutsche Formular.',
            responseTurkish: 'İyi, o zaman size Almanca formu veririm.',
          },
          {
            german: 'Auf Englisch, bitte, weil ich die Wörter dann besser verstehe.',
            turkish: 'İngilizce, lütfen, çünkü o zaman kelimeleri daha iyi anlarım.',
            responseGerman: 'Kein Problem, wir haben das Formular auch auf Englisch.',
            responseTurkish: 'Sorun değil, formumuz İngilizce olarak da var.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Memur',
        german: 'Haben Sie alle nötigen Unterlagen dabei, zum Beispiel den Mietvertrag und Ihren Reisepass?',
        turkish: 'Gerekli tüm belgeler yanınızda mı, örneğin kira sözleşmesi ve pasaportunuz?',
      },
      {
        type: 'reply',
        prompt: 'Pasaportunun yanında olduğunu ama ev sahibinin onayının eksik olduğunu söyle.',
        german: 'Meinen Reisepass habe ich dabei, aber die Bestätigung vom Vermieter fehlt leider noch.',
        turkish: 'Pasaportum yanımda, ama maalesef ev sahibinin onayı hâlâ eksik.',
        wrongOptions: [
          'Ich habe alles dabei, deshalb fehlt mir nichts mehr.',
          'Ich habe keinen Mietvertrag, obwohl ich seit Jahren hier wohne.',
        ],
      },
      {
        type: 'say',
        speaker: 'Memur',
        german:
          'Ohne diese Bestätigung kann ich Sie leider nicht anmelden. Sie können aber einen neuen Termin vereinbaren.',
        turkish: 'Bu onay olmadan maalesef sizi kaydedemem. Ama yeni bir randevu ayarlayabilirsiniz.',
      },
      {
        type: 'reply',
        prompt: 'Onayı yarın alabileceğini söyle ve bir sonraki boş randevuyu sor.',
        german: 'Ich kann die Bestätigung morgen holen. Wann ist der nächste freie Termin?',
        turkish: 'Onayı yarın alabilirim. Bir sonraki boş randevu ne zaman?',
        wrongOptions: [
          'Ich möchte keinen Termin, sondern sofort einen neuen Pass.',
          'Wann haben Sie Feierabend, obwohl es regnet?',
        ],
      },
      {
        type: 'say',
        speaker: 'Memur',
        german:
          'Der nächste freie Termin ist am Donnerstag um neun Uhr. Das Verfahren dauert dann nur etwa zehn Minuten.',
        turkish: 'Bir sonraki boş randevu perşembe saat dokuzda. İşlem o zaman yalnızca yaklaşık on dakika sürer.',
      },
      {
        type: 'reply',
        prompt: 'Perşembenin uygun olduğunu söyle ve unutmamak için e-postayla onay iste (damit kullan).',
        german:
          'Donnerstag passt mir gut. Könnten Sie mir bitte eine Bestätigung per E-Mail schicken, damit ich den Termin nicht vergesse?',
        turkish:
          'Perşembe bana uyar. Randevuyu unutmamam için bana e-postayla bir onay gönderebilir misiniz?',
        wrongOptions: [
          'Donnerstag passt mir nicht, deshalb komme ich am Donnerstag.',
          'Ich möchte lieber heute noch bezahlen und gehen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Memur',
        german: 'Selbstverständlich. Ihre E-Mail-Adresse steht ja im Formular. Einen schönen Tag noch!',
        turkish: 'Elbette. E-posta adresiniz zaten formda yazıyor. İyi günler dilerim!',
      },
    ],
  },
  {
    id: 'isyeri-sorun',
    level: 'B1',
    title: 'İş Yerinde Sorun Çözme',
    description: 'Geciken bir proje için müdürüne durumu anlat ve çözüm öner.',
    place: 'Ofis',
    steps: [
      {
        type: 'say',
        speaker: 'Müdür',
        german: 'Guten Morgen. Ich habe gehört, dass es Probleme mit dem Kundenprojekt gibt. Was ist passiert?',
        turkish: 'Günaydın. Müşteri projesinde sorunlar olduğunu duydum. Ne oldu?',
      },
      {
        type: 'reply',
        prompt: 'Tedarikçi malzemeyi geç gönderdiği için teslim tarihini yetiştiremeyeceğinizi söyle (deshalb).',
        german: 'Der Lieferant hat das Material zu spät geschickt, deshalb schaffen wir den Termin leider nicht.',
        turkish: 'Tedarikçi malzemeyi çok geç gönderdi, bu yüzden maalesef teslim tarihini yetiştiremiyoruz.',
        wrongOptions: [
          'Der Lieferant hat das Material zu spät geschickt, deshalb wir schaffen den Termin leider nicht.',
          'Wir schaffen den Termin problemlos, obwohl der Lieferant uns kein Material geschickt hat.',
        ],
      },
      {
        type: 'say',
        speaker: 'Müdür',
        german: 'Verstehe. Wie lange brauchen Sie noch, wenn das Material nächste Woche kommt?',
        turkish: 'Anlıyorum. Malzeme gelecek hafta gelirse daha ne kadar zamana ihtiyacınız var?',
      },
      {
        type: 'reply',
        prompt: 'Malzeme gelirse bir hafta daha gerektiğini, fazla mesai yaparsanız daha erken bitebileceğini söyle (wenn).',
        german:
          'Wenn das Material kommt, brauchen wir noch eine Woche. Wenn wir Überstunden machen, können wir vielleicht früher fertig werden.',
        turkish:
          'Malzeme gelirse bir hafta daha gerekiyor. Fazla mesai yaparsak belki daha erken bitirebiliriz.',
        wrongOptions: [
          'Wenn das Material kommt, wir brauchen noch eine Woche.',
          'Wenn wir Überstunden machen, brauchen wir zwei Wochen mehr, weil wir dann schneller sind.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Müdür',
        german: 'Soll ich selbst mit dem Lieferanten sprechen, oder möchten Sie das übernehmen?',
        turkish: 'Tedarikçiyle ben mi konuşayım, yoksa bunu siz mi üstlenmek istersiniz?',
        prompt: 'Tedarikçiyle kimin konuşacağını gerekçesiyle seç.',
        options: [
          {
            german: 'Es wäre gut, wenn Sie mit ihm sprechen würden, weil er dann schneller reagiert.',
            turkish: 'Sizin onunla konuşmanız iyi olur, çünkü o zaman daha hızlı tepki verir.',
            responseGerman: 'Einverstanden, ich rufe ihn heute Nachmittag an.',
            responseTurkish: 'Anlaştık, onu bugün öğleden sonra ararım.',
          },
          {
            german: 'Ich würde das gern selbst übernehmen, weil ich den Lieferanten schon lange kenne.',
            turkish: 'Bunu kendim üstlenmek isterim, çünkü tedarikçiyi uzun zamandır tanıyorum.',
            responseGerman: 'Einverstanden, dann kümmern Sie sich bitte darum.',
            responseTurkish: 'Anlaştık, o zaman lütfen siz ilgilenin.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Müdür',
        german: 'Gut. Während Sie auf das Material warten, sollten Sie den Kunden informieren. Wer übernimmt das?',
        turkish: 'İyi. Malzemeyi beklerken müşteriyi bilgilendirmeniz gerekir. Bunu kim üstlenecek?',
      },
      {
        type: 'reply',
        prompt: 'Müşteriyi bugün kendin arayacağını, çünkü projeyi en iyi senin bildiğini söyle (weil).',
        german: 'Ich rufe den Kunden heute selbst an, weil ich das Projekt am besten kenne.',
        turkish: 'Müşteriyi bugün kendim arayacağım, çünkü projeyi en iyi ben biliyorum.',
        wrongOptions: [
          'Ich rufe den Kunden heute selbst an, weil ich kenne das Projekt am besten.',
          'Der Kunde soll mich anrufen, damit ich nichts erklären muss und niemand etwas erfährt.',
        ],
      },
      {
        type: 'say',
        speaker: 'Müdür',
        german: 'Danke. Und wie können wir solche Verzögerungen in Zukunft vermeiden?',
        turkish: 'Teşekkürler. Peki gelecekte bu tür gecikmeleri nasıl önleyebiliriz?',
      },
      {
        type: 'reply',
        prompt: 'İkinci bir tedarikçi bulmayı ve siparişleri daha erken vermeyi öner (dass).',
        german: 'Ich schlage vor, dass wir einen zweiten Lieferanten suchen und die Bestellungen früher aufgeben.',
        turkish: 'Bir ikinci tedarikçi aramamızı ve siparişleri daha erken vermemizi öneriyorum.',
        wrongOptions: [
          'Ich schlage vor, dass wir suchen keinen zweiten Lieferanten.',
          'Ich schlage vor, dass wir die Bestellungen noch später aufgeben, deshalb gibt es weniger Probleme.',
        ],
      },
      {
        type: 'say',
        speaker: 'Müdür',
        german: 'Gute Idee. Bereiten Sie bitte bis Freitag einen kurzen Plan vor.',
        turkish: 'İyi fikir. Lütfen cumaya kadar kısa bir plan hazırlayın.',
      },
    ],
  },
  {
    id: 'sigorta-gorusmesi',
    level: 'B1',
    title: 'Sigorta Görüşmesi',
    description: 'Park halindeki arabana çarpıldığını sigortaya bildir.',
    place: 'Sigorta şirketi (telefon)',
    steps: [
      {
        type: 'say',
        speaker: 'Sigorta danışmanı',
        german: 'Versicherung Nordstern, guten Tag. Worum geht es?',
        turkish: 'Nordstern Sigorta, iyi günler. Konu nedir?',
      },
      {
        type: 'reply',
        prompt: 'Dün park halindeyken arabana başka bir arabanın çarptığını ve hasarı bildirmek istediğini söyle (während).',
        german:
          'Gestern ist ein anderes Auto gegen meinen Wagen gefahren, während er geparkt war. Ich möchte den Schaden melden.',
        turkish:
          'Dün başka bir araba, park hâlindeyken arabama çarptı. Hasarı bildirmek istiyorum.',
        wrongOptions: [
          'Gestern bin ich gegen ein anderes Auto gefahren, weil mein Wagen war geparkt.',
          'Ich möchte meine Versicherung kündigen, weil sie mir zu teuer geworden ist.',
        ],
      },
      {
        type: 'say',
        speaker: 'Sigorta danışmanı',
        german: 'Das tut mir leid. Wurde jemand verletzt, und hat die Polizei den Unfall aufgenommen?',
        turkish: 'Çok üzüldüm. Yaralanan oldu mu ve polis kazayı tutanağa geçirdi mi?',
      },
      {
        type: 'reply',
        prompt: 'Neyse ki kimsenin yaralanmadığını, polisin geldiğini ve tutanak tuttuğunu söyle.',
        german: 'Zum Glück wurde niemand verletzt. Die Polizei war da und hat ein Protokoll geschrieben.',
        turkish: 'Neyse ki kimse yaralanmadı. Polis geldi ve bir tutanak tuttu.',
        wrongOptions: [
          'Zum Glück niemand verletzt wurde. Die Polizei hat ein Protokoll geschrieben.',
          'Leider wurden zwei Personen verletzt, aber die Polizei war nicht da.',
        ],
      },
      {
        type: 'say',
        speaker: 'Sigorta danışmanı',
        german: 'Gut. Wie hoch ist der Schaden ungefähr, und haben Sie schon Fotos gemacht?',
        turkish: 'İyi. Hasar yaklaşık ne kadar ve fotoğraf çektiniz mi?',
      },
      {
        type: 'reply',
        prompt: 'Fotoğraf çektiğini ve atölyenin hasarı yaklaşık bin iki yüz euro tahmin ettiğini söyle.',
        german: 'Ich habe Fotos gemacht. Die Werkstatt schätzt den Schaden auf etwa zwölfhundert Euro.',
        turkish: 'Fotoğraf çektim. Atölye hasarı yaklaşık bin iki yüz euro olarak tahmin ediyor.',
        wrongOptions: [
          'Ich habe keine Fotos gemacht, weil ich das Auto schon verkauft habe.',
          'Die Werkstatt schätzt den Schaden auf zwölf Euro, deshalb brauche ich keine Fotos.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Sigorta danışmanı',
        german: 'Wie möchten Sie bei Rückfragen erreicht werden, per Telefon oder per E-Mail?',
        turkish: 'Sorular çıkarsa size nasıl ulaşalım, telefonla mı yoksa e-postayla mı?',
        prompt: 'Hangi iletişim yolunu istediğini seç.',
        options: [
          {
            german: 'Am liebsten per E-Mail, weil ich tagsüber im Büro nicht telefonieren kann.',
            turkish: 'En çok e-postayla, çünkü gün içinde ofiste telefonla konuşamıyorum.',
            responseGerman: 'Gut, dann schreiben wir Ihnen nur per E-Mail.',
            responseTurkish: 'İyi, o zaman size yalnızca e-postayla yazarız.',
          },
          {
            german: 'Am liebsten per Telefon, weil das schneller geht.',
            turkish: 'En çok telefonla, çünkü bu daha hızlı.',
            responseGerman: 'Gut, dann rufen wir Sie unter Ihrer Nummer an.',
            responseTurkish: 'İyi, o zaman numaranızdan sizi ararız.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Sigorta danışmanı',
        german:
          'Bitte schicken Sie uns die Fotos und das Polizeiprotokoll per E-Mail. Wenn alles stimmt, bekommen Sie das Geld innerhalb von zwei Wochen.',
        turkish:
          'Lütfen fotoğrafları ve polis tutanağını e-postayla bize gönderin. Her şey doğruysa parayı iki hafta içinde alırsınız.',
      },
      {
        type: 'reply',
        prompt: 'Hepsini bugün göndereceğini söyle ve kiralık araç masrafının karşılanıp karşılanmadığını sor (ob).',
        german:
          'Ich schicke alles noch heute. Können Sie mir sagen, ob die Kosten für einen Mietwagen übernommen werden?',
        turkish:
          'Hepsini bugün gönderirim. Kiralık araç masraflarının karşılanıp karşılanmadığını söyleyebilir misiniz?',
        wrongOptions: [
          'Ich schicke alles noch heute. Können Sie mir sagen, wenn die Kosten für einen Mietwagen übernommen werden?',
          'Ich schicke nichts, weil ich keine E-Mail-Adresse habe und das Auto ohnehin schrottreif ist.',
        ],
      },
      {
        type: 'say',
        speaker: 'Sigorta danışmanı',
        german: 'Ja, bis zu sieben Tage. Bitte heben Sie die Rechnung gut auf.',
        turkish: 'Evet, yedi güne kadar. Lütfen faturayı iyi saklayın.',
      },
    ],
  },
  {
    id: 'kira-sozlesmesi',
    level: 'B1',
    title: 'Kira Sözleşmesi',
    description: 'Sözleşmedeki süre, depozito ve evcil hayvan maddelerini sor.',
    place: 'Ev sahibinin ofisi',
    steps: [
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german: 'Schön, dass Sie sich für die Wohnung entschieden haben. Hier ist der Mietvertrag. Haben Sie noch Fragen?',
        turkish: 'Daireye karar vermenize sevindim. İşte kira sözleşmesi. Sorunuz var mı?',
      },
      {
        type: 'reply',
        prompt: 'Sözleşmenin ne kadar sürdüğünü ve ne zaman feshedebileceğini sor.',
        german: 'Ja. Wie lange läuft der Vertrag, und wann kann ich ihn kündigen?',
        turkish: 'Evet. Sözleşme ne kadar süreli ve onu ne zaman feshedebilirim?',
        wrongOptions: [
          'Ja. Wie lange läuft die Miete, und wann bekomme ich ein neues Auto?',
          'Nein, ich habe keine Fragen, deshalb unterschreibe ich nichts.',
        ],
      },
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german: 'Der Vertrag ist unbefristet. Sie können mit einer Frist von drei Monaten kündigen.',
        turkish: 'Sözleşme süresiz. Üç aylık bir ihbar süresiyle feshedebilirsiniz.',
      },
      {
        type: 'reply',
        prompt: 'Depozitonun ne kadar olduğunu ve taşınırsan ne zaman geri alacağını sor (wenn).',
        german: 'Wie hoch ist die Kaution, und wann bekomme ich sie zurück, wenn ich wieder ausziehe?',
        turkish: 'Depozito ne kadar ve tekrar taşınırsam ne zaman geri alırım?',
        wrongOptions: [
          'Wie hoch ist die Kaution, und wann bekomme ich sie zurück, wenn ich ziehe wieder aus?',
          'Wann muss ich die Kaution zurückgeben, damit Sie wieder einziehen können?',
        ],
      },
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german:
          'Die Kaution beträgt drei Monatsmieten. Sie bekommen sie spätestens sechs Monate nach dem Auszug zurück, wenn es keine Schäden gibt.',
        turkish:
          'Depozito üç aylık kira bedeli. Hasar yoksa en geç taşındıktan altı ay sonra geri alırsınız.',
      },
      {
        type: 'reply',
        prompt: 'Küçük bir kedin olduğunu ve evcil hayvana izin verilip verilmediğini bilmek istediğini söyle (ob).',
        german: 'Ich habe eine kleine Katze. Ich möchte wissen, ob Haustiere in der Wohnung erlaubt sind.',
        turkish: 'Küçük bir kedim var. Dairede evcil hayvanlara izin verilip verilmediğini bilmek istiyorum.',
        wrongOptions: [
          'Ich habe eine kleine Katze. Ich möchte wissen, wenn Haustiere in der Wohnung erlaubt sind.',
          'Ich habe einen großen Hund, der in der Wohnung machen darf, was er will.',
        ],
      },
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german:
          'Katzen sind erlaubt, solange sie keinen Lärm machen und die Nachbarn nicht stören. Das steht in Paragraf acht.',
        turkish:
          'Kediler, gürültü yapmadıkları ve komşuları rahatsız etmedikleri sürece serbest. Bu sekizinci maddede yazıyor.',
      },
      {
        type: 'reply',
        prompt: 'İmzalamadan önce sözleşmeyi evde sakin sakin okumak istediğini söyle ve yarın geri getirmeyi öner.',
        german:
          'Ich möchte den Vertrag zu Hause in Ruhe lesen, bevor ich unterschreibe. Kann ich ihn morgen zurückbringen?',
        turkish:
          'İmzalamadan önce sözleşmeyi evde sakin sakin okumak istiyorum. Yarın geri getirebilir miyim?',
        wrongOptions: [
          'Ich möchte den Vertrag zu Hause lesen, nachdem ich unterschreiben habe.',
          'Ich unterschreibe sofort, ohne den Vertrag zu lesen. Ich habe keine Zeit.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Ev sahibi',
        german: 'Soll ich Ihnen den Vertrag in Papierform mitgeben, oder möchten Sie ihn lieber als PDF per E-Mail bekommen?',
        turkish: 'Sözleşmeyi size basılı olarak mı vereyim, yoksa e-postayla PDF olarak mı almak istersiniz?',
        prompt: 'Sözleşmeyi hangi biçimde almak istediğini seç.',
        options: [
          {
            german: 'Bitte in Papierform, damit ich ihn in Ruhe markieren kann.',
            turkish: 'Lütfen basılı olarak, böylece rahatça işaretleyebilirim.',
            responseGerman: 'Gern, ich gebe Ihnen eine Kopie mit. Das Original behalte ich hier.',
            responseTurkish: 'Memnuniyetle, size bir kopya veririm. Aslını burada saklarım.',
          },
          {
            german: 'Bitte als PDF per E-Mail, weil ich ihn dann auch am Computer lesen kann.',
            turkish: 'Lütfen e-postayla PDF olarak, çünkü o zaman bilgisayarda da okuyabilirim.',
            responseGerman: 'Gern, ich schicke Ihnen den Vertrag gleich per E-Mail.',
            responseTurkish: 'Memnuniyetle, sözleşmeyi hemen size e-postayla gönderirim.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Ev sahibi',
        german: 'Selbstverständlich. Bis morgen Abend reicht völlig.',
        turkish: 'Elbette. Yarın akşama kadar tamamen yeter.',
      },
    ],
  },
  {
    id: 'doktor-detay',
    level: 'B1',
    title: 'Doktorla Ayrıntılı Görüşme',
    description: 'Sırt ağrını, nedenlerini ve tedavi önerilerini konuş.',
    place: 'Doktor muayenehanesi',
    steps: [
      {
        type: 'say',
        speaker: 'Doktor',
        german: 'Guten Tag. Was führt Sie zu mir?',
        turkish: 'İyi günler. Sizi bana getiren nedir?',
      },
      {
        type: 'reply',
        prompt: 'Üç haftadır sırt ağrın olduğunu, uzun süre oturunca kötüleştiğini söyle (wenn).',
        german:
          'Seit drei Wochen habe ich Rückenschmerzen, und es wird schlimmer, wenn ich lange am Schreibtisch sitze.',
        turkish:
          'Üç haftadır sırt ağrım var ve uzun süre masa başında oturursam daha da kötüleşiyor.',
        wrongOptions: [
          'Seit drei Wochen habe ich Rückenschmerzen, und es wird schlimmer, wenn ich sitze lange am Schreibtisch.',
          'Seit drei Wochen habe ich keine Schmerzen mehr, obwohl ich sehr lange sitze.',
        ],
      },
      {
        type: 'say',
        speaker: 'Doktor',
        german: 'Strahlt der Schmerz auch in die Beine aus? Und haben Sie in letzter Zeit schwer gehoben?',
        turkish: 'Ağrı bacaklara da yayılıyor mu? Ve son zamanlarda ağır bir şey kaldırdınız mı?',
      },
      {
        type: 'reply',
        prompt: 'Bacaklara yayılmadığını ama geçen hafta taşınırken ağır kutular taşıdığını söyle.',
        german: 'In die Beine strahlt er nicht aus. Aber letzte Woche habe ich beim Umzug schwere Kisten getragen.',
        turkish: 'Bacaklara yayılmıyor. Ama geçen hafta taşınırken ağır kutular taşıdım.',
        wrongOptions: [
          'In die Beine strahlt er nicht aus, aber letzte Woche ich habe schwere Kisten getragen.',
          'Ja, er strahlt in die Beine aus, deshalb habe ich letzte Woche keine Kisten getragen.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Doktor',
        german: 'Ich würde Ihren Rücken gern kurz untersuchen. Möchten Sie sich dafür hinsetzen oder hinlegen?',
        turkish: 'Sırtınızı kısaca muayene etmek isterim. Bunun için oturmak mı yoksa uzanmak mı istersiniz?',
        prompt: 'Muayene için nasıl durmak istediğini seç.',
        options: [
          {
            german: 'Ich setze mich lieber hin, weil das Liegen wehtut.',
            turkish: 'Oturmayı tercih ederim, çünkü uzanmak acıtıyor.',
            responseGerman: 'In Ordnung. Dann setzen Sie sich bitte auf den Stuhl.',
            responseTurkish: 'Tamam. O zaman lütfen sandalyeye oturun.',
          },
          {
            german: 'Ich lege mich lieber hin, weil mein Rücken dann entspannter ist.',
            turkish: 'Uzanmayı tercih ederim, çünkü o zaman sırtım daha rahat.',
            responseGerman: 'In Ordnung. Dann legen Sie sich bitte auf die Liege.',
            responseTurkish: 'Tamam. O zaman lütfen muayene yatağına uzanın.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Doktor',
        german:
          'Das erklärt einiges. Haben Sie schon Schmerzmittel genommen, und haben sie geholfen?',
        turkish: 'Bu bazı şeyleri açıklıyor. Daha önce ağrı kesici aldınız mı ve işe yaradı mı?',
      },
      {
        type: 'reply',
        prompt: 'İbuprofen aldığını ama yalnızca birkaç saat işe yaradığını söyle.',
        german: 'Ich habe Ibuprofen genommen, aber es hat nur für ein paar Stunden geholfen.',
        turkish: 'İbuprofen aldım ama sadece birkaç saat işe yaradı.',
        wrongOptions: [
          'Ich habe Ibuprofen genommen, aber es hat nur für ein paar Stunden geholfen sein.',
          'Ich habe Ibuprofen genommen, und es hat vollständig geholfen, deshalb bin ich hier.',
        ],
      },
      {
        type: 'say',
        speaker: 'Doktor',
        german:
          'Ich verschreibe Ihnen Krankengymnastik. Außerdem sollten Sie, während Sie arbeiten, jede Stunde kurz aufstehen und sich bewegen.',
        turkish:
          'Size fizik tedavi yazıyorum. Ayrıca çalışırken her saat kısa süre kalkıp hareket etmelisiniz.',
      },
      {
        type: 'reply',
        prompt: 'İşyerinde daha iyi bir sandalye isteyeceğini söyle ve kontrole ne zaman geleceğini sor.',
        german: 'Ich werde in meinem Büro einen besseren Stuhl verlangen. Wann soll ich zur Kontrolle wiederkommen?',
        turkish: 'İşyerimde daha iyi bir sandalye isteyeceğim. Kontrol için ne zaman tekrar gelmeliyim?',
        wrongOptions: [
          'Ich werde in meinem Büro einen besseren Stuhl verlangen. Wann soll ich gestern wiederkommen?',
          'Ich möchte keine Krankengymnastik machen, obwohl Sie sie verschrieben haben.',
        ],
      },
      {
        type: 'say',
        speaker: 'Doktor',
        german:
          'Kommen Sie in zwei Wochen wieder. Wenn die Schmerzen vorher schlimmer werden, rufen Sie mich bitte sofort an.',
        turkish:
          'İki hafta sonra tekrar gelin. Ağrılar daha önce şiddetlenirse lütfen hemen beni arayın.',
      },
    ],
  },
  {
    id: 'seyahat-degisikligi',
    level: 'B1',
    title: 'Seyahat Planı Değişikliği',
    description: 'İptal edilen uçuşun yerine yeni bir uçuş ayarla.',
    place: 'Seyahat acentesi',
    steps: [
      {
        type: 'say',
        speaker: 'Acente çalışanı',
        german: 'Reisebüro Sonnenschein, guten Tag. Wie kann ich Ihnen helfen?',
        turkish: 'Sonnenschein Seyahat Acentesi, iyi günler. Size nasıl yardımcı olabilirim?',
      },
      {
        type: 'reply',
        prompt: 'İstanbul uçuşunun iptal edildiğini ve bu yüzden rezervasyonu değiştirmek istediğini söyle (deshalb).',
        german: 'Mein Flug nach Istanbul wurde gestrichen, deshalb möchte ich meine Buchung ändern.',
        turkish: 'İstanbul uçuşum iptal edildi, bu yüzden rezervasyonumu değiştirmek istiyorum.',
        wrongOptions: [
          'Mein Flug nach Istanbul wurde gestrichen, deshalb ich möchte meine Buchung ändern.',
          'Mein Flug nach Istanbul war sehr schön, deshalb möchte ich noch einmal buchen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Acente çalışanı',
        german: 'Das tut mir leid. Wann wollten Sie ursprünglich fliegen, und wann können Sie jetzt reisen?',
        turkish: 'Çok üzüldüm. Aslında ne zaman uçacaktınız ve şimdi ne zaman seyahat edebilirsiniz?',
      },
      {
        type: 'reply',
        prompt: 'Cumartesi uçacaktın, ama daha erken de gidebilirsin; kız kardeşinin düğününe yetişmelisin (weil).',
        german:
          'Ich wollte am Samstag fliegen. Ich kann auch früher fliegen, weil ich unbedingt zur Hochzeit meiner Schwester kommen muss.',
        turkish:
          'Cumartesi uçmak istiyordum. Daha erken de uçabilirim, çünkü kız kardeşimin düğününe mutlaka yetişmem gerekiyor.',
        wrongOptions: [
          'Ich wollte am Samstag fliegen. Ich kann nicht früher fliegen, weil ich muss unbedingt zur Hochzeit meiner Schwester kommen.',
          'Ich wollte gestern fliegen, obwohl ich keine Hochzeit besuchen möchte.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Acente çalışanı',
        german: 'Reisen Sie allein oder mit Ihrer Familie?',
        turkish: 'Yalnız mı seyahat ediyorsunuz, yoksa ailenizle mi?',
        prompt: 'Kiminle seyahat edeceğini seç.',
        options: [
          {
            german: 'Ich reise allein, deshalb brauche ich nur einen Platz.',
            turkish: 'Yalnız seyahat ediyorum, bu yüzden yalnızca bir yere ihtiyacım var.',
            responseGerman: 'Gut, dann suche ich nur einen Platz.',
            responseTurkish: 'İyi, o zaman yalnızca bir yer ararım.',
          },
          {
            german: 'Ich reise mit meinem Bruder, deshalb brauche ich zwei Plätze.',
            turkish: 'Erkek kardeşimle seyahat ediyorum, bu yüzden iki yere ihtiyacım var.',
            responseGerman: 'Gut, dann suche ich zwei Plätze nebeneinander.',
            responseTurkish: 'İyi, o zaman yan yana iki yer ararım.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Acente çalışanı',
        german:
          'Ich habe einen Direktflug am Freitag um zehn Uhr gefunden. Allerdings ist er hundert Euro teurer als Ihr ursprünglicher Flug.',
        turkish:
          'Cuma günü saat onda doğrudan bir uçuş buldum. Ancak ilk uçuşunuzdan yüz euro daha pahalı.',
      },
      {
        type: 'reply',
        prompt: 'Uçuşu havayolu iptal ettiği için farkı onun ödemesi gerektiğini düşündüğünü söyle ve bunu kontrol etmesini rica et (dass).',
        german:
          'Ich finde, dass die Fluggesellschaft den Unterschied zahlen sollte, weil sie den Flug gestrichen hat. Können Sie das bitte prüfen?',
        turkish:
          'Bence havayolu farkı ödemeli, çünkü uçuşu o iptal etti. Bunu lütfen kontrol edebilir misiniz?',
        wrongOptions: [
          'Ich finde, dass ich den Unterschied zahlen sollte, weil ich den Flug gestrichen habe.',
          'Ich finde, dass die Fluggesellschaft den Unterschied zahlen sollte, weil sie hat den Flug gestrichen.',
        ],
      },
      {
        type: 'say',
        speaker: 'Acente çalışanı',
        german:
          'Gute Argumentation. Ich rufe die Fluggesellschaft an. Während ich warte, können Sie mir Ihre Buchungsnummer geben.',
        turkish:
          'Güzel gerekçe. Havayolunu arayacağım. Ben beklerken bana rezervasyon numaranızı verebilirsiniz.',
      },
      {
        type: 'reply',
        prompt: 'Numarayı ver ve havayolu kabul etmezse sizinle tekrar konuşmak istediğini söyle (wenn).',
        german:
          'Hier ist meine Buchungsnummer. Wenn die Fluggesellschaft nicht zustimmt, möchte ich noch einmal mit Ihnen sprechen.',
        turkish:
          'İşte rezervasyon numaram. Havayolu kabul etmezse sizinle bir kez daha konuşmak istiyorum.',
        wrongOptions: [
          'Hier ist meine Buchungsnummer. Wenn die Fluggesellschaft nicht zustimmt, ich möchte noch einmal mit Ihnen sprechen.',
          'Ich habe keine Buchungsnummer, obwohl ich die Reise vor drei Monaten gebucht habe, deshalb fliege ich nicht.',
        ],
      },
      {
        type: 'say',
        speaker: 'Acente çalışanı',
        german: 'Natürlich. Ich melde mich innerhalb einer Stunde bei Ihnen.',
        turkish: 'Elbette. Bir saat içinde size dönüş yapacağım.',
      },
    ],
  },
  {
    id: 'oturum-izni',
    level: 'B1',
    title: 'Oturma İzni Başvurusu',
    description: 'Yabancılar dairesinde eksik belgeyle oturma iznini uzat.',
    place: 'Yabancılar dairesi (Ausländerbehörde)',
    steps: [
      {
        type: 'say',
        speaker: 'Memur',
        german: 'Guten Tag. Haben Sie einen Termin? Worum geht es?',
        turkish: 'İyi günler. Randevunuz var mı? Konu nedir?',
      },
      {
        type: 'reply',
        prompt: 'Randevun olduğunu ve oturma izninin ay sonunda dolacağı için uzatmak istediğini söyle (weil).',
        german:
          'Ja, ich habe einen Termin. Ich möchte meine Aufenthaltserlaubnis verlängern, weil sie Ende des Monats abläuft.',
        turkish:
          'Evet, randevum var. Oturma iznimi uzatmak istiyorum, çünkü ay sonunda sona eriyor.',
        wrongOptions: [
          'Ja, ich habe einen Termin. Ich möchte meine Aufenthaltserlaubnis verlängern, weil sie läuft Ende des Monats ab.',
          'Nein, ich habe keinen Termin. Ich möchte meine Aufenthaltserlaubnis abgeben, obwohl sie noch zwei Jahre gültig ist.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Memur',
        german: 'Verstehe. Möchten Sie, dass ich langsamer spreche, oder wollen Sie die Informationen lieber schriftlich?',
        turkish: 'Anlıyorum. Daha yavaş konuşmamı mı istersiniz, yoksa bilgileri yazılı olarak mı almak istersiniz?',
        prompt: 'Açıklamanın nasıl yapılmasını istediğini seç.',
        options: [
          {
            german: 'Bitte sprechen Sie etwas langsamer, dann verstehe ich alles.',
            turkish: 'Lütfen biraz daha yavaş konuşun, o zaman her şeyi anlarım.',
            responseGerman: 'Gern, ich spreche langsam und deutlich.',
            responseTurkish: 'Memnuniyetle, yavaş ve net konuşurum.',
          },
          {
            german: 'Bitte geben Sie mir die Informationen auch schriftlich.',
            turkish: 'Lütfen bilgileri bana yazılı olarak da verin.',
            responseGerman: 'Gern, ich schreibe Ihnen alles auf ein Blatt.',
            responseTurkish: 'Memnuniyetle, size her şeyi bir kâğıda yazarım.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Memur',
        german:
          'Gut. Haben Sie das ausgefüllte Antragsformular, ein aktuelles Foto und Nachweise über Ihr Einkommen mitgebracht?',
        turkish:
          'İyi. Doldurulmuş başvuru formunu, güncel bir fotoğrafı ve gelir belgelerinizi getirdiniz mi?',
      },
      {
        type: 'reply',
        prompt: 'Form ve fotoğrafın yanında olduğunu, ama maaş bordrolarından yalnızca ikisini getirdiğini söyle.',
        german:
          'Das Formular und das Foto habe ich dabei, aber von den Gehaltsabrechnungen habe ich leider nur zwei mitgebracht.',
        turkish:
          'Form ve fotoğraf yanımda, ama maaş bordrolarından maalesef yalnızca ikisini getirdim.',
        wrongOptions: [
          'Das Formular und das Foto habe ich leider vergessen, deshalb habe ich drei Gehaltsabrechnungen mitgebracht.',
          'Ich habe nichts dabei, weil ich den Termin gar nicht brauche.',
        ],
      },
      {
        type: 'say',
        speaker: 'Memur',
        german:
          'Das ist ein Problem, denn wir brauchen alle drei. Wenn Sie die dritte nachreichen, bekommen Sie zunächst eine Bescheinigung, dass Ihr Antrag läuft.',
        turkish:
          'Bu bir sorun, çünkü üçüne de ihtiyacımız var. Üçüncüsünü sonradan getirirseniz önce başvurunuzun sürdüğüne dair bir belge alırsınız.',
      },
      {
        type: 'reply',
        prompt: 'Üçüncü bordroyu e-postayla gönderip gönderemeyeceğini ve belgenin seyahat için de geçerli olup olmadığını bilmek istediğini söyle (ob).',
        german:
          'Ich würde gern wissen, ob ich die dritte Abrechnung per E-Mail schicken darf und ob die Bescheinigung auch für Reisen gilt.',
        turkish:
          'Üçüncü bordroyu e-postayla gönderip gönderemeyeceğimi ve belgenin seyahatler için de geçerli olup olmadığını bilmek isterim.',
        wrongOptions: [
          'Ich würde gern wissen, wenn ich die dritte Abrechnung per E-Mail schicken darf und wenn die Bescheinigung auch für Reisen gilt.',
          'Ich würde gern wissen, ob ich die dritte Abrechnung nie schicken muss, weil ich nicht reisen möchte.',
        ],
      },
      {
        type: 'say',
        speaker: 'Memur',
        german:
          'Per E-Mail ist leider nicht möglich, Sie müssen sie persönlich abgeben oder per Post schicken. Mit der Bescheinigung dürfen Sie innerhalb Deutschlands reisen, aber nicht ins Ausland.',
        turkish:
          'E-postayla maalesef mümkün değil; kendiniz teslim etmeli veya postayla göndermelisiniz. Belgeyle Almanya içinde seyahat edebilirsiniz ama yurt dışına çıkamazsınız.',
      },
      {
        type: 'reply',
        prompt: 'Bordroyu bugün postayla göndereceğini ve bu yüzden yurt dışı seyahatini ertelemen gerektiğini söyle (deshalb).',
        german:
          'Dann schicke ich sie noch heute per Post. Meine Auslandsreise muss ich deshalb leider verschieben.',
        turkish:
          'O zaman bugün postayla göndereceğim. Bu yüzden yurt dışı seyahatimi maalesef ertelemek zorundayım.',
        wrongOptions: [
          'Dann schicke ich sie noch heute per Post. Deshalb ich muss meine Auslandsreise leider verschieben.',
          'Dann komme ich nie wieder, deshalb reise ich morgen ins Ausland.',
        ],
      },
      {
        type: 'say',
        speaker: 'Memur',
        german:
          'Genau. Sobald wir Ihre Unterlagen vollständig haben, melden wir uns schriftlich bei Ihnen. Auf Wiedersehen!',
        turkish:
          'Aynen. Belgeleriniz tamamlanır tamamlanmaz size yazılı olarak dönüş yapacağız. Hoşça kalın!',
      },
    ],
  },
  {
    id: 'gorusme-sonrasi-telefon',
    level: 'B1',
    title: 'Görüşme Sonrası Telefon',
    description: 'Mülakat sonrası süreci sor ve başka teklifini belirt.',
    place: 'Telefon görüşmesi',
    steps: [
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german: 'Müller, Personalabteilung, guten Tag.',
        turkish: 'Müller, İnsan Kaynakları, iyi günler.',
      },
      {
        type: 'reply',
        prompt: 'Kendini tanıt, geçen salı mülakata geldiğini ve sürecin durumunu sormak istediğini söyle.',
        german:
          'Guten Tag, hier ist Ali Yılmaz. Ich war letzten Dienstag bei Ihnen zum Vorstellungsgespräch und wollte fragen, wie der Stand ist.',
        turkish:
          'İyi günler, ben Ali Yılmaz. Geçen salı mülakat için sizdeydim ve sürecin ne durumda olduğunu sormak istedim.',
        wrongOptions: [
          'Guten Tag, hier ist Ali Yılmaz. Ich werde nächsten Dienstag zum Vorstellungsgespräch kommen und möchte den Termin absagen.',
          'Guten Tag, hier ist Ali Yılmaz. Ich wollte nur sagen, dass ich die Stelle nicht mehr will, obwohl ich noch kein Angebot habe.',
        ],
      },
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german:
          'Ach ja, Herr Yılmaz. Wir haben die Entscheidung noch nicht getroffen, weil wir noch zwei weitere Gespräche führen.',
        turkish:
          'Ah evet, Herr Yılmaz. Henüz karar vermedik, çünkü iki görüşme daha yapacağız.',
      },
      {
        type: 'reply',
        prompt: 'Anladığını söyle, ama başka bir şirketten teklif aldığını ve bir hafta içinde cevap vermen gerektiğini belirt (dass).',
        german:
          'Ich verstehe. Ich möchte Ihnen aber sagen, dass ich ein Angebot von einer anderen Firma habe und innerhalb einer Woche antworten muss.',
        turkish:
          'Anlıyorum. Ama size şunu söylemek isterim: başka bir şirketten teklif aldım ve bir hafta içinde cevap vermem gerekiyor.',
        wrongOptions: [
          'Ich verstehe. Ich möchte Ihnen aber sagen, dass ich habe ein Angebot von einer anderen Firma.',
          'Ich verstehe. Ich muss Ihnen leider sagen, dass ich diese Stelle gar nicht möchte, deshalb rufe ich an.',
        ],
      },
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german:
          'Danke für die Offenheit. Ich werde mit dem Abteilungsleiter sprechen, damit wir Ihnen früher Bescheid geben können.',
        turkish:
          'Açık sözlülüğünüz için teşekkürler. Size daha erken haber verebilmemiz için bölüm müdürüyle konuşacağım.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve pozisyon profiline tam uyduğu için orada çalışmayı çok istediğini söyle (weil).',
        german: 'Vielen Dank. Ich würde sehr gern bei Ihnen arbeiten, weil die Stelle genau zu meinem Profil passt.',
        turkish:
          'Çok teşekkürler. Sizin şirketinizde çalışmayı çok isterim, çünkü pozisyon tam olarak profilime uyuyor.',
        wrongOptions: [
          'Vielen Dank. Ich würde sehr gern bei Ihnen arbeiten, weil die Stelle passt genau zu meinem Profil.',
          'Vielen Dank. Ich würde lieber woanders arbeiten, weil die Stelle nicht zu meinem Profil passt.',
        ],
      },
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german:
          'Das freut mich zu hören. Wir melden uns spätestens am Donnerstag, ob wir Ihnen die Stelle anbieten können.',
        turkish:
          'Bunu duymak beni sevindirdi. En geç perşembe günü pozisyonu size sunup sunamayacağımızı bildiririz.',
      },
      {
        type: 'reply',
        prompt: 'Perşembe günü telefonunun açık olacağını ve belge gerekirse hemen göndereceğini söyle (falls).',
        german:
          'Das ist sehr nett. Mein Telefon ist am Donnerstag immer erreichbar, und falls Sie noch Unterlagen brauchen, schicke ich sie sofort.',
        turkish:
          'Çok naziksiniz. Perşembe günü telefonum her zaman açık olacak ve başka belge gerekirse hemen gönderirim.',
        wrongOptions: [
          'Das ist sehr nett. Mein Telefon ist am Donnerstag immer erreichbar, und falls Sie noch Unterlagen brauchen, ich schicke sie sofort.',
          'Das ist nicht nett. Ich bin am Donnerstag nie erreichbar, obwohl ich auf Ihre Antwort warte.',
        ],
      },
      {
        type: 'choice',
        speaker: 'İK Uzmanı',
        german: 'Noch eine Frage: Ab wann könnten Sie bei uns anfangen?',
        turkish: 'Bir sorum daha var: Ne zamandan itibaren bizde başlayabilirsiniz?',
        prompt: 'Ne zaman başlayabileceğini gerekçesiyle seç.',
        options: [
          {
            german: 'Ich könnte in vier Wochen anfangen, weil meine Kündigungsfrist dann endet.',
            turkish: 'Dört hafta sonra başlayabilirim, çünkü ihbar sürem o zaman bitiyor.',
            responseGerman: 'Das passt gut. Wir möchten die Stelle bis zum Ersten besetzen.',
            responseTurkish: 'Bu iyi uyuyor. Pozisyonu ayın birine kadar doldurmak istiyoruz.',
          },
          {
            german: 'Ich könnte erst in zwei Monaten anfangen, weil ich noch ein Projekt abschließen muss.',
            turkish: 'Ancak iki ay sonra başlayabilirim, çünkü önce bir projeyi bitirmem gerekiyor.',
            responseGerman: 'Das ist kein Problem. Wir können den Starttermin später festlegen.',
            responseTurkish: 'Sorun değil. Başlangıç tarihini daha sonra belirleyebiliriz.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'İK Uzmanı',
        german: 'Perfekt. Dann sprechen wir am Donnerstag. Einen schönen Tag noch!',
        turkish: 'Mükemmel. O zaman perşembe günü konuşuruz. İyi günler dilerim!',
      },
    ],
  },
  {
    id: 'ekip-toplantisi',
    level: 'B1',
    title: 'Ekip Toplantısı',
    description: 'Kampanya bütçesini tartış, fikrini gerekçelendir.',
    place: 'Toplantı odası',
    steps: [
      {
        type: 'say',
        speaker: 'Takım lideri',
        german:
          'Guten Morgen zusammen. Wir müssen heute entscheiden, wie wir die neue Kampagne planen. Wer möchte anfangen?',
        turkish:
          'Herkese günaydın. Bugün yeni kampanyayı nasıl planlayacağımıza karar vermemiz gerekiyor. Kim başlamak ister?',
      },
      {
        type: 'reply',
        prompt: 'Sosyal medyaya daha fazla yatırım yapılması gerektiğini, çünkü hedef kitlenin orada aktif olduğunu söyle (dass / weil).',
        german:
          'Ich finde, dass wir mehr in soziale Medien investieren sollten, weil unsere Zielgruppe dort sehr aktiv ist.',
        turkish:
          'Bence sosyal medyaya daha fazla yatırım yapmalıyız, çünkü hedef kitlemiz orada çok aktif.',
        wrongOptions: [
          'Ich finde, dass wir mehr in soziale Medien investieren sollten, weil unsere Zielgruppe ist dort sehr aktiv.',
          'Ich finde, dass wir keine Kampagne machen sollten, weil niemand soziale Medien benutzt.',
        ],
      },
      {
        type: 'say',
        speaker: 'Takım lideri',
        german: 'Guter Punkt. Aber unser Budget ist begrenzt. Was würden Sie dafür streichen?',
        turkish: 'İyi nokta. Ama bütçemiz sınırlı. Bunun için neyi keserdiniz?',
      },
      {
        type: 'reply',
        prompt: 'Basılı broşürleri azaltacağını, çünkü çoğunun zaten çöpe atıldığını söyle (denn).',
        german: 'Ich würde die gedruckten Broschüren reduzieren, denn die meisten werden ohnehin weggeworfen.',
        turkish: 'Basılı broşürleri azaltırdım, çünkü çoğu zaten çöpe atılıyor.',
        wrongOptions: [
          'Ich würde das gesamte Team streichen, damit wir mehr Budget haben.',
          'Ich würde mehr Broschüren drucken, obwohl niemand sie liest.',
        ],
      },
      {
        type: 'choice',
        speaker: 'Takım lideri',
        german: 'Interessant. Möchten Sie Ihren Vorschlag lieber mit Zahlen oder mit einem Beispiel begründen?',
        turkish: 'İlginç. Önerinizi daha çok rakamlarla mı yoksa bir örnekle mi gerekçelendirmek istersiniz?',
        prompt: 'Önerini nasıl gerekçelendireceğini seç.',
        options: [
          {
            german: 'Ich würde ihn mit Zahlen begründen, weil das die meisten Kollegen überzeugt.',
            turkish: 'Rakamlarla gerekçelendirirdim, çünkü bu çoğu meslektaşı ikna eder.',
            responseGerman: 'Gute Idee. Frau Weber hat dazu aktuelle Zahlen.',
            responseTurkish: 'İyi fikir. Weber Hanım bu konuda güncel rakamlara sahip.',
          },
          {
            german: 'Ich würde ein Beispiel nennen, weil das leichter zu verstehen ist.',
            turkish: 'Bir örnek verirdim, çünkü bu daha kolay anlaşılır.',
            responseGerman: 'Gute Idee. Vielleicht hat Frau Weber dazu auch Zahlen.',
            responseTurkish: 'İyi fikir. Belki Weber Hanım bu konuda rakamlara da sahiptir.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Frau Weber',
        german:
          'Die Zahlen zeigen, dass die Broschüren nur zehn Prozent der neuen Kunden bringen. Deshalb unterstütze ich den Vorschlag.',
        turkish:
          'Rakamlar, broşürlerin yeni müşterilerin yalnızca yüzde onunu getirdiğini gösteriyor. Bu yüzden öneriyi destekliyorum.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et, ama şu anda hesapları yönetmek için kimsenin yeterli zamanı olmadığını ekle.',
        german: 'Danke, Frau Weber. Allerdings hat im Moment niemand genug Zeit, um die Konten zu betreuen.',
        turkish: 'Teşekkürler, Frau Weber. Ancak şu anda hesapları yönetmek için kimsenin yeterli zamanı yok.',
        wrongOptions: [
          'Danke, Frau Weber. Allerdings hat im Moment niemand genug Zeit, damit die Konten zu betreuen.',
          'Danke, Frau Weber. Allerdings stimme ich Ihnen gar nicht zu, obwohl ich die Zahlen nicht kenne.',
        ],
      },
      {
        type: 'say',
        speaker: 'Takım lideri',
        german:
          'Das stimmt. Dann schlage ich vor, dass wir eine Teilzeitkraft einstellen und die Broschüren halbieren. Sind alle einverstanden?',
        turkish:
          'Doğru. O zaman yarı zamanlı birini işe almayı ve broşürleri yarıya indirmeyi öneriyorum. Herkes aynı fikirde mi?',
      },
      {
        type: 'reply',
        prompt: 'Katıldığını söyle, ama üç aylık bir deneme süresi belirleyip sonucu sonra birlikte değerlendirmeyi öner.',
        german:
          'Ich bin einverstanden. Wir sollten aber eine Probezeit von drei Monaten festlegen und das Ergebnis danach gemeinsam auswerten.',
        turkish:
          'Katılıyorum. Ancak üç aylık bir deneme süresi belirlemeli ve sonucu sonra birlikte değerlendirmeliyiz.',
        wrongOptions: [
          'Ich bin einverstanden. Wir sollten aber keine Probezeit festlegen, damit wir das Ergebnis nie auswerten müssen.',
          'Ich bin nicht einverstanden, weil ich lieber nach Hause gehen möchte.',
        ],
      },
      {
        type: 'say',
        speaker: 'Takım lideri',
        german: 'Gut, so machen wir es. Ich schreibe das Protokoll, während Sie die Aufgaben unter sich verteilen.',
        turkish: 'Güzel, öyle yapalım. Siz görevleri aranızda paylaştırırken ben tutanağı yazacağım.',
      },
    ],
  },
  {
    id: 'urun-iade',
    level: 'B1',
    title: 'Arızalı Ürün Reklamasyonu',
    description: 'Arızalı bir ürünü mağazaya geri götür, sorunu anlat, değişim veya onarım iste.',
    place: 'Elektronik mağazası',
    steps: [
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Guten Tag. Wie kann ich Ihnen helfen?',
        turkish: 'İyi günler. Size nasıl yardımcı olabilirim?',
      },
      {
        type: 'reply',
        prompt: 'Geçen hafta bir kulaklık aldığını ama sol hoparlörün çalışmadığını söyle (aber).',
        german: 'Ich habe letzte Woche diese Kopfhörer gekauft, aber der linke Lautsprecher funktioniert nicht.',
        turkish: 'Geçen hafta bu kulaklığı aldım ama sol hoparlör çalışmıyor.',
        wrongOptions: [
          'Ich möchte diese Kopfhörer kaufen, aber der linke Lautsprecher funktioniert nicht.',
          'Ich habe letzte Woche diese Kopfhörer gekauft, und ich bin sehr zufrieden damit.',
        ],
        wrongTurkish: [
          'Bu kulaklığı satın almak istiyorum ama sol hoparlör çalışmıyor.',
          'Geçen hafta bu kulaklığı aldım ve çok memnunum.',
        ],
        wrongNotes: [
          'Kulaklığı zaten aldın; şikâyette bulunuyorsun, satın almıyorsun.',
          'Sorunu anlatman gerekiyordu; memnuniyet bildirmek şikâyetle bağdaşmaz.',
        ],
        note: '"funktionieren" = çalışmak; "nicht funktionieren" = çalışmıyor. "die Kopfhörer" yalnızca çoğul kullanılır. "aber" iki zıt durumu bağlar.',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Das tut mir leid. Haben Sie den Kassenbon dabei?',
        turkish: 'Buna üzüldüm. Fişiniz yanınızda mı?',
      },
      {
        type: 'reply',
        prompt: 'Fişin yanında olduğunu ve onu hemen göstereceğini söyle.',
        german: 'Ja, den Kassenbon habe ich dabei. Ich zeige ihn Ihnen sofort.',
        turkish: 'Evet, fiş yanımda. Size hemen gösteriyorum.',
        wrongOptions: [
          'Nein, den Kassenbon habe ich weggeworfen, aber ich möchte trotzdem Geld zurück.',
          'Ja, den Kassenbon habe ich dabei. Ich zeige ihn Ihnen nicht.',
        ],
        wrongTurkish: [
          'Hayır, fişi attım ama yine de para iadesi istiyorum.',
          'Evet, fiş yanımda. Size göstermiyorum.',
        ],
        wrongNotes: [
          'Fişin yanında olduğunu söylemen gerekiyordu; fişsiz iade zorlaşır.',
          'İade için fişi göstermelisin; göstermemek mantıksız ve nazik değil.',
        ],
        note: '"den Kassenbon": "der Kassenbon" eril, Akkusativ\'de "den" olur. "ihn" = onu (fiş).',
      },
      {
        type: 'choice',
        speaker: 'Satış danışmanı',
        german: 'Das Gerät hat noch Garantie. Möchten Sie lieber ein neues Gerät oder eine Reparatur?',
        turkish: 'Cihazın garantisi hâlâ geçerli. Yeni bir cihaz mı yoksa onarım mı istersiniz?',
        prompt: 'Yeni cihaz mı onarım mı istediğini seç.',
        options: [
          {
            german: 'Ich hätte gern ein neues Gerät, weil ich die Kopfhörer täglich benutze.',
            turkish: 'Yeni bir cihaz isterim, çünkü kulaklığı her gün kullanıyorum.',
            responseGerman: 'Gern, ich hole Ihnen ein neues Gerät aus dem Lager.',
            responseTurkish: 'Memnuniyetle, size depodan yeni bir cihaz getiriyorum.',
          },
          {
            german: 'Ich möchte lieber eine Reparatur, weil mir dieses Modell sehr gut gefällt.',
            turkish: 'Onarım isterim, çünkü bu model çok hoşuma gidiyor.',
            responseGerman: 'Kein Problem, ich schicke die Kopfhörer zum Hersteller.',
            responseTurkish: 'Sorun değil, kulaklığı üreticiye gönderirim.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Bitte unterschreiben Sie dieses Formular. Dann ist alles erledigt.',
        turkish: 'Lütfen bu formu imzalayın. O zaman her şey tamam.',
      },
      {
        type: 'reply',
        prompt: 'İmzalamadan önce hatayı kısaca açıklamak ve formu okumak istediğini söyle (bevor).',
        german: 'Ich möchte den Fehler kurz beschreiben und das Formular lesen, bevor ich unterschreibe.',
        turkish: 'Hatayı kısaca açıklamak ve imzalamadan önce formu okumak istiyorum.',
        wrongOptions: [
          'Ich möchte unterschreiben und das Formular lesen, bevor ich den Fehler beschreibe.',
          'Ich möchte nichts lesen, weil ich keine Zeit habe.',
        ],
        wrongTurkish: [
          'İmzalamak ve hatayı açıklamadan önce formu okumak istiyorum.',
          'Hiçbir şey okumak istemiyorum, çünkü vaktim yok.',
        ],
        wrongNotes: [
          'Sıra yanlış: formu imzalamadan önce okumalısın.',
          'Resmî bir formu okumadan imzalamak riskli; okumak istemelisin.',
        ],
        note: '"bevor" = -meden önce; yan cümlede fiil sona gider: "bevor ich unterschreibe".',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Natürlich, nehmen Sie sich Zeit. Falls das Gerät noch einmal kaputtgeht, bringen Sie es bitte wieder zu uns.',
        turkish: 'Tabii, acele etmeyin. Cihaz tekrar bozulursa lütfen yine bize getirin.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve garantinin ne kadar süre daha geçerli olduğunu nazikçe sor.',
        german: 'Danke. Könnten Sie mir bitte sagen, wie lange die Garantie noch gilt?',
        turkish: 'Teşekkürler. Garantinin ne kadar süre daha geçerli olduğunu söyler misiniz?',
        wrongOptions: [
          'Danke. Könnten Sie mir bitte sagen, wo die Garantie noch gilt?',
          'Danke. Ich will wissen, wie lange die Garantie noch gilt!',
        ],
        wrongTurkish: [
          'Teşekkürler. Garantinin nerede geçerli olduğunu söyler misiniz?',
          'Teşekkürler. Garantinin ne kadar daha geçerli olduğunu bilmek istiyorum!',
        ],
        wrongNotes: [
          '"wie lange" süreyi sorar; "wo" yeri sorar.',
          'Bilgiyi soruyor ama nazik rica kalıbı yok; "Könnten Sie ...?" daha kibardır.',
        ],
        note: '"Könnten Sie mir bitte sagen, wie ...?" kibar bir dolaylı sorudur; yan cümlede fiil sona gider: "wie lange die Garantie noch gilt".',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Die Garantie gilt noch ein Jahr und elf Monate. Das steht auch auf dem Beleg.',
        turkish: 'Garanti bir yıl on bir ay daha geçerli. Bu belgede de yazıyor.',
      },
      {
        type: 'reply',
        prompt: 'Hızlı çözüm için teşekkür et ve her şeyin yolunda gitmesine sevindiğini söyle (dass).',
        german: 'Vielen Dank für die schnelle Lösung. Ich bin froh, dass alles geklappt hat.',
        turkish: 'Hızlı çözüm için çok teşekkürler. Her şeyin yolunda gitmesine sevindim.',
        wrongOptions: [
          'Vielen Dank für die langsame Lösung. Ich bin froh, dass nichts geklappt hat.',
          'Vielen Dank. Ich bin sicher, dass das Gerät wieder kaputtgeht.',
        ],
        wrongTurkish: [
          'Yavaş çözüm için çok teşekkürler. Hiçbir şeyin yolunda gitmemesine sevindim.',
          'Çok teşekkürler. Cihazın tekrar bozulacağından eminim.',
        ],
        wrongNotes: [
          'Mantıksız: çözümü ve sonucu olumlu değerlendirmelisin.',
          'Teşekkür edip memnuniyetini söylemelisin; olumsuz bir tahmin uygun değil.',
        ],
        note: '"froh sein, dass ..." = ...ine sevinmek. "klappen" = yolunda gitmek (gündelik dil).',
      },
      {
        type: 'say',
        speaker: 'Satış danışmanı',
        german: 'Gern geschehen. Einen schönen Tag noch!',
        turkish: 'Rica ederim. İyi günler!',
      },
    ],
  },
  {
    id: 'mobil-sozlesme',
    level: 'B1',
    title: 'Cep Telefonu Sözleşmesi',
    description: 'Tarifeleri karşılaştır, sözleşme süresini ve iptal koşullarını sor, kararını gerekçelendir.',
    place: 'Telefon mağazası',
    steps: [
      {
        type: 'say',
        speaker: 'Danışman',
        german: 'Guten Tag! Sie interessieren sich für einen Handyvertrag?',
        turkish: 'İyi günler! Cep telefonu sözleşmesiyle ilgileniyorsunuz, değil mi?',
      },
      {
        type: 'reply',
        prompt: 'Evet, ucuz ama bol internetli bir tarife aradığını söyle (aber).',
        german: 'Ja, ich suche einen günstigen Tarif, aber mit viel Datenvolumen.',
        turkish: 'Evet, ucuz ama bol internetli bir tarife arıyorum.',
        wrongOptions: [
          'Ja, ich suche einen teuren Tarif, aber mit wenig Datenvolumen.',
          'Ja, ich suche einen günstigen Tarif, aber ohne Handy und ohne Internet.',
        ],
        wrongTurkish: [
          'Evet, pahalı ama az internetli bir tarife arıyorum.',
          'Evet, ucuz ama telefonsuz ve internetsiz bir tarife arıyorum.',
        ],
        wrongNotes: [
          'Ucuz ve bol internetli istiyorsun; bu cevap tersini söylüyor.',
          'Bol internet isteyeceksin; internetsiz bir tarife mantıklı değil.',
        ],
        note: '"das Datenvolumen" = internet kotası. "günstig" = uygun fiyatlı. "mit viel ..." = bol ...li.',
      },
      {
        type: 'say',
        speaker: 'Danışman',
        german: 'Dann habe ich zwei Angebote: zwanzig Euro im Monat mit zehn Gigabyte oder dreißig Euro mit unbegrenztem Datenvolumen.',
        turkish: 'O zaman iki teklifim var: ayda yirmi euro ve on gigabayt ya da otuz euro ve sınırsız internet.',
      },
      {
        type: 'reply',
        prompt: 'Sözleşme süresinin ne kadar olduğunu ve daha erken feshedip feshedemeyeceğini sor.',
        german: 'Wie lange ist die Vertragslaufzeit, und kann ich den Vertrag früher kündigen?',
        turkish: 'Sözleşme süresi ne kadar ve sözleşmeyi daha erken feshedebilir miyim?',
        wrongOptions: [
          'Wie lange ist die Vertragslaufzeit, und kann ich den Vertrag früher bezahlen?',
          'Wo ist die Vertragslaufzeit, und kann ich den Vertrag früher kündigen?',
        ],
        wrongTurkish: [
          'Sözleşme süresi ne kadar ve sözleşmeyi daha erken ödeyebilir miyim?',
          'Sözleşme süresi nerede ve sözleşmeyi daha erken feshedebilir miyim?',
        ],
        wrongNotes: [
          '"kündigen" feshetmek demektir; "bezahlen" ödemek anlamına gelir.',
          '"Wo" yeri sorar; süre için "wie lange" kullanılır.',
        ],
        note: '"die Vertragslaufzeit" = sözleşme süresi. "kündigen" = (sözleşmeyi) feshetmek; "die Kündigung" = fesih.',
      },
      {
        type: 'say',
        speaker: 'Danışman',
        german: 'Die Laufzeit beträgt vierundzwanzig Monate. Danach können Sie mit einer Frist von einem Monat kündigen.',
        turkish: 'Süre yirmi dört ay. Sonrasında bir aylık ihbar süresiyle feshedebilirsiniz.',
      },
      {
        type: 'choice',
        speaker: 'Danışman',
        german: 'Welches Angebot passt besser zu Ihnen?',
        turkish: 'Hangi teklif size daha uygun?',
        prompt: 'Hangi teklifi seçeceğini gerekçesiyle seç.',
        options: [
          {
            german: 'Ich nehme das günstigere Angebot, weil ich unterwegs nicht viel Internet brauche.',
            turkish: 'Daha uygun teklifi alıyorum, çünkü dışarıdayken çok internete ihtiyacım olmuyor.',
            responseGerman: 'Gut. Dann sparen Sie jeden Monat zehn Euro.',
            responseTurkish: 'İyi. O zaman her ay on euro tasarruf edersiniz.',
          },
          {
            german: 'Ich nehme das teurere Angebot, weil ich viel streame und unterwegs Videos schaue.',
            turkish: 'Daha pahalı teklifi alıyorum, çünkü çok yayın izliyorum ve dışarıdayken video izliyorum.',
            responseGerman: 'Gut. Dann haben Sie nie Probleme mit dem Datenvolumen.',
            responseTurkish: 'İyi. O zaman internet kotasıyla hiç sorun yaşamazsınız.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Danışman',
        german: 'Gut. Ich brauche noch Ihren Ausweis und Ihre Kontonummer für die Abbuchung.',
        turkish: 'İyi. Kimliğinize ve ödeme için hesap numaranıza da ihtiyacım var.',
      },
      {
        type: 'reply',
        prompt: 'Kimliğinin yanında olduğunu ve IBAN numaranı hemen yazacağını söyle.',
        german: 'Meinen Ausweis habe ich dabei. Die IBAN schreibe ich Ihnen gleich auf.',
        turkish: 'Kimliğim yanımda. IBAN numaramı hemen yazıyorum.',
        wrongOptions: [
          'Meinen Ausweis habe ich vergessen. Die IBAN schreibe ich Ihnen nicht auf.',
          'Meinen Ausweis habe ich dabei. Die IBAN ist mir egal.',
        ],
        wrongTurkish: [
          'Kimliğimi unuttum. IBAN numaramı yazmıyorum.',
          'Kimliğim yanımda. IBAN umurumda değil.',
        ],
        wrongNotes: [
          'Kimliğin yanında; bilgileri vermelisin.',
          'IBAN sözleşme için zorunlu; ilgisiz davranmak çözüm değil.',
        ],
        note: '"aufschreiben" ayrılabilen fiildir: "Ich schreibe die IBAN auf." "der Ausweis" = kimlik.',
      },
      {
        type: 'say',
        speaker: 'Danışman',
        german: 'Danke. Noch ein Hinweis: Der Tarif gilt in ganz Deutschland.',
        turkish: 'Teşekkürler. Bir not daha: Tarife Almanya genelinde geçerli.',
      },
      {
        type: 'reply',
        prompt: 'Başka bir şehre taşınırsan sözleşmeye ne olacağını sor (wenn).',
        german: 'Was passiert mit dem Vertrag, wenn ich in eine andere Stadt umziehe?',
        turkish: 'Başka bir şehre taşınırsam sözleşmeye ne olur?',
        wrongOptions: [
          'Was passiert mit dem Handy, wenn ich in eine andere Stadt umziehe?',
          'Was passiert mit dem Vertrag, wenn ich nie in eine andere Stadt umziehe?',
        ],
        wrongTurkish: [
          'Başka bir şehre taşınırsam telefona ne olur?',
          'Hiç başka bir şehre taşınmazsam sözleşmeye ne olur?',
        ],
        wrongNotes: [
          'Sözleşmeyi soruyorsun; telefonu değil.',
          'Taşınma durumunu sormalısın; hiç taşınmama bir durum sorusu değil.',
        ],
        note: '"wenn" yan cümlesinde fiil sona gider: "wenn ich umziehe". "umziehen" = taşınmak.',
      },
      {
        type: 'say',
        speaker: 'Danışman',
        german: 'Dann bleibt alles gleich, Sie ändern nur Ihre Adresse. Hier ist die Vertragszusammenfassung. Bitte unterschreiben Sie dann unten.',
        turkish: 'O zaman her şey aynı kalır, yalnızca adresinizi değiştirirsiniz. İşte sözleşme özeti. Lütfen sonra aşağıyı imzalayın.',
      },
      {
        type: 'reply',
        prompt: 'Özeti kısaca okuyacağını ve sorusu olursa tekrar geleceğini söyle (falls).',
        german: 'Ich lese noch kurz die Zusammenfassung, und falls ich Fragen habe, komme ich wieder.',
        turkish: 'Özeti kısaca okuyacağım ve sorum olursa tekrar geleceğim.',
        wrongOptions: [
          'Ich lese noch kurz die Zusammenfassung, und falls ich keine Fragen habe, komme ich wieder.',
          'Ich unterschreibe sofort, ohne die Zusammenfassung zu lesen.',
        ],
        wrongTurkish: [
          'Özeti kısaca okuyacağım ve sorum yoksa tekrar geleceğim.',
          'Özeti okumadan hemen imzalıyorum.',
        ],
        wrongNotes: [
          'Mantık hatası: sorun olursa gelirsin; sorun yoksa gelmene gerek yok.',
          'Sözleşmeyi okumadan imzalamak riskli.',
        ],
        note: '"falls" = ...ecek olursa; yan cümlede fiil sona gider: "falls ich Fragen habe".',
      },
      {
        type: 'say',
        speaker: 'Danışman',
        german: 'Selbstverständlich. Danach gebe ich Ihnen Ihre SIM-Karte. Viel Spaß mit dem neuen Tarif!',
        turkish: 'Elbette. Sonra size SIM kartınızı vereceğim. Yeni tarifenizi keyifle kullanın!',
      },
    ],
  },
  {
    id: 'hastalik-bildirimi',
    level: 'B1',
    title: 'Hastalık Bildirimi (İşverene)',
    description: 'Yöneticini ara, hasta olduğunu bildir, rapor ve görevlerin devri hakkında konuş.',
    place: 'Telefon (iş yeri)',
    steps: [
      {
        type: 'say',
        speaker: 'Herr Lehmann',
        german: 'Lehmann, guten Morgen.',
        turkish: 'Lehmann, günaydın.',
      },
      {
        type: 'reply',
        prompt: 'Kendini tanıt ve ateşin olduğu için bugün işe gelemeyeceğini söyle (weil).',
        german: 'Guten Morgen, hier ist Demir. Ich kann heute nicht zur Arbeit kommen, weil ich Fieber habe.',
        turkish: 'Günaydın, ben Demir. Bugün işe gelemeyeceğim, çünkü ateşim var.',
        wrongOptions: [
          'Guten Morgen, hier ist Demir. Ich komme heute früher zur Arbeit, weil ich Fieber habe.',
          'Guten Morgen, hier ist Demir. Ich kann heute nicht zur Arbeit kommen, weil ich Urlaub habe.',
        ],
        wrongTurkish: [
          'Günaydın, ben Demir. Bugün işe daha erken geliyorum, çünkü ateşim var.',
          'Günaydın, ben Demir. Bugün işe gelemeyeceğim, çünkü izinliyim.',
        ],
        wrongNotes: [
          'Gelemediğini söylemen gerekiyordu; gerekçe de bu cümleyle tutmuyor.',
          'Hastalık bildiriyorsun; "Urlaub" tatil/izin demektir, hastalık değil.',
        ],
        note: '"weil" yan cümlesinde fiil sona gider: "weil ich Fieber habe". "sich krankmelden" = hastalık bildirmek.',
      },
      {
        type: 'say',
        speaker: 'Herr Lehmann',
        german: 'Das tut mir leid. Gute Besserung! Waren Sie schon beim Arzt?',
        turkish: 'Üzüldüm. Geçmiş olsun! Doktora gittiniz mi?',
      },
      {
        type: 'reply',
        prompt: 'Henüz gitmediğini ama bugün öğleden sonra aile hekimiyle randevun olduğunu söyle.',
        german: 'Noch nicht, aber ich habe heute Nachmittag einen Termin bei meiner Hausärztin.',
        turkish: 'Henüz değil ama bugün öğleden sonra aile hekimimle randevum var.',
        wrongOptions: [
          'Ja, ich war schon da, aber ich habe heute Nachmittag einen Termin.',
          'Noch nicht, aber ich habe gestern Nachmittag einen Termin bei meiner Hausärztin.',
        ],
        wrongTurkish: [
          'Evet, zaten gittim ama bugün öğleden sonra bir randevum var.',
          'Henüz değil ama dün öğleden sonra aile hekimimle randevum var.',
        ],
        wrongNotes: [
          'Henüz gitmedin; "Ja" ile çelişiyor.',
          'Randevu bugün; "gestern" geçmişi gösterir ve henüz gitmedim ile uyumsuz.',
        ],
        note: '"die Hausärztin" = (kadın) aile hekimi. "noch nicht" = henüz değil. "einen Termin bei ..." = ... ile randevu.',
      },
      {
        type: 'choice',
        speaker: 'Herr Lehmann',
        german: 'Wie lange, glauben Sie, werden Sie ausfallen? Nur ein, zwei Tage oder die ganze Woche?',
        turkish: 'Sizce ne kadar süre işe gelemeyeceksiniz? Yalnızca bir iki gün mü yoksa bütün hafta mı?',
        prompt: 'Ne kadar süre işe gelemeyeceğini tahmin ettiğini seç.',
        options: [
          {
            german: 'Ich denke, dass ich nur heute und morgen ausfalle.',
            turkish: 'Sanırım yalnızca bugün ve yarın gelemeyeceğim.',
            responseGerman: 'Gut. Dann plane ich die Termine ab übermorgen wieder mit Ihnen.',
            responseTurkish: 'İyi. O zaman randevuları yarından sonraki günden itibaren yine sizinle planlarım.',
          },
          {
            german: 'Ich denke, dass ich die ganze Woche ausfalle.',
            turkish: 'Sanırım bütün hafta gelemeyeceğim.',
            responseGerman: 'Verstanden. Dann müssen wir Ihre Vertretung für die ganze Woche regeln.',
            responseTurkish: 'Anlaşıldı. O zaman bütün hafta için vekâlet düzenlememiz gerekiyor.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Herr Lehmann',
        german: 'Wichtig: Wenn Sie länger als zwei Tage fehlen, brauchen wir ein ärztliches Attest. Kennen Sie die Regel?',
        turkish: 'Önemli: İki günden uzun süre devamsızlık yaparsanız doktor raporu istiyoruz. Kuralı biliyor musunuz?',
      },
      {
        type: 'reply',
        prompt: 'Kuralı bildiğini ve raporu alır almaz e-postayla göndereceğini söyle (sobald).',
        german: 'Ja, die Regel kenne ich. Ich schicke Ihnen das Attest per E-Mail, sobald ich es habe.',
        turkish: 'Evet, kuralı biliyorum. Raporu alır almaz size e-postayla gönderirim.',
        wrongOptions: [
          'Nein, die Regel kenne ich nicht. Ich schicke Ihnen das Attest per E-Mail, sobald ich es habe.',
          'Ja, die Regel kenne ich. Ich schicke Ihnen das Attest per E-Mail, bevor ich es habe.',
        ],
        wrongTurkish: [
          'Hayır, kuralı bilmiyorum. Raporu alır almaz size e-postayla gönderirim.',
          'Evet, kuralı biliyorum. Raporu almadan önce size e-postayla gönderirim.',
        ],
        wrongNotes: [
          'Kuralı bildiğini söylemen gerekiyordu.',
          'Rapor henüz yokken gönderilemez; "bevor" yerine "sobald" gerekir.',
        ],
        note: '"sobald" = ...ır ...maz; yan cümlede fiil sona gider: "sobald ich es habe". "das Attest" = doktor raporu.',
      },
      {
        type: 'say',
        speaker: 'Herr Lehmann',
        german: 'Gut. Wer kann Ihre Aufgaben übernehmen? Gibt es dringende Termine?',
        turkish: 'İyi. Görevlerinizi kim devralabilir? Acil randevular var mı?',
      },
      {
        type: 'reply',
        prompt: 'Bugün saat on dörtte bir müşteri randevun olduğunu ve Frau Weber\'in bunu devralabileceğini öner.',
        german: 'Heute um vierzehn Uhr habe ich einen Kundentermin. Frau Weber könnte ihn übernehmen.',
        turkish: 'Bugün saat on dörtte bir müşteri randevum var. Frau Weber bunu devralabilir.',
        wrongOptions: [
          'Heute um vierzehn Uhr habe ich einen Kundentermin. Frau Weber muss ihn absagen.',
          'Gestern um vierzehn Uhr hatte ich einen Kundentermin. Frau Weber könnte ihn übernehmen.',
        ],
        wrongTurkish: [
          'Bugün saat on dörtte bir müşteri randevum var. Frau Weber bunu iptal etmek zorunda.',
          'Dün saat on dörtte bir müşteri randevum vardı. Frau Weber bunu devralabilir.',
        ],
        wrongNotes: [
          'Çözüm devretmek; müşteri randevusunu iptal etmek iş için kötü olur.',
          'Bugünkü randevudan söz etmelisin; dünkü randevu geçmişte kaldı.',
        ],
        note: '"könnte" (Konjunktiv II) nazik öneri bildirir. "übernehmen" = devralmak.',
      },
      {
        type: 'say',
        speaker: 'Herr Lehmann',
        german: 'Das ist in Ordnung. Ich spreche gleich mit Frau Weber. Ruhen Sie sich aus und werden Sie schnell gesund!',
        turkish: 'Tamam. Hemen Frau Weber ile konuşuyorum. Dinlenin ve çabuk iyileşin!',
      },
      {
        type: 'reply',
        prompt: 'Anlayışı için teşekkür et ve doktor ziyaretinden sonra haber vereceğini söyle.',
        german: 'Vielen Dank für Ihr Verständnis. Ich melde mich nach dem Arztbesuch bei Ihnen.',
        turkish: 'Anlayışınız için çok teşekkürler. Doktor ziyaretinden sonra size haber vereceğim.',
        wrongOptions: [
          'Vielen Dank für Ihr Verständnis. Ich melde mich nach dem Urlaub bei Ihnen.',
          'Das ist mir egal. Ich melde mich vielleicht später.',
        ],
        wrongTurkish: [
          'Anlayışınız için çok teşekkürler. Tatilden sonra size haber vereceğim.',
          'Bu benim için fark etmez. Belki daha sonra haber veririm.',
        ],
        wrongNotes: [
          'Doktor ziyaretinden sonra haber vereceksin; tatil konu dışı.',
          'Nazik olmayan bir cevap; anlayış için teşekkür etmelisin.',
        ],
        note: '"sich melden bei ..." = ...e haber vermek. "nach dem Arztbesuch" = doktor ziyaretinden sonra ("nach" + Dativ).',
      },
    ],
  },
  {
    id: 'ariza-bildirme',
    level: 'B1',
    title: 'Ev Arızasını Ev Sahibine Bildirme',
    description: 'Kalorifer arızasını ev sahibine bildir, aciliyetini anlat ve tamir günü belirle.',
    place: 'Telefon (ev sahibi)',
    steps: [
      {
        type: 'say',
        speaker: 'Herr Schulz',
        german: 'Schulz, guten Tag.',
        turkish: 'Schulz, iyi günler.',
      },
      {
        type: 'reply',
        prompt: 'Kendini üç numaralı daireden tanıt ve kaloriferin iki gündür çalışmadığını söyle (seit).',
        german: 'Guten Tag, hier ist Demir aus der Wohnung drei. Die Heizung funktioniert seit zwei Tagen nicht mehr.',
        turkish: 'İyi günler, ben üç numaralı daireden Demir. Kalorifer iki gündür çalışmıyor.',
        wrongOptions: [
          'Guten Tag, hier ist Demir aus der Wohnung drei. Die Heizung funktioniert in zwei Tagen nicht mehr.',
          'Guten Tag, hier ist Demir aus der Wohnung drei. Die Heizung ist sehr teuer seit zwei Tagen.',
        ],
        wrongTurkish: [
          'İyi günler, ben üç numaralı daireden Demir. Kalorifer iki gün sonra çalışmayacak.',
          'İyi günler, ben üç numaralı daireden Demir. Kalorifer iki gündür çok pahalı.',
        ],
        wrongNotes: [
          '"seit" süreyi başlangıçtan beri anlatır; "in" gelecekteki süre için kullanılır.',
          'Arızayı anlatman gerekiyordu; fiyatı değil.',
        ],
        note: '"seit zwei Tagen" = iki gündür ("seit" + Dativ). "die Heizung funktioniert nicht" = kalorifer çalışmıyor.',
      },
      {
        type: 'say',
        speaker: 'Herr Schulz',
        german: 'Das ist ärgerlich. Haben Sie schon geprüft, ob das Thermostat richtig eingestellt ist?',
        turkish: 'Bu can sıkıcı. Termostatın doğru ayarlı olup olmadığına baktınız mı?',
      },
      {
        type: 'reply',
        prompt: 'Baktığını; termostat beşte olmasına rağmen radyatörlerin soğuk kaldığını söyle (obwohl).',
        german: 'Ja, ich habe es geprüft. Die Heizkörper bleiben kalt, obwohl das Thermostat auf fünf steht.',
        turkish: 'Evet, baktım. Termostat beşte olmasına rağmen radyatörler soğuk kalıyor.',
        wrongOptions: [
          'Ja, ich habe es geprüft. Die Heizkörper bleiben warm, obwohl das Thermostat auf fünf steht.',
          'Nein, ich habe es nicht geprüft, obwohl die Heizkörper kalt bleiben.',
        ],
        wrongTurkish: [
          'Evet, baktım. Termostat beşte olmasına rağmen radyatörler sıcak kalıyor.',
          'Hayır, bakmadım, radyatörler soğuk kalmasına rağmen.',
        ],
        wrongNotes: [
          'Sorun radyatörlerin soğuk kalması; "warm" sorunu yok sayar.',
          'Baktığını söylemen gerekiyordu.',
        ],
        note: '"obwohl" = -mesine rağmen; yan cümlede fiil sona gider: "obwohl das Thermostat auf fünf steht".',
      },
      {
        type: 'choice',
        speaker: 'Herr Schulz',
        german: 'Soll ich einen Handwerker schicken? Er könnte morgen Vormittag oder übermorgen Nachmittag kommen.',
        turkish: 'Bir usta göndereyim mi? Yarın öğleden önce ya da yarından sonraki gün öğleden sonra gelebilir.',
        prompt: 'Ustanın hangi gün gelmesini istediğini gerekçesiyle seç.',
        options: [
          {
            german: 'Morgen Vormittag passt mir gut, weil ich dann zu Hause bin.',
            turkish: 'Yarın öğleden önce bana uyuyor, çünkü o zaman evdeyim.',
            responseGerman: 'Gut, dann sage ich dem Handwerker für morgen zwischen neun und zwölf Uhr Bescheid.',
            responseTurkish: 'İyi, o zaman ustaya yarın dokuzla on iki arasında haber veririm.',
          },
          {
            german: 'Übermorgen Nachmittag passt mir besser, weil ich morgen arbeiten muss.',
            turkish: 'Yarından sonraki gün öğleden sonra daha uygun, çünkü yarın çalışmam gerekiyor.',
            responseGerman: 'Gut, dann kommt er übermorgen zwischen vierzehn und siebzehn Uhr.',
            responseTurkish: 'İyi, o zaman yarından sonraki gün on dörtle on yedi arasında gelir.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Herr Schulz',
        german: 'Gut. Haben Sie bis dahin eine Möglichkeit, die Wohnung zu wärmen?',
        turkish: 'İyi. O zamana kadar evi ısıtacak bir imkânınız var mı?',
      },
      {
        type: 'reply',
        prompt: 'Elektrikli ısıtıcın olmadığını söyle ve geçici olarak bir tane ödünç verip veremeyeceğini sor (könnte).',
        german: 'Ich habe keinen Heizlüfter. Könnten Sie mir vielleicht vorübergehend einen leihen?',
        turkish: 'Elektrikli ısıtıcım yok. Belki geçici olarak bana bir tane ödünç verebilir misiniz?',
        wrongOptions: [
          'Ich habe keinen Heizlüfter. Könnten Sie mir vielleicht dauerhaft einen kaufen?',
          'Ich habe einen Heizlüfter, aber ich brauche noch einen Handwerker.',
        ],
        wrongTurkish: [
          'Elektrikli ısıtıcım yok. Belki kalıcı olarak bana bir tane satın alabilir misiniz?',
          'Elektrikli ısıtıcım var ama yine de bir ustaya ihtiyacım var.',
        ],
        wrongNotes: [
          'Geçici bir çözüm istiyorsun; kalıcı satın alma talebi fazla ve uygunsuz.',
          'Isıtıcın olmadığını söyleyip geçici yardım istemen gerekiyordu.',
        ],
        note: '"Könnten Sie ...?" nazik bir rica kalıbıdır. "vorübergehend" = geçici olarak. "leihen" = ödünç vermek/almak.',
      },
      {
        type: 'say',
        speaker: 'Herr Schulz',
        german: 'Ich schaue, was sich machen lässt. Ich melde mich heute Abend noch einmal bei Ihnen.',
        turkish: 'Neler yapılabileceğine bakarım. Bu akşam size yine dönerim.',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve arızanın nedeninin ne olabileceğini sor.',
        german: 'Danke. Wissen Sie schon, was die Ursache sein könnte?',
        turkish: 'Teşekkürler. Nedeninin ne olabileceğini şimdiden biliyor musunuz?',
        wrongOptions: [
          'Danke. Wissen Sie schon, wer die Ursache sein könnte?',
          'Danke. Ich weiß schon, was die Ursache sein könnte.',
        ],
        wrongTurkish: [
          'Teşekkürler. Nedenin kim olabileceğini şimdiden biliyor musunuz?',
          'Teşekkürler. Nedeninin ne olabileceğini ben şimdiden biliyorum.',
        ],
        wrongNotes: [
          'Bir şeyi soruyorsun; kişiyi soran "wer" burada uygun değil.',
          'Soru soracaktın; bu cümle bilgi veriyor.',
        ],
        note: '"die Ursache" = neden, sebep. Dolaylı soruda fiil sona gider: "was die Ursache sein könnte".',
      },
      {
        type: 'say',
        speaker: 'Herr Schulz',
        german: 'Wahrscheinlich ist ein Ventil defekt. Das passiert bei älteren Anlagen öfter.',
        turkish: 'Muhtemelen bir vana arızalı. Bu, eski sistemlerde daha sık oluyor.',
      },
      {
        type: 'reply',
        prompt: 'Anladığını ve tamir sırasında evde olup ustaya her şeyi göstereceğini söyle (während).',
        german: 'Das verstehe ich. Während der Reparatur bin ich zu Hause und zeige dem Handwerker alles.',
        turkish: 'Anlıyorum. Tamir sırasında evde olacağım ve ustaya her şeyi göstereceğim.',
        wrongOptions: [
          'Das verstehe ich. Während der Reparatur bin ich im Urlaub und zeige dem Handwerker nichts.',
          'Das verstehe ich nicht. Während der Reparatur bin ich zu Hause.',
        ],
        wrongTurkish: [
          'Anlıyorum. Tamir sırasında tatilde olacağım ve ustaya hiçbir şey göstermeyeceğim.',
          'Anlamıyorum. Tamir sırasında evde olacağım.',
        ],
        wrongNotes: [
          'Tamir sırasında evde olacağını söylemelisin; tatilde olmak çözümü engeller.',
          'Anladığını söylemen gerekiyordu.',
        ],
        note: '"während" + Genitiv/Dativ: "während der Reparatur" = tamir sırasında. "zeigen" = göstermek.',
      },
      {
        type: 'say',
        speaker: 'Herr Schulz',
        german: 'Gut. Vielen Dank für Ihre Geduld. Bis dann!',
        turkish: 'İyi. Sabrınız için çok teşekkürler. Görüşmek üzere!',
      },
    ],
  },
  {
    id: 'komsu-gurultu',
    level: 'B1',
    title: 'Komşuyla Gürültü Sorunu',
    description: 'Komşuya gürültü sorununu nazikçe anlat, çözüm öner ve uzlaş.',
    place: 'Apartman koridoru',
    steps: [
      {
        type: 'say',
        speaker: 'Herr Krüger',
        german: 'Guten Abend. Sie sind mein Nachbar aus dem Erdgeschoss, oder? Kann ich etwas für Sie tun?',
        turkish: 'İyi akşamlar. Siz zemin kattaki komşumsunuz, değil mi? Sizin için bir şey yapabilir miyim?',
      },
      {
        type: 'reply',
        prompt: 'Sizin altınızda oturduğunu ve son gecelerde çok gürültü olduğu için uyuyamadığını söyle (deshalb).',
        german: 'Guten Abend. Ich wohne unter Ihnen. In den letzten Nächten war es sehr laut, deshalb konnte ich nicht schlafen.',
        turkish: 'İyi akşamlar. Sizin altınızda oturuyorum. Son gecelerde çok gürültü vardı, bu yüzden uyuyamadım.',
        wrongOptions: [
          'Guten Abend. Ich wohne über Ihnen. In den letzten Nächten war es sehr laut, deshalb konnte ich nicht schlafen.',
          'Guten Abend. Ich wohne unter Ihnen. In den letzten Nächten war es sehr ruhig, deshalb konnte ich nicht schlafen.',
        ],
        wrongTurkish: [
          'İyi akşamlar. Sizin üstünüzde oturuyorum. Son gecelerde çok gürültü vardı, bu yüzden uyuyamadım.',
          'İyi akşamlar. Sizin altınızda oturuyorum. Son gecelerde çok sessizdi, bu yüzden uyuyamadım.',
        ],
        wrongNotes: [
          'Zemin kattasın; onun altında oturuyorsun, üstünde değil.',
          'Sessizlik uyumaya engel olmaz; sorun gürültü.',
        ],
        note: '"deshalb" = bu yüzden. "konnte" ("können" Präteritum) = -ebiliyordum: "konnte nicht schlafen".',
      },
      {
        type: 'say',
        speaker: 'Herr Krüger',
        german: 'Oh, das tut mir leid. Ich wusste nicht, dass man es bei Ihnen so gut hört. Wir hatten Besuch.',
        turkish: 'Üzgünüm. Sizde bu kadar iyi duyulduğunu bilmiyordum. Misafirimiz vardı.',
      },
      {
        type: 'reply',
        prompt: 'Anladığını ama özellikle gece yarısından sonra rahatsız olduğunu söyle.',
        german: 'Das verstehe ich, aber vor allem nach Mitternacht stört mich der Lärm.',
        turkish: 'Anlıyorum ama özellikle gece yarısından sonra gürültü beni rahatsız ediyor.',
        wrongOptions: [
          'Das verstehe ich, aber vor allem vor Mitternacht stört mich der Lärm.',
          'Das ist mir egal, aber vor allem nach Mitternacht stört mich der Lärm.',
        ],
        wrongTurkish: [
          'Anlıyorum ama özellikle gece yarısından önce gürültü beni rahatsız ediyor.',
          'Bu benim için fark etmez ama özellikle gece yarısından sonra gürültü beni rahatsız ediyor.',
        ],
        wrongNotes: [
          'Gece yarısından sonra rahatsız oluyorsun; "vor" önce demektir.',
          'Nazik olmayan bir başlangıç; önce anlayış göstermelisin.',
        ],
        note: '"vor allem" = özellikle. "nach Mitternacht" = gece yarısından sonra ("nach" + Dativ). "stören" = rahatsız etmek.',
      },
      {
        type: 'choice',
        speaker: 'Herr Krüger',
        german: 'Was wäre für Sie eine gute Lösung? Sollen wir ab zweiundzwanzig Uhr leiser sein, oder sollen die Besuche früher enden?',
        turkish: 'Sizin için iyi bir çözüm ne olurdu? Saat yirmi ikiden sonra daha sessiz mi olalım, yoksa ziyaretler daha erken mi bitsin?',
        prompt: 'Hangi çözümü istediğini seç.',
        options: [
          {
            german: 'Ich würde mir wünschen, dass Sie ab zweiundzwanzig Uhr die Musik leiser machen.',
            turkish: 'Saat yirmi ikiden sonra müziği kısmanızı isterim.',
            responseGerman: 'Das lässt sich machen. Wir drehen die Lautstärke ab zehn Uhr herunter.',
            responseTurkish: 'Bu yapılabilir. Saat ondan sonra sesi kısarız.',
          },
          {
            german: 'Es wäre schön, wenn Ihre Besuche am Wochenende früher enden würden.',
            turkish: 'Hafta sonu ziyaretlerinizin daha erken bitmesi güzel olurdu.',
            responseGerman: 'Das verstehe ich. Wir treffen uns dann lieber schon am Nachmittag.',
            responseTurkish: 'Anlıyorum. O zaman daha çok öğleden sonra buluşuruz.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Herr Krüger',
        german: 'Gut. Und was ist, wenn es trotzdem einmal zu laut wird?',
        turkish: 'Peki yine de bir gün fazla gürültü olursa ne yapacağız?',
      },
      {
        type: 'reply',
        prompt: 'Böyle bir durumda kısaca kapısını çalabileceğini ya da mesaj yazabileceğini öner (könnte).',
        german: 'Dann könnte ich kurz bei Ihnen klingeln oder Ihnen eine Nachricht schreiben.',
        turkish: 'O zaman kısaca kapınızı çalabilir ya da size bir mesaj yazabilirim.',
        wrongOptions: [
          'Dann könnte ich sofort die Polizei rufen.',
          'Dann würde ich nie wieder mit Ihnen sprechen.',
        ],
        wrongTurkish: [
          'O zaman hemen polisi arayabilirim.',
          'O zaman sizinle bir daha hiç konuşmazdım.',
        ],
        wrongNotes: [
          'Uzlaşma aranan bir konuşmada polise gitmek aşırı ve nazik değil.',
          'Uzlaşmayı bozan bir cevap; çözüm önermelisin.',
        ],
        note: '"könnte" nazik bir öneri bildirir. "klingeln" = zili çalmak: "bei Ihnen klingeln" = kapınızı çalmak.',
      },
      {
        type: 'say',
        speaker: 'Herr Krüger',
        german: 'Das ist fair. Und ich verspreche, dass es nicht wieder passiert. Haben Sie sonst noch ein Anliegen?',
        turkish: 'Bu adil. Ve bunun tekrar olmayacağına söz veriyorum. Başka bir isteğiniz var mı?',
      },
      {
        type: 'reply',
        prompt: 'Teşekkür et ve ev kurallarına göre gece sessizliğinin saat yirmi ikide başladığını hatırlat.',
        german: 'Danke. Laut Hausordnung beginnt die Nachtruhe um zweiundzwanzig Uhr.',
        turkish: 'Teşekkürler. Ev kurallarına göre gece sessizliği saat yirmi ikide başlıyor.',
        wrongOptions: [
          'Danke. Laut Hausordnung beginnt die Nachtruhe um zwölf Uhr mittags.',
          'Danke. Laut Hausordnung ist Lärm am Abend erlaubt, solange man will.',
        ],
        wrongTurkish: [
          'Teşekkürler. Ev kurallarına göre gece sessizliği öğlen on ikide başlıyor.',
          'Teşekkürler. Ev kurallarına göre akşam gürültü, istendiği sürece serbest.',
        ],
        wrongNotes: [
          'Gece sessizliği geceleri başlar; öğlen değil.',
          'Bu yanlış bilgi ve şikâyetinle çelişiyor.',
        ],
        note: '"laut" + Dativ = ...e göre. "die Nachtruhe" = gece sessizliği. "die Hausordnung" = ev kuralları.',
      },
      {
        type: 'say',
        speaker: 'Herr Krüger',
        german: 'Stimmt, das weiß ich. Ich werde in Zukunft mehr darauf achten.',
        turkish: 'Doğru, biliyorum. Bundan sonra buna daha çok dikkat edeceğim.',
      },
      {
        type: 'reply',
        prompt: 'Anlayışı için teşekkür et ve güzel bir akşam dile.',
        german: 'Vielen Dank für Ihr Verständnis. Ich wünsche Ihnen noch einen schönen Abend.',
        turkish: 'Anlayışınız için çok teşekkürler. Size güzel bir akşam dilerim.',
        wrongOptions: [
          'Vielen Dank. Ich wünsche Ihnen einen schönen Morgen.',
          'Das hat lange gedauert. Gute Nacht.',
        ],
        wrongTurkish: [
          'Çok teşekkürler. Size güzel bir sabah dilerim.',
          'Çok uzun sürdü. İyi geceler.',
        ],
        wrongNotes: [
          'Akşam konuşuyorsunuz; akşam dileği uygun düşer.',
          'Nazik olmayan bir kapanış; teşekkür edip iyi dilekte bulunmalısın.',
        ],
        note: '"wünschen" = dilemek: "Ich wünsche Ihnen einen schönen Abend." ("Ihnen" Dativ, "einen schönen Abend" Akkusativ).',
      },
      {
        type: 'say',
        speaker: 'Herr Krüger',
        german: 'Danke, gleichfalls. Gute Nacht!',
        turkish: 'Teşekkürler, size de. İyi geceler!',
      },
    ],
  },
  {
    id: 'acil-durum',
    level: 'B1',
    title: 'Acil Durum ve Kaza Bildirme',
    description: 'Acil çağrı hattını ara; yeri, olayı ve yaralıyı açıkla ve talimatları uygula.',
    place: 'Telefon (112)',
    steps: [
      {
        type: 'say',
        speaker: 'Acil çağrı merkezi',
        german: 'Notruf, Feuerwehr und Rettungsdienst. Was ist passiert?',
        turkish: 'Acil çağrı merkezi, itfaiye ve ambulans. Ne oldu?',
      },
      {
        type: 'reply',
        prompt: 'Burada az önce bir trafik kazası olduğunu ve bir kişinin yaralandığını söyle.',
        german: 'Hier ist gerade ein Verkehrsunfall passiert, und eine Person ist verletzt.',
        turkish: 'Burada az önce bir trafik kazası oldu ve bir kişi yaralandı.',
        wrongOptions: [
          'Hier ist gerade ein Verkehrsunfall passiert, aber niemand ist verletzt.',
          'Hier ist gerade ein Einbruch passiert, und eine Person ist verletzt.',
        ],
        wrongTurkish: [
          'Burada az önce bir trafik kazası oldu ama kimse yaralanmadı.',
          'Burada az önce bir hırsızlık oldu ve bir kişi yaralandı.',
        ],
        wrongNotes: [
          'Yaralı olduğunu söylemelisin; ambulans bunun için çağrılır.',
          'Olay bir trafik kazası; hırsızlık değil.',
        ],
        note: '"passieren" = olmak, meydana gelmek (Perfekt: "ist passiert"). "verletzt" = yaralı.',
      },
      {
        type: 'say',
        speaker: 'Acil çağrı merkezi',
        german: 'Wo genau sind Sie? Nennen Sie bitte die Straße und die Hausnummer.',
        turkish: 'Tam olarak neredesiniz? Lütfen sokağı ve kapı numarasını söyleyin.',
      },
      {
        type: 'reply',
        prompt: 'Hauptstraße 25 numarada, bir süpermarketin tam önünde olduğunu söyle.',
        german: 'Ich bin in der Hauptstraße fünfundzwanzig, direkt vor einem Supermarkt.',
        turkish: 'Hauptstraße 25 numaradayım, tam bir süpermarketin önünde.',
        wrongOptions: [
          'Ich bin in der Hauptstraße fünfzig, direkt vor einem Supermarkt.',
          'Ich bin zu Hause, direkt vor einem Supermarkt.',
        ],
        wrongTurkish: [
          'Hauptstraße 50 numaradayım, tam bir süpermarketin önünde.',
          'Evdeyim, tam bir süpermarketin önünde.',
        ],
        wrongNotes: [
          'Numara yirmi beş; "fünfzig" elli demektir.',
          'Kaza yerini söylemelisin; evde olmak ve süpermarketin önünde olmak çelişir.',
        ],
        note: 'Adres için "in der ...straße" + sayı kullanılır. "direkt vor + Dativ" = tam önünde.',
      },
      {
        type: 'say',
        speaker: 'Acil çağrı merkezi',
        german: 'Verstanden. Sind weitere Personen verletzt, und was ist genau passiert?',
        turkish: 'Anlaşıldı. Başka yaralı var mı ve tam olarak ne oldu?',
      },
      {
        type: 'reply',
        prompt: 'Yalnızca bir kişinin yaralı olduğunu ve bir motosikletlinin düştüğünü söyle.',
        german: 'Es ist nur eine Person verletzt. Ein Motorradfahrer ist gestürzt.',
        turkish: 'Yalnızca bir kişi yaralı. Bir motosikletli düştü.',
        wrongOptions: [
          'Es sind zehn Personen verletzt. Ein Motorradfahrer ist gestürzt.',
          'Es ist nur eine Person verletzt. Ein Motorradfahrer ist geflogen.',
        ],
        wrongTurkish: [
          'On kişi yaralı. Bir motosikletli düştü.',
          'Yalnızca bir kişi yaralı. Bir motosikletli uçtu.',
        ],
        wrongNotes: [
          'Yalnızca bir yaralı var; sayıyı yanlış verirsen yanlış ekip gönderilir.',
          'Düşmek için "stürzen" kullanılır; "fliegen" uçmak demektir.',
        ],
        note: '"stürzen" = düşmek (Perfekt: "ist gestürzt"). "nur" = yalnızca.',
      },
      {
        type: 'choice',
        speaker: 'Acil çağrı merkezi',
        german: 'Ist die verletzte Person bei Bewusstsein?',
        turkish: 'Yaralının bilinci yerinde mi?',
        prompt: 'Yaralının bilincinin yerinde olup olmadığını seç.',
        options: [
          {
            german: 'Ja, sie ist bei Bewusstsein und spricht mit mir.',
            turkish: 'Evet, bilinci yerinde ve benimle konuşuyor.',
            responseGerman: 'Gut. Sprechen Sie ruhig mit ihr und beruhigen Sie sie.',
            responseTurkish: 'İyi. Onunla sakin sakin konuşun ve onu sakinleştirin.',
          },
          {
            german: 'Nein, sie reagiert nicht, ich glaube, sie ist bewusstlos.',
            turkish: 'Hayır, tepki vermiyor, sanırım bilinci kapalı.',
            responseGerman: 'Verstanden. Bleiben Sie in ihrer Nähe und achten Sie bitte auf ihre Atmung.',
            responseTurkish: 'Anlaşıldı. Yakınında kalın ve lütfen nefesine dikkat edin.',
          },
        ],
      },
      {
        type: 'say',
        speaker: 'Acil çağrı merkezi',
        german: 'Der Rettungswagen ist schon unterwegs. Ist die Straße blockiert?',
        turkish: 'Ambulans yolda. Yol kapalı mı?',
      },
      {
        type: 'reply',
        prompt: 'Yolun yarısının kapalı olduğunu ve diğer arabaların yavaşça geçtiğini söyle (während).',
        german: 'Ja, die Straße ist halb blockiert, während die anderen Autos langsam vorbeifahren.',
        turkish: 'Evet, yol yarı yarıya kapalı, diğer arabalar ise yavaşça geçiyor.',
        wrongOptions: [
          'Nein, die Straße ist frei, während die anderen Autos langsam vorbeifahren.',
          'Ja, die Straße ist blockiert, weil niemand vorbeifahren möchte.',
        ],
        wrongTurkish: [
          'Hayır, yol açık, diğer arabalar ise yavaşça geçiyor.',
          'Evet, yol kapalı, çünkü kimse geçmek istemiyor.',
        ],
        wrongNotes: [
          'Yolun yarısı kapalı; "frei" yanlış bilgi verir.',
          'Gerekçe uyumsuz: yol, kaza yüzünden kapalı; kimse geçmek istemediği için değil.',
        ],
        note: '"während" burada iki eşzamanlı durumu bağlar; yan cümlede fiil sona gider. "halb" = yarı.',
      },
      {
        type: 'say',
        speaker: 'Acil çağrı merkezi',
        german: 'Gut. Ein Notarzt kommt auch. Bewegen Sie die Person bitte nicht, außer es besteht Gefahr. Haben Sie eine Decke?',
        turkish: 'İyi. Bir acil doktor da geliyor. Tehlike olmadıkça kişiyi lütfen hareket ettirmeyin. Bir battaniyeniz var mı?',
      },
      {
        type: 'reply',
        prompt: 'Arabasında bir battaniye olduğunu ve onu getirip yaralıyı örteceğini söyle.',
        german: 'Ja, im Auto habe ich eine Decke. Ich hole sie gleich und decke die Person damit zu.',
        turkish: 'Evet, arabamda bir battaniye var. Hemen getirip yaralıyı onunla örtüyorum.',
        wrongOptions: [
          'Ja, im Auto habe ich eine Decke. Ich hole sie gleich und bewege die Person vorsichtig auf die Straße.',
          'Nein, im Auto habe ich keine Decke, aber ich hole sie gleich.',
        ],
        wrongTurkish: [
          'Evet, arabamda bir battaniye var. Hemen getirip yaralıyı dikkatlice yola taşıyorum.',
          'Hayır, arabamda battaniye yok ama hemen getiriyorum.',
        ],
        wrongNotes: [
          'Yaralıyı hareket ettirmemelisin; özellikle yola taşımak tehlikelidir.',
          'Çelişkili cevap: battaniye yoksa getirilemez.',
        ],
        note: '"zudecken" ayrılabilen fiildir: "Ich decke die Person zu." "gleich" = hemen, birazdan.',
      },
      {
        type: 'say',
        speaker: 'Acil çağrı merkezi',
        german: 'Sehr gut. Der Rettungswagen ist in wenigen Minuten da. Bleiben Sie bitte am Telefon.',
        turkish: 'Çok iyi. Ambulans birkaç dakika içinde orada. Lütfen hatta kalın.',
      },
      {
        type: 'reply',
        prompt: 'Hatta kalacağını söyle ve yardım için teşekkür et.',
        german: 'Ja, ich bleibe am Telefon. Vielen Dank für Ihre Hilfe.',
        turkish: 'Evet, hatta kalıyorum. Yardımınız için çok teşekkürler.',
        wrongOptions: [
          'Nein, ich lege jetzt auf. Auf Wiederhören.',
          'Ja, ich bleibe am Telefon. Das war langweilig.',
        ],
        wrongTurkish: [
          'Hayır, şimdi kapatıyorum. Görüşmek üzere.',
          'Evet, hatta kalıyorum. Sıkıcıydı.',
        ],
        wrongNotes: [
          'Operatör hatta kalmanı istiyor; kapatmak yanlış.',
          'Uygunsuz ve acil durumla bağdaşmıyor.',
        ],
        note: '"am Telefon bleiben" = hatta kalmak. Acil durumda operatörün talimatlarına uymak önemlidir.',
      },
    ],
  },
];

/** Senaryo kimliklerine bağlı ek bilgiler (Almanca başlık, öğrenme hedefi). Kimlikler değişmez. */
export interface ScenarioMeta {
  germanTitle: string;
  /** Kısa öğrenme hedefi. Yoksa açıklama kullanılır. */
  goal?: string;
}

export const SCENARIO_META: Record<string, ScenarioMeta> = {
  'kafede-siparis': { germanTitle: 'Im Café bestellen' },
  'tren-istasyonu': { germanTitle: 'Am Bahnhof' },
  'markette-alisveris': {
    germanTitle: 'Im Supermarkt',
    goal: 'Bir ürünün yerini sorup fiyatını öğrenebilir, kasada ödeme yapabilirsin.',
  },
  'yeni-tanisma': {
    germanTitle: 'Sich kennenlernen',
    goal: 'Kendini tanıtıp adını, nereli olduğunu ve mesleğini söyleyebilirsin.',
  },
  'otelde-giris': {
    germanTitle: 'Im Hotel einchecken',
    goal: 'Rezervasyonunu söyleyip kahvaltı ve Wi-Fi hakkında soru sorabilirsin.',
  },
  'yol-tarifi': {
    germanTitle: 'Nach dem Weg fragen',
    goal: 'Bir yerin nerede olduğunu sorup sağ, sol ve düz tariflerini anlayabilirsin.',
  },
  'restoranda-siparis': {
    germanTitle: 'Im Restaurant bestellen',
    goal: 'Masa isteyip yemek ve içecek sipariş edebilir, hesabı isteyebilirsin.',
  },
  'doktor-randevu': { germanTitle: 'Einen Arzttermin vereinbaren' },
  'ev-gorme': { germanTitle: 'Wohnungsbesichtigung' },
  'eczane-ilac': { germanTitle: 'In der Apotheke' },
  'banka-hesap': { germanTitle: 'Ein Konto eröffnen' },
  'kayip-esya': { germanTitle: 'Im Fundbüro' },
  'tren-gecikme': { germanTitle: 'Zugverspätung' },
  'restoran-sikayet': { germanTitle: 'Beschwerde im Restaurant' },
  'kurs-kayit': { germanTitle: 'Kursanmeldung' },
  'tasinma-gunu': { germanTitle: 'Der Umzugstag' },
  'is-randevusu': { germanTitle: 'Ein Vorstellungstermin' },
  'arkadasla-sohbet': {
    germanTitle: 'Ein Gespräch unter Freunden',
    goal: 'Geçmişi anlatabilir (Perfekt), buluşma planlayabilir ve davet kabul edebilirsin.',
  },
  'is-gorusmesi': { germanTitle: 'Das Vorstellungsgespräch' },
  'resmi-daire': { germanTitle: 'Auf dem Amt' },
  'isyeri-sorun': { germanTitle: 'Probleme am Arbeitsplatz lösen' },
  'sigorta-gorusmesi': { germanTitle: 'Das Versicherungsgespräch' },
  'kira-sozlesmesi': { germanTitle: 'Der Mietvertrag' },
  'doktor-detay': { germanTitle: 'Das ausführliche Arztgespräch' },
  'seyahat-degisikligi': { germanTitle: 'Eine Reise umbuchen' },
  'oturum-izni': { germanTitle: 'Aufenthaltserlaubnis verlängern' },
  'gorusme-sonrasi-telefon': { germanTitle: 'Telefonat nach dem Gespräch' },
  'ekip-toplantisi': { germanTitle: 'Die Teambesprechung' },
  'kiyafet-magazasi': {
    germanTitle: 'Im Bekleidungsgeschäft',
    goal: 'Aradığın kıyafeti söyleyip beden ve renk belirtebilir, deneyip fiyatını sorabilirsin.',
  },
  'hobi-sohbeti': {
    germanTitle: 'Hobbys und Freizeit',
    goal: 'Boş zamanında ne yaptığını ve ne sıklıkla yaptığını söyleyip karşındakine de sorabilirsin.',
  },
  'gunluk-rutin': {
    germanTitle: 'Mein Tagesablauf',
    goal: 'Saat belirterek gününü anlatabilir, ayrılabilen fiilleri (aufstehen, anfangen) kullanabilirsin.',
  },
  'randevu-erteleme': {
    germanTitle: 'Einen Termin verschieben',
    goal: 'Mevcut bir randevuyu nazikçe erteleyip sebebini söyleyebilir, yeni gün ve saat kararlaştırabilirsin.',
  },
  'havaalani-pasaport': {
    germanTitle: 'Passkontrolle am Flughafen',
    goal: 'Pasaportunu uzatıp seyahatinin amacını, süresini ve kalacağın yeri söyleyebilirsin.',
  },
  'rica-izin-isteme': {
    germanTitle: 'Bitten und um Erlaubnis fragen',
    goal: '"Darf ich ...?" ve "Könnten Sie ...?" kalıplarıyla nazikçe izin ve yardım isteyebilirsin.',
  },
  'postane-paket': {
    germanTitle: 'Auf der Post',
    goal: 'Paket göndermek istediğini söyleyip gönderim türünü seçebilir, formu doldurup ücreti ödeyebilirsin.',
  },
  'aile-tanitma': {
    germanTitle: 'Meine Familie vorstellen',
    goal: 'Aile üyelerini tanıtıp isim, yaş ve meslek söyleyebilir, "mein/meine" ile sahiplik bildirebilirsin.',
  },
  'ev-tanitma': {
    germanTitle: 'Meine Wohnung vorstellen',
    goal: 'Odaları ve içindeki eşyaları adlandırıp "Es gibt ..." kalıbıyla evini tanıtabilirsin.',
  },
  'dogum-gunu-daveti': {
    germanTitle: 'Eine Einladung zur Geburtstagsparty',
    goal: 'Gün, saat ve adres vererek davet edebilir, misafir sayısı ve getirilecekler hakkında konuşabilirsin.',
  },
  'firin-kasap': {
    germanTitle: 'Beim Bäcker und beim Metzger',
    goal: 'Fırında ve kasapta ne istediğini ve miktarını (adet, gram) söyleyip ödeme yapabilirsin.',
  },
  'saat-acilis-kapanis': {
    germanTitle: 'Uhrzeit und Öffnungszeiten',
    goal: 'Saati sorup anlayabilir, "Wann öffnet/schließt ...?" ile açılış ve kapanış saatlerini öğrenebilirsin.',
  },
  'ozur-mazeret': {
    germanTitle: 'Sich entschuldigen',
    goal: 'Özür dileyip mazeretini Perfekt ve "deshalb" ile açıklayabilir, telafi önerebilirsin.',
  },
  'telefon-gorusmesi': {
    germanTitle: 'Telefonieren: Anfang und Ende',
    goal: 'Telefonda kendini tanıtıp biriyle görüşmek isteyebilir, mesaj bırakıp görüşmeyi nazikçe bitirebilirsin.',
  },
  'muze-bileti': {
    germanTitle: 'Eintrittskarten fürs Museum',
    goal: 'Giriş bileti isteyip öğrenci indirimini ve vestiyeri sorabilir, fotoğraf izni hakkında bilgi alabilirsin.',
  },
  'sehir-tanitimi': {
    germanTitle: 'Meine Heimatstadt vorstellen',
    goal: 'Şehrinin konumunu, nüfusunu, görülecek yerlerini ve yemeklerini anlatabilirsin.',
  },
  'taksi-cagirma': {
    germanTitle: 'Ein Taxi bestellen',
    goal: 'Telefonla taksi çağırıp adresini ve gideceğin yeri söyleyebilir, ödeme yöntemini sorabilirsin.',
  },
  'urun-iade': {
    germanTitle: 'Reklamation im Elektronikmarkt',
    goal: 'Arızalı ürünü anlatıp fişle haklarını öne sürebilir, değişim veya onarım talep edebilirsin.',
  },
  'mobil-sozlesme': {
    germanTitle: 'Einen Handyvertrag abschließen',
    goal: 'Tarife, sözleşme süresi ve fesih koşulları hakkında soru sorup kararını gerekçelendirebilirsin.',
  },
  'hastalik-bildirimi': {
    germanTitle: 'Sich krankmelden',
    goal: 'İşverene hastalık bildirimi yapıp rapor ve görev devri konularını nazikçe konuşabilirsin.',
  },
  'ariza-bildirme': {
    germanTitle: 'Einen Mangel in der Wohnung melden',
    goal: 'Evdeki arızayı açıklayıp aciliyetini belirtebilir, nazik rica ve tamir günü kararlaştırabilirsin.',
  },
  'komsu-gurultu': {
    germanTitle: 'Ein Gespräch wegen Lärm',
    goal: 'Şikâyetini Konjunktiv II ile nazikçe ifade edip çözüm önerebilir ve komşunla uzlaşabilirsin.',
  },
  'acil-durum': {
    germanTitle: 'Einen Notruf absetzen',
    goal: 'Acil durumda yeri, olayı ve yaralı sayısını net açıklayıp operatörün talimatlarını anlayabilirsin.',
  },
};

export const getScenarioMeta = (id: string): ScenarioMeta | undefined => SCENARIO_META[id];

export const getScenarioById = (id: string | undefined): Scenario | undefined =>
  SCENARIOS.find(scenario => scenario.id === id);

export const getScenariosForLevel = (level: Level): Scenario[] =>
  SCENARIOS.filter(scenario => scenario.level === level);

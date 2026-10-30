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
};

export type ScenarioStep = SayStep | ReplyStep;

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
];

export const getScenarioById = (id: string | undefined): Scenario | undefined =>
  SCENARIOS.find(scenario => scenario.id === id);

export const getScenariosForLevel = (level: Level): Scenario[] =>
  SCENARIOS.filter(scenario => scenario.level === level);

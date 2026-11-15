// Cihaz içi Almanca konuşma tanıma modülünün native kaynakları için KORUMA testi (statik metin denetimi).
// Amaç: "ağ tabanlı tanımaya düşmeme" ve "ses/transkript kaydedilmez/gönderilmez" sözleşmesinin sessizce bozulmasını engellemek.
// Bu, gerçek derleme veya cihaz davranışı doğrulaması DEĞİLDİR (derleme: iOS Xcode + Android Gradle ile ayrıca yapılır).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'modules', 'wortly-speech-recognition');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
/** Yorum satırları sayılmaz: yasak API'ler yalnızca açıklamada geçebilir. */
const code = (source) => source.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');

const swift = code(read('ios', 'WortlySpeechRecognitionModule.swift'));
const kotlin = code(read('android', 'src', 'main', 'java', 'expo', 'modules', 'wortlyspeechrecognition', 'WortlySpeechRecognitionModule.kt'));
const manifest = read('android', 'src', 'main', 'AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '');

test('iOS: tanıyıcı açıkça de-DE ile kurulur ve cihaz içi tanıma koşulsuz zorunludur', () => {
  assert.match(swift, /germanLocaleIdentifier\s*=\s*"de-DE"/);
  assert.match(swift, /SFSpeechRecognizer\(locale:\s*Locale\(identifier:\s*germanLocaleIdentifier\)\)/);
  assert.match(swift, /request\.requiresOnDeviceRecognition\s*=\s*true/);
  assert.doesNotMatch(swift, /requiresOnDeviceRecognition\s*=\s*(false|options)/);
  // Varsayılan yerel ayarlı tanıyıcı (locale verilmemiş) kullanılmaz.
  assert.doesNotMatch(swift, /SFSpeechRecognizer\(\)/);
});

test('iOS: cihaz içi destek ve izin, mikrofon motoru oluşturulmadan ÖNCE doğrulanır', () => {
  const start = swift.slice(swift.indexOf('private func start('));
  const engineAt = start.indexOf('AVAudioEngine()');
  assert.ok(engineAt > 0);
  for (const guard of ['Self.checkAvailability()', 'availability.available', 'supportsOnDeviceRecognition']) {
    const at = guard === 'supportsOnDeviceRecognition' ? swift.indexOf(guard) : start.indexOf(guard);
    assert.ok(at >= 0, guard);
    if (guard !== 'supportsOnDeviceRecognition') assert.ok(at < engineAt, `${guard} mikrofondan önce olmalı`);
  }
  assert.ok(start.indexOf('microphonePermission() == "granted"') < engineAt);
  assert.ok(start.indexOf('speechPermission() == "granted"') < engineAt);
  assert.match(swift, /guard recognizer\.supportsOnDeviceRecognition else/);
});

test('iOS: sonuç/hata olayı oturum temizliğinden ÖNCE gönderilir (JS "idle" olayından sonra olayları yok sayar)', () => {
  const finish = swift.slice(swift.indexOf('private func finishSession('), swift.indexOf('private func diagnostic('));
  const lastSend = Math.max(finish.lastIndexOf('sendEvent("onResult"'), finish.lastIndexOf('sendEvent("onError"'));
  assert.ok(lastSend > 0 && lastSend < finish.indexOf('teardown(emit: true)'), 'finishSession: olay teardown\'dan önce');
  const abort = swift.slice(swift.indexOf('private func abort('), swift.indexOf('private func stopAudioCapture('));
  assert.ok(abort.indexOf('sendEvent("onError"') < abort.indexOf('teardown(emit: true)'), 'abort: hata olayı teardown\'dan önce');
  const handle = swift.slice(swift.indexOf('private func handle('), swift.indexOf('private func finishSession('));
  const errorBranch = handle.slice(handle.indexOf('} else if let code = code {'));
  assert.ok(errorBranch.indexOf('sendEvent("onError"') < errorBranch.indexOf('teardown(emit: true)'), 'handle: hata olayı teardown\'dan önce');
});

test('iOS: ses geldi mi ayrımı (no-audio / no-speech) ve ayrıntı yalnızca sayı ile hata kodu içerir', () => {
  assert.match(swift, /"no-speech" : "no-audio"/);
  assert.match(swift, /silentPeakThreshold/);
  const detail = swift.slice(swift.indexOf('private func diagnostic('), swift.indexOf('private static func errorCode('));
  assert.doesNotMatch(detail, /lastTranscript|transcript/);
});

test('iOS: ortak ses oturumu ayarı dinlemeden önce saklanır, her temizlikte geri yüklenir (expo-speech sessiz kalmasın)', () => {
  const start = swift.slice(swift.indexOf('private func start('), swift.indexOf('private func handle('));
  const saveAt = start.indexOf('savedAudioSession = SavedAudioSession(');
  const recordAt = start.indexOf('setCategory(.record');
  assert.ok(saveAt > 0 && recordAt > saveAt, 'önceki ayar, .record kategorisine geçmeden ÖNCE saklanmalı');
  const teardown = swift.slice(swift.indexOf('private func teardown('), swift.indexOf('private func setState('));
  const deactivateAt = teardown.indexOf('setActive(false');
  const restoreAt = teardown.indexOf('setCategory(saved.category, mode: saved.mode, options: saved.options)');
  assert.ok(deactivateAt > 0 && restoreAt > deactivateAt, 'oturum kapatıldıktan sonra önceki kategori geri yüklenmeli');
  assert.match(teardown, /savedAudioSession = nil/);
  // Geri yükleme yalnızca saklanmış ayar varsa yapılır (dinleme hiç başlamadıysa ortak oturuma dokunulmaz).
  assert.match(teardown, /if let saved = savedAudioSession \{/);
  // .record kategorisi yalnızca start() içinde ayarlanır; başka hiçbir yerde ortak oturuma kayıt kategorisi verilmez.
  assert.equal((swift.match(/setCategory\(\.record/g) ?? []).length, 1);
});

test('Android: yalnızca cihaz içi tanıyıcı; ağ kullanabilen tanıyıcı hiçbir yolda çağrılmaz', () => {
  assert.match(kotlin, /SpeechRecognizer\.createOnDeviceSpeechRecognizer\(/);
  assert.doesNotMatch(kotlin, /SpeechRecognizer\.createSpeechRecognizer\(/);
  assert.doesNotMatch(kotlin, /createSpeechRecognizer/);
  assert.doesNotMatch(kotlin, /EXTRA_PREFER_OFFLINE/); // "tercih" bayrağına güvenilmez, gerçek cihaz içi tanıyıcı kullanılır
  assert.doesNotMatch(kotlin, /androidRecognitionServicePackage|ComponentName/);
});

test('Android: API 33 ve Almanca yüklü paket doğrulanmadan dinleme başlamaz', () => {
  assert.match(kotlin, /Build\.VERSION_CODES\.TIRAMISU/);
  assert.match(kotlin, /isOnDeviceRecognitionAvailable\(/);
  assert.match(kotlin, /installedOnDeviceLanguages/);
  assert.match(kotlin, /GERMAN_LOCALE\s*=\s*"de-DE"/);
  const start = kotlin.slice(kotlin.indexOf('private fun start('));
  assert.ok(start.indexOf('verifyGerman(') > 0);
  assert.ok(start.indexOf('verifyGerman(') < start.indexOf('startListening('), 'dil doğrulaması startListening\'ten önce olmalı');
});

test('modül ses kaydetmez, ağ isteği yapmaz; Android modül manifesti INTERNET izni eklemez', () => {
  const forbiddenNative = [
    /AVAudioFile/, /SFSpeechURLRecognitionRequest/, /URLSession/, /URLRequest/, /FileHandle/, /FileManager/, /UserDefaults/,
    /MediaRecorder/, /FileOutputStream/, /HttpURLConnection/, /OkHttp/, /SharedPreferences/, /java\.net\./,
    /\bLog\.[dviwe]\(/, /\bprint\(/, /\bNSLog\(/,
  ];
  for (const pattern of forbiddenNative) {
    assert.doesNotMatch(swift, pattern, `Swift: ${pattern}`);
    assert.doesNotMatch(kotlin, pattern, `Kotlin: ${pattern}`);
  }
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
});

test('JS katmanı kalıcı depolama veya ağ kullanmaz', () => {
  const dir = path.join(root, 'src');
  const files = [...fs.readdirSync(dir).map(name => path.join(dir, name)), path.join(root, 'index.ts')];
  for (const file of files) {
    const source = code(fs.readFileSync(file, 'utf8'));
    for (const pattern of [/AsyncStorage/, /\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /expo-file-system/, /localStorage/, /console\.(log|info|debug)/]) {
      assert.doesNotMatch(source, pattern, `${path.basename(file)}: ${pattern}`);
    }
  }
});

test('modül yapılandırması: iki platform, doğru sınıf adları', () => {
  const config = JSON.parse(read('expo-module.config.json'));
  assert.deepEqual(config.platforms, ['apple', 'android']);
  assert.deepEqual(config.apple.modules, ['WortlySpeechRecognitionModule']);
  assert.deepEqual(config.android.modules, ['expo.modules.wortlyspeechrecognition.WortlySpeechRecognitionModule']);
});

import ExpoModulesCore
import Foundation
import AVFoundation
import Speech

// Cihaz içi Almanca (de-DE) konuşma tanıma.
//
// Gizlilik/güvenlik sözleşmesi:
//  - Tanıyıcı AÇIKÇA de-DE ile oluşturulur. Başlatmadan önce `supportsOnDeviceRecognition` doğrulanır; destek yoksa mikrofon
//    HİÇ açılmadan "unavailable" döner. İstek `requiresOnDeviceRecognition = true` ile kurulur: sunucuya (Apple) ses gitmez.
//    (Topluluk paketlerinin aksine bayrak koşullu değil, koşul sağlanmıyorsa tanıma hiç başlamaz.)
//  - Ses dosyaya yazılmaz, transkript günlüğe basılmaz/saklanmaz; yalnızca olay olarak JS'e (belleğe) verilir.
//  - Tüm durum ana kuyruğa bağlıdır (işlevler `.runOnQueue(.main)` ile çalışır; tanıyıcı geri çağrıları ana kuyruğa alınır).
//  - Durdurma, hata, arka plana geçiş, ses kesintisi (arama vb.) ve modül yok edilmesinde mikrofon ve tanıyıcı temizlenir.
//  - Sonuç/hata olayı HER ZAMAN oturum temizliğinden (onStateChange: idle) ÖNCE gönderilir; JS tarafı "idle" olayını görünce
//    oturumu kapatır ve sonraki olayları yok sayar.
//  - Ses oturumu: dinleme başlarken uygulamanın ortak AVAudioSession ayarı (kategori/mod/seçenekler) saklanır ve HER temizlikte
//    geri yüklenir. expo-speech (AVSpeechSynthesizer) uygulamanın ortak oturumunu kullanır; `.record` kategorisinde takılı kalırsa
//    bundan sonra tüm Almanca seslendirmeler (senaryolar dahil) sessiz kalır.
//  - Sorun giderme için yalnızca SAYILAR toplanır (ses seviyesi tepesi, ses parçası sayısı, kısmi sonuç sayısı, hata kodu).
//    Ses, metin ve transkript bu ayrıntıya girmez.

private let germanLocaleIdentifier = "de-DE"
/// stop() sonrası nihai sonuç gelmezse beklenecek süre (JS tarafının süresinden kısadır).
private let stopGraceSeconds: TimeInterval = 3

/// Bu seviyenin altındaki tepe değer "mikrofondan ses gelmedi" sayılır (sessiz odada bile ~0.001 civarı gürültü olur).
private let silentPeakThreshold: Float = 0.003

/// Dinlemeden önceki ortak ses oturumu ayarı; temizlikte geri yüklenir.
private struct SavedAudioSession {
  let category: AVAudioSession.Category
  let mode: AVAudioSession.Mode
  let options: AVAudioSession.CategoryOptions
}

private enum SpeechModuleError: Error {
  case noAudioInput
}

/// Mikrofon tamponlarının yalnızca sayısal özeti (ses saklanmaz). Tap ses iş parçacığında çalıştığı için kilitlidir.
private final class AudioStats {
  private let lock = NSLock()
  private var buffers = 0
  private var peak: Float = 0

  func record(_ buffer: AVAudioPCMBuffer) {
    var localPeak: Float = 0
    let frames = Int(buffer.frameLength)
    if let channels = buffer.floatChannelData {
      let samples = channels[0]
      for index in 0..<frames { localPeak = max(localPeak, abs(samples[index])) }
    } else if let channels = buffer.int16ChannelData {
      let samples = channels[0]
      for index in 0..<frames { localPeak = max(localPeak, abs(Float(samples[index])) / 32768) }
    }
    lock.lock()
    buffers += 1
    peak = max(peak, localPeak)
    lock.unlock()
  }

  var summary: (buffers: Int, peak: Float) {
    lock.lock()
    defer { lock.unlock() }
    return (buffers, peak)
  }
}

public final class WortlySpeechRecognitionModule: Module {
  private var recognizer: SFSpeechRecognizer?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var audioEngine: AVAudioEngine?
  /// Her temizlikte artar; eski tanıma geri çağrıları bu sayede yok sayılır.
  private var generation = 0
  private var state = "idle"
  /// Yalnızca oturum süresince bellekte; temizlikte silinir.
  private var lastTranscript = ""
  private var stopFallback: DispatchWorkItem?
  private var interruptionObserver: NSObjectProtocol?
  private var engineObserver: NSObjectProtocol?
  private var audioStats = AudioStats()
  private var partialCount = 0
  private var engineRestarts = 0
  private var savedAudioSession: SavedAudioSession?

  public func definition() -> ModuleDefinition {
    Name("WortlySpeechRecognition")

    Events("onStateChange", "onResult", "onError")

    OnCreate {
      self.observeAudioInterruptions()
    }

    OnDestroy {
      if let observer = self.interruptionObserver {
        NotificationCenter.default.removeObserver(observer)
        self.interruptionObserver = nil
      }
      self.teardown(emit: false)
    }

    OnAppEntersBackground {
      self.abort(code: "interrupted")
    }

    AsyncFunction("getAvailability") { (promise: Promise) in
      promise.resolve(Self.checkAvailability().payload)
    }.runOnQueue(.main)

    AsyncFunction("getPermissions") { (promise: Promise) in
      promise.resolve(Self.currentPermissions())
    }.runOnQueue(.main)

    AsyncFunction("requestPermissions") { (promise: Promise) in
      Self.requestPermissions { permissions in
        promise.resolve(permissions)
      }
    }.runOnQueue(.main)

    AsyncFunction("start") { (promise: Promise) in
      self.start(promise)
    }.runOnQueue(.main)

    AsyncFunction("stop") { (promise: Promise) in
      self.stop()
      promise.resolve(nil)
    }.runOnQueue(.main)

    AsyncFunction("cancel") { (promise: Promise) in
      self.teardown(emit: true)
      promise.resolve(nil)
    }.runOnQueue(.main)
  }

  /// Telefon araması vb. ses kesintisi başlayınca oturumu sonlandırır (mikrofon açık kalmaz).
  private func observeAudioInterruptions() {
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let self = self,
        let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
        AVAudioSession.InterruptionType(rawValue: rawType) == .began else { return }
      self.abort(code: "interrupted")
    }
  }

  // MARK: - Destek ve izin

  private struct Availability {
    let available: Bool
    let reason: String?

    var payload: [String: Any] {
      available ? ["available": true] : ["available": false, "reason": reason ?? "unknown"]
    }
  }

  private static func makeRecognizer() -> SFSpeechRecognizer? {
    SFSpeechRecognizer(locale: Locale(identifier: germanLocaleIdentifier))
  }

  /// Almanca (de-DE) için CİHAZ İÇİ tanıma gerçekten destekleniyor mu? Sunucu tanımasına asla düşülmez.
  private static func checkAvailability() -> Availability {
    guard let recognizer = makeRecognizer() else {
      return Availability(available: false, reason: "language-not-supported")
    }
    guard recognizer.isAvailable else {
      return Availability(available: false, reason: "recognizer-unavailable")
    }
    guard recognizer.supportsOnDeviceRecognition else {
      return Availability(available: false, reason: "on-device-not-supported")
    }
    return Availability(available: true, reason: nil)
  }

  private static func microphonePermission() -> String {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted: return "granted"
      case .denied: return "denied"
      case .undetermined: return "undetermined"
      @unknown default: return "undetermined"
      }
    }
    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted: return "granted"
    case .denied: return "denied"
    case .undetermined: return "undetermined"
    @unknown default: return "undetermined"
    }
  }

  private static func speechPermission() -> String {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "undetermined"
    @unknown default: return "undetermined"
    }
  }

  private static func currentPermissions() -> [String: Any] {
    ["microphone": microphonePermission(), "speech": speechPermission()]
  }

  /// Önce mikrofon, sonra konuşma tanıma izni sorulur (zaten verilmiş/reddedilmiş olanlar tekrar sorulmaz).
  private static func requestPermissions(completion: @escaping ([String: Any]) -> Void) {
    func requestSpeech() {
      guard SFSpeechRecognizer.authorizationStatus() == .notDetermined else {
        DispatchQueue.main.async { completion(currentPermissions()) }
        return
      }
      SFSpeechRecognizer.requestAuthorization { _ in
        DispatchQueue.main.async { completion(currentPermissions()) }
      }
    }

    guard microphonePermission() == "undetermined" else {
      requestSpeech()
      return
    }
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { _ in
        DispatchQueue.main.async { requestSpeech() }
      }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { _ in
        DispatchQueue.main.async { requestSpeech() }
      }
    }
  }

  // MARK: - Oturum

  private func start(_ promise: Promise) {
    guard state == "idle" else {
      promise.resolve(["status": "busy"])
      return
    }

    // 1) Almanca cihaz içi destek: yoksa mikrofon hiç açılmaz.
    let availability = Self.checkAvailability()
    guard availability.available, let recognizer = Self.makeRecognizer() else {
      promise.resolve(["status": "unavailable", "reason": availability.reason ?? "unknown"])
      return
    }

    // 2) İzinler (burada sorulmaz; JS tarafı önce requestPermissions çağırır).
    guard Self.microphonePermission() == "granted", Self.speechPermission() == "granted" else {
      promise.resolve([
        "status": "permission-denied",
        "detail": "mikrofon:\(Self.microphonePermission()) konusma:\(Self.speechPermission())",
      ])
      return
    }

    // 3) İstek: cihaz içi ZORUNLU. Bayrak sağlanamıyorsa başlatma.
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = true
    if #available(iOS 16.0, *) {
      request.addsPunctuation = false
    }
    guard request.requiresOnDeviceRecognition else {
      promise.resolve(["status": "unavailable", "reason": "on-device-not-supported"])
      return
    }

    generation += 1
    let current = generation
    self.recognizer = recognizer
    self.request = request
    let stats = AudioStats()
    audioStats = stats
    partialCount = 0
    engineRestarts = 0
    setState("starting")

    do {
      let audioSession = AVAudioSession.sharedInstance()
      // Başarısız başlangıçta da temizlik bunu geri yükler (setCategory yarıda kalsa bile).
      if savedAudioSession == nil {
        savedAudioSession = SavedAudioSession(
          category: audioSession.category, mode: audioSession.mode, options: audioSession.categoryOptions
        )
      }
      try audioSession.setCategory(.record, mode: .measurement, options: [])
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

      let engine = AVAudioEngine()
      let input = engine.inputNode
      let format = input.outputFormat(forBus: 0)
      guard format.sampleRate > 0, format.channelCount > 0 else {
        throw SpeechModuleError.noAudioInput
      }
      input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak request] buffer, _ in
        stats.record(buffer)
        request?.append(buffer)
      }
      // Ses yönlendirmesi/örnekleme hızı değişirse AVAudioEngine kendiliğinden durur; tap sessizce susmasın diye yeniden başlatılır.
      engineObserver = NotificationCenter.default.addObserver(
        forName: .AVAudioEngineConfigurationChange,
        object: engine,
        queue: .main
      ) { [weak self] _ in
        guard let self = self, self.state == "listening", let running = self.audioEngine, !running.isRunning else { return }
        self.engineRestarts += 1
        try? running.start()
      }
      engine.prepare()
      try engine.start()
      self.audioEngine = engine

      lastTranscript = ""
      task = recognizer.recognitionTask(with: request) { [weak self] result, error in
        // Sonuç değerleri ana kuyrukta işlenir; yalnızca bu oturumun geri çağrıları dikkate alınır.
        let transcript = result?.bestTranscription.formattedString
        let isFinal = result?.isFinal ?? false
        DispatchQueue.main.async {
          self?.handle(transcript: transcript, isFinal: isFinal, error: error, generation: current)
        }
      }
      setState("listening")
      promise.resolve(["status": "started"])
    } catch {
      teardown(emit: false)
      // Mikrofon/ses oturumu açılamadı (giriş yok, başka uygulama kullanıyor vb.).
      let nsError = error as NSError
      let detail = error is SpeechModuleError ? "mikrofon-girisi-yok" : "ses:\(nsError.domain)/\(nsError.code)"
      promise.resolve(["status": "error", "code": "audio-error", "detail": detail])
    }
  }

  private func handle(transcript: String?, isFinal: Bool, error: Error?, generation g: Int) {
    guard g == generation, state != "idle" else { return }

    let text = (transcript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty {
      lastTranscript = transcript ?? ""
      partialCount += 1
    }

    if transcript != nil && isFinal {
      // Boş nihai sonuç, önceden duyulan kısmi metni ezmez; hiç metin yoksa sessiz boş cevap yerine açık hata verilir.
      finishSession(text: text.isEmpty ? lastTranscript : (transcript ?? ""), error: error as NSError?)
      return
    }
    if !text.isEmpty {
      sendEvent("onResult", ["transcript": transcript ?? "", "isFinal": false])
    }

    if let error = error {
      let nsError = error as NSError
      let code = Self.errorCode(for: nsError)
      // Konuşulmuş ve metin alınmışken tanıyıcı "ses yok"/iptal diye biterse eldeki metin nihai sayılır.
      if !lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (code == nil || code == "no-speech") {
        finishSession(text: lastTranscript, error: nil)
      } else if code == nil || code == "no-speech" {
        finishSession(text: "", error: nsError)
      } else if let code = code {
        sendEvent("onError", ["code": code, "detail": diagnostic(error: nsError)])
        teardown(emit: true)
      }
    }
  }

  /// Oturumu bitirir. Önce sonuç/hata olayı gönderilir, SONRA temizlenir (JS "idle" olayından sonra olayları yok sayar).
  /// Metin yoksa nedeni ayırır: mikrofondan ses gelmediyse "no-audio", ses geldi ama kelime çıkmadıysa "no-speech".
  private func finishSession(text: String, error: NSError?) {
    if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      sendEvent("onResult", ["transcript": text, "isFinal": true])
    } else {
      let summary = audioStats.summary
      let heardAudio = summary.buffers > 0 && summary.peak >= silentPeakThreshold
      sendEvent("onError", ["code": heardAudio ? "no-speech" : "no-audio", "detail": diagnostic(error: error)])
    }
    teardown(emit: true)
  }

  /// Yalnızca sayılar ve hata kodu: ses/metin içermez.
  private func diagnostic(error: NSError?) -> String {
    let summary = audioStats.summary
    var parts = [
      "seviye:\(String(format: "%.3f", summary.peak))",
      "parça:\(summary.buffers)",
      "kısmi:\(partialCount)",
    ]
    if engineRestarts > 0 { parts.append("motor-yeniden:\(engineRestarts)") }
    if let error = error { parts.append("hata:\(error.domain)/\(error.code)") }
    return parts.joined(separator: " · ")
  }

  /// Hata → kod. Kullanıcı/biz iptal ettiğimizde (kod 216, 301) hata bildirilmez.
  private static func errorCode(for error: NSError) -> String? {
    let nsError = error
    if nsError.domain == "kAFAssistantErrorDomain" {
      switch nsError.code {
      case 1110: return "no-speech"
      case 216, 301: return nil
      default: return "recognizer-error"
      }
    }
    return "recognizer-error"
  }

  /// Nazik durdurma: ses girişi kapanır, nihai sonuç beklenir; gelmezse kısa sürede temizlenir.
  private func stop() {
    guard state == "listening" else { return }
    setState("stopping")
    stopAudioCapture()
    request?.endAudio()

    let current = generation
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.generation == current, self.state != "idle" else { return }
      self.finishSession(text: self.lastTranscript, error: nil)
    }
    stopFallback = work
    DispatchQueue.main.asyncAfter(deadline: .now() + stopGraceSeconds, execute: work)
  }

  /// Arka plan / ses kesintisi: oturumu sonlandırır ve JS'e bildirir.
  private func abort(code: String) {
    guard state != "idle" else { return }
    sendEvent("onError", ["code": code, "detail": diagnostic(error: nil)])
    teardown(emit: true)
  }

  private func stopAudioCapture() {
    if let observer = engineObserver {
      NotificationCenter.default.removeObserver(observer)
      engineObserver = nil
    }
    if let engine = audioEngine {
      engine.inputNode.removeTap(onBus: 0)
      if engine.isRunning { engine.stop() }
    }
    audioEngine = nil
  }

  /// Mikrofonu, motoru, isteği ve tanıyıcı görevini kapatır; bellekteki transkripti siler.
  private func teardown(emit: Bool) {
    generation += 1
    stopFallback?.cancel()
    stopFallback = nil
    stopAudioCapture()
    request?.endAudio()
    request = nil
    task?.cancel()
    task = nil
    recognizer = nil
    lastTranscript = ""
    partialCount = 0
    // Başka ses oturumları (ör. sesli okuma) devam ediyorsa etkinleştirme hatası önemsizdir.
    let audioSession = AVAudioSession.sharedInstance()
    try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
    // `.record` kategorisi bırakılırsa expo-speech (ortak oturum) sessiz kalır: önceki ayarı geri yükle.
    if let saved = savedAudioSession {
      try? audioSession.setCategory(saved.category, mode: saved.mode, options: saved.options)
      savedAudioSession = nil
    }
    if emit {
      setState("idle")
    } else {
      state = "idle"
    }
  }

  private func setState(_ newState: String) {
    guard state != newState else { return }
    state = newState
    sendEvent("onStateChange", ["state": newState])
  }
}

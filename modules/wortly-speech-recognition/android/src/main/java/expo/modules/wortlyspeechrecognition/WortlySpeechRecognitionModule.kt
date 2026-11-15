package expo.modules.wortlyspeechrecognition

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

// Cihaz içi Almanca (de-DE) konuşma tanıma.
//
// Gizlilik/güvenlik sözleşmesi:
//  - YALNIZCA gerçek cihaz içi tanıyıcı kullanılır (SpeechRecognizer.createOnDeviceSpeechRecognizer, Android 13+).
//    Ağ kullanabilen SpeechRecognizer.createSpeechRecognizer HİÇBİR yolda çağrılmaz; EXTRA_PREFER_OFFLINE gibi "tercih"
//    bayraklarına güvenilmez.
//  - Başlatmadan önce (1) API 33+, (2) cihaz içi tanıyıcı mevcut, (3) Almanca (de-DE) cihaz içi paketi YÜKLÜ olduğu
//    doğrulanır. Biri yoksa mikrofon hiç açılmadan "unavailable" döner; ağ tanıyıcıya düşülmez.
//  - Ses kaydedilmez, transkript günlüğe basılmaz/saklanmaz; yalnızca olay olarak JS'e (belleğe) verilir.
//  - Tüm durum ana iş parçacığına bağlıdır (SpeechRecognizer ana iş parçacığında kullanılmalıdır).
//  - Durdurma, hata, arka plana geçiş ve modül yok edilmesinde tanıyıcı ve mikrofon temizlenir.

private const val GERMAN_LOCALE = "de-DE"
/** stop() sonrası nihai sonuç gelmezse beklenecek süre (JS tarafının süresinden kısadır). */
private const val STOP_GRACE_MS = 3000L
/** Dil desteği sorgusu yanıt vermezse beklenecek en uzun süre. */
private const val SUPPORT_CHECK_TIMEOUT_MS = 5000L

class WortlySpeechRecognitionModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  /** Her temizlikte artar; eski geri çağrılar bu sayede yok sayılır. */
  private var sessionId = 0
  private var state = "idle"
  /** Yalnızca oturum süresince bellekte; temizlikte silinir. */
  private var lastTranscript = ""
  private var stopFallback: Runnable? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WortlySpeechRecognition")

    Events("onStateChange", "onResult", "onError")

    AsyncFunction("getAvailability") { promise: Promise ->
      onMain { checkAvailability { payload -> promise.resolve(payload) } }
    }

    AsyncFunction("getPermissions") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.RECORD_AUDIO)
    }

    AsyncFunction("requestPermissions") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.RECORD_AUDIO)
    }

    AsyncFunction("start") { promise: Promise ->
      onMain { start(promise) }
    }

    AsyncFunction("stop") { promise: Promise ->
      onMain {
        stop()
        promise.resolve(null)
      }
    }

    AsyncFunction("cancel") { promise: Promise ->
      onMain {
        teardown(emit = true)
        promise.resolve(null)
      }
    }

    OnActivityEntersBackground {
      onMain { abort("interrupted") }
    }

    OnDestroy {
      onMain { teardown(emit = false) }
    }
  }

  // MARK: - Destek

  private fun unavailable(reason: String): Map<String, Any?> = mapOf("available" to false, "reason" to reason)

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post { block() }
  }

  private fun isGerman(tag: String): Boolean = tag.replace('_', '-').equals(GERMAN_LOCALE, ignoreCase = true)

  private fun recognizerIntent(): Intent =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, GERMAN_LOCALE)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }

  /** API ve cihaz içi tanıyıcı varlığı (eşzamanlı kontrol). Neden varsa döner; uygunsa null. */
  private fun syncUnavailableReason(): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "os-version"
    if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) return "on-device-not-supported"
    return null
  }

  /** Almanca cihaz içi paketinin YÜKLÜ olduğunu doğrular. Sonuç: null = uygun, aksi hâlde neden. */
  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private fun verifyGerman(speechRecognizer: SpeechRecognizer, callback: (String?) -> Unit) {
    val settled = AtomicBoolean(false)
    val timeout = Runnable {
      if (settled.compareAndSet(false, true)) callback("recognizer-unavailable")
    }
    mainHandler.postDelayed(timeout, SUPPORT_CHECK_TIMEOUT_MS)
    val finish = { reason: String? ->
      if (settled.compareAndSet(false, true)) {
        mainHandler.removeCallbacks(timeout)
        callback(reason)
      }
    }

    speechRecognizer.checkRecognitionSupport(
      recognizerIntent(),
      context.mainExecutor,
      object : RecognitionSupportCallback {
        override fun onSupportResult(recognitionSupport: RecognitionSupport) {
          val installed = recognitionSupport.installedOnDeviceLanguages.any { isGerman(it) }
          val known = recognitionSupport.supportedOnDeviceLanguages.any { isGerman(it) } ||
            recognitionSupport.pendingOnDeviceLanguages.any { isGerman(it) }
          finish(
            when {
              installed -> null
              known -> "language-not-installed"
              else -> "language-not-supported"
            },
          )
        }

        override fun onError(error: Int) {
          finish("recognizer-unavailable")
        }
      },
    )
  }

  private fun checkAvailability(callback: (Map<String, Any?>) -> Unit) {
    syncUnavailableReason()?.let {
      callback(unavailable(it))
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      callback(unavailable("os-version"))
      return
    }
    // Dil sorgusu bir tanıyıcı örneği ister; yalnızca kontrol için oluşturulur ve hemen yok edilir (mikrofon açılmaz).
    val probe = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
    verifyGerman(probe) { reason ->
      try { probe.destroy() } catch (_: Exception) { /* yok sayılır */ }
      callback(if (reason == null) mapOf("available" to true) else unavailable(reason))
    }
  }

  // MARK: - Oturum

  private fun start(promise: Promise) {
    if (state != "idle") {
      promise.resolve(mapOf("status" to "busy"))
      return
    }

    // 1) API + cihaz içi tanıyıcı varlığı: yoksa mikrofon hiç açılmaz, ağ tanıyıcıya düşülmez.
    syncUnavailableReason()?.let {
      promise.resolve(mapOf("status" to "unavailable", "reason" to it))
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      promise.resolve(mapOf("status" to "unavailable", "reason" to "os-version"))
      return
    }

    // 2) İzin (burada sorulmaz; JS tarafı önce requestPermissions çağırır).
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      promise.resolve(mapOf("status" to "permission-denied"))
      return
    }

    // 3) YALNIZCA cihaz içi tanıyıcı. Almanca paketi doğrulanmadan dinleme başlamaz.
    val speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
    sessionId += 1
    val current = sessionId
    recognizer = speechRecognizer
    setState("starting")

    verifyGerman(speechRecognizer) { reason ->
      if (current != sessionId || recognizer !== speechRecognizer) {
        // Beklerken iptal edildi/değişti: bu tanıyıcıyı kapat (mikrofon hiç açılmadı).
        try { speechRecognizer.destroy() } catch (_: Exception) { /* yok sayılır */ }
        promise.resolve(mapOf("status" to "cancelled"))
        return@verifyGerman
      }
      if (reason != null) {
        teardown(emit = true)
        promise.resolve(mapOf("status" to "unavailable", "reason" to reason))
        return@verifyGerman
      }
      try {
        lastTranscript = ""
        speechRecognizer.setRecognitionListener(createListener(current))
        speechRecognizer.startListening(recognizerIntent())
        setState("listening")
        promise.resolve(mapOf("status" to "started"))
      } catch (_: Exception) {
        teardown(emit = true)
        promise.resolve(mapOf("status" to "error", "code" to "audio-error"))
      }
    }
  }

  private fun createListener(current: Int) = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}

    override fun onPartialResults(partialResults: Bundle?) {
      if (current != sessionId) return
      val transcript = firstResult(partialResults) ?: return
      lastTranscript = transcript
      sendEvent("onResult", mapOf("transcript" to transcript, "isFinal" to false))
    }

    override fun onResults(results: Bundle?) {
      if (current != sessionId) return
      val transcript = firstResult(results)
      teardown(emit = true)
      if (transcript.isNullOrEmpty()) {
        sendEvent("onError", mapOf("code" to "no-speech"))
      } else {
        sendEvent("onResult", mapOf("transcript" to transcript, "isFinal" to true))
      }
    }

    override fun onError(error: Int) {
      if (current != sessionId) return
      teardown(emit = true)
      sendEvent("onError", errorPayload(error))
    }
  }

  private fun firstResult(bundle: Bundle?): String? =
    bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()

  private fun errorPayload(error: Int): Map<String, Any?> = when (error) {
    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> mapOf("code" to "no-speech")
    SpeechRecognizer.ERROR_AUDIO -> mapOf("code" to "audio-error")
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> mapOf("code" to "permission-denied")
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> mapOf("code" to "busy")
    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> mapOf("code" to "unavailable", "reason" to "language-not-supported")
    SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> mapOf("code" to "unavailable", "reason" to "language-not-installed")
    // Ağ/sunucu hataları cihaz içi tanıyıcıda beklenmez; gelirse sessizce yeniden denemek yerine hata olarak bildirilir.
    else -> mapOf("code" to "recognizer-error")
  }

  /** Nazik durdurma: dinleme biter, nihai sonuç beklenir; gelmezse kısa sürede temizlenir. */
  private fun stop() {
    if (state != "listening") return
    setState("stopping")
    val current = sessionId
    try { recognizer?.stopListening() } catch (_: Exception) { /* süre dolunca temizlenir */ }

    val fallback = Runnable {
      if (current != sessionId || state == "idle") return@Runnable
      val transcript = lastTranscript
      teardown(emit = true)
      if (transcript.isEmpty()) {
        sendEvent("onError", mapOf("code" to "no-speech"))
      } else {
        sendEvent("onResult", mapOf("transcript" to transcript, "isFinal" to true))
      }
    }
    stopFallback = fallback
    mainHandler.postDelayed(fallback, STOP_GRACE_MS)
  }

  /** Arka plan: oturumu sonlandırır ve JS'e bildirir. */
  private fun abort(code: String) {
    if (state == "idle") return
    teardown(emit = true)
    sendEvent("onError", mapOf("code" to code))
  }

  /** Tanıyıcıyı ve mikrofonu kapatır; bellekteki transkripti siler. */
  private fun teardown(emit: Boolean) {
    sessionId += 1
    stopFallback?.let { mainHandler.removeCallbacks(it) }
    stopFallback = null
    val current = recognizer
    recognizer = null
    if (current != null) {
      try { current.cancel() } catch (_: Exception) { /* yok sayılır */ }
      try { current.destroy() } catch (_: Exception) { /* yok sayılır */ }
    }
    lastTranscript = ""
    if (emit) setState("idle") else state = "idle"
  }

  private fun setState(newState: String) {
    if (state == newState) return
    state = newState
    sendEvent("onStateChange", mapOf("state" to newState))
  }
}

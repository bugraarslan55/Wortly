Pod::Spec.new do |s|
  s.name           = 'WortlySpeechRecognition'
  s.version        = '1.0.0'
  s.summary        = 'On-device German speech recognition for Wortly'
  s.description    = 'Wortly-specific local Expo module: on-device only (de-DE) speech recognition. No network recognition.'
  s.license        = 'UNLICENSED'
  s.author         = 'Wortly'
  s.homepage       = 'https://github.com/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end

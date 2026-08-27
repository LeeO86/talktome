Pod::Spec.new do |s|
  s.name           = 'TalkToMeCertTrust'
  s.version        = '0.1.0'
  s.summary        = 'Per-host TLS fingerprint pins for TalkToMe'
  s.description    = 'Probes a server certificate and pins its SHA-256 on Expo fetch and RN HTTP'
  s.author         = 'TalkToMe Mobile'
  s.homepage       = 'https://github.com/LeeO86/talktome-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end

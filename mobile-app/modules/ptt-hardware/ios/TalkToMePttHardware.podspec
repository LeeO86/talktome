Pod::Spec.new do |s|
  s.name           = 'TalkToMePttHardware'
  s.version        = '0.1.0'
  s.summary        = 'Android-only PTT hardware transports stub for TalkToMe'
  s.description    = 'iOS no-op so the JS façade can call the same module name on both platforms. BLE stays in TalkToMeBlePtt.'
  s.author         = 'TalkToMe Mobile'
  s.homepage       = 'https://github.com/LeeO86/talktome-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end

Pod::Spec.new do |s|
  s.name           = 'TalkToMeBlePtt'
  s.version        = '0.1.0'
  s.summary        = 'BLE PTT accessory central for TalkToMe'
  s.description    = 'Core Bluetooth central for catalogued PTT buttons and speaker mics'
  s.author         = 'TalkToMe Mobile'
  s.homepage       = 'https://github.com/LeeO86/talktome-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'CoreBluetooth'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end

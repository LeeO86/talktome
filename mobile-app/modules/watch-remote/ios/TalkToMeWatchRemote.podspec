Pod::Spec.new do |s|
  s.name           = 'TalkToMeWatchRemote'
  s.version        = '0.1.0'
  s.summary        = 'Apple Watch talk remote for TalkToMe'
  s.description    = 'WatchConnectivity session that mirrors talk targets and receives hold-to-talk commands'
  s.author         = 'TalkToMe Mobile'
  s.homepage       = 'https://github.com/LeeO86/talktome-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'WatchConnectivity'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end

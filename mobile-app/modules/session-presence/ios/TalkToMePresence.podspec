Pod::Spec.new do |s|
  s.name           = 'TalkToMePresence'
  s.version        = '0.1.0'
  s.summary        = 'Live Activity, home widget, and Talk shortcut for TalkToMe'
  s.description    = 'ActivityKit live activity updates, App Intent Talk shortcut, and shared presence state'
  s.author         = 'TalkToMe Mobile'
  s.homepage       = 'https://github.com/LeeO86/talktome-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.weak_frameworks = 'ActivityKit', 'WidgetKit', 'AppIntents'
  s.frameworks     = 'SwiftUI', 'MediaPlayer', 'UIKit'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end

Pod::Spec.new do |s|
  s.name           = 'TalkToMePtt'
  s.version        = '0.1.0'
  s.summary        = 'Optional PushToTalk channel manager for TalkToMe'
  s.description    = 'PTChannelManager wrapper. Default OSS builds omit the entitlement and never join.'
  s.author         = 'TalkToMe Mobile'
  s.homepage       = 'https://github.com/LeeO86/talktome-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.weak_frameworks = 'PushToTalk'
  s.frameworks     = 'AVFoundation', 'UIKit'

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
end

Pod::Spec.new do |s|
  s.name           = 'TalkToMeAudioSession'
  s.version        = '0.1.0'
  s.summary        = 'AVAudioSession profiles for TalkToMe Tier B'
  s.description    = 'Play-and-record intercom session, interruption recovery, and background receive keepalive'
  s.author         = 'TalkToMe Mobile'
  s.homepage       = 'https://github.com/LeeO86/talktome-mobile'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'AVFoundation', 'AVFAudio', 'AVKit', 'UIKit', 'MediaPlayer'

  s.dependency 'ExpoModulesCore'
  s.dependency 'JitsiWebRTC', '~> 124.0.0'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.resources = 'Resources/*.mp3'
end

import AVFoundation
import WatchKit

enum WatchTalkBeep {
  private static var player: AVAudioPlayer?
  private static var prepared = false

  static func playConfirmed(soundOnWatch: Bool = true) {
    if soundOnWatch {
      WKInterfaceDevice.current().play(.success)
      playTone()
    }
  }

  private static func playTone() {
    prepare()
    player?.currentTime = 0
    player?.play()
  }

  private static func prepare() {
    if prepared {
      return
    }
    prepared = true
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)
      player = try AVAudioPlayer(data: toneWav())
      player?.prepareToPlay()
    } catch {
      prepared = false
    }
  }

  private static func toneWav() -> Data {
    let sampleRate = 22_050
    let duration = 0.12
    let frequency = 880.0
    let sampleCount = Int(Double(sampleRate) * duration)
    let fade = Int(Double(sampleRate) * 0.008)
    var samples = [Int16](repeating: 0, count: sampleCount)
    for index in 0 ..< sampleCount {
      let envelope: Double
      if index < fade {
        envelope = Double(index) / Double(max(fade, 1))
      } else if index > sampleCount - fade {
        envelope = Double(sampleCount - index) / Double(max(fade, 1))
      } else {
        envelope = 1
      }
      let value = sin(2 * Double.pi * frequency * Double(index) / Double(sampleRate)) * envelope * 0.55
      samples[index] = Int16(value * Double(Int16.max))
    }

    let dataSize = sampleCount * 2
    var wav = Data()
    wav.append(ascii("RIFF"))
    wav.append(u32(36 + dataSize))
    wav.append(ascii("WAVE"))
    wav.append(ascii("fmt "))
    wav.append(u32(16))
    wav.append(u16(1))
    wav.append(u16(1))
    wav.append(u32(sampleRate))
    wav.append(u32(sampleRate * 2))
    wav.append(u16(2))
    wav.append(u16(16))
    wav.append(ascii("data"))
    wav.append(u32(dataSize))
    samples.withUnsafeBytes { raw in
      wav.append(contentsOf: raw)
    }
    return wav
  }

  private static func ascii(_ value: String) -> Data {
    Data(value.utf8)
  }

  private static func u16(_ value: Int) -> Data {
    var payload = UInt16(value).littleEndian
    return Data(bytes: &payload, count: 2)
  }

  private static func u32(_ value: Int) -> Data {
    var payload = UInt32(value).littleEndian
    return Data(bytes: &payload, count: 4)
  }
}

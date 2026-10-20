# Incoming audio level meters

Enable **Application menu → Controls → Incoming level meters** in the browser
client. The option defaults to off and is saved in the user's audio settings.
Admins and remote panels can also change that preference for a user.
Admins can enable it as a client default under **Admin → Config → Client defaults**.
Saved user preferences take precedence over that default.

Each user, conference and feed target has a 6 × 36 px vertical meter between its
icon and name. The display covers −90 to 0 dBFS so quiet background noise remains
visible (−80 dBFS occupies about 4 px). Conferences show their strongest
incoming contributor. Hidden meters reserve no space; left-hand mode mirrors
their position with the rest of the target row.

The level represents incoming audio before playback volume, feed dimming or
output device routing. It does not confirm that a loudspeaker is producing sound.
Pausing reception stops the incoming level; existing user mute controls may pause
the consumer as well.

`public/incomingAudioLevels.js` samples at 10 Hz while enabled and visible, with
an active receive transport and consumers. The browser client measures decoded
incoming tracks with a `MediaStreamAudioSourceNode` and separate left/right
`AnalyserNode`s, showing the strongest channel's RMS. Separating channels avoids
cancellation for opposite-phase stereo audio. The measurement branch has no
connection to an audio output and uses the shared AudioContext; it creates no
microphone stream or server telemetry and does not change playback routing.

This bypasses Chromium's native playout gain, which affects inbound RTP
`audioLevel` and energy statistics when a media element's volume changes. Meters
therefore remain active at playback volume zero and during feed dimming. A
suspended or unsupported analysis context is shown as unavailable rather than
falling back to post-fader statistics. Paused, muted or ended tracks show zero.
Measurement nodes are disconnected when consumers disappear, reception pauses,
meters are disabled or the page is hidden. The shared context and received tracks
remain owned by the existing audio lifecycle. Remote panels never run the monitor.

The standalone sampler also supports timestamped receiver source levels and
interval deltas of inbound RTP energy statistics for callers without track
analysis. The browser client always supplies tracks and uses direct analysis.

Validation: `npm test` covers mapping, RMS conversion, stereo source levels,
silence, paused/replaced consumers, disabled polling and in-flight cancellation.
The browser audio check uses separate users and a stereo feed to verify direct
and conference reception, level changes, volume zero, feed stop/resume and
preference restoration. A Chrome WebRTC loopback check verifies that direct
track RMS stays constant at media-element volumes 1, 0.5 and 0. Check layout at 375 px in both handedness modes.

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
an active receive transport and consumers. It first reads timestamped receiver
levels from [`getSynchronizationSources()`](https://www.w3.org/TR/webrtc/#dom-rtcrtpreceiver-getsynchronizationsources).
This also handles stereo feeds for which Chrome was observed to return zero
in inbound audio energy statistics despite nonzero decoded audio. If source
levels are unavailable, one transport `getStats()` request supplies all target
levels, using interval deltas of
[`totalAudioEnergy` and `totalSamplesDuration`](https://www.w3.org/TR/webrtc-stats/#dom-rtcinboundrtpstreamstats-totalaudioenergy),
or `audioLevel`. Frozen source timestamps or packet counters clear the display.
Unsupported level statistics are marked as unavailable in the meter's tooltip.

Metering creates no AudioContext, microphone stream, playback connection or
server telemetry. Remote panels never run the meter monitor themselves.

Validation: `npm test` covers mapping, RMS conversion, stereo source levels,
silence, paused/replaced consumers, disabled polling and in-flight cancellation.
The browser audio check uses separate users and a stereo feed to verify direct
and conference reception, level changes, volume zero, feed stop/resume and
preference restoration. Check layout at 375 px in both handedness modes.

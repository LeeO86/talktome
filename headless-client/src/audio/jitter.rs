//! Per-consumer receive buffer: sequence tracking with Opus FEC/PLC for
//! gaps, and a decoded PCM FIFO whose playout depth follows the link.
//!
//! Playout starts at `jitter_min_ms`. While the stream is healthy the buffer
//! is trimmed to that target plus one frame, so a burst cannot become a
//! standing delay. An underrun raises the target by one frame up to
//! `jitter_max_ms`; five seconds of clean audio lowers it again.

use std::collections::VecDeque;
use std::time::Instant;

use anyhow::Result;

use super::codec::{OpusDecoder, SAMPLE_RATE};

const MAX_CONCEAL_FRAMES: u16 = 5;
/// Clean playout required before the target drops by one frame.
const RELAX_SAMPLES: usize = SAMPLE_RATE as usize * 5;

pub struct StreamBuffer {
    decoder: OpusDecoder,
    pcm: VecDeque<f32>,
    next_seq: Option<u16>,
    frame_samples: usize,
    min_samples: usize,
    /// Current playout depth. Starts at `min_samples` and moves by one frame.
    target_samples: usize,
    max_samples: usize,
    /// Samples played since the last underrun or target change.
    clean_samples: usize,
    primed: bool,
    underruns: u32,
    last_packet: Instant,
    pub stats: StreamStats,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct StreamStats {
    pub packets: u64,
    pub concealed: u64,
    pub dropped_late: u64,
    pub dropped_overflow: u64,
    pub underruns: u64,
}

impl StreamBuffer {
    pub fn new(min_ms: u32, max_ms: u32) -> Result<Self> {
        let per_ms = SAMPLE_RATE as usize / 1000;
        let min_samples = per_ms * min_ms.max(1) as usize;
        let max_samples = per_ms * max_ms.max(min_ms.saturating_add(20)) as usize;
        Ok(Self {
            decoder: OpusDecoder::new()?,
            pcm: VecDeque::with_capacity(per_ms * (max_ms as usize + 120)),
            next_seq: None,
            frame_samples: per_ms * 20,
            min_samples,
            target_samples: min_samples,
            max_samples,
            clean_samples: 0,
            primed: false,
            underruns: 0,
            last_packet: Instant::now(),
            stats: StreamStats::default(),
        })
    }

    pub fn last_packet(&self) -> Instant {
        self.last_packet
    }

    #[cfg(test)]
    pub fn buffered_ms(&self) -> u32 {
        (self.pcm.len() * 1000 / SAMPLE_RATE as usize) as u32
    }

    #[cfg(test)]
    pub fn target_ms(&self) -> u32 {
        (self.target_samples * 1000 / SAMPLE_RATE as usize) as u32
    }

    /// True while audio is actually being played out from this stream.
    pub fn is_active(&self) -> bool {
        self.primed
    }

    pub fn push(&mut self, seq: u16, payload: &[u8]) -> Result<()> {
        self.last_packet = Instant::now();
        if let Some(samples) = self.decoder.packet_samples(payload) {
            if samples > 0 {
                self.frame_samples = samples;
            }
        }

        if let Some(expected) = self.next_seq {
            let gap = seq.wrapping_sub(expected);
            if gap == 0 {
                // in order
            } else if gap < 0x8000 {
                // Lost `gap` frames: conceal all but the last, recover the
                // last one from this packet's in-band FEC data.
                let conceal = gap.min(MAX_CONCEAL_FRAMES);
                for index in 0..conceal {
                    let is_last = index + 1 == gap;
                    let pcm = if is_last {
                        self.decoder
                            .decode_fec(payload, self.frame_samples)?
                            .to_vec()
                    } else {
                        self.decoder.conceal(self.frame_samples)?.to_vec()
                    };
                    self.append(&pcm);
                    self.stats.concealed += 1;
                }
            } else {
                // Late or duplicate packet.
                self.stats.dropped_late += 1;
                return Ok(());
            }
        }
        let pcm = self.decoder.decode(payload, false)?.to_vec();
        self.append(&pcm);
        self.next_seq = Some(seq.wrapping_add(1));
        self.stats.packets += 1;
        Ok(())
    }

    fn step_samples(&self) -> usize {
        self.frame_samples.max(1)
    }

    fn raise_target(&mut self) {
        let next = self.target_samples.saturating_add(self.step_samples());
        self.target_samples = next.min(self.max_samples);
    }

    fn lower_target(&mut self) {
        self.target_samples = self
            .target_samples
            .saturating_sub(self.step_samples())
            .max(self.min_samples);
    }

    fn append(&mut self, pcm: &[f32]) {
        self.pcm.extend(pcm.iter().copied());
        // Keep one extra frame above the target so the packet that just
        // arrived is not discarded, but never let a burst stand as delay.
        let ceiling = self.target_samples.saturating_add(self.step_samples());
        if self.pcm.len() > ceiling {
            let drop = (self.pcm.len() - ceiling).min(self.step_samples());
            self.pcm.drain(..drop);
            self.stats.dropped_overflow += drop as u64;
        }
        if !self.primed && self.pcm.len() >= self.target_samples {
            self.primed = true;
            self.underruns = 0;
        }
    }

    /// Adds this stream's next `out.len()` samples (scaled by `gain`) into `out`.
    pub fn mix_into(&mut self, out: &mut [f32], gain: f32) {
        if !self.primed || out.is_empty() {
            return;
        }
        let available = self.pcm.len();
        if available < out.len() {
            self.underruns += 1;
            self.stats.underruns += 1;
            self.clean_samples = 0;
            self.raise_target();
        } else if self.target_samples > self.min_samples {
            self.clean_samples = self.clean_samples.saturating_add(out.len());
            if self.clean_samples >= RELAX_SAMPLES {
                self.lower_target();
                self.clean_samples = 0;
            }
        }
        for sample in out.iter_mut().take(available) {
            *sample += self.pcm.pop_front().unwrap_or(0.0) * gain;
        }
        // An exhausted buffer waits until it holds the target again so a
        // burst of late packets does not play out as stutter.
        if self.pcm.is_empty() {
            self.primed = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::codec::OpusEncoder;

    fn tone_packets(count: usize) -> Vec<bytes::Bytes> {
        let mut encoder = OpusEncoder::new(20, 64_000, true).unwrap();
        let mut phase = 0f32;
        (0..count)
            .map(|_| {
                let frame: Vec<f32> = (0..960)
                    .map(|_| {
                        phase += 440.0 * std::f32::consts::TAU / 48_000.0;
                        phase.sin() * 0.5
                    })
                    .collect();
                encoder.encode(&frame).unwrap()
            })
            .collect()
    }

    #[test]
    fn primes_after_minimum_and_conceals_gaps() {
        let mut buffer = StreamBuffer::new(40, 200).unwrap();
        let packets = tone_packets(12);
        buffer.push(1, &packets[0]).unwrap();
        assert!(!buffer.is_active(), "20 ms is below the 40 ms minimum");
        buffer.push(2, &packets[1]).unwrap();
        assert!(buffer.is_active());
        // Lose packet 3, deliver 4: one frame concealed via FEC.
        // 80 ms would have queued; the target (40 ms) plus one frame trims it.
        buffer.push(4, &packets[3]).unwrap();
        assert_eq!(buffer.stats.concealed, 1);
        assert_eq!(buffer.buffered_ms(), 60);
        // Duplicate/late packet is dropped.
        buffer.push(2, &packets[1]).unwrap();
        assert_eq!(buffer.stats.dropped_late, 1);

        let mut out = vec![0f32; 960];
        buffer.mix_into(&mut out, 0.5);
        assert!(out.iter().any(|s| s.abs() > 0.01));
        assert_eq!(buffer.buffered_ms(), 40);
    }

    #[test]
    fn overflow_drops_oldest_and_underrun_unprimes() {
        let mut buffer = StreamBuffer::new(20, 60).unwrap();
        let packets = tone_packets(10);
        for (index, packet) in packets.iter().enumerate() {
            buffer.push(index as u16, packet).unwrap();
        }
        assert!(buffer.buffered_ms() <= 60);
        assert!(buffer.stats.dropped_overflow > 0);
        let mut out = vec![0f32; 48_000];
        buffer.mix_into(&mut out, 1.0);
        assert!(!buffer.is_active(), "drained buffer waits for refill");
        assert!(buffer.stats.underruns >= 1);
    }

    #[test]
    fn steady_state_stays_near_the_target() {
        let mut buffer = StreamBuffer::new(20, 120).unwrap();
        let packets = tone_packets(40);
        for (index, packet) in packets.iter().enumerate() {
            buffer.push(index as u16, packet).unwrap();
        }
        assert_eq!(buffer.target_ms(), 20);
        assert!(
            (20..=40).contains(&buffer.buffered_ms()),
            "buffered {} ms",
            buffer.buffered_ms()
        );
        assert!(buffer.stats.dropped_overflow > 0);
    }

    #[test]
    fn underrun_raises_target_and_clean_audio_relaxes_it() {
        let mut buffer = StreamBuffer::new(20, 120).unwrap();
        let packets = tone_packets(8);
        buffer.push(0, &packets[0]).unwrap();
        buffer.push(1, &packets[1]).unwrap();
        assert!(buffer.is_active());
        assert_eq!(buffer.target_ms(), 20);

        let mut drain = vec![0f32; 48_000];
        buffer.mix_into(&mut drain, 1.0);
        assert!(!buffer.is_active());
        assert_eq!(buffer.target_ms(), 40, "one underrun adds one frame");

        buffer.push(2, &packets[2]).unwrap();
        assert!(
            !buffer.is_active(),
            "a single 20 ms packet is below the raised target"
        );
        buffer.push(3, &packets[3]).unwrap();
        assert!(buffer.is_active());

        let mut out = vec![0f32; 960];
        let mut seq = 4u16;
        // 5 s of 20 ms frames, kept full so none of them underrun.
        for _ in 0..250 {
            buffer
                .push(seq, &packets[seq as usize % packets.len()])
                .unwrap();
            seq = seq.wrapping_add(1);
            buffer.mix_into(&mut out, 1.0);
            assert!(buffer.is_active());
        }
        assert_eq!(buffer.target_ms(), 20);
    }
}

//! Sums all consumer streams into one mono signal with per-target volume,
//! mute and dimming.

use std::collections::HashMap;
use std::time::Duration;

use anyhow::Result;

use super::jitter::StreamBuffer;
use crate::talk::{AudioLevel, TargetKey};

pub fn db_to_gain(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

struct Source {
    key: TargetKey,
    /// Speaker inside a conference, when known from producer appData.
    speaker: Option<i64>,
    buffer: StreamBuffer,
}

pub struct Mixer {
    sources: HashMap<String, Source>,
    levels: HashMap<TargetKey, AudioLevel>,
    /// Per-member listen level inside a conference: (conference id, user id).
    member_levels: HashMap<(i64, i64), AudioLevel>,
    default_volume: f32,
    dim_gain: f32,
    dim_feeds_while_speaking: bool,
    dim_when_addressed: bool,
    talking: bool,
    addressed: bool,
    jitter_min_ms: u32,
    jitter_max_ms: u32,
    /// Output peak of the last render, for meters.
    pub output_peak: f32,
}

impl Mixer {
    pub fn new(
        default_volume: f32,
        dim_db: f32,
        dim_feeds_while_speaking: bool,
        dim_when_addressed: bool,
        jitter_min_ms: u32,
        jitter_max_ms: u32,
    ) -> Self {
        Self {
            sources: HashMap::new(),
            levels: HashMap::new(),
            member_levels: HashMap::new(),
            default_volume,
            dim_gain: db_to_gain(dim_db),
            dim_feeds_while_speaking,
            dim_when_addressed,
            talking: false,
            addressed: false,
            jitter_min_ms,
            jitter_max_ms,
            output_peak: 0.0,
        }
    }

    pub fn add_source_from(
        &mut self,
        consumer_id: &str,
        key: TargetKey,
        speaker: Option<i64>,
    ) -> Result<()> {
        self.sources.insert(
            consumer_id.to_string(),
            Source {
                key,
                speaker,
                buffer: StreamBuffer::new(self.jitter_min_ms, self.jitter_max_ms)?,
            },
        );
        Ok(())
    }

    pub fn remove_source(&mut self, consumer_id: &str) {
        self.sources.remove(consumer_id);
    }

    pub fn clear_sources(&mut self) {
        self.sources.clear();
    }

    pub fn set_level(&mut self, key: TargetKey, level: AudioLevel) {
        self.levels.insert(key, level);
    }

    pub fn set_dim_state(&mut self, talking: bool, addressed: bool) {
        self.talking = talking;
        self.addressed = addressed;
    }

    pub fn push_packet(&mut self, consumer_id: &str, seq: u16, payload: &[u8]) -> Result<bool> {
        match self.sources.get_mut(consumer_id) {
            Some(source) => {
                source.buffer.push(seq, payload)?;
                Ok(true)
            }
            None => Ok(false),
        }
    }

    pub fn set_member_level(&mut self, conference_id: i64, user_id: i64, level: AudioLevel) {
        self.member_levels.insert((conference_id, user_id), level);
    }

    fn gain_for_source(&self, source: &Source) -> f32 {
        let mut gain = self.gain_for(source.key);
        if let (TargetKey::Conference(conference_id), Some(user_id)) = (source.key, source.speaker)
        {
            if let Some(member) = self.member_levels.get(&(conference_id, user_id)) {
                if member.muted {
                    return 0.0;
                }
                gain *= member.volume;
            }
        }
        gain
    }

    fn gain_for(&self, key: TargetKey) -> f32 {
        let level = self.levels.get(&key).cloned().unwrap_or(AudioLevel {
            volume: self.default_volume,
            muted: false,
        });
        if level.muted {
            return 0.0;
        }
        let mut gain = level.volume;
        if matches!(key, TargetKey::Feed(_)) {
            let dim = (self.dim_feeds_while_speaking && self.talking)
                || (self.dim_when_addressed && self.addressed);
            if dim {
                gain *= self.dim_gain;
            }
        }
        gain
    }

    /// Renders `out.len()` mono samples (overwrites `out`).
    pub fn render(&mut self, out: &mut [f32]) {
        out.fill(0.0);
        let gains: Vec<(String, f32)> = self
            .sources
            .iter()
            .map(|(id, source)| (id.clone(), self.gain_for_source(source)))
            .collect();
        for (id, gain) in gains {
            if let Some(source) = self.sources.get_mut(&id) {
                source.buffer.mix_into(out, gain);
            }
        }
        let mut peak = 0f32;
        for sample in out.iter_mut() {
            // Soft clip to keep summed conferences from wrapping.
            if sample.abs() > 0.95 {
                *sample = sample.signum() * (0.95 + (sample.abs() - 0.95).tanh() * 0.05);
            }
            peak = peak.max(sample.abs());
        }
        self.output_peak = peak;
    }

    /// Targets from which audio is currently being played out.
    pub fn receiving_keys(&self) -> Vec<TargetKey> {
        let mut keys: Vec<TargetKey> = self
            .sources
            .values()
            .filter(|s| {
                s.buffer.is_active()
                    && s.buffer.last_packet().elapsed() < Duration::from_millis(500)
            })
            .map(|s| s.key)
            .collect();
        keys.sort();
        keys.dedup();
        keys
    }

    /// Speakers currently delivering audio inside `conference_id`.
    pub fn receiving_speakers(&self, conference_id: i64) -> Vec<i64> {
        let mut ids: Vec<i64> = self
            .sources
            .values()
            .filter(|s| {
                s.key == TargetKey::Conference(conference_id)
                    && s.buffer.is_active()
                    && s.buffer.last_packet().elapsed() < Duration::from_millis(500)
            })
            .filter_map(|s| s.speaker)
            .collect();
        ids.sort();
        ids.dedup();
        ids
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::codec::OpusEncoder;

    fn packets(count: usize, amplitude: f32) -> Vec<bytes::Bytes> {
        let mut encoder = OpusEncoder::new(20, 64_000, false).unwrap();
        (0..count)
            .map(|i| {
                let frame: Vec<f32> = (0..960)
                    .map(|n| {
                        (((i * 960 + n) as f32) * 440.0 * std::f32::consts::TAU / 48_000.0).sin()
                            * amplitude
                    })
                    .collect();
                encoder.encode(&frame).unwrap()
            })
            .collect()
    }

    fn rms(samples: &[f32]) -> f32 {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    }

    #[test]
    fn applies_volume_mute_and_feed_dim() {
        let mut mixer = Mixer::new(1.0, -20.0, true, false, 20, 200);
        mixer
            .add_source_from("c1", TargetKey::Conference(1), None)
            .unwrap();
        mixer
            .add_source_from("f1", TargetKey::Feed(1), None)
            .unwrap();
        let conf = packets(6, 0.5);
        let feed = packets(6, 0.5);
        for (i, p) in conf.iter().enumerate() {
            mixer.push_packet("c1", i as u16, p).unwrap();
        }
        for (i, p) in feed.iter().enumerate() {
            mixer.push_packet("f1", i as u16, p).unwrap();
        }
        assert!(!mixer.push_packet("nope", 0, &conf[0]).unwrap());

        let mut out = vec![0f32; 960];
        mixer.render(&mut out);
        let both = rms(&out);
        assert!(both > 0.3, "two sources summed: {both}");

        mixer.set_level(
            TargetKey::Conference(1),
            AudioLevel {
                volume: 1.0,
                muted: true,
            },
        );
        mixer.render(&mut out);
        let feed_only = rms(&out);
        assert!((feed_only - 0.35).abs() < 0.1, "feed alone: {feed_only}");

        mixer.set_dim_state(true, false);
        mixer.render(&mut out);
        let dimmed = rms(&out);
        assert!(dimmed < feed_only * 0.2, "dimmed {dimmed} vs {feed_only}");

        assert_eq!(
            mixer.receiving_keys(),
            vec![TargetKey::Conference(1), TargetKey::Feed(1)]
        );
        mixer.remove_source("f1");
        assert_eq!(mixer.receiving_keys(), vec![TargetKey::Conference(1)]);
    }

    #[test]
    fn conference_member_level_scales_one_speaker() {
        let mut mixer = Mixer::new(1.0, -20.0, false, false, 20, 200);
        mixer
            .add_source_from("adi", TargetKey::Conference(1), Some(2))
            .unwrap();
        mixer
            .add_source_from("beni", TargetKey::Conference(1), Some(3))
            .unwrap();
        let packets = packets(6, 0.5);
        for (i, p) in packets.iter().enumerate() {
            mixer.push_packet("adi", i as u16, p).unwrap();
            mixer.push_packet("beni", i as u16, p).unwrap();
        }
        let mut out = vec![0f32; 960];
        mixer.render(&mut out);
        let both = rms(&out);
        mixer.set_member_level(
            1,
            3,
            AudioLevel {
                volume: 1.0,
                muted: true,
            },
        );
        mixer.render(&mut out);
        let adi_only = rms(&out);
        assert!(
            adi_only < both * 0.75 && adi_only > both * 0.3,
            "muting one conference member: both={both} adi={adi_only}"
        );
        assert_eq!(mixer.receiving_speakers(1), vec![2, 3]);
    }
}

//! Owns the cpal capture and playback streams on a dedicated thread, reopens
//! devices when they fail or disappear and reports their status.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig, SupportedStreamConfig};
use tokio::sync::{mpsc, watch};

use super::codec::SAMPLE_RATE;
use super::mixer::Mixer;
use super::resample::{FromInternal, ToInternal};
use super::{device_label, device_pcm_id, find_device};
use crate::config::AudioConfig;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudioStatus {
    pub capture_ok: bool,
    pub playback_ok: bool,
    pub capture_device: Option<String>,
    pub playback_device: Option<String>,
    pub last_error: Option<String>,
}

impl AudioStatus {
    pub fn all_ok(&self, capture_wanted: bool, playback_wanted: bool) -> bool {
        (!capture_wanted || self.capture_ok) && (!playback_wanted || self.playback_ok)
    }
}

/// Handle to the audio thread.
pub struct AudioIo {
    stop: Arc<AtomicBool>,
    pub status: watch::Receiver<AudioStatus>,
    thread: Option<thread::JoinHandle<()>>,
}

impl AudioIo {
    /// Starts the audio thread. Captured 48 kHz mono frames of
    /// `frame_samples` are sent to `frames`; playback pulls from `mixer`.
    pub fn start(
        config: AudioConfig,
        frame_samples: usize,
        mixer: Arc<Mutex<Mixer>>,
        frames: mpsc::Sender<Vec<f32>>,
    ) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let (status_tx, status_rx) = watch::channel(AudioStatus {
            capture_ok: false,
            playback_ok: false,
            capture_device: None,
            playback_device: None,
            last_error: None,
        });
        let thread_stop = stop.clone();
        let thread = thread::Builder::new()
            .name("talktome-audio".into())
            .spawn(move || {
                run_supervisor(config, frame_samples, mixer, frames, status_tx, thread_stop)
            })
            .expect("spawning audio thread");
        Self {
            stop,
            status: status_rx,
            thread: Some(thread),
        }
    }

    pub fn stop(mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn wanted(device: &Option<String>) -> bool {
    !matches!(device.as_deref().map(str::trim), Some("none") | Some("off"))
}

/// `tone` / `tone:<hz>` generates a sine as capture input (testing, installer checks).
fn tone_frequency(device: &Option<String>) -> Option<f32> {
    let name = device.as_deref()?.trim();
    if name == "tone" {
        return Some(440.0);
    }
    name.strip_prefix("tone:")
        .and_then(|hz| hz.trim().parse().ok())
}

/// `wav:<path>` writes the mixed output to a WAV file instead of a device.
fn wav_sink_path(device: &Option<String>) -> Option<std::path::PathBuf> {
    device
        .as_deref()?
        .trim()
        .strip_prefix("wav:")
        .map(|p| std::path::PathBuf::from(p.trim()))
}

fn run_tone_generator(
    frequency: f32,
    frame_samples: usize,
    gain: f32,
    frames: mpsc::Sender<Vec<f32>>,
    stop: Arc<AtomicBool>,
) {
    let mut phase = 0f32;
    let step = frequency * std::f32::consts::TAU / SAMPLE_RATE as f32;
    let frame_duration = Duration::from_secs_f64(frame_samples as f64 / SAMPLE_RATE as f64);
    let mut next = Instant::now();
    while !stop.load(Ordering::Relaxed) {
        let frame: Vec<f32> = (0..frame_samples)
            .map(|_| {
                phase += step;
                if phase > std::f32::consts::TAU {
                    phase -= std::f32::consts::TAU;
                }
                phase.sin() * 0.4 * gain
            })
            .collect();
        let _ = frames.try_send(frame);
        next += frame_duration;
        let now = Instant::now();
        if next > now {
            thread::sleep(next - now);
        } else {
            next = now;
        }
    }
}

fn run_wav_sink(path: std::path::PathBuf, mixer: Arc<Mutex<Mixer>>, stop: Arc<AtomicBool>) {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = match hound::WavWriter::create(&path, spec) {
        Ok(writer) => writer,
        Err(error) => {
            tracing::error!(event = "wav-sink-failed", path = %path.display(), error = %error);
            return;
        }
    };
    let period = Duration::from_millis(20);
    let mut buffer = vec![0f32; (SAMPLE_RATE / 50) as usize];
    let mut next = Instant::now();
    while !stop.load(Ordering::Relaxed) {
        if let Ok(mut mixer) = mixer.lock() {
            mixer.render(&mut buffer);
        }
        for sample in &buffer {
            let _ = writer.write_sample((sample.clamp(-1.0, 1.0) * 32767.0) as i16);
        }
        next += period;
        let now = Instant::now();
        if next > now {
            thread::sleep(next - now);
        } else {
            next = now;
        }
    }
    let _ = writer.finalize();
}

fn run_supervisor(
    config: AudioConfig,
    frame_samples: usize,
    mixer: Arc<Mutex<Mixer>>,
    frames: mpsc::Sender<Vec<f32>>,
    status_tx: watch::Sender<AudioStatus>,
    stop: Arc<AtomicBool>,
) {
    let mut capture_wanted = wanted(&config.input_device);
    let mut playback_wanted = wanted(&config.output_device);
    let mut capture: Option<OpenStream> = None;
    let mut playback: Option<OpenStream> = None;
    let mut next_attempt = Instant::now();
    let reopen = Duration::from_millis(config.reopen_ms.max(250));
    let gain = super::mixer::db_to_gain(config.input_gain_db);
    let mut virtual_threads = Vec::new();

    if let Some(frequency) = tone_frequency(&config.input_device) {
        tracing::info!(event = "audio-capture-open", device = "tone", frequency);
        let (frames, stop) = (frames.clone(), stop.clone());
        virtual_threads.push(thread::spawn(move || {
            run_tone_generator(frequency, frame_samples, gain, frames, stop)
        }));
        capture_wanted = false;
    }
    if let Some(path) = wav_sink_path(&config.output_device) {
        tracing::info!(event = "audio-playback-open", device = "wav", path = %path.display());
        let (mixer, stop) = (mixer.clone(), stop.clone());
        virtual_threads.push(thread::spawn(move || run_wav_sink(path, mixer, stop)));
        playback_wanted = false;
    }
    if !capture_wanted || !playback_wanted {
        let _ = status_tx.send(AudioStatus {
            capture_ok: !capture_wanted,
            playback_ok: !playback_wanted,
            capture_device: (!capture_wanted)
                .then(|| config.input_device.clone().unwrap_or_default()),
            playback_device: (!playback_wanted)
                .then(|| config.output_device.clone().unwrap_or_default()),
            last_error: None,
        });
    }

    while !stop.load(Ordering::Relaxed) {
        let now = Instant::now();
        let mut changed = false;

        if let Some(open) = capture.as_ref() {
            if open.failed.load(Ordering::Relaxed) {
                tracing::warn!(event = "audio-device-lost", direction = "capture", device = %open.name);
                capture = None;
                changed = true;
                next_attempt = now + reopen;
            }
        }
        if let Some(open) = playback.as_ref() {
            if open.failed.load(Ordering::Relaxed) {
                tracing::warn!(event = "audio-device-lost", direction = "playback", device = %open.name);
                playback = None;
                changed = true;
                next_attempt = now + reopen;
            }
        }

        let mut last_error = None;
        if now >= next_attempt {
            if capture_wanted && capture.is_none() {
                match open_capture(&config, frame_samples, gain, frames.clone()) {
                    Ok(open) => {
                        tracing::info!(event = "audio-device-restored", direction = "capture", device = %open.name);
                        capture = Some(open);
                        changed = true;
                    }
                    Err(error) => {
                        tracing::debug!(event = "audio-open-failed", direction = "capture", error = %error);
                        last_error = Some(format!("capture: {error:#}"));
                    }
                }
            }
            if playback_wanted && playback.is_none() {
                match open_playback(&config, mixer.clone()) {
                    Ok(open) => {
                        tracing::info!(event = "audio-device-restored", direction = "playback", device = %open.name);
                        playback = Some(open);
                        changed = true;
                    }
                    Err(error) => {
                        tracing::debug!(event = "audio-open-failed", direction = "playback", error = %error);
                        last_error = Some(match last_error {
                            Some(prev) => format!("{prev}; playback: {error:#}"),
                            None => format!("playback: {error:#}"),
                        });
                    }
                }
            }
            next_attempt = now + reopen;
            if last_error.is_some() {
                changed = true;
            }
        }

        if changed {
            let status = AudioStatus {
                capture_ok: !capture_wanted || capture.is_some(),
                playback_ok: !playback_wanted || playback.is_some(),
                capture_device: capture.as_ref().map(|c| c.name.clone()),
                playback_device: playback.as_ref().map(|p| p.name.clone()),
                last_error,
            };
            if *status_tx.borrow() != status {
                let _ = status_tx.send(status);
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
    drop(capture);
    drop(playback);
    for handle in virtual_threads {
        let _ = handle.join();
    }
}

struct OpenStream {
    name: String,
    failed: Arc<AtomicBool>,
    _stream: Stream,
}

fn pick_device(
    host: &cpal::Host,
    wanted_name: &Option<String>,
    input: bool,
) -> Result<cpal::Device> {
    match wanted_name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty() && *n != "default")
    {
        Some(name) => {
            let devices: Vec<cpal::Device> = if input {
                host.input_devices()?.collect()
            } else {
                host.output_devices()?.collect()
            };
            find_device(devices.into_iter(), name)
                .ok_or_else(|| anyhow!("audio device {name:?} not found"))
        }
        None => if input {
            host.default_input_device()
        } else {
            host.default_output_device()
        }
        .ok_or_else(|| anyhow!("no default audio device")),
    }
}

/// Prefers 48 kHz at the lowest channel count that carries our mono signal.
fn choose_config(device: &cpal::Device, input: bool) -> Result<SupportedStreamConfig> {
    let ranges: Vec<cpal::SupportedStreamConfigRange> = if input {
        device.supported_input_configs()?.collect()
    } else {
        device.supported_output_configs()?.collect()
    };
    let wanted = SAMPLE_RATE;
    let mut best: Option<cpal::SupportedStreamConfigRange> = None;
    for range in ranges.iter() {
        if !matches!(range.sample_format(), SampleFormat::F32 | SampleFormat::I16) {
            continue;
        }
        if range.min_sample_rate() <= wanted && wanted <= range.max_sample_rate() {
            let better = match &best {
                None => true,
                Some(current) => {
                    range.channels() < current.channels()
                        || (range.channels() == current.channels()
                            && range.sample_format() == SampleFormat::F32)
                }
            };
            if better {
                best = Some(*range);
            }
        }
    }
    if let Some(range) = best {
        return Ok(range.with_sample_rate(wanted));
    }
    let default = if input {
        device.default_input_config()?
    } else {
        device.default_output_config()?
    };
    Ok(default)
}

fn open_capture(
    config: &AudioConfig,
    frame_samples: usize,
    gain: f32,
    frames: mpsc::Sender<Vec<f32>>,
) -> Result<OpenStream> {
    let host = cpal::default_host();
    let device = pick_device(&host, &config.input_device, true)?;
    let name = format!("{} ({})", device_label(&device), device_pcm_id(&device));
    let supported = choose_config(&device, true).context("no usable capture configuration")?;
    let channels = supported.channels() as usize;
    let rate = supported.sample_rate();
    let format = supported.sample_format();
    let stream_config: StreamConfig = supported.into();
    let failed = Arc::new(AtomicBool::new(false));
    let error_flag = failed.clone();
    let err_fn = move |error: cpal::Error| {
        tracing::warn!(event = "audio-stream-error", direction = "capture", error = %error);
        error_flag.store(true, Ordering::Relaxed);
    };

    let mut resampler = ToInternal::new(rate, SAMPLE_RATE)?;
    let mut mono: Vec<f32> = Vec::with_capacity(4096);
    let mut converted: Vec<f32> = Vec::with_capacity(4096);
    let mut pending: Vec<f32> = Vec::with_capacity(frame_samples * 4);

    let mut handle_samples = move |samples: &[f32]| {
        mono.clear();
        for frame in samples.chunks(channels) {
            let sum: f32 = frame.iter().sum();
            mono.push(sum / channels as f32 * gain);
        }
        converted.clear();
        if resampler.process(&mono, &mut converted).is_err() {
            return;
        }
        pending.extend_from_slice(&converted);
        while pending.len() >= frame_samples {
            let frame: Vec<f32> = pending.drain(..frame_samples).collect();
            // Never block the audio thread; drop frames if the encoder lags.
            let _ = frames.try_send(frame);
        }
    };

    let stream = match format {
        SampleFormat::F32 => device.build_input_stream(
            stream_config,
            move |data: &[f32], _| handle_samples(data),
            err_fn,
            None,
        )?,
        SampleFormat::I16 => {
            let mut scratch: Vec<f32> = Vec::new();
            device.build_input_stream(
                stream_config,
                move |data: &[i16], _| {
                    scratch.clear();
                    scratch.extend(data.iter().map(|s| *s as f32 / 32768.0));
                    handle_samples(&scratch)
                },
                err_fn,
                None,
            )?
        }
        other => anyhow::bail!("unsupported capture sample format {other:?}"),
    };
    stream.play().context("starting capture stream")?;
    tracing::info!(event = "audio-capture-open", device = %name, rate, channels, format = ?format);
    Ok(OpenStream {
        name,
        failed,
        _stream: stream,
    })
}

fn open_playback(config: &AudioConfig, mixer: Arc<Mutex<Mixer>>) -> Result<OpenStream> {
    let host = cpal::default_host();
    let device = pick_device(&host, &config.output_device, false)?;
    let name = format!("{} ({})", device_label(&device), device_pcm_id(&device));
    let supported = choose_config(&device, false).context("no usable playback configuration")?;
    let channels = supported.channels() as usize;
    let rate = supported.sample_rate();
    let format = supported.sample_format();
    let stream_config: StreamConfig = supported.into();
    let failed = Arc::new(AtomicBool::new(false));
    let error_flag = failed.clone();
    let err_fn = move |error: cpal::Error| {
        tracing::warn!(event = "audio-stream-error", direction = "playback", error = %error);
        error_flag.store(true, Ordering::Relaxed);
    };

    let mut resampler = FromInternal::new(SAMPLE_RATE, rate)?;
    let mut mono: Vec<f32> = Vec::new();
    let mut render_mono = move |out: &mut [f32]| {
        let frames = out.len() / channels.max(1);
        mono.resize(frames, 0.0);
        let render_result = resampler.fill(&mut mono, |buf| {
            if let Ok(mut mixer) = mixer.lock() {
                mixer.render(buf);
            } else {
                buf.fill(0.0);
            }
        });
        if render_result.is_err() {
            mono.fill(0.0);
        }
        for (index, frame) in out.chunks_mut(channels.max(1)).enumerate() {
            let sample = mono.get(index).copied().unwrap_or(0.0);
            for slot in frame.iter_mut() {
                *slot = sample;
            }
        }
    };

    let stream = match format {
        SampleFormat::F32 => device.build_output_stream(
            stream_config,
            move |data: &mut [f32], _| render_mono(data),
            err_fn,
            None,
        )?,
        SampleFormat::I16 => {
            let mut scratch: Vec<f32> = Vec::new();
            device.build_output_stream(
                stream_config,
                move |data: &mut [i16], _| {
                    scratch.resize(data.len(), 0.0);
                    render_mono(&mut scratch);
                    for (dst, src) in data.iter_mut().zip(scratch.iter()) {
                        *dst = (src.clamp(-1.0, 1.0) * 32767.0) as i16;
                    }
                },
                err_fn,
                None,
            )?
        }
        other => anyhow::bail!("unsupported playback sample format {other:?}"),
    };
    stream.play().context("starting playback stream")?;
    tracing::info!(event = "audio-playback-open", device = %name, rate, channels, format = ?format);
    Ok(OpenStream {
        name,
        failed,
        _stream: stream,
    })
}

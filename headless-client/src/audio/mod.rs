//! Local audio: Opus codec, capture/playback, jitter buffering and mixing.

pub mod codec;

use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait};

/// The ALSA PCM identifier (`plughw:CARD=Headset,DEV=0`) of a cpal device,
/// which is what `audio.input_device` / `audio.output_device` refer to.
pub fn device_pcm_id(device: &cpal::Device) -> String {
    device
        .id()
        .map(|id| id.id().to_string())
        .unwrap_or_else(|_| "?".into())
}

pub fn device_label(device: &cpal::Device) -> String {
    device
        .description()
        .map(|d| d.name().to_string())
        .unwrap_or_else(|_| device_pcm_id(device))
}

/// Finds a device by PCM id or human-readable name.
pub fn find_device<I>(devices: I, wanted: &str) -> Option<cpal::Device>
where
    I: Iterator<Item = cpal::Device>,
{
    let wanted = wanted.trim();
    devices.into_iter().find(|device| {
        device_pcm_id(device) == wanted
            || device_label(device) == wanted
            || device
                .id()
                .map(|id| id.to_string() == wanted)
                .unwrap_or(false)
    })
}

/// Prints the audio devices cpal/ALSA exposes, for provisioning.
pub fn list_devices() -> Result<()> {
    let host = cpal::default_host();
    println!("Input devices (use the id in audio.input_device):");
    for device in host.input_devices()? {
        let configs: Vec<String> = device
            .supported_input_configs()
            .map(|c| {
                c.map(|cfg| format!("{}ch {}-{} Hz", cfg.channels(), cfg.min_sample_rate(), cfg.max_sample_rate()))
                    .collect()
            })
            .unwrap_or_default();
        println!("  {}\n      {}  [{}]", device_pcm_id(&device), device_label(&device), configs.join(", "));
    }
    println!("Output devices (use the id in audio.output_device):");
    for device in host.output_devices()? {
        let configs: Vec<String> = device
            .supported_output_configs()
            .map(|c| {
                c.map(|cfg| format!("{}ch {}-{} Hz", cfg.channels(), cfg.min_sample_rate(), cfg.max_sample_rate()))
                    .collect()
            })
            .unwrap_or_default();
        println!("  {}\n      {}  [{}]", device_pcm_id(&device), device_label(&device), configs.join(", "));
    }
    Ok(())
}

use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicI32, AtomicU64},
    mpsc::SyncSender,
    Arc, Mutex,
};
use std::time::Duration;

use crate::audio::{AudioDeviceInfo, AudioDeviceSnapshotEntry};
use crate::bridge_media::BridgeOutputMixerSource;
use crate::{ndi, omt};

#[allow(dead_code)]
pub enum NetworkAudioInputRuntime {
    Ndi(ndi::NdiInputRuntime),
    Omt(omt::OmtInputRuntime),
}

#[allow(dead_code)]
pub enum NetworkAudioOutputRuntime {
    Ndi(ndi::NdiOutputRuntime),
    Omt(omt::OmtOutputRuntime),
}

pub struct InputStartRequest {
    pub device_id: String,
    pub left_channel: u16,
    pub right_channel: u16,
    pub sender: SyncSender<Vec<u8>>,
    pub last_error: Arc<Mutex<Option<String>>>,
    pub level_milli_db: Arc<AtomicI32>,
    pub captured_frames: Arc<AtomicU64>,
    pub dropped_chunks: Arc<AtomicU64>,
    pub dropped_frames: Arc<AtomicU64>,
}

pub fn audio_devices(wait: Duration) -> Vec<AudioDeviceInfo> {
    std::thread::scope(|scope| {
        let ndi_devices = scope.spawn(|| ndi::audio_devices(wait));
        let omt_devices = scope.spawn(|| omt::audio_devices(wait));
        let mut devices = ndi_devices.join().unwrap_or_default();
        devices.extend(omt_devices.join().unwrap_or_default());
        devices
    })
}

pub fn audio_device_snapshot(wait: Duration) -> Vec<AudioDeviceSnapshotEntry> {
    audio_devices(wait)
        .into_iter()
        .map(|device| AudioDeviceSnapshotEntry {
            id: device.id,
            name: device.name,
            direction: device.direction,
            is_default: false,
        })
        .collect()
}

pub fn is_input_device(device_id: &str) -> bool {
    ndi::is_input_device(device_id) || omt::is_input_device(device_id)
}

pub fn is_output_device(device_id: &str) -> bool {
    ndi::is_output_device(device_id) || omt::is_output_device(device_id)
}

pub fn start_input(request: InputStartRequest) -> Result<NetworkAudioInputRuntime, String> {
    if ndi::is_input_device(&request.device_id) {
        return ndi::NdiInputRuntime::start(
            request.device_id,
            request.left_channel,
            request.right_channel,
            request.sender,
            request.last_error,
            request.level_milli_db,
            request.captured_frames,
            request.dropped_chunks,
            request.dropped_frames,
        )
        .map(NetworkAudioInputRuntime::Ndi);
    }
    if omt::is_input_device(&request.device_id) {
        return omt::OmtInputRuntime::start(
            request.device_id,
            request.left_channel,
            request.right_channel,
            request.sender,
            request.last_error,
            request.level_milli_db,
            request.captured_frames,
            request.dropped_chunks,
            request.dropped_frames,
        )
        .map(NetworkAudioInputRuntime::Omt);
    }
    Err(format!(
        "unknown network audio input device: {}",
        request.device_id
    ))
}

pub fn start_output(
    device_id: String,
    sources: Arc<Mutex<HashMap<String, BridgeOutputMixerSource>>>,
    last_error: Arc<Mutex<Option<String>>>,
) -> Result<NetworkAudioOutputRuntime, String> {
    if ndi::is_output_device(&device_id) {
        return ndi::NdiOutputRuntime::start(device_id, sources, last_error)
            .map(NetworkAudioOutputRuntime::Ndi);
    }
    if omt::is_output_device(&device_id) {
        return omt::OmtOutputRuntime::start(device_id, sources, last_error)
            .map(NetworkAudioOutputRuntime::Omt);
    }
    Err(format!("unknown network audio output device: {device_id}"))
}

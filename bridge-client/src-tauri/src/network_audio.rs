use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering},
    mpsc::{self, SyncSender},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};

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

pub struct NetworkAudioScan {
    pub devices: Vec<AudioDeviceInfo>,
    pub warnings: Vec<String>,
}

const BACKEND_PROBE_TIMEOUT: Duration = Duration::from_secs(4);

// See audio.rs: timed-out native calls stay detached, so never start another
// probe against that backend until the Bridge process is restarted.
static NDI_TIMED_OUT: AtomicBool = AtomicBool::new(false);
static OMT_TIMED_OUT: AtomicBool = AtomicBool::new(false);

pub fn audio_devices(wait: Duration) -> NetworkAudioScan {
    let ndi = spawn_backend_probe("NDI", &NDI_TIMED_OUT, move || ndi::audio_devices(wait));
    let omt = spawn_backend_probe("OMT", &OMT_TIMED_OUT, move || omt::audio_devices(wait));
    let mut devices = Vec::new();
    let mut warnings = Vec::new();

    collect_backend_probe(ndi, BACKEND_PROBE_TIMEOUT, &mut devices, &mut warnings);
    collect_backend_probe(omt, BACKEND_PROBE_TIMEOUT, &mut devices, &mut warnings);

    NetworkAudioScan { devices, warnings }
}

pub fn audio_device_snapshot(wait: Duration) -> Vec<AudioDeviceSnapshotEntry> {
    audio_devices(wait)
        .devices
        .into_iter()
        .map(|device| AudioDeviceSnapshotEntry {
            id: device.id,
            name: device.name,
            direction: device.direction,
            is_default: false,
        })
        .collect()
}

struct BackendProbe {
    name: &'static str,
    timed_out: &'static AtomicBool,
    started_at: Instant,
    receiver: Option<mpsc::Receiver<Vec<AudioDeviceInfo>>>,
}

fn spawn_backend_probe(
    name: &'static str,
    timed_out: &'static AtomicBool,
    probe: impl FnOnce() -> Vec<AudioDeviceInfo> + Send + 'static,
) -> BackendProbe {
    if timed_out.load(Ordering::Relaxed) {
        return BackendProbe {
            name,
            timed_out,
            started_at: Instant::now(),
            receiver: None,
        };
    }

    let (sender, receiver) = mpsc::sync_channel(1);
    let started_at = Instant::now();
    thread::spawn(move || {
        let _ = sender.send(probe());
    });
    BackendProbe {
        name,
        timed_out,
        started_at,
        receiver: Some(receiver),
    }
}

fn collect_backend_probe(
    probe: BackendProbe,
    timeout: Duration,
    devices: &mut Vec<AudioDeviceInfo>,
    warnings: &mut Vec<String>,
) {
    let Some(receiver) = probe.receiver else {
        warnings.push(format!(
            "Skipped {} audio: its backend stopped responding earlier.",
            probe.name
        ));
        return;
    };
    let remaining = timeout.saturating_sub(probe.started_at.elapsed());
    match receiver.recv_timeout(remaining) {
        Ok(mut found) => devices.append(&mut found),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            probe.timed_out.store(true, Ordering::Relaxed);
            warnings.push(format!(
                "Skipped {} audio: its backend did not respond within {} seconds.",
                probe.name,
                timeout.as_secs()
            ));
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            probe.timed_out.store(true, Ordering::Relaxed);
            warnings.push(format!(
                "Skipped {} audio: its backend probe stopped unexpectedly.",
                probe.name
            ));
        }
    }
}

pub fn ndi_status(wait: Duration) -> ndi::NdiStatus {
    if NDI_TIMED_OUT.load(Ordering::Relaxed) {
        return ndi::NdiStatus {
            available: false,
            version: None,
            runtime_path: None,
            source_count: 0,
            source_names: Vec::new(),
            error: Some("NDI backend timed out and was disabled for this Bridge session".to_string()),
        };
    }
    let (sender, receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let _ = sender.send(ndi::status(wait));
    });
    match receiver.recv_timeout(BACKEND_PROBE_TIMEOUT) {
        Ok(status) => status,
        Err(_) => {
            NDI_TIMED_OUT.store(true, Ordering::Relaxed);
            ndi::NdiStatus {
                available: false,
                version: None,
                runtime_path: None,
                source_count: 0,
                source_names: Vec::new(),
                error: Some(
                    "NDI backend timed out and was disabled for this Bridge session".to_string(),
                ),
            }
        }
    }
}

pub fn omt_status(wait: Duration) -> omt::OmtStatus {
    if OMT_TIMED_OUT.load(Ordering::Relaxed) {
        return omt::OmtStatus {
            available: false,
            version: None,
            runtime_path: None,
            source_count: 0,
            source_names: Vec::new(),
            error: Some("OMT backend timed out and was disabled for this Bridge session".to_string()),
        };
    }
    let (sender, receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let _ = sender.send(omt::status(wait));
    });
    match receiver.recv_timeout(BACKEND_PROBE_TIMEOUT) {
        Ok(status) => status,
        Err(_) => {
            OMT_TIMED_OUT.store(true, Ordering::Relaxed);
            omt::OmtStatus {
                available: false,
                version: None,
                runtime_path: None,
                source_count: 0,
                source_names: Vec::new(),
                error: Some(
                    "OMT backend timed out and was disabled for this Bridge session".to_string(),
                ),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{collect_backend_probe, spawn_backend_probe};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    static TEST_TIMED_OUT: AtomicBool = AtomicBool::new(false);

    #[test]
    fn quarantines_a_backend_that_does_not_answer_in_time() {
        TEST_TIMED_OUT.store(false, Ordering::Relaxed);
        let probe = spawn_backend_probe("test", &TEST_TIMED_OUT, || {
            std::thread::sleep(Duration::from_millis(100));
            Vec::new()
        });
        let mut devices = Vec::new();
        let mut warnings = Vec::new();

        collect_backend_probe(
            probe,
            Duration::from_millis(5),
            &mut devices,
            &mut warnings,
        );

        assert!(devices.is_empty());
        assert_eq!(warnings.len(), 1);
        assert!(TEST_TIMED_OUT.load(Ordering::Relaxed));
    }
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

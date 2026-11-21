#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
audio_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/talktome-audio-routes.XXXXXX")"
trap 'rm -rf "$audio_test_dir"' EXIT

xcrun swiftc \
  modules/audio-session/ios/TalkToMeAudioRoutePreference.swift \
  scripts/tests/audio-route-preference.swift \
  -o "$audio_test_dir/tests"
"$audio_test_dir/tests"

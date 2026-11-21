#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
watch_test_dir="$(mktemp -d "${TMPDIR:-/tmp}/talktome-watch-gestures.XXXXXX")"
trap 'rm -rf "$watch_test_dir"' EXIT
xcrun swiftc targets/TalkToMeWatch/WatchTalkGesture.swift targets/TalkToMeWatch/WatchRemoteModels.swift scripts/tests/watch-gesture.swift -o "$watch_test_dir/tests"
"$watch_test_dir/tests"

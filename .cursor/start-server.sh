#!/usr/bin/env bash
# Runs the Talktome server for Cloud Agents as a long-lived, visible process.
# Non-interactive: the setup wizard is disabled and configuration comes from env.
set -euo pipefail

cd "$(dirname "$0")/.."

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use --silent "$(tr -d '[:space:]' < .node-version)" || true

export TALKTOME_NO_WIZARD=1
export MDNS_HOST="${MDNS_HOST:-off}"
export HTTPS_PORT="${HTTPS_PORT:-8443}"
export HTTP_PORT="${HTTP_PORT:-8080}"
export TALKTOME_DATA_DIR="${TALKTOME_DATA_DIR:-$HOME/talktome-data}"

echo "[start] Talktome on HTTPS :$HTTPS_PORT (HTTP redirect :$HTTP_PORT), data dir $TALKTOME_DATA_DIR"
exec node server.js

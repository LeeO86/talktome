#!/usr/bin/env bash
# Idempotent Cloud Agent install for Talktome.
# Pins Node to the version in .node-version (via nvm) and installs dependencies.
set -euo pipefail

cd "$(dirname "$0")/.."

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "[install] Installing nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"

NODE_VERSION="$(tr -d '[:space:]' < .node-version)"
echo "[install] Using Node $NODE_VERSION"
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use "$NODE_VERSION"

node --version
npm --version

echo "[install] Installing npm dependencies..."
npm ci

echo "[install] Done."

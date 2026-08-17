#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?Release tag is required}"
ASSET_PATH="${2:?Release asset path is required}"
TITLE="${3:-${TAG} - macOS + Windows}"
MAX_ATTEMPTS=8

retry_command() {
  local attempt=1
  local delay=5

  while true; do
    if "$@"; then
      return 0
    fi

    if (( attempt >= MAX_ATTEMPTS )); then
      printf 'Command failed after %s attempts: %s\n' "$attempt" "$*" >&2
      return 1
    fi

    printf 'GitHub API request failed; retrying in %ss (%s/%s): %s\n' \
      "$delay" "$attempt" "$MAX_ATTEMPTS" "$*" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay < 30 ? delay * 2 : 30))
  done
}

ensure_draft_release() {
  local attempt=1
  local delay=5

  while true; do
    if gh release view "$TAG" >/dev/null 2>&1; then
      return 0
    fi

    if gh release create "$TAG" --draft --title "$TITLE"; then
      return 0
    fi

    if (( attempt >= MAX_ATTEMPTS )); then
      printf 'Could not find or create draft release %s after %s attempts.\n' \
        "$TAG" "$attempt" >&2
      return 1
    fi

    printf 'Draft release is not available yet; retrying in %ss (%s/%s).\n' \
      "$delay" "$attempt" "$MAX_ATTEMPTS" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay < 30 ? delay * 2 : 30))
  done
}

ensure_draft_release
retry_command gh release upload "$TAG" "$ASSET_PATH" --clobber

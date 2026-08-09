#!/usr/bin/env bash

set -euo pipefail

image="${1:-talktome:smoke-test}"
expected_version="${2:-}"
container_name="talktome-smoke-${RANDOM}-$$"

if [[ -n "$expected_version" ]]; then
  actual_version="$(docker run --rm "$image" node server.js --version)"
  if [[ "$actual_version" != "$expected_version" ]]; then
    echo "Expected Docker server version $expected_version, found $actual_version." >&2
    exit 1
  fi
fi

cleanup() {
  docker rm --force --volumes "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run \
  --detach \
  --name "$container_name" \
  --env PUBLIC_IP=127.0.0.1 \
  --env HTTP_PORT=off \
  --env TALKTOME_RTC_PORT_START=45000 \
  --env TALKTOME_RTC_PORT_COUNT=32 \
  --health-interval=1s \
  --health-timeout=5s \
  --health-start-period=1s \
  --health-retries=30 \
  "$image" >/dev/null

for _ in $(seq 1 60); do
  state="$(docker inspect --format '{{.State.Status}}' "$container_name")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_name")"

  if [[ "$state" != "running" ]]; then
    echo "Container exited before becoming healthy." >&2
    docker logs "$container_name" >&2
    exit 1
  fi

  if [[ "$health" == "healthy" ]]; then
    echo "Docker image $image started successfully and passed its healthcheck."
    exit 0
  fi

  if [[ "$health" == "unhealthy" || "$health" == "missing" ]]; then
    echo "Container healthcheck failed with status: $health" >&2
    docker inspect --format '{{json .State.Health}}' "$container_name" >&2
    docker logs "$container_name" >&2
    exit 1
  fi

  sleep 1
done

echo "Container did not become healthy within 60 seconds." >&2
docker inspect --format '{{json .State.Health}}' "$container_name" >&2
docker logs "$container_name" >&2
exit 1

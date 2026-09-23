// Ported from talktome public/connectionHealth.js @ v1.5.6 by Daniel Jocher.
// A volatile, timed `connection-health` ack. Two seconds without a fresh reply
// is a warning. Replies from an older connection, or that arrive late, do not clear it.

export const HEARTBEAT_INTERVAL_MS = 500;
export const HEARTBEAT_TIMEOUT_MS = 2000;

export type HeartbeatSocket = {
  connected: boolean;
  emitHealth: (timeoutMs: number, onReply: (error: unknown, reply: unknown) => void) => void;
};

type HeartbeatClock = {
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
};

export function createServerHeartbeat(
  socket: HeartbeatSocket,
  onChange: (interrupted: boolean) => void,
  clock: HeartbeatClock = {},
) {
  const now = clock.now ?? (() => Date.now());
  const schedule = clock.schedule ?? ((callback: () => void, delay: number) => setInterval(callback, delay));
  const cancel = clock.cancel ?? ((timer: unknown) => clearInterval(timer as ReturnType<typeof setInterval>));
  let timer: unknown = null;
  let generation = 0;
  let lastReply = 0;
  let interrupted = false;

  function update(value: boolean) {
    if (interrupted === value) {
      return;
    }
    interrupted = value;
    onChange(value);
  }

  function stop() {
    generation += 1;
    if (timer !== null) {
      cancel(timer);
    }
    timer = null;
    update(false);
  }

  function start() {
    stop();
    const currentGeneration = generation;
    lastReply = now();
    const tick = () => {
      if (!socket.connected || currentGeneration !== generation) {
        return;
      }
      update(now() - lastReply >= HEARTBEAT_TIMEOUT_MS);
      const sentAt = now();
      socket.emitHealth(HEARTBEAT_TIMEOUT_MS, (error, reply) => {
        if (
          error ||
          reply !== true ||
          !socket.connected ||
          currentGeneration !== generation ||
          now() - sentAt >= HEARTBEAT_TIMEOUT_MS
        ) {
          return;
        }
        lastReply = now();
        update(false);
      });
    };
    timer = schedule(tick, HEARTBEAT_INTERVAL_MS);
    tick();
  }

  return { start, stop };
}

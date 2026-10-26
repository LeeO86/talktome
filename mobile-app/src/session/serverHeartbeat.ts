// Ported from talktome public/connectionHealth.js @ v1.5.9 by Daniel Jocher.
// A volatile, timed `connection-health` ack. Two seconds without a fresh reply
// is a warning. Replies from an older connection, or that arrive late, do not clear it.
// A stalled timer (the app was suspended) or a backgrounded app resets the
// clock instead of reporting a server outage.

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
  /** True while the app is not foregrounded. Background ticks must not warn. */
  isPaused?: () => boolean;
};

export function createServerHeartbeat(
  socket: HeartbeatSocket,
  onChange: (interrupted: boolean) => void,
  clock: HeartbeatClock = {},
) {
  const now = clock.now ?? (() => Date.now());
  const schedule = clock.schedule ?? ((callback: () => void, delay: number) => setInterval(callback, delay));
  const cancel = clock.cancel ?? ((timer: unknown) => clearInterval(timer as ReturnType<typeof setInterval>));
  const isPaused = clock.isPaused ?? (() => false);
  let timer: unknown = null;
  let generation = 0;
  let lastReply = 0;
  let lastTick = 0;
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
    lastTick = lastReply;
    const tick = () => {
      if (!socket.connected || currentGeneration !== generation) {
        return;
      }
      const tickAt = now();
      // A suspended app may skip every timer. Resume the clock instead of
      // treating that gap as a server outage when the first tick finally runs.
      if (tickAt - lastTick > HEARTBEAT_INTERVAL_MS * 3) {
        lastReply = tickAt;
      }
      lastTick = tickAt;
      // Backgrounded apps delay timers and acknowledgements far past the
      // timeout. Socket.IO still reports a real transport drop.
      if (isPaused()) {
        lastReply = tickAt;
        return;
      }
      update(tickAt - lastReply >= HEARTBEAT_TIMEOUT_MS);
      const sentAt = tickAt;
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

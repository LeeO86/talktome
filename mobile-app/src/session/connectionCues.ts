// Disconnect / reconnect tones from talktome public/connectionSounds.js @ v1.5.9.
// Each edge plays once. Logout and pause reset the latch and play nothing.
// In the background, one disconnect and one reconnect play, then further
// cycles stay quiet until the app is foregrounded again.

export type ConnectionCue = 'disconnected' | 'reconnected';

const RECOVERY_BLOCKED = new Set(['disconnected', 'failed', 'connecting']);

export function transportsAllowRecovery(send: string, receive: string): boolean {
  return !RECOVERY_BLOCKED.has(send) && !RECOVERY_BLOCKED.has(receive);
}

export function transportReportsLoss(send: string, receive: string): boolean {
  return (
    send === 'disconnected' ||
    send === 'failed' ||
    receive === 'disconnected' ||
    receive === 'failed'
  );
}

export function canAnnounceConnectionRecovery(input: {
  ending: boolean;
  signedIn: boolean;
  socketConnected: boolean;
  heartbeatInterrupted: boolean;
  send: string;
  receive: string;
}): boolean {
  return (
    !input.ending &&
    input.signedIn &&
    input.socketConnected &&
    !input.heartbeatInterrupted &&
    transportsAllowRecovery(input.send, input.receive)
  );
}

export function createConnectionCues(play: (cue: ConnectionCue) => void) {
  let lost = false;
  let background = false;
  let backgroundCycleComplete = false;

  function shouldPlay(): boolean {
    return !background || !backgroundCycleComplete;
  }

  return {
    setBackground(value: boolean) {
      const next = Boolean(value);
      if (background === next) {
        return;
      }
      background = next;
      backgroundCycleComplete = false;
    },
    noteDisconnected() {
      if (lost) {
        return;
      }
      lost = true;
      if (shouldPlay()) {
        play('disconnected');
      }
    },
    noteReconnected() {
      if (!lost) {
        return;
      }
      lost = false;
      if (shouldPlay()) {
        play('reconnected');
      }
      if (background) {
        backgroundCycleComplete = true;
      }
    },
    reset() {
      lost = false;
    },
  };
}

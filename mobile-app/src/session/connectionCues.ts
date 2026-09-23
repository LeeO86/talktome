// Disconnect / reconnect tones from talktome public/connectionSounds.js @ v1.5.6.
// Each edge plays once. Logout and pause reset the latch and play nothing.

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
  return {
    noteDisconnected() {
      if (lost) {
        return;
      }
      lost = true;
      play('disconnected');
    },
    noteReconnected() {
      if (!lost) {
        return;
      }
      lost = false;
      play('reconnected');
    },
    reset() {
      lost = false;
    },
  };
}

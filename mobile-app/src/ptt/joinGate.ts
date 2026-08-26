export const SYSTEM_PTT_JOIN_WAIT_MS = 10_000;

export function shouldWaitForPendingSystemPttJoin(input: {
  platform: string;
  pttEnabled: boolean;
  joinInFlight: boolean;
  pttJoined?: boolean;
}): boolean {
  return input.platform === 'ios' && input.pttEnabled && input.joinInFlight && input.pttJoined !== true;
}

/**
 * Join must start on the user-tap stack (`beginPttJoin`). getUserMedia waits here
 * until `onJoined` / `onJoinFailed` (or a timeout) so we do not own AVAudioSession
 * while the system channel is still coming up.
 */
export class SystemPttJoinGate {
  private inFlight = false;
  private waiters: Array<() => void> = [];

  get pending(): boolean {
    return this.inFlight;
  }

  begin(): void {
    this.inFlight = true;
  }

  settle(): void {
    if (!this.inFlight && this.waiters.length === 0) {
      return;
    }
    this.inFlight = false;
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }

  async wait(timeoutMs = SYSTEM_PTT_JOIN_WAIT_MS): Promise<'ready' | 'timeout' | 'idle'> {
    if (!this.inFlight) {
      return 'idle';
    }
    return await new Promise((resolve) => {
      let done = false;
      const finish = (result: 'ready' | 'timeout') => {
        if (done) {
          return;
        }
        done = true;
        resolve(result);
      };
      const timer = setTimeout(() => finish('timeout'), timeoutMs);
      this.waiters.push(() => {
        clearTimeout(timer);
        finish('ready');
      });
    });
  }
}

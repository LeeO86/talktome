import { type TalkTarget } from '../protocol';
import type { WatchRemoteCommand } from './native';

export type WatchTalkAck = {
  type?: 'talk-confirmed' | 'talk-lock-confirmed';
  key: string;
  requestId?: string;
  talking: boolean;
  locked?: boolean;
  readyCueOnPhone?: boolean;
};

type Host = {
  resolve: (command: WatchRemoteCommand) => TalkTarget | null;
  allowed: (target: TalkTarget) => boolean;
  press: (input: string, target: TalkTarget) => Promise<void>;
  release: (input: string) => Promise<void>;
  lock: (target: TalkTarget) => Promise<void>;
  unlock: (target: TalkTarget) => Promise<void>;
  talking: (target: TalkTarget) => boolean;
  locked: (target: TalkTarget) => boolean;
  readyCue: () => Promise<boolean>;
  ack: (ack: WatchTalkAck) => void;
};
type Hold = { target: TalkTarget; stopped: boolean; ready: Promise<void>; locking?: Promise<void> };

/** Separate Watch holds from phone touches, and cancel a release while media warms up. */
export class WatchTalkControl {
  private holds = new Map<string, Hold>();
  private lockOwners = new Map<string, string>();
  constructor(private readonly host: Host) {}

  async handle(command: WatchRemoteCommand, action: 'start' | 'stop' | 'lock'): Promise<void> {
    const input = `watch:${command.requestId || command.key}`;
    const ack = (extra: Partial<WatchTalkAck>) => this.host.ack({
      key: command.key, requestId: command.requestId, talking: false, ...extra,
    });
    const hold = this.holds.get(input);
    if (action === 'stop') {
      if (hold) {
        hold.stopped = true;
        this.holds.delete(input);
        // Release immediately; waiting for ready would briefly transmit after lift.
        await this.host.release(input);
        await hold.locking?.catch(() => {});
        const key = `${hold.target.type}-${hold.target.id}`;
        if (this.lockOwners.get(key) === input) {
          this.lockOwners.delete(key);
          await this.host.unlock(hold.target);
        }
      } else if (!command.requestId) {
        // A restarted Watch can stop a lock visible in the phone snapshot.
        const target = this.host.resolve(command);
        if (target && this.host.allowed(target)) await this.host.unlock(target);
      }
      return;
    }
    if (action === 'lock') {
      if (!hold || hold.stopped) { ack({ type: 'talk-lock-confirmed', locked: false }); return; }
      if (hold.locking) return;
      hold.locking = (async () => {
        await hold.ready;
        if (hold.stopped || !this.host.allowed(hold.target)) return;
        await this.host.lock(hold.target);
        if (this.host.locked(hold.target)) {
          this.lockOwners.set(`${hold.target.type}-${hold.target.id}`, input);
          await this.host.release(input); // latched talk no longer needs a held input
        }
        ack({ type: 'talk-lock-confirmed', talking: this.host.talking(hold.target),
          locked: !hold.stopped && this.host.locked(hold.target) });
      })();
      try { await hold.locking; }
      catch { ack({ type: 'talk-lock-confirmed', locked: false }); }
      return;
    }
    if (hold) return; // duplicate delivery must not start or beep twice
    const target = this.host.resolve(command);
    if (!target || !this.host.allowed(target)) { ack({}); return; }
    const next: Hold = { target, stopped: false, ready: Promise.resolve() };
    this.holds.set(input, next);
    next.ready = (async () => {
      try {
        await this.host.press(input, target);
        if (next.stopped) return;
        const talking = this.host.talking(target);
        const readyCueOnPhone = talking ? await this.host.readyCue() : false;
        if (!next.stopped) ack({ talking, readyCueOnPhone });
      } catch { if (!next.stopped) ack({}); }
    })();
    await next.ready;
  }
}

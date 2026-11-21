import { describe, it, expect, vi } from 'vitest';
import { WatchTalkControl } from './talkControl';
const target = { type: 'conference' as const, id: 2, label: 'Crew', canTalk: true };
const command = { key: 'conference-2', targetType: 'conference', targetId: '2', requestId: 'press-1' };
function setup() {
  const host = { resolve: vi.fn(() => target), allowed: vi.fn(() => true), press: vi.fn(async () => {}),
    release: vi.fn(async () => {}), lock: vi.fn(async () => {}), unlock: vi.fn(async () => {}),
    talking: vi.fn(() => true), locked: vi.fn(() => true), readyCue: vi.fn(async () => true), ack: vi.fn() };
  return { host, control: new WatchTalkControl(host) };
}
describe('Watch talk commands', () => {
  it('confirms readiness through the selected phone output, once per press', async () => {
    const { host, control } = setup();
    await control.handle(command, 'start'); await control.handle(command, 'start');
    expect(host.press).toHaveBeenCalledOnce(); expect(host.readyCue).toHaveBeenCalledOnce();
    expect(host.ack).toHaveBeenCalledWith(expect.objectContaining({ talking: true, readyCueOnPhone: true, requestId: 'press-1' }));
  });
  it('falls back to the Watch cue when no external phone output is selected', async () => {
    const { host, control } = setup(); host.readyCue.mockResolvedValue(false);
    await control.handle(command, 'start');
    expect(host.ack).toHaveBeenCalledWith(expect.objectContaining({ readyCueOnPhone: false }));
  });
  it('releases an early lift immediately while microphone startup is still pending', async () => {
    const { host, control } = setup(); let ready!: () => void;
    host.press.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const start = control.handle(command, 'start');
    await control.handle(command, 'stop');
    expect(host.release).toHaveBeenCalledWith('watch:press-1');
    ready(); await start;
    expect(host.ack).not.toHaveBeenCalled(); expect(host.readyCue).not.toHaveBeenCalled();
  });
  it('latches after readiness, releases the held input, and explicitly unlocks on stop', async () => {
    const { host, control } = setup(); await control.handle(command, 'start');
    await control.handle(command, 'lock');
    expect(host.lock).toHaveBeenCalledWith(target);
    expect(host.release).toHaveBeenCalledWith('watch:press-1');
    expect(host.ack).toHaveBeenCalledWith(expect.objectContaining({ type: 'talk-lock-confirmed', locked: true }));
    await control.handle(command, 'stop'); expect(host.unlock).toHaveBeenCalledWith(target);
  });
  it('does not lock a press that was released before it became ready', async () => {
    const { host, control } = setup(); let ready!: () => void;
    host.press.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const start = control.handle(command, 'start'), lock = control.handle(command, 'lock');
    const stop = control.handle(command, 'stop'); ready(); await Promise.all([start, lock, stop]);
    expect(host.lock).not.toHaveBeenCalled(); expect(host.unlock).not.toHaveBeenCalled();
  });
  it('finishes a stop arriving during lock startup without leaving a stuck lock', async () => {
    const { host, control } = setup(); let locked!: () => void;
    host.lock.mockImplementation(() => new Promise(resolve => { locked = resolve; }));
    await control.handle(command, 'start'); const lock = control.handle(command, 'lock');
    await Promise.resolve(); const stop = control.handle(command, 'stop');
    locked(); await Promise.all([lock, stop]); expect(host.unlock).toHaveBeenCalledWith(target);
  });
  it('ignores a stale release for an older press of the same target', async () => {
    const { host, control } = setup(); await control.handle(command, 'start'); await control.handle(command, 'stop');
    await control.handle({ ...command, requestId: 'press-2' }, 'start'); host.release.mockClear();
    await control.handle(command, 'stop'); expect(host.release).not.toHaveBeenCalled();
  });
  it('rejects unselected/unavailable targets and does not confirm or beep', async () => {
    const { host, control } = setup(); host.allowed.mockReturnValue(false);
    await control.handle(command, 'start');
    expect(host.press).not.toHaveBeenCalled(); expect(host.readyCue).not.toHaveBeenCalled();
    expect(host.ack).toHaveBeenCalledWith(expect.objectContaining({ talking: false }));
  });
});

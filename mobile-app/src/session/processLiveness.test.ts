import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appLock = readFileSync(
  resolve(__dirname, '../../modules/session-presence/ios/TalkToMeProcessLiveness.swift'),
  'utf8',
);
const widgetLock = readFileSync(
  resolve(__dirname, '../../targets/TalkToMeWidget/TalkToMeProcessLiveness.swift'),
  'utf8',
);
const liveActivity = readFileSync(
  resolve(__dirname, '../../targets/TalkToMeWidget/TalkToMeLiveActivity.swift'),
  'utf8',
);
const liveActivityController = readFileSync(
  resolve(__dirname, '../../modules/session-presence/ios/TalkToMeLiveActivityController.swift'),
  'utf8',
);
const presenceModule = readFileSync(
  resolve(__dirname, '../../modules/session-presence/ios/TalkToMePresenceModule.swift'),
  'utf8',
);
const sessionShutdown = readFileSync(
  resolve(__dirname, '../../modules/session-presence/ios/TalkToMeSessionShutdown.swift'),
  'utf8',
);

describe('iOS process liveness lock', () => {
  it('uses POSIX fcntl F_SETLK with the Darwin flock struct instead of sysFlock', () => {
    for (const source of [appLock, widgetLock]) {
      expect(source).toContain('F_SETLK');
      expect(source).toContain('F_WRLCK');
      expect(source).toContain('fcntl(fd,');
      expect(source).not.toContain('sysFlock');
      expect(source).not.toContain('@_silgen_name("flock")');
      expect(source).not.toMatch(/Darwin\.flock\s*\(/);
    }
  });

  it('keeps the app exclusive and the widget non-blocking on the same lock file', () => {
    expect(appLock).toContain('setExclusiveLock(fd: fd, wait: true)');
    expect(widgetLock).toContain('setExclusiveLock(fd: fd, wait: false)');
    expect(appLock).toContain('FileProtectionType.none');
    expect(widgetLock).toContain('F_UNLCK');
  });

  it('does not treat lock-screen data-protection errors as swipe-kill', () => {
    expect(widgetLock).toContain('ENOENT');
    expect(widgetLock).toContain('EACCES');
    expect(widgetLock).toContain('EPERM');
  });
});

describe('iOS lock screen Live Activity', () => {
  it('paints ActivityKit state instead of overlaying Not connected', () => {
    expect(liveActivity).toContain('TalkToMeLockScreenView(state: context.state)');
    expect(liveActivity).not.toContain('TalkToMeResolvedPresence');
    expect(liveActivity).not.toContain('resolvedLiveActivityState');
  });

  it('waits for Activity.end so swipe-kill can dismiss the Dynamic Island', () => {
    expect(liveActivityController).toContain('endAllAndWait');
    expect(liveActivityController).toContain('dismissalPolicy: .immediate');
    expect(sessionShutdown).toContain('endAllAndWait');
  });

  it('claims the process lock before clearing leftover lock-screen surfaces', () => {
    const claimAt = presenceModule.indexOf('TalkToMeProcessLiveness.claimForProcessLifetime()');
    const clearAt = presenceModule.indexOf('TalkToMeSessionShutdown.clearLockScreenSurfaces()');
    expect(claimAt).toBeGreaterThan(0);
    expect(clearAt).toBeGreaterThan(claimAt);
  });
});

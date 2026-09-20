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

describe('iOS process liveness lock', () => {
  it('calls C flock by silgen_name instead of Darwin.flock (the fcntl struct)', () => {
    for (const source of [appLock, widgetLock]) {
      expect(source).toContain('@_silgen_name("flock")');
      expect(source).toContain('sysFlock(');
      expect(source).not.toMatch(/Darwin\.flock\s*\(/);
    }
  });

  it('keeps the app exclusive and widget non-blocking probe on the same C flock', () => {
    expect(appLock).toContain('sysFlock(fd, LOCK_EX)');
    expect(widgetLock).toContain('sysFlock(fd, LOCK_EX | LOCK_NB)');
    expect(widgetLock).toContain('sysFlock(fd, LOCK_UN)');
  });
});

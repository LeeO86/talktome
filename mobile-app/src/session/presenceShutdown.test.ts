import { describe, expect, it } from 'vitest';

import {
  shouldClearOrphanedPresence,
  shouldDisconnectForAppStateChange,
  shouldDisconnectSession,
} from './presenceShutdown';

describe('presence shutdown', () => {
  it('keeps the lock-screen session when the app is only backgrounded', () => {
    expect(shouldDisconnectSession('app-state-background')).toBe(false);
    expect(shouldDisconnectSession('app-state-inactive')).toBe(false);
    expect(shouldDisconnectForAppStateChange('background')).toBe(false);
    expect(shouldDisconnectForAppStateChange('inactive')).toBe(false);
    expect(shouldDisconnectForAppStateChange('active')).toBe(false);
  });

  it('disconnects when the process is actually going away', () => {
    expect(shouldDisconnectSession('native-will-terminate')).toBe(true);
    expect(shouldDisconnectSession('android-task-removed')).toBe(true);
    expect(shouldDisconnectSession('native-launch-orphan')).toBe(true);
  });

  it('clears leftover native presence after a kill that skipped JS disconnect', () => {
    expect(shouldClearOrphanedPresence(true)).toBe(true);
    expect(shouldClearOrphanedPresence(false)).toBe(false);
  });
});

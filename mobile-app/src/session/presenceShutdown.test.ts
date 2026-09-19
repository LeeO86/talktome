import { describe, expect, it } from 'vitest';

import {
  IOS_WIDGET_LIVENESS_RECHECK_SECONDS,
  shouldClearOrphanedPresence,
  shouldDisconnectForAppStateChange,
  shouldDisconnectSession,
  shouldRenderDisconnectedPresence,
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

  it('drops connected widget UI after SIGKILL without treating lock-screen suspend as death', () => {
    expect(shouldRenderDisconnectedPresence(true, true)).toBe(false);
    expect(shouldRenderDisconnectedPresence(true, false)).toBe(true);
    expect(shouldRenderDisconnectedPresence(false, true)).toBe(true);
    expect(shouldRenderDisconnectedPresence(false, false)).toBe(true);
    expect(IOS_WIDGET_LIVENESS_RECHECK_SECONDS).toBe(20);
  });
});

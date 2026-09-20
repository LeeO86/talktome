/**
 * Lock-screen / widget / FGS leftovers after the operator closes the app.
 *
 * Live Activities and Apple PTT system UI outlive the process. JS
 * `disconnect()` does not run when the user swipe-kills a suspended app, so
 * native code has to drop those surfaces. AppState `background` is a live
 * session (lock screen card is supposed to stay) and must not disconnect.
 *
 * iOS: the main process holds an App Group `fcntl` write lock. The home widget
 * rechecks it on `IOS_WIDGET_LIVENESS_RECHECK_SECONDS`. SIGKILL releases the
 * lock so the widget can drop connected leftovers without a JS disconnect.
 * Live Activity / Dynamic Island show ActivityKit state while the process
 * lives (including lock screen) and are ended with `.immediate` from native
 * `willTerminate` — they are not restyled to "Not connected" by a view tick.
 * Suspended / locked still holds the lock.
 */
export const IOS_WIDGET_LIVENESS_RECHECK_SECONDS = 20;

export function shouldRenderDisconnectedPresence(
  snapshotConnected: boolean,
  appProcessAlive: boolean,
): boolean {
  return !snapshotConnected || !appProcessAlive;
}

export type PresenceShutdownTrigger =
  | 'app-state-background'
  | 'app-state-inactive'
  | 'native-will-terminate'
  | 'android-task-removed'
  | 'native-launch-orphan';

export function shouldDisconnectSession(trigger: PresenceShutdownTrigger): boolean {
  switch (trigger) {
    case 'app-state-background':
    case 'app-state-inactive':
      return false;
    case 'native-will-terminate':
    case 'android-task-removed':
    case 'native-launch-orphan':
      return true;
  }
}

export function shouldDisconnectForAppStateChange(next: string): boolean {
  if (next === 'background') {
    return shouldDisconnectSession('app-state-background');
  }
  if (next === 'inactive') {
    return shouldDisconnectSession('app-state-inactive');
  }
  return false;
}

export function shouldClearOrphanedPresence(nativeSnapshotConnected: boolean): boolean {
  return nativeSnapshotConnected;
}

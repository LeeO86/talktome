/**
 * Lock-screen / widget / FGS leftovers after the operator closes the app.
 *
 * Live Activities and Apple PTT system UI outlive the process. JS
 * `disconnect()` does not run when the user swipe-kills a suspended app, so
 * native code has to drop those surfaces. AppState `background` is a live
 * session (lock screen card is supposed to stay) and must not disconnect.
 *
 * iOS: there is no process-liveness probe. Builds 15/16 had the app hold a
 * `flock` / `fcntl` lock on an App Group file so the widget could tell a
 * suspended app from a swipe-killed one; iOS terminates an app that holds a
 * lock on a shared-container file when it suspends it (RunningBoard
 * 0xDEAD10CC), which TestFlight reported as a crash 20–30 s after every
 * backgrounding. The home widget paints the App Group snapshot as written and
 * never calls ActivityKit lifecycle APIs (app-only). Live Activity / Dynamic
 * Island show ActivityKit state while the process lives (including lock
 * screen). Both are cleared with `.immediate` from native `willTerminate` when
 * the process is still running in the background, and on the next app launch
 * when it was swipe-killed while suspended (no `willTerminate` is delivered
 * for a suspended app).
 */

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

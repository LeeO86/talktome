import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const presenceIos = resolve(__dirname, '../../modules/session-presence/ios');
const widgetDir = resolve(__dirname, '../../targets/TalkToMeWidget');

function swiftSources(dir: string): Array<{ name: string; source: string }> {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.swift'))
    .map((name) => ({ name, source: readFileSync(resolve(dir, name), 'utf8') }));
}

const liveActivity = readFileSync(resolve(widgetDir, 'TalkToMeLiveActivity.swift'), 'utf8');
const widgetPresence = readFileSync(resolve(widgetDir, 'TalkToMeWidgetPresence.swift'), 'utf8');
const liveActivityController = readFileSync(
  resolve(presenceIos, 'TalkToMeLiveActivityController.swift'),
  'utf8',
);
const presenceModule = readFileSync(resolve(presenceIos, 'TalkToMePresenceModule.swift'), 'utf8');
const presenceStore = readFileSync(resolve(presenceIos, 'TalkToMePresenceStore.swift'), 'utf8');
const sessionShutdown = readFileSync(resolve(presenceIos, 'TalkToMeSessionShutdown.swift'), 'utf8');

describe('iOS shared-container file locks', () => {
  // TestFlight builds 15 and 16 died with EXC_CRASH / RUNNINGBOARD 0xDEAD10CC on
  // every suspension: the app held a flock (15) / fcntl (16) lock on an App Group
  // file for its whole lifetime so the widget could probe liveness. iOS kills an
  // app that holds a lock on a shared-container file while suspending it.
  it('never lock files in the App Group container from the app or the widget', () => {
    for (const { name, source } of [...swiftSources(presenceIos), ...swiftSources(widgetDir)]) {
      expect(source, name).not.toMatch(/\bfcntl\s*\(/);
      expect(source, name).not.toMatch(/\bflock\s*\(/);
      expect(source, name).not.toContain('F_SETLK');
      expect(source, name).not.toContain('O_EXLOCK');
      expect(source, name).not.toContain('O_SHLOCK');
      expect(source, name).not.toContain('sysFlock');
    }
    expect(existsSync(resolve(presenceIos, 'TalkToMeProcessLiveness.swift'))).toBe(false);
    expect(existsSync(resolve(widgetDir, 'TalkToMeProcessLiveness.swift'))).toBe(false);
  });

  it('deletes the lock file left behind by builds 15/16 at launch', () => {
    expect(presenceStore).toContain('legacyProcessAliveFileName = "talktome.process.alive"');
    expect(presenceStore).toContain('removeLegacyProcessLockFile');
    expect(sessionShutdown).toContain('TalkToMePresenceStore.removeLegacyProcessLockFile()');
    expect(presenceModule).not.toContain('claimForProcessLifetime');
  });

  it('keeps ActivityKit lifecycle calls and liveness probes out of the widget extension', () => {
    expect(widgetPresence).not.toContain('import ActivityKit');
    expect(widgetPresence).not.toContain('Activity<');
    expect(widgetPresence).not.toContain('.end(');
    expect(widgetPresence).not.toContain('RunLoop');
    expect(widgetPresence).not.toContain('appProcessIsAlive');
    expect(widgetPresence).toContain('policy: .never');
  });
});

describe('iOS lock screen Live Activity', () => {
  it('paints ActivityKit state instead of overlaying Not connected', () => {
    expect(liveActivity).toContain('TalkToMeLockScreenView(state: context.state)');
    expect(liveActivity).not.toContain('TalkToMeResolvedPresence');
    expect(liveActivity).not.toContain('resolvedLiveActivityState');
  });

  it('waits for Activity.end only in willTerminate, with a bounded semaphore', () => {
    expect(liveActivityController).toContain('endAllAndWait');
    expect(liveActivityController).toContain('DispatchSemaphore');
    expect(liveActivityController).toContain('done.wait(timeout:');
    expect(liveActivityController).toContain('dismissalPolicy: .immediate');
    expect(liveActivityController).not.toContain('RunLoop');
    expect(liveActivityController).not.toContain('Thread.sleep');
    expect(sessionShutdown).toContain('endLeftoverLiveActivities(wait: true)');
    expect(sessionShutdown).toContain('endLeftoverLiveActivities(wait: false)');
    const launchPath = sessionShutdown.slice(
      sessionShutdown.indexOf('static func clearLockScreenSurfaces()'),
      sessionShutdown.indexOf('static func runForImminentTermination'),
    );
    expect(launchPath).toContain('wait: false');
    expect(launchPath).not.toContain('wait: true');
  });

  it('ends with a final disconnected content state', () => {
    expect(liveActivityController).toContain('staleDate: Date()');
    expect(liveActivityController).toContain('disconnectedContent()');
  });

  it('serializes orphan end before the restored session requests a new activity', () => {
    expect(liveActivityController).toContain('TalkToMeLiveActivityQueue.enqueue');
    expect(liveActivityController).toContain('await previous.value');
  });

  it('posts the JS disconnect before waiting on ActivityKit', () => {
    const terminate = sessionShutdown.slice(sessionShutdown.indexOf('static func runForImminentTermination'));
    const jsAt = terminate.indexOf('beforeWait()');
    const waitAt = terminate.indexOf('endLeftoverLiveActivities(wait: true)');
    expect(jsAt).toBeGreaterThan(0);
    expect(waitAt).toBeGreaterThan(jsAt);
    expect(presenceModule).toContain('runForImminentTermination(beforeWait:');
  });
});

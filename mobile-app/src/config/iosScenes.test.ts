import { describe, expect, it } from 'vitest';
import config from '../../app.config';

const { migrateAppDelegate, sceneManifest } = require('../../plugins/withTalkToMeScenes');

const startup = `class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  func launch() {
    window = UIWindow(frame: UIScreen.main.bounds)
    configureAnotherPlugin()
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
  }
}
`;

describe('iOS scene startup', () => {
  it('enables scene startup for standard production configuration', () => {
    expect(config.plugins).toContain('./plugins/withTalkToMeScenes');
  });

  it('moves React startup into a scene window while preserving other plugin initialization', () => {
    const next = migrateAppDelegate(startup);
    expect(next).not.toContain('UIWindow(frame: UIScreen.main.bounds)');
    expect(next).toContain('configureAnotherPlugin()');
    expect(next).toContain('UIWindow(windowScene: windowScene)');
    expect(next.match(/factory\.startReactNative\(/g)).toHaveLength(1);
    expect(migrateAppDelegate(next)).toBe(next);
  });

  it('preserves cold-start links and forwards links through the Expo app delegate', () => {
    const next = migrateAppDelegate(startup);
    expect(next).toContain('launchOptions[.url] = context.url');
    expect(next).toContain('launchOptions[.userActivityDictionary]');
    expect(next).toContain('appDelegate?.application(UIApplication.shared, open: context.url');
    expect(next).not.toContain('RCTLinkingManager.application');
  });

  it('registers the actual scene delegate and rejects changed templates instead of producing a blank app', () => {
    expect(sceneManifest().UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName)
      .toBe('$(PRODUCT_MODULE_NAME).TalkToMeSceneDelegate');
    expect(() => migrateAppDelegate('class AppDelegate {}')).toThrow('unexpected startup layout');
  });
});

const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARKER = '// talktome-scene-lifecycle';
const SCENE_CLASS = '$(PRODUCT_MODULE_NAME).TalkToMeSceneDelegate';
const SCENE_DELEGATE = `
${MARKER}
class TalkToMeSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let owner = appDelegate,
          let factory = owner.reactNativeFactory else { return }

    var launchOptions = owner.sceneLaunchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      if let source = context.options.sourceApplication {
        launchOptions[.sourceApplication] = source
      }
      if let annotation = context.options.annotation {
        launchOptions[.annotation] = annotation
      }
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity
      ]
    }

    let sceneWindow = UIWindow(windowScene: windowScene)
    window = sceneWindow
    owner.window = sceneWindow
    factory.startReactNative(withModuleName: "main", in: sceneWindow, launchOptions: launchOptions)
    sceneWindow.makeKeyAndVisible()

    // Preserve Expo's subscribers as well as React Native's URL handling.
    self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    for activity in connectionOptions.userActivities {
      self.scene(scene, continue: activity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }
}
`;

function migrateAppDelegate(contents) {
  if (contents.includes(MARKER)) return contents;
  const property = '  var window: UIWindow?';
  const windowCreation = /^[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\r?\n/m;
  const startReactNative = /^[ \t]*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)\r?\n/m;
  if (!contents.includes(property) || !windowCreation.test(contents) || !startReactNative.test(contents)) {
    throw new Error('AppDelegate.swift has an unexpected startup layout; update withTalkToMeScenes.js before building.');
  }
  return contents
    .replace(property, `${property}\n  var sceneLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?`)
    .replace(windowCreation, '    sceneLaunchOptions = launchOptions\n')
    .replace(startReactNative, '') + SCENE_DELEGATE;
}

function sceneManifest() {
  return {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [{
        UISceneConfigurationName: 'TalkToMe',
        UISceneDelegateClassName: SCENE_CLASS,
      }],
    },
  };
}

function withTalkToMeScenes(config) {
  config = withInfoPlist(config, mod => {
    mod.modResults.UIApplicationSceneManifest = sceneManifest();
    return mod;
  });
  return withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('TalkToMe scenes require a Swift AppDelegate.');
    mod.modResults.contents = migrateAppDelegate(mod.modResults.contents);
    return mod;
  });
}

module.exports = withTalkToMeScenes;
module.exports.migrateAppDelegate = migrateAppDelegate;
module.exports.sceneManifest = sceneManifest;

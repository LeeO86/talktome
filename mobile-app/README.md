# Talktome Mobile App

Native iOS and Android intercom client for Talktome, built with Expo,
React Native and TypeScript. The server is selected at runtime.

The app includes:

- Server/account profiles, guest login, production selection and QR login links.
- WebRTC talk/listen, per-target volume and mute, Reply and locked talk buttons.
- Server remote-panel control and synchronized operator preferences.
- Live speaker names on conference cards, including listen-only conferences.
- Automatic reconnect with cancellation of superseded connection attempts.
- Background audio, native route selection and Android foreground service.
- BLE push-to-talk accessories, including PTT-Z01 and Herda HB980-Plus profiles.
- iOS Live Activities, widgets and shortcuts; Android session widget.
- Apple Watch talk remote; audio stays on the iPhone.
- Per-host certificate pinning for self-hosted servers with self-signed TLS.

## Development

Use Node.js 22, an Android SDK/JDK 17 for Android, and macOS/Xcode for iOS.
This app requires native modules and a development build; Expo Go is insufficient.
Install dependencies independently of the server at the repository root:

```bash
cd mobile-app
npm ci
npm test
npm run typecheck
npx expo run:android
# On macOS:
npx expo run:ios
```

Start Metro for an installed development build with `npm start`.
Rebuild the native binary after changing native modules or config plugins.
The generated `android/` and `ios/` folders are ignored; local Expo modules in
`modules/` and Apple extension sources in `targets/` are committed.

For local iPhone builds with a separate signing identity:

```bash
cp ios.local.example.json ios.local.json
# Enter your unique bundleIdentifier and Apple team ID, then quit Xcode.
npm run ios:local:prepare
open ios/TalkToMe.xcworkspace
```

The helper backs up the existing native project under `.expo/ios-backups/`,
generates a fresh project and configures Release execution without Metro.
`ios.local.json` is ignored and used only with `TALKTOME_IOS_LOCAL=1`.
Local mode also enables scene-based startup; other builds can opt in using
`TALKTOME_IOS_SCENES=1`. Run `pod install` in `ios/` after native dependency
changes, or regenerate after config-plugin changes.

## CI and releases

The root **Pull Request Checks** workflow runs mobile tests, TypeScript and Expo
configuration checks alongside the existing server and desktop checks.

**Mobile Android Builds** follows the desktop release convention: builds on
`main` changes and `v*` tags, plus manual dispatch with an optional
`release_version`. It uses the root `scripts/resolve-build-version.js` and
`scripts/upload-release-asset.sh`. Builds always upload an Actions artifact;
tag/manual-version builds also upload the APK to the shared GitHub release
draft. This APK uses debug signing for sideload testing. It is not a Play Store
upload artifact. Set repository variable `TALKTOME_ANDROID_PACKAGE` to the
publisher's final Play package name before distributing it. The APK appends
`.sideload` to that base (development fallback: `com.example.talktome.sideload`)
so it can coexist with the differently signed Play app. Profiles are separate;
the two installations do not update each other.

**Mobile iOS EAS Release** starts when a GitHub release is published. It checks
out that release's tag, builds in EAS Cloud and submits to App Store Connect /
TestFlight. Manual dispatch accepts an existing tag in `release_version`; leave
`submit` unchecked for a build without submission. App Store public release
still requires the publisher's review/release process in App Store Connect.

**Mobile Google Play EAS Release** runs on the same published-release event,
with a separate manual build/submit option. It builds a production Android App
Bundle (`.aab`) in EAS and uploads to an **internal-track draft** in Play Console.
The publisher completes store setup and promotes the draft there. Enable it
with repository variable `MOBILE_PLAY_RELEASE_ENABLED=true` after provisioning
Android credentials and assigning a Google service account key in EAS.

Each EAS workflow run starts a cloud build and consumes the publisher's EAS
build quota. Each store workflow serializes its own builds and does not cancel
an active build when a newer workflow run arrives.

All mobile workflows derive the marketing version from the repository's Git
version
(the numeric `x.y.z` portion) and set the mobile build number to
`29 + GITHUB_RUN_NUMBER` (the first run is build 30). Local iOS and Android
builds default to 30. Reruns keep the same number; the iOS pre-check rejects
numbers already used or active in EAS, and also checks App Store Connect when
API credentials are configured. Start a new workflow run rather than resubmitting
a successful build. If moving to an existing app with a higher build counter,
adjust the offset in the release workflows first. The APK and Play counters are
independent because they use different package identifiers.

## Publisher setup for EAS and the stores

Create/link the publisher's Expo project and register the main iOS bundle ID,
`.widget` and `.watchkitapp` extensions and the `group.<bundle ID>` App Group
in the publisher's Apple team. Provision the app and extensions in EAS once
interactively, including App Store Connect submission credentials. Run EAS
commands from `mobile-app/`, for example `npx eas-cli credentials --platform ios`.
A non-interactive CI run cannot perform the initial account/provisioning setup.

Configure these **GitHub repository variables**:

| Variable | Value |
| --- | --- |
| `TALKTOME_EXPO_OWNER` | Publisher's Expo account or organization |
| `TALKTOME_EAS_PROJECT_ID` | Publisher's Expo project UUID |
| `TALKTOME_IOS_BUNDLE_IDENTIFIER` | Registered main iOS bundle identifier |
| `TALKTOME_APPLE_TEAM_ID` | Publisher's ten-character Apple team ID |
| `APP_STORE_CONNECT_APP_ID` | Numeric App Store Connect app ID |
| `MOBILE_IOS_RELEASE_ENABLED` | `true` once Apple setup is complete |
| `TALKTOME_ANDROID_PACKAGE` | Final Google Play package name (without `.sideload`) |
| `MOBILE_PLAY_RELEASE_ENABLED` | `true` once Play setup is complete |

Configure **GitHub repository secret** `EXPO_TOKEN` for that Expo account.
Signing and submission credentials are managed by EAS. For Google Play,
create the app in the publisher's Play Console, configure Play App Signing and
an Android upload keystore through `npx eas-cli credentials --platform android`.
Create a Google Cloud service account, enable the Android Publisher API, grant
the service account the required app/release permissions in Play Console and
assign its JSON key to the app in EAS Credentials. The key is not a GitHub
repository variable and is never committed. See
[Expo's Google Play submission setup](https://docs.expo.dev/submit/android/). Optionally configure
`APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_ID`, and
`APP_STORE_CONNECT_PRIVATE_KEY` as repository secrets for the build-number
pre-check against Apple; without them it checks EAS history only.

`scripts/prepare-eas-release.cjs` validates the required publisher settings and
writes the platform-specific public identity/version into the production profile in `eas.json`
for that run. This ensures EAS workers use the same settings as GitHub even
though runner environment variables are not automatically forwarded to cloud
builds. For iOS, the App Store Connect app ID is also written into the submission
profile. No signing key is written to the repository or the uploaded source.
The committed config has no contributor-specific Expo, Apple-team or Store ID;
local development defaults to `com.example.talktome` without a signing team.
See [Expo's build-profile environment documentation](https://docs.expo.dev/build/eas-json/).

For interactive EAS development/preview builds, export the same identity
variables locally and configure them in the corresponding EAS environment.
Keep publisher identity consistent across profiles.

## Assets and attribution

The icon source is `assets/talktome-mark.png`. To regenerate derived assets,
install `pngjs` as a local tool and make `ffmpeg` available, then run
`node scripts/sync-talktome-icons.js`. Android adaptive icons use a transparent
white glyph on black. Web-client icon assets are checked against `../public/`.

The app's filtered Git history retains its original authors. To preserve
per-commit attribution upstream, merge the PR with a merge commit rather than
squashing it. The app uses the repository's [Apache-2.0 license](../LICENSE).
See `AUTHORS` and `NOTICE` for contributor and source attribution. Research, prototype archives and standalone development-environment
scripts are not part of this folder.

Physical-device testing is still required for background audio, hardware PTT,
widgets, signing and the Watch extension. In particular, validate the signed
Watch embed in the publisher's EAS build before store distribution.

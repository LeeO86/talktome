const fs = require('fs');
const path = require('path');
const { withDangerousMod, withProjectBuildGradle } = require('expo/config-plugins');

const PINNED_JITSI_WEBRTC = 'org.jitsi:webrtc:124.0.0';
const GCS_MAVEN_CENTRAL = 'https://maven-central.storage-download.googleapis.com/maven2/';

const EXCLUSIVE_JITSI_REPO = `
        exclusiveContent {
            forRepository {
                maven {
                    url '${GCS_MAVEN_CENTRAL}'
                }
            }
            filter {
                includeGroup 'org.jitsi'
            }
        }
`;

function pinJitsiWebrtcGradle(contents) {
  const hasDynamic = /org\.jitsi:webrtc:124\.\+/.test(contents);
  if (contents.includes(PINNED_JITSI_WEBRTC) && !hasDynamic) {
    return contents;
  }
  const next = contents.replace(/org\.jitsi:webrtc:124\.\+/g, PINNED_JITSI_WEBRTC);
  if (!next.includes(PINNED_JITSI_WEBRTC)) {
    throw new Error(
      'react-native-webrtc android/build.gradle no longer declares org.jitsi:webrtc:124.+; update withTalkToMeJitsiWebrtc.js',
    );
  }
  return next;
}

function injectJitsiWebrtcRepository(contents) {
  if (contents.includes("includeGroup 'org.jitsi'") || contents.includes('includeGroup "org.jitsi"')) {
    return contents;
  }
  const marker = /allprojects\s*\{\s*repositories\s*\{/;
  if (!marker.test(contents)) {
    throw new Error('android/build.gradle is missing allprojects.repositories; update withTalkToMeJitsiWebrtc.js');
  }
  return contents.replace(marker, (match) => `${match}${EXCLUSIVE_JITSI_REPO}`);
}

function withTalkToMeJitsiWebrtc(config) {
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const gradlePath = path.join(
        mod.modRequest.projectRoot,
        'node_modules',
        'react-native-webrtc',
        'android',
        'build.gradle',
      );
      if (!fs.existsSync(gradlePath)) {
        throw new Error(`Missing ${gradlePath}`);
      }
      const original = fs.readFileSync(gradlePath, 'utf8');
      const next = pinJitsiWebrtcGradle(original);
      if (next !== original) {
        fs.writeFileSync(gradlePath, next);
      }
      return mod;
    },
  ]);
  return withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = injectJitsiWebrtcRepository(mod.modResults.contents);
    return mod;
  });
}

module.exports = withTalkToMeJitsiWebrtc;
module.exports.PINNED_JITSI_WEBRTC = PINNED_JITSI_WEBRTC;
module.exports.pinJitsiWebrtcGradle = pinJitsiWebrtcGradle;
module.exports.injectJitsiWebrtcRepository = injectJitsiWebrtcRepository;

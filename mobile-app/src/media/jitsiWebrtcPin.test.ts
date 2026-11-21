import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  PINNED_JITSI_WEBRTC,
  injectJitsiWebrtcRepository,
  pinJitsiWebrtcGradle,
} = require('../../plugins/withTalkToMeJitsiWebrtc.js') as {
  PINNED_JITSI_WEBRTC: string;
  injectJitsiWebrtcRepository: (contents: string) => string;
  pinJitsiWebrtcGradle: (contents: string) => string;
};

describe('jitsi webrtc Android pin', () => {
  it('replaces the react-native-webrtc dynamic 124.+ coordinate', () => {
    const source = `
dependencies {
    implementation "com.facebook.react:react-android:+"
    api 'org.jitsi:webrtc:124.+'
    implementation "androidx.core:core:1.7.0"
}
`;
    expect(pinJitsiWebrtcGradle(source)).toContain(`api '${PINNED_JITSI_WEBRTC}'`);
    expect(pinJitsiWebrtcGradle(source)).not.toContain('124.+');
    expect(pinJitsiWebrtcGradle(pinJitsiWebrtcGradle(source))).toContain(PINNED_JITSI_WEBRTC);
  });

  it('routes org.jitsi through the Google Maven Central mirror', () => {
    const source = `
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url 'https://www.jitpack.io' }
    }
}
`;
    const next = injectJitsiWebrtcRepository(source);
    expect(next).toContain("includeGroup 'org.jitsi'");
    expect(next).toContain('maven-central.storage-download.googleapis.com');
    expect(injectJitsiWebrtcRepository(next)).toBe(next);
  });

  it('is wired into the Expo config plugin list', () => {
    const config = readConfigPluginList();
    expect(config).toContain('./plugins/withTalkToMeJitsiWebrtc');
  });
});

function readConfigPluginList() {
  return readFileSync(resolve(__dirname, '../../app.config.ts'), 'utf8');
}

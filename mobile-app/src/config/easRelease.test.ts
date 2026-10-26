import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { prepareEasRelease } = require('../../scripts/prepare-eas-release.cjs');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'talktome-eas-'));
  writeFileSync(join(root, 'eas.json'), JSON.stringify({
    build: { production: {} }, submit: { production: { ios: {} } },
  }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const publisher = {
  TALKTOME_EXPO_OWNER: 'publisher',
  TALKTOME_EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
  TALKTOME_IOS_BUNDLE_IDENTIFIER: 'org.publisher.intercom',
  TALKTOME_APPLE_TEAM_ID: 'ABCDEFGHIJ',
  TALKTOME_MOBILE_VERSION: '1.5.20',
  TALKTOME_MOBILE_BUILD_NUMBER: '50',
};
function prepare(env: Record<string, string>, platform = 'ios') {
  prepareEasRelease(root, env, platform);
}

describe('EAS release handoff', () => {
  it('forwards public identity and version to the cloud without copying credentials', () => {
    prepare({ ...publisher, EXPO_TOKEN: 'not-a-real-token', APP_STORE_CONNECT_APP_ID: '123456789', TALKTOME_IOS_SUBMIT: 'true' });
    const config = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
    expect(config.build.production.env).toEqual(publisher);
    expect(config.submit.production.ios.ascAppId).toBe('123456789');
    expect(JSON.stringify(config)).not.toContain('not-a-real-token');
  });

  it('refuses submission without a store app ID before any cloud build starts', () => {
    expect(() => prepare({ ...publisher, TALKTOME_IOS_SUBMIT: 'true' })).toThrow();
  });

  it('refuses the development identity for a release', () => {
    expect(() => prepare({ ...publisher, TALKTOME_IOS_BUNDLE_IDENTIFIER: 'com.example.talktome' })).toThrow();
  });

  it('prepares Android without requiring an Apple account or copying its identity', () => {
    const android = {
      TALKTOME_EXPO_OWNER: publisher.TALKTOME_EXPO_OWNER,
      TALKTOME_EAS_PROJECT_ID: publisher.TALKTOME_EAS_PROJECT_ID,
      TALKTOME_MOBILE_VERSION: publisher.TALKTOME_MOBILE_VERSION,
      TALKTOME_MOBILE_BUILD_NUMBER: publisher.TALKTOME_MOBILE_BUILD_NUMBER,
      TALKTOME_ANDROID_PACKAGE: 'org.publisher.intercom',
    };
    prepare(android, 'android');
    const config = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
    expect(config.build.production.env).toEqual(android);
    expect(config.build.production.env.TALKTOME_APPLE_TEAM_ID).toBeUndefined();
  });

  it.each(['com.example.talktome', 'org.publisher.intercom.sideload', 'org.publisher.bad-name'])(
    'rejects a development, sideload or invalid Play package: %s', identifier => {
      expect(() => prepare({ ...publisher, TALKTOME_ANDROID_PACKAGE: identifier }, 'android')).toThrow();
    },
  );
});

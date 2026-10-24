import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { resolveIosSigning } = require('../../scripts/ios-signing');
const widgetConfig = require('../../targets/TalkToMeWidget/expo-target.config');

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'talktome-ios-signing-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function writeLocal(config: unknown) {
  writeFileSync(join(root, 'ios.local.json'), JSON.stringify(config));
}

describe('local iOS signing', () => {
  it('keeps upstream signing even when this machine has personal overrides', () => {
    writeLocal({ bundleIdentifier: 'com.example.private', appleTeamId: 'ABCDEFGHIJ' });
    expect(resolveIosSigning(root, {})).toEqual({
      local: false,
      bundleIdentifier: 'io.github.leeo86.talktome-mobile',
      appleTeamId: '4876GGFAH9',
      appGroup: 'group.io.github.leeo86.talktome-mobile',
    });
  });

  it('derives the app and widget group from the explicitly selected local identity', () => {
    writeLocal({ bundleIdentifier: 'com.example.private', appleTeamId: 'ABCDEFGHIJ' });
    const signing = resolveIosSigning(root, { TALKTOME_IOS_LOCAL: '1' });
    expect(signing).toEqual({
      local: true,
      bundleIdentifier: 'com.example.private',
      appleTeamId: 'ABCDEFGHIJ',
      appGroup: 'group.com.example.private',
    });
    expect(widgetConfig({ ios: signing }).entitlements).toEqual({
      'com.apple.security.application-groups': [signing.appGroup],
    });
  });

  it('fails with setup instructions instead of silently using upstream signing', () => {
    expect(() => resolveIosSigning(root, { TALKTOME_IOS_LOCAL: '1' })).toThrow('Copy ios.local.example.json');
  });

  it.each([
    { bundleIdentifier: 'io.github.leeo86.talktome-mobile', appleTeamId: 'ABCDEFGHIJ' },
    { bundleIdentifier: 'not a bundle id', appleTeamId: 'ABCDEFGHIJ' },
    { bundleIdentifier: 'com.example.private', appleTeamId: '' },
  ])('rejects an incomplete or non-personal local signing config: %j', config => {
    writeLocal(config);
    expect(() => resolveIosSigning(root, { TALKTOME_IOS_LOCAL: '1' })).toThrow('your own bundleIdentifier');
  });
});

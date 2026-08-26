import { describe, expect, it } from 'vitest';

import { androidSessionPermissionKeys, isAndroidPermissionGranted } from './permissionsPolicy';

describe('android session permissions', () => {
  it('asks for notifications only on Android 13+', () => {
    expect(androidSessionPermissionKeys(32)).toEqual(['RECORD_AUDIO']);
    expect(androidSessionPermissionKeys(33)).toEqual(['RECORD_AUDIO', 'POST_NOTIFICATIONS']);
    expect(androidSessionPermissionKeys(35)).toEqual(['RECORD_AUDIO', 'POST_NOTIFICATIONS']);
  });

  it('treats a missing permission name as granted', () => {
    expect(isAndroidPermissionGranted({}, null)).toBe(true);
  });

  it('requires an explicit grant in the native result map', () => {
    expect(
      isAndroidPermissionGranted({ 'android.permission.RECORD_AUDIO': 'granted' }, 'android.permission.RECORD_AUDIO'),
    ).toBe(true);
    expect(
      isAndroidPermissionGranted({ 'android.permission.RECORD_AUDIO': 'denied' }, 'android.permission.RECORD_AUDIO'),
    ).toBe(false);
    expect(isAndroidPermissionGranted({}, 'android.permission.RECORD_AUDIO')).toBe(false);
  });
});

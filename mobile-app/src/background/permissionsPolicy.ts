export function androidSessionPermissionKeys(sdk: number): Array<'RECORD_AUDIO' | 'POST_NOTIFICATIONS'> {
  return sdk >= 33 ? ['RECORD_AUDIO', 'POST_NOTIFICATIONS'] : ['RECORD_AUDIO'];
}

export function isAndroidPermissionGranted(
  results: Record<string, string>,
  name: string | null,
  grantedValue = 'granted',
): boolean {
  if (!name) {
    return true;
  }
  return results[name] === grantedValue;
}

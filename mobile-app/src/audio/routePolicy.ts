/** Keep in sync with TalkToMeAudioSessionController.handle(_:) route-change cases. */

export type AudioRouteChangeReason =
  | 'override'
  | 'newDeviceAvailable'
  | 'oldDeviceUnavailable'
  | 'routeConfigurationChange'
  | 'other';

/**
 * Plug-in should follow EarPods. Unplug falls back to speaker if that port is gone.
 * Control Center / route-picker `.override` is a user choice.
 * Later `.routeConfigurationChange` must not rewrite that choice back to headphones.
 */
export function preferredRouteAfterChange(input: {
  reason: AudioRouteChangeReason;
  resolvedId: string;
  preferredStillAvailable: boolean;
}): 'resolved' | 'speaker' | 'keep' {
  if (input.reason === 'newDeviceAvailable') {
    return 'resolved';
  }
  if (input.reason === 'oldDeviceUnavailable') {
    return input.preferredStillAvailable ? 'keep' : 'speaker';
  }
  if (input.reason === 'override') {
    return 'resolved';
  }
  return 'keep';
}

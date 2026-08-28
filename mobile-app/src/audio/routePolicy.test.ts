import { describe, expect, it } from 'vitest';

import { preferredRouteAfterChange } from './routePolicy';

describe('preferredRouteAfterChange', () => {
  it('follows newly connected EarPods', () => {
    expect(
      preferredRouteAfterChange({
        reason: 'newDeviceAvailable',
        resolvedId: 'port:headphones',
        preferredStillAvailable: true,
      }),
    ).toBe('resolved');
  });

  it('returns to speaker after headphones unplug', () => {
    expect(
      preferredRouteAfterChange({
        reason: 'oldDeviceUnavailable',
        resolvedId: 'speaker',
        preferredStillAvailable: false,
      }),
    ).toBe('speaker');
  });

  it('keeps an explicit loudspeaker choice instead of snapping back to EarPods', () => {
    expect(
      preferredRouteAfterChange({
        reason: 'override',
        resolvedId: 'speaker',
        preferredStillAvailable: true,
      }),
    ).toBe('resolved');
    expect(
      preferredRouteAfterChange({
        reason: 'routeConfigurationChange',
        resolvedId: 'port:headphones',
        preferredStillAvailable: true,
      }),
    ).toBe('keep');
    expect(
      preferredRouteAfterChange({
        reason: 'other',
        resolvedId: 'port:headphones',
        preferredStillAvailable: true,
      }),
    ).toBe('keep');
  });
});

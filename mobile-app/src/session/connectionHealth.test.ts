import { describe, expect, it } from 'vitest';

import { connectionHealth, describeIceCandidateError } from './connectionHealth';

describe('connectionHealth', () => {
  it('treats a failed socket as the server being unavailable', () => {
    expect(connectionHealth({ signaling: 'failed' })).toEqual({
      kind: 'failed',
      label: 'Server unavailable',
      shortLabel: 'Unavailable',
    });
  });

  it('shows connecting until signaling is up', () => {
    expect(connectionHealth({ signaling: 'connecting' }).shortLabel).toBe('Connecting');
    expect(connectionHealth({ signaling: 'disconnected' }).label).toBe('Server connecting');
  });

  it('prefers media failure over a connected socket', () => {
    expect(
      connectionHealth({
        signaling: 'connected',
        send: 'failed',
        receive: 'connected',
      }).label,
    ).toBe('Media failed');
  });

  it('warns when the server stops answering before media drops', () => {
    expect(
      connectionHealth({
        signaling: 'connected',
        send: 'connected',
        receive: 'connected',
        heartbeatInterrupted: true,
      }),
    ).toEqual({
      kind: 'warning',
      label: 'Server not responding',
      shortLabel: 'No reply',
    });
    expect(
      connectionHealth({
        signaling: 'connected',
        send: 'failed',
        receive: 'connected',
        heartbeatInterrupted: true,
      }).label,
    ).toBe('Media failed');
  });

  it('treats a dropped or closed transport as interrupted', () => {
    expect(
      connectionHealth({
        signaling: 'connected',
        send: 'disconnected',
        receive: 'connected',
      }).shortLabel,
    ).toBe('Interrupted');
    expect(
      connectionHealth({
        signaling: 'connected',
        send: 'closed',
        receive: 'idle',
      }).kind,
    ).toBe('warning');
  });

  it('confirms a healthy session as OK', () => {
    expect(
      connectionHealth({
        signaling: 'connected',
        send: 'connected',
        receive: 'connected',
      }),
    ).toEqual({
      kind: 'connected',
      label: 'Media connected',
      shortLabel: 'OK',
    });
    expect(
      connectionHealth({
        signaling: 'connected',
        mediaReady: true,
      }).shortLabel,
    ).toBe('OK');
  });

  it('keeps ICE gathering in the connecting state', () => {
    expect(
      connectionHealth({
        signaling: 'connected',
        send: 'new',
        receive: 'new',
        sendIce: 'gathering',
      }).label,
    ).toBe('ICE gathering');
  });

  it('describes ICE candidate errors', () => {
    expect(describeIceCandidateError(null)).toBeNull();
    expect(describeIceCandidateError({ errorCode: 701, errorText: 'timeout' })).toBe(
      'ICE 701 · timeout',
    );
  });
});

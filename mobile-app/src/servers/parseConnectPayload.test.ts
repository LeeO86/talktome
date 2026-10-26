import { describe, expect, it } from 'vitest';

import { parseConnectPayload } from './parseConnectPayload';

describe('parseConnectPayload', () => {
  it('extracts the server and token from a #login= URL', () => {
    expect(
      parseConnectPayload(
        'https://talktome.restreamer.srfprod.ch/#login=kk2oTJA2LtCQQhwkvpHOgixbjtOYK4LgxrAyq05RnLY',
      ),
    ).toEqual({
      serverAddress: 'https://talktome.restreamer.srfprod.ch',
      token: 'kk2oTJA2LtCQQhwkvpHOgixbjtOYK4LgxrAyq05RnLY',
    });
  });

  it('treats the admin portal QR as a server address', () => {
    expect(parseConnectPayload('https://talktome.restreamer.srfprod.ch')).toEqual({
      serverAddress: 'https://talktome.restreamer.srfprod.ch',
    });
  });

  it('reads a token from the query string', () => {
    expect(parseConnectPayload('https://intercom.local:8443/?login=abcDEF1234567890')).toEqual({
      serverAddress: 'https://intercom.local:8443',
      token: 'abcDEF1234567890',
    });
  });

  it('reads a hash-only login fragment', () => {
    expect(parseConnectPayload('#login=abcDEF1234567890')).toEqual({
      token: 'abcDEF1234567890',
    });
  });

  it('treats a long token without a host as a login token', () => {
    expect(parseConnectPayload('kk2oTJA2LtCQQhwkvpHOgixbjtOYK4LgxrAyq05RnLY')).toEqual({
      token: 'kk2oTJA2LtCQQhwkvpHOgixbjtOYK4LgxrAyq05RnLY',
    });
  });

  it('returns empty for blank input', () => {
    expect(parseConnectPayload('   ')).toEqual({});
  });

  it('does not adopt an http URL', () => {
    expect(parseConnectPayload('http://intercom.local:8443/#login=abcDEF1234567890')).toEqual({});
  });
});

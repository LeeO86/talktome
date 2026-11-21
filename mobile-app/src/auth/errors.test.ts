import { describe, expect, it } from 'vitest';

import { operatorFacingServerMessage } from './errors';

describe('operatorFacingServerMessage', () => {
  it('maps auth failures and server faults to fixed sentences', () => {
    expect(operatorFacingServerMessage(401, 'Invalid credentials')).toBe(
      'The username or password is incorrect.',
    );
    expect(operatorFacingServerMessage(403, 'forbidden')).toBe('The username or password is incorrect.');
    expect(operatorFacingServerMessage(500, 'Exception in thread')).toBe(
      'The server could not complete the request.',
    );
  });

  it('drops stack traces, SQL, and long bodies', () => {
    expect(operatorFacingServerMessage(400, 'Error\n    at Module._compile (server.js:1:1)')).toBe(
      'The server rejected the request.',
    );
    expect(operatorFacingServerMessage(400, 'select * from users where name = ?')).toBe(
      'The server rejected the request.',
    );
    expect(operatorFacingServerMessage(400, 'x'.repeat(200))).toBe('The server rejected the request.');
    expect(operatorFacingServerMessage(400, { message: 'nope' })).toBe('The server rejected the request.');
  });

  it('returns a short human message unchanged', () => {
    expect(operatorFacingServerMessage(409, 'Name is already in use.')).toBe('Name is already in use.');
  });
});

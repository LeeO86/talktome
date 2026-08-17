export class ApiClientError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
  }
}

export class InvalidCredentialsError extends ApiClientError {
  constructor(message = 'The username or password is incorrect.') {
    super(message, 401);
    this.name = 'InvalidCredentialsError';
  }
}

export class FeedLoginNotSupportedError extends ApiClientError {
  constructor() {
    super('Feed sign-in is not possible from the mobile app.');
    this.name = 'FeedLoginNotSupportedError';
  }
}

export class SessionCookieUnavailableError extends Error {
  constructor() {
    super(
      'Signed in, but the session cookie could not be attached to signaling. Rebuild the iOS simulator app so native cookie support is included.',
    );
    this.name = 'SessionCookieUnavailableError';
  }
}

export class SessionConflictError extends Error {
  readonly existing?: { socketId?: string; name?: string };

  constructor(existing?: { socketId?: string; name?: string }) {
    const who = existing?.name ? ` (${existing.name})` : '';
    super(`This user is already signed in${who}. Take over that session?`);
    this.name = 'SessionConflictError';
    this.existing = existing;
  }
}

export class TlsUntrustedError extends Error {
  readonly hostname: string;
  readonly likelyLocal: boolean;

  constructor(hostname: string, likelyLocal: boolean) {
    super(
      likelyLocal
        ? 'Could not trust this server certificate. Turn on “Allow self-signed local TLS” to pin its fingerprint, or install a certificate the device already trusts.'
        : 'TLS handshake failed. Check the server URL and certificate.',
    );
    this.name = 'TlsUntrustedError';
    this.hostname = hostname;
    this.likelyLocal = likelyLocal;
  }
}

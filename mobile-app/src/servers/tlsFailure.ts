/** Flatten Expo fetch / native module error chains for TLS detection. */
export function collectErrorText(error: unknown, depth = 0): string {
  if (error == null || depth > 5) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'number') {
    return String(error);
  }
  if (error instanceof Error) {
    const cause = 'cause' in error ? collectErrorText(error.cause, depth + 1) : '';
    return [error.name, error.message, cause].filter(Boolean).join('\n');
  }
  if (typeof error === 'object') {
    const record = error as { message?: unknown; cause?: unknown; nativeMessage?: unknown };
    return [
      collectErrorText(record.message, depth + 1),
      collectErrorText(record.nativeMessage, depth + 1),
      collectErrorText(record.cause, depth + 1),
    ]
      .filter(Boolean)
      .join('\n');
  }
  return String(error);
}

export function looksLikeTlsFailure(error: unknown): boolean {
  const text = collectErrorText(error);
  return /ssl|tls|certif|self[-\s]?signed|handshake|untrusted|pinning|NSURLErrorSecure|errssl|pretending to be|secure connection/i.test(
    text,
  );
}

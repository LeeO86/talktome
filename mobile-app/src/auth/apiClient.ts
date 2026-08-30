// Derived from talktome-apple APIClient.swift @ 004d6e76 by Daniel Jocher.
// Adds /login/options, /login/session, /api/v1/health, logout, and an explicit cookie jar.

import {
  parseDefaultClientSettingsScript,
  type ServerClientDefaults,
} from '../protocol/clientDefaults';
import type { Production } from '../protocol/productions';
import {
  talkTargetFromResponse,
  type HealthResponse,
  type LoginOptions,
  type LoginRequest,
  type LoginTokenRequest,
  type OperatorIdentity,
  type TalkTarget,
  type TalkTargetResponse,
} from '../protocol/types';
import { ApiClientError, FeedLoginNotSupportedError, InvalidCredentialsError } from './errors';
import { readJson, TalkToMeHttp } from './http';

export class ApiClient {
  constructor(private readonly http: TalkToMeHttp) {}

  async health(): Promise<HealthResponse> {
    const response = await this.http.request('/api/v1/health');
    if (!response.ok) {
      throw await this.serverError(response);
    }
    return (await readJson<HealthResponse>(response)) ?? { ok: true };
  }

  /** Admin-configured default client settings (server 1.4.4+). Empty on old servers. */
  async defaultClientSettings(): Promise<ServerClientDefaults> {
    try {
      const response = await this.http.request('/default-client-settings.js');
      if (!response.ok) {
        return {};
      }
      return parseDefaultClientSettingsScript(await response.text());
    } catch {
      return {};
    }
  }

  async loginOptions(): Promise<LoginOptions> {
    const response = await this.http.request('/login/options');
    if (!response.ok) {
      return { guestLogin: { enabled: false, label: 'Guest' }, sso: { enabled: false } };
    }
    return (
      (await readJson<LoginOptions>(response)) ?? {
        guestLogin: { enabled: false, label: 'Guest' },
        sso: { enabled: false },
      }
    );
  }

  async login(name: string, password: string): Promise<OperatorIdentity> {
    const body: LoginRequest = { name, password };
    const response = await this.http.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      throw new InvalidCredentialsError();
    }
    if (!response.ok) {
      throw await this.serverError(response);
    }

    return decodeUserIdentity(await readJson<OperatorIdentity>(response));
  }

  async loginToken(token: string): Promise<OperatorIdentity> {
    const body: LoginTokenRequest = { token: token.trim() };
    const response = await this.http.request('/login/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      throw new InvalidCredentialsError('This login link is invalid or expired.');
    }
    if (response.status === 404) {
      throw new ApiClientError(
        'This server does not support login links. Sign in with username and password.',
        404,
      );
    }
    if (!response.ok) {
      throw await this.serverError(response);
    }

    return decodeUserIdentity(await readJson<OperatorIdentity>(response));
  }

  async loginGuest(name?: string): Promise<OperatorIdentity> {
    const response = await this.http.request('/login/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name?.trim() || undefined }),
    });
    if (response.status === 403) {
      throw new ApiClientError('Guest login is disabled on this server.', 403);
    }
    if (!response.ok) {
      throw await this.serverError(response);
    }
    const payload = await readJson<{
      kind?: string;
      guestId?: string;
      guestProfileUserId?: number;
      name?: string;
      productions?: unknown;
    }>(response);
    if (!payload || payload.kind !== 'guest' || typeof payload.guestId !== 'string') {
      throw new ApiClientError('The response could not be decoded.');
    }
    const guestProfileUserId = Number(payload.guestProfileUserId);
    if (!Number.isFinite(guestProfileUserId)) {
      throw new ApiClientError('Guest profile is missing.');
    }
    return {
      id: payload.guestId,
      name: typeof payload.name === 'string' && payload.name.trim() ? payload.name : 'Guest',
      kind: 'guest',
      guestId: payload.guestId,
      guestProfileUserId,
      productions: normalizeProductions(payload.productions),
    };
  }

  async fetchTargets(userId: number, productionId?: number | null): Promise<TalkTarget[]> {
    const query = new URLSearchParams({ includeMemberships: '1' });
    if (productionId != null) {
      query.set('productionId', String(productionId));
    }
    const response = await this.http.request(`/users/${userId}/targets?${query.toString()}`);
    if (!response.ok) {
      throw await this.serverError(response);
    }
    const payload = (await readJson<TalkTargetResponse[]>(response)) ?? [];
    if (!Array.isArray(payload)) {
      throw new ApiClientError('The response could not be decoded.');
    }
    return payload.map(talkTargetFromResponse);
  }

  async fetchGuestTargets(productionId?: number | null): Promise<TalkTarget[]> {
    const query = new URLSearchParams();
    if (productionId != null) {
      query.set('productionId', String(productionId));
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await this.http.request(`/guest/targets${suffix}`);
    if (!response.ok) {
      throw await this.serverError(response);
    }
    const payload = (await readJson<TalkTargetResponse[]>(response)) ?? [];
    if (!Array.isArray(payload)) {
      throw new ApiClientError('The response could not be decoded.');
    }
    return payload.map(talkTargetFromResponse);
  }

  async logout(userId?: number | string, socketId?: string): Promise<void> {
    await this.http.request('/api/v1/client/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, socketId }),
    });
  }

  private async serverError(response: Response): Promise<ApiClientError> {
    const payload = await readJson<{ error?: string }>(response);
    const message = payload?.error
      ? `Server error ${response.status}: ${payload.error}`
      : `Server error ${response.status}.`;
    return new ApiClientError(message, response.status);
  }
}

function decodeUserIdentity(payload: OperatorIdentity | null): OperatorIdentity {
  if (!payload || typeof payload.id !== 'number' || typeof payload.name !== 'string') {
    throw new ApiClientError('The response could not be decoded.');
  }
  if (payload.kind === 'feed') {
    throw new FeedLoginNotSupportedError();
  }
  if (payload.kind !== 'user') {
    throw new ApiClientError('Unsupported login kind.');
  }
  return {
    ...payload,
    productions: normalizeProductions(payload.productions),
  };
}

function normalizeProductions(value: unknown): Production[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const row = item as { id?: unknown; name?: unknown };
    const id = Number(row.id);
    if (!Number.isFinite(id) || typeof row.name !== 'string') {
      return [];
    }
    return [{ id, name: row.name }];
  });
}

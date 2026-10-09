import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaEngine } from '../media/engine';
import type { OperatorIdentity, Production } from '../protocol';
import { PANEL_AUDIO_DEFAULTS } from '../protocol/remotePanel';
import { SessionController } from './sessionController';
import { initialState, useSessionStore } from './state';

const mocks = vi.hoisted(() => ({ registration: {} as Record<string, unknown>, entered: vi.fn(), order: [] as string[] }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active' }, Platform: { OS: 'android' } }));
vi.mock('expo-modules-core', () => ({ requireNativeModule: () => { throw new Error('No device'); } }));
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(async () => null), setItemAsync: vi.fn(async () => {}), deleteItemAsync: vi.fn(async () => {}) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) } }));
vi.mock('../audio/session', () => ({ audioSessionAvailable: () => false, playConnectionCue: vi.fn() }));
vi.mock('../ptt/native', () => ({ pttNativeAvailable: () => false, updatePttRemoteParticipant: vi.fn() }));
vi.mock('../ble/native', () => ({ startBleNative: vi.fn() }));
vi.mock('./backgroundCoordinator', () => ({ BackgroundCoordinator: class { syncPresence() {} } }));
vi.mock('./mediaCoordinator', () => ({ MediaCoordinator: class {
  constructor(private c: SessionController) {}
  async enterOperator(production: Production | null) {
    mocks.entered(production); useSessionStore.setState({ operatorReady: true, productionId: production?.id ?? null });
    await this.c.remotePanel.operatorReady();
  }
  async rebuildMediaAfterReconnect() { mocks.order.push('rebuild'); await this.c.remotePanel.operatorReady(); }
  async applyTargetAudioStates() {}
  async applyStoppedFeedKeys() {}
  async setOperatorAudio() { mocks.order.push('restore-audio'); }
  syncFeedDucking() {}
} }));
vi.mock('../signaling/client', async importOriginal => ({ ...await importOriginal<object>(), SignalingClient: class {
  handlers = {}; socketId = 'new-socket'; connected = true;
  disconnect() {}
  async connect() { return this.socketId; }
  async register() { return mocks.registration; }
  async setActiveProduction(id: number | null) { mocks.order.push(`announce:${id}`); return id ?? 1; }
  emitPanelReport() {}
  emitTargetAudioSnapshot() {}
  async saveUserAudioSettings() { return { ok: true }; }
} }));

const controllers: SessionController[] = [];
beforeEach(() => {
  mocks.entered.mockClear(); mocks.order = [];
  useSessionStore.setState({ ...initialState, serverAddress: 'https://example.test', activeProfileId: 'profile', productionId: 7, productionName: 'Studio', productions: [{ id: 7, name: 'Studio' }, { id: 8, name: 'Field' }] });
  mocks.registration = { ok: true, productionId: 8, productions: [{ id: 7, name: 'Studio' }, { id: 8, name: 'Field' }], panelSettings: { revision: 2, storage: { 'activeProduction:1': '8' } }, userAudioSettings: PANEL_AUDIO_DEFAULTS };
});
afterEach(() => { controllers.splice(0).forEach(c => c.remotePanel.reset()); });
const identity: OperatorIdentity = { kind: 'user', id: 1, name: 'Me', productions: [{ id: 7, name: 'Studio' }, { id: 8, name: 'Field' }] };
function fixture() {
  const c = new SessionController(); controllers.push(c);
  vi.spyOn(c, 'persistCurrentProfile').mockResolvedValue();
  const internal = c as unknown as { finishIdentity(identity: OperatorIdentity, force: boolean): Promise<void>; refreshServerClientDefaults(): Promise<void>; handleReconnect(): Promise<void> };
  vi.spyOn(internal, 'refreshServerClientDefaults').mockResolvedValue();
  return { c, internal };
}

describe('panel registration in the native session', () => {
  it('honors the production selected remotely while the phone was offline', async () => {
    const { internal } = fixture(); await internal.finishIdentity(identity, false);
    expect(mocks.entered).toHaveBeenCalledWith({ id: 8, name: 'Field' });
    expect(mocks.order[0]).toBe('restore-audio');
  });

  it('keeps remembered production selection on older servers', async () => {
    mocks.registration = { ok: true }; const { c, internal } = fixture(); await internal.finishIdentity(identity, false);
    expect(mocks.entered).toHaveBeenCalledWith({ id: 7, name: 'Studio' }); expect(c.remotePanel.audioProfile).toBeUndefined();
  });

  it('uses the assigned production list from registration, including a primary Default', async () => {
    mocks.registration = { ...mocks.registration, productionId: 1, productions: [{ id: 1, name: 'Default' }], panelSettings: { revision: 3, storage: { 'activeProduction:1': '1' } } };
    const { internal } = fixture(); await internal.finishIdentity(identity, false);
    expect(mocks.entered).toHaveBeenCalledWith({ id: 1, name: 'Default' });
  });

  it('stops old media before restoring settings and re-announces the server-selected production on reconnect', async () => {
    const { c, internal } = fixture(); await internal.finishIdentity(identity, false);
    useSessionStore.setState({ productionId: 7 });
    c.media = { stop: vi.fn(async () => { mocks.order.push('stop-old-media'); }), applyTalkOpusProfile: vi.fn(async () => { throw new Error('Old producer must never be touched'); }) } as unknown as MediaEngine;
    mocks.order = []; await internal.handleReconnect();
    expect(mocks.order).toEqual(['stop-old-media', 'restore-audio', 'announce:8', 'rebuild']);
    expect(useSessionStore.getState().productionId).toBe(8); expect(c.media).toBeNull();
  });
});

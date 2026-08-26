import { requireNativeModule } from 'expo-modules-core';

export type AudioRouteKind = 'speaker' | 'receiver' | 'bluetooth' | 'wired' | 'usb' | 'other';

export type AudioRoute = {
  id: string;
  label: string;
  kind: AudioRouteKind;
  selected?: boolean;
};

export type AudioRouteSnapshot = {
  routes: AudioRoute[];
  currentId: string;
  inputLabel: string;
  outputLabel: string;
  voiceProcessing: boolean;
};

type NativeAudioSession = {
  audioRoutes?: () => AudioRoute[];
  currentAudioRoute?: () => Record<string, unknown> | null;
  selectAudioRoute?: (id: string) => Promise<Record<string, unknown> | boolean>;
  hasSystemRoutePicker?: () => boolean;
  addListener?: (
    eventName: 'onAudioRouteChange',
    listener: (event: Record<string, unknown>) => void,
  ) => { remove: () => void };
};

let cached: NativeAudioSession | null | undefined;

function loadNative(): NativeAudioSession | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    cached = requireNativeModule('TalkToMeAudioSession') as NativeAudioSession;
  } catch {
    cached = null;
  }
  return cached;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asKind(value: unknown): AudioRouteKind {
  if (
    value === 'speaker' ||
    value === 'receiver' ||
    value === 'bluetooth' ||
    value === 'wired' ||
    value === 'usb'
  ) {
    return value;
  }
  return 'other';
}

function parseRoute(value: unknown): AudioRoute | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Record<string, unknown>;
  const id = asString(item.id);
  if (!id) {
    return null;
  }
  return {
    id,
    label: asString(item.label, id),
    kind: asKind(item.kind),
    selected: item.selected === true,
  };
}

function parseSnapshot(value: unknown, fallbackId = 'speaker'): AudioRouteSnapshot {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const routes = Array.isArray(record.routes)
    ? record.routes.map(parseRoute).filter((item): item is AudioRoute => item != null)
    : [];
  const currentId = asString(record.currentId) || routes.find((item) => item.selected)?.id || fallbackId;
  return {
    routes: routes.map((item) => ({ ...item, selected: item.id === currentId })),
    currentId,
    inputLabel: asString(record.inputLabel, 'Unknown'),
    outputLabel: asString(record.outputLabel, 'Unknown'),
    voiceProcessing: record.voiceProcessing === true,
  };
}

export function emptyAudioRouteSnapshot(): AudioRouteSnapshot {
  return {
    routes: [
      { id: 'speaker', label: 'Speaker', kind: 'speaker', selected: true },
      { id: 'receiver', label: 'Phone', kind: 'receiver', selected: false },
    ],
    currentId: 'speaker',
    inputLabel: 'Unknown',
    outputLabel: 'Unknown',
    voiceProcessing: false,
  };
}

export function readAudioRouteSnapshot(): AudioRouteSnapshot {
  const native = loadNative();
  if (!native?.currentAudioRoute && !native?.audioRoutes) {
    return emptyAudioRouteSnapshot();
  }
  const current = native.currentAudioRoute?.();
  if (current && typeof current === 'object' && Array.isArray((current as { routes?: unknown }).routes)) {
    return parseSnapshot(current);
  }
  return parseSnapshot({
    routes: native.audioRoutes?.() ?? [],
    currentId: (current as { id?: string } | null)?.id,
    inputLabel: (current as { inputLabel?: string } | null)?.inputLabel,
    outputLabel: (current as { outputLabel?: string } | null)?.outputLabel,
    voiceProcessing: (current as { voiceProcessing?: boolean } | null)?.voiceProcessing,
  });
}

export async function selectAudioRoute(id: string): Promise<AudioRouteSnapshot> {
  const native = loadNative();
  if (!native?.selectAudioRoute) {
    return readAudioRouteSnapshot();
  }
  const result = await native.selectAudioRoute(id);
  if (result && typeof result === 'object') {
    return parseSnapshot(result, id);
  }
  return readAudioRouteSnapshot();
}

export function subscribeAudioRoutes(onChange: (snapshot: AudioRouteSnapshot) => void): () => void {
  const native = loadNative();
  const sub = native?.addListener?.('onAudioRouteChange', (event) => {
    onChange(parseSnapshot(event));
  });
  return () => sub?.remove();
}

export function hasSystemRoutePicker(): boolean {
  return loadNative()?.hasSystemRoutePicker?.() === true;
}

export function describeAudioRouteKind(kind: AudioRouteKind): string {
  switch (kind) {
    case 'speaker':
      return 'Speaker';
    case 'receiver':
      return 'Phone';
    case 'bluetooth':
      return 'Bluetooth';
    case 'wired':
      return 'Headphones';
    case 'usb':
      return 'USB';
    default:
      return 'Other';
  }
}

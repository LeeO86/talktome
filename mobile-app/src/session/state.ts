import { create } from 'zustand';

import type { CertificateProbe } from '../servers/tlsTrust';
import type {
  IncomingTalkState,
  LoginOptions,
  OperatorIdentity,
  PeerSession,
  Production,
  TargetAudioPreference,
  TalkTarget,
} from '../protocol';
import { EMPTY_CONFERENCE_LISTEN, type ConferenceListenState } from './conferenceListen';
import { DEFAULT_OPERATOR_AUDIO, type OperatorAudioSettings } from './operatorAudio';
import { emptyAudioRouteSnapshot, type AudioRoute } from '../audio/routes';
import type { BleConnectionKind } from '../ble/native';
import { DEFAULT_BLE_TARGET, type BleTargetSelection } from '../ble/target';
import type { SavedProfile } from './remembered';

export type SessionUiState = {
  hydrated: boolean;
  status: 'idle' | 'connecting' | 'choose-production' | 'ready' | 'paused' | 'error';
  statusMessage: string;
  serverAddress: string;
  username: string;
  rememberPassword: boolean;
  allowInsecureLocalTLS: boolean;
  leftHanded: boolean;
  talkSelectMode: boolean;
  selectedTalkTarget: TalkTarget | null;
  replyTarget: TalkTarget | null;
  loginOptions: LoginOptions | null;
  pendingCertificate: CertificateProbe | null;
  identity: OperatorIdentity | null;
  productions: Production[];
  productionId: number | null;
  productionName: string | null;
  profiles: SavedProfile[];
  activeProfileId: string | null;
  paused: boolean;
  addingProfile: boolean;
  openLoginScanner: boolean;
  operatorReady: boolean;
  targets: TalkTarget[];
  talkingTargetKey: string | null;
  talkingTargetKeys: string[];
  lockedTargetKeys: string[];
  talking: boolean;
  talkLocked: boolean;
  incoming: IncomingTalkState;
  peers: PeerSession[];
  audioPreferences: Record<string, TargetAudioPreference>;
  speakingTargetKeys: string[];
  activeFeedKeys: string[];
  stoppedFeedKeys: string[];
  conferenceListen: ConferenceListenState;
  operatorAudio: OperatorAudioSettings;
  audioRoutes: AudioRoute[];
  audioInputLabel: string;
  audioOutputLabel: string;
  audioVoiceProcessing: boolean;
  captureMicLabel: string;
  captureEchoCancellation: boolean | null;
  captureNoiseSuppression: boolean | null;
  captureAutoGainControl: boolean | null;
  conflictName?: string;
  error: string | null;
  capabilityReason: string;
  overBudget: boolean;
  activeRemoteCount: number;
  signalingLabel: string;
  fgsRunning: boolean;
  fgsAvailable: boolean;
  audioSessionAvailable: boolean;
  audioSessionActive: boolean;
  audioKeepalive: boolean;
  pttAvailable: boolean;
  pttBootstrapEnabled: boolean;
  pttJoined: boolean;
  pttVerified: boolean;
  pttChannelName: string;
  pttDiagnostic: string;
  bleKind: BleConnectionKind;
  bleName: string;
  bleMessage: string;
  bleShortPressLocks: boolean;
  bleTargetKind: 'reply' | 'target';
  bleTargetType: string;
  bleTargetId: string;
  bleTargetLabel: string;
};

export const FOREGROUND_REASON =
  'Foreground only on this build. iOS audio background mode is declared; lock-screen idle is still expected to die until Tier A.';
export const HOLD_HINT = 'Hold to talk. Slide to lock.';

export const initialState: SessionUiState = {
  hydrated: false,
  status: 'idle',
  statusMessage: '',
  serverAddress: '',
  username: '',
  rememberPassword: true,
  allowInsecureLocalTLS: false,
  leftHanded: false,
  talkSelectMode: false,
  selectedTalkTarget: null,
  replyTarget: null,
  loginOptions: null,
  pendingCertificate: null,
  identity: null,
  productions: [],
  productionId: null,
  productionName: null,
  profiles: [],
  activeProfileId: null,
  paused: false,
  addingProfile: false,
  openLoginScanner: false,
  operatorReady: false,
  targets: [],
  talkingTargetKey: null,
  talkingTargetKeys: [],
  lockedTargetKeys: [],
  talking: false,
  talkLocked: false,
  incoming: { addressedNow: [] },
  peers: [],
  audioPreferences: {},
  speakingTargetKeys: [],
  activeFeedKeys: [],
  stoppedFeedKeys: [],
  conferenceListen: EMPTY_CONFERENCE_LISTEN,
  operatorAudio: DEFAULT_OPERATOR_AUDIO,
  audioRoutes: emptyAudioRouteSnapshot().routes,
  audioInputLabel: 'Unknown',
  audioOutputLabel: 'Unknown',
  audioVoiceProcessing: false,
  captureMicLabel: 'Microphone',
  captureEchoCancellation: null,
  captureNoiseSuppression: null,
  captureAutoGainControl: null,
  error: null,
  capabilityReason: FOREGROUND_REASON,
  overBudget: false,
  activeRemoteCount: 0,
  signalingLabel: 'disconnected',
  fgsRunning: false,
  fgsAvailable: false,
  audioSessionAvailable: false,
  audioSessionActive: false,
  audioKeepalive: false,
  pttAvailable: false,
  pttBootstrapEnabled: false,
  pttJoined: false,
  pttVerified: false,
  pttChannelName: '',
  pttDiagnostic: '',
  bleKind: 'idle',
  bleName: '',
  bleMessage: '',
  bleShortPressLocks: true,
  bleTargetKind: 'reply',
  bleTargetType: '',
  bleTargetId: '',
  bleTargetLabel: '',
};

type SessionStore = SessionUiState & {
  setField: <K extends keyof SessionUiState>(key: K, value: SessionUiState[K]) => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialState,
  setField: (key, value) => set({ [key]: value } as Pick<SessionStore, typeof key>),
}));

export function bleSelectionFromState(state: SessionUiState): BleTargetSelection {
  if (state.bleTargetKind !== 'target' || !state.bleTargetType || state.bleTargetId === '') {
    return DEFAULT_BLE_TARGET;
  }
  return {
    kind: 'target',
    type: state.bleTargetType as TalkTarget['type'],
    id: state.bleTargetId,
    label: state.bleTargetLabel || state.bleTargetId,
  };
}

export function bleFieldsFromSelection(
  selection: BleTargetSelection,
  shortPressLocks: boolean,
): Pick<
  SessionUiState,
  | 'bleShortPressLocks'
  | 'bleTargetKind'
  | 'bleTargetType'
  | 'bleTargetId'
  | 'bleTargetLabel'
> {
  if (selection.kind === 'reply') {
    return {
      bleShortPressLocks: shortPressLocks,
      bleTargetKind: 'reply',
      bleTargetType: '',
      bleTargetId: '',
      bleTargetLabel: '',
    };
  }
  return {
    bleShortPressLocks: shortPressLocks,
    bleTargetKind: 'target',
    bleTargetType: selection.type,
    bleTargetId: String(selection.id),
    bleTargetLabel: selection.label,
  };
}

export function latestIncomingName(incoming: IncomingTalkState): string | null {
  const latest = incoming.addressedNow
    .slice()
    .sort((left, right) => (right.at ?? 0) - (left.at ?? 0))[0];
  const name = latest?.fromName?.trim();
  return name ? name : null;
}

export { looksLikeTlsFailure } from '../servers/tlsFailure';

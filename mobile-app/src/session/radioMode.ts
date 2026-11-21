import { bindingControlTarget } from '../ble/bindings';
import { resolveBleTalkTarget } from '../ble/target';
import { talkTargetIdentity, type TalkTarget } from '../protocol';
import type { SessionUiState } from './state';

type RadioState = Pick<SessionUiState, 'bleBindings' | 'replyTarget' | 'targets'>;

// Undefined means the normal mix. Null means radio mode is on but no channel is available.
export function radioReceiveTarget(state: RadioState): TalkTarget | null | undefined {
  const radio = state.bleBindings.find(binding => binding.radioMode);
  if (!radio) return undefined;
  return resolveBleTalkTarget({ ...state, selection: bindingControlTarget(radio) });
}

export function radioReceiveKey(state: RadioState): string | null | undefined {
  const target = radioReceiveTarget(state);
  return target ? talkTargetIdentity(target) : target;
}

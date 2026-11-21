// UI façade for the operator runtime. Screens import `session` and
// `useSessionStore` from here; the implementation lives in
// sessionController.ts and its talk/media/background coordinators.
import { SessionController } from './sessionController';
import { radioReceiveKey } from './radioMode';
import { useSessionStore } from './state';

export { useSessionStore, type SessionUiState } from './state';

export const session = new SessionController();

useSessionStore.subscribe((state, previous) => {
  if (state.bleBindings === previous.bleBindings && state.targets === previous.targets &&
      state.replyTarget === previous.replyTarget) return;
  const key = radioReceiveKey(state);
  if (key !== radioReceiveKey(previous)) session.mediaCoordinator.syncRadioReceive(key);
});

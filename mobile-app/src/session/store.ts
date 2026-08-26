// UI façade for the operator runtime. Screens import `session` and
// `useSessionStore` from here; the implementation lives in
// sessionController.ts and its talk/media/background coordinators.
import { SessionController } from './sessionController';

export { useSessionStore, type SessionUiState } from './state';

export const session = new SessionController();

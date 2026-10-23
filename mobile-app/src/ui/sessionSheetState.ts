import { create } from 'zustand';

export type SessionSheetStart = 'session' | 'accessories';

/**
 * Whether the session sheet is open. App.tsx presents it through the native screen stack (not a
 * React Native Modal: native screens inside a Modal get a second touch handler and stop taking taps).
 * `start` picks the page the sheet opens on; Session always stays underneath it.
 */
export const useSessionSheetOpen = create<{ open: boolean; start: SessionSheetStart }>(() => ({
  open: false,
  start: 'session',
}));

export function openSessionSheet(start: SessionSheetStart = 'session'): void {
  useSessionSheetOpen.setState({ open: true, start });
}

export function closeSessionSheet(): void {
  useSessionSheetOpen.setState({ open: false });
}

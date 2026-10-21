import { create } from 'zustand';

/**
 * Whether the session sheet is open. App.tsx presents it through the native screen stack (not a
 * React Native Modal: native screens inside a Modal get a second touch handler and stop taking taps).
 */
export const useSessionSheetOpen = create<{ open: boolean }>(() => ({ open: false }));

export function openSessionSheet(): void {
  useSessionSheetOpen.setState({ open: true });
}

export function closeSessionSheet(): void {
  useSessionSheetOpen.setState({ open: false });
}

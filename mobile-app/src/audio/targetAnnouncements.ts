const KNOB_SETTLE_MS = 400;

export function createTargetAnnouncements(
  speak: (label: string, volume: number) => Promise<boolean>,
  stop: () => Promise<void>,
  unavailable: () => void,
  scheduleNativeDelay?: (delayMs: number, run: () => void) => (() => void) | undefined,
) {
  let cancelDelay: (() => void) | undefined;
  let request: object | undefined;
  let stopping: Promise<void> | undefined;

  function cancel(): Promise<void> | undefined {
    cancelDelay?.();
    cancelDelay = undefined;
    if (request) {
      request = undefined;
      const current = stop();
      stopping = current;
      void current.then(() => {
        if (stopping === current) stopping = undefined;
      });
    }
    return stopping;
  }

  return {
    cancel,
    schedule(label: string, volume: number, canSpeak: () => boolean) {
      void cancel();
      if (volume <= 0) return;
      const announce = () => {
        cancelDelay = undefined;
        if (!canSpeak()) return;
        const current = {};
        request = current;
        void speak(label, volume).then(ok => {
          if (request !== current || ok) return;
          request = undefined;
          unavailable();
        });
      };
      cancelDelay = scheduleNativeDelay?.(KNOB_SETTLE_MS, announce);
      if (!cancelDelay) {
        const timer = setTimeout(announce, KNOB_SETTLE_MS);
        cancelDelay = () => clearTimeout(timer);
      }
    },
  };
}

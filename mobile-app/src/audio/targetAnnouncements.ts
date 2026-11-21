const KNOB_SETTLE_MS = 400;

export function createTargetAnnouncements(
  speak: (label: string) => Promise<boolean>,
  stop: () => Promise<void>,
  unavailable: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: object | undefined;
  let stopping: Promise<void> | undefined;

  function cancel(): Promise<void> | undefined {
    clearTimeout(timer);
    timer = undefined;
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
    schedule(label: string, canSpeak: () => boolean) {
      void cancel();
      timer = setTimeout(() => {
        timer = undefined;
        if (!canSpeak()) return;
        const current = {};
        request = current;
        void speak(label).then(ok => {
          if (request !== current || ok) return;
          request = undefined;
          unavailable();
        });
      }, KNOB_SETTLE_MS);
    },
  };
}

import type { PttButton } from './events';

export type PttIntentRule = {
  action: string;
  button: PttButton;
  /** Omit for pulse actions (channel up/down/set) and for setChannel. */
  pressed?: boolean;
  extraChannelKey?: string;
};

/** Zello partner intents plus OEM aliases we have seen or expect on rugged phones. */
export const PTT_INTENT_CATALOG: readonly PttIntentRule[] = [
  { action: 'com.zello.ptt.down', button: 'ptt', pressed: true },
  { action: 'com.zello.ptt.up', button: 'ptt', pressed: false },
  { action: 'com.zello.intent.buttonExtra1.down', button: 'ptt2', pressed: true },
  { action: 'com.zello.intent.buttonExtra1.up', button: 'ptt2', pressed: false },
  { action: 'com.zello.intent.buttonExtra2.down', button: 'ptt3', pressed: true },
  { action: 'com.zello.intent.buttonExtra2.up', button: 'ptt3', pressed: false },
  { action: 'com.zello.intent.buttonExtra3.down', button: 'ptt4', pressed: true },
  { action: 'com.zello.intent.buttonExtra3.up', button: 'ptt4', pressed: false },
  { action: 'com.zello.intent.buttonExtra4.down', button: 'ptt4', pressed: true },
  { action: 'com.zello.intent.buttonExtra4.up', button: 'ptt4', pressed: false },
  { action: 'com.zello.intent.buttonSOS.down', button: 'sos', pressed: true },
  { action: 'com.zello.intent.buttonSOS.up', button: 'sos', pressed: false },
  { action: 'com.zello.intent.channelUp', button: 'channelUp', pressed: true },
  { action: 'com.zello.intent.channelDown', button: 'channelDown', pressed: true },
  {
    action: 'com.zello.intent.setChannel',
    button: 'setChannel',
    pressed: true,
    extraChannelKey: 'com.zello.extra.channel',
  },

  { action: 'com.ruggear.ptt.down', button: 'ptt', pressed: true },
  { action: 'com.ruggear.ptt.up', button: 'ptt', pressed: false },
  { action: 'com.ruggear.intent.action.PTT_DOWN', button: 'ptt', pressed: true },
  { action: 'com.ruggear.intent.action.PTT_UP', button: 'ptt', pressed: false },
  { action: 'com.ruggear.intent.action.SOS_DOWN', button: 'sos', pressed: true },
  { action: 'com.ruggear.intent.action.SOS_UP', button: 'sos', pressed: false },

  { action: 'com.sonim.intent.action.PTT_BUTTON_DOWN', button: 'ptt', pressed: true },
  { action: 'com.sonim.intent.action.PTT_BUTTON_UP', button: 'ptt', pressed: false },
  { action: 'com.sonimtech.intent.action.PTT_BUTTON_DOWN', button: 'ptt', pressed: true },
  { action: 'com.sonimtech.intent.action.PTT_BUTTON_UP', button: 'ptt', pressed: false },

  { action: 'com.android.action.PTT.down', button: 'ptt', pressed: true },
  { action: 'com.android.action.PTT.up', button: 'ptt', pressed: false },
  { action: 'android.intent.action.PTT_BUTTON_DOWN', button: 'ptt', pressed: true },
  { action: 'android.intent.action.PTT_BUTTON_UP', button: 'ptt', pressed: false },
  { action: 'android.intent.action.PTT.down', button: 'ptt', pressed: true },
  { action: 'android.intent.action.PTT.up', button: 'ptt', pressed: false },

  { action: 'com.inrico.ptt.down', button: 'ptt', pressed: true },
  { action: 'com.inrico.ptt.up', button: 'ptt', pressed: false },
  { action: 'com.crosscall.ptt.down', button: 'ptt', pressed: true },
  { action: 'com.crosscall.ptt.up', button: 'ptt', pressed: false },
];

export function matchPttIntent(
  action: string,
  extras?: Record<string, unknown> | null,
): { button: PttButton; pressed: boolean; channel?: number } | null {
  const rule = PTT_INTENT_CATALOG.find((item) => item.action === action);
  if (!rule) {
    return null;
  }
  let channel: number | undefined;
  if (rule.button === 'setChannel') {
    const keys = [rule.extraChannelKey, 'com.zello.extra.channel', 'channel', 'extra_channel'];
    for (const key of keys) {
      if (!key || extras == null) {
        continue;
      }
      const value = extras[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        channel = Math.round(value);
        break;
      }
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        channel = Math.round(Number(value));
        break;
      }
    }
  }
  return {
    button: rule.button,
    pressed: rule.pressed ?? true,
    ...(channel != null ? { channel } : {}),
  };
}

export function pttIntentCatalogJson(): string {
  return JSON.stringify(PTT_INTENT_CATALOG);
}

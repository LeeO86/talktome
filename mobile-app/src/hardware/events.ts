export type PttTransport = 'ble' | 'spp' | 'intent' | 'usb';

export type PttButton =
  | 'ptt'
  | 'ptt2'
  | 'ptt3'
  | 'ptt4'
  | 'sos'
  | 'channelUp'
  | 'channelDown'
  | 'setChannel'
  | 'replay'
  | 'multi'
  | 'statusToggle'
  | 'selectionMode';

export type PttDeviceKind = 'ble' | 'spp' | 'onboard' | 'usb';

export type PttEvent = {
  button: PttButton;
  pressed: boolean;
  channel?: number;
  source: PttTransport;
  deviceId?: string;
  deviceName?: string;
  timestamp: number;
  raw?: string;
};

export const PTT_TALK_BUTTONS: readonly PttButton[] = ['ptt', 'ptt2', 'ptt3', 'ptt4', 'sos'];
export const PTT_CHANNEL_BUTTONS: readonly PttButton[] = ['channelUp', 'channelDown', 'setChannel'];

export const ONBOARD_DEVICE_ID = 'onboard';
export const ONBOARD_DEVICE_NAME = 'This phone';

export const PTT_EVENT_DEDUP_MS = 150;

export function isTalkButton(button: PttButton): boolean {
  return PTT_TALK_BUTTONS.includes(button);
}

export function isChannelButton(button: PttButton): boolean {
  return PTT_CHANNEL_BUTTONS.includes(button);
}

export function describePttButton(button: PttButton): string {
  switch (button) {
    case 'ptt':
      return 'PTT 1';
    case 'ptt2':
      return 'PTT 2';
    case 'ptt3':
      return 'PTT 3';
    case 'ptt4':
      return 'PTT 4';
    case 'sos':
      return 'SOS';
    case 'channelUp':
      return 'Channel up';
    case 'channelDown':
      return 'Channel down';
    case 'setChannel':
      return 'Channel knob';
    case 'replay':
      return 'Replay';
    case 'multi':
      return 'Multi';
    case 'statusToggle':
      return 'Status';
    case 'selectionMode':
      return 'Selection mode';
    default:
      return button;
  }
}

export function describePttDeviceKind(kind: PttDeviceKind | undefined): string {
  switch (kind) {
    case 'onboard':
      return 'Phone keys';
    case 'spp':
      return 'Bluetooth Classic';
    case 'usb':
      return 'USB';
    default:
      return 'Bluetooth LE';
  }
}

export function sppDeviceId(address: string): string {
  return address.startsWith('spp:') ? address : `spp:${address}`;
}

export function usbDeviceId(identity: string): string {
  return identity.startsWith('usb:') ? identity : `usb:${identity}`;
}

export function hardwareDeviceId(source: PttTransport, nativeId?: string): string {
  if (source === 'intent') {
    return ONBOARD_DEVICE_ID;
  }
  if (!nativeId) {
    return source;
  }
  if (source === 'spp') {
    return sppDeviceId(nativeId);
  }
  if (source === 'usb') {
    return usbDeviceId(nativeId);
  }
  return nativeId;
}

import { describe, expect, it } from 'vitest';

import {
  ACCESSORY_CATALOG,
  bluetoothUuidsEqual,
  catalogForNative,
  coerceNotifyBytes,
  decodeButtonByte,
  decodeZelloTwoByte,
  matchAccessoryProfile,
  matchesExpectedBleName,
  looksLikePttCommand,
  shouldSkipPairingName,
  normalizeBluetoothUuid,
} from './catalog';

describe('BLE accessory catalog', () => {
  it('ships the PTT-Z01 button and Herda HB980-Plus speaker mic', () => {
    expect(ACCESSORY_CATALOG.map((profile) => profile.id)).toEqual([
      'ptt-z01',
      'herda-hb980-plus',
      'hm10-generic',
      'zello-ble-generic',
    ]);
    expect(catalogForNative()[1]).toMatchObject({
      id: 'herda-hb980-plus',
      discovery: 'vendor-notify',
      names: expect.arrayContaining(['HB9800D', 'HB980D', 'Herda PTT', 'Herdt980D-Zello']),
    });
  });

  it('matches PTT-Z01 by name or the FFE0 service', () => {
    expect(matchAccessoryProfile({ name: 'ptt-z01' })?.id).toBe('ptt-z01');
    expect(
      matchAccessoryProfile({ advertisedServiceUuids: ['0000ffe0-0000-1000-8000-00805f9b34fb'] })
        ?.id,
    ).toBe('ptt-z01');
    expect(matchesExpectedBleName('PTT-Z01')).toBe(true);
    expect(matchesExpectedBleName('Other')).toBe(false);
  });

  it('matches HB980-Plus advertised names without guessing the GATT UUID', () => {
    expect(matchAccessoryProfile({ name: 'HB9800D' })?.id).toBe('herda-hb980-plus');
    expect(matchAccessoryProfile({ name: 'HB980D' })?.discovery).toBe('vendor-notify');
    expect(matchAccessoryProfile({ name: 'Herda HB980-Plus' })?.id).toBe('herda-hb980-plus');
    expect(matchAccessoryProfile({ name: 'Herda PTT' })?.id).toBe('herda-hb980-plus');
    expect(matchAccessoryProfile({ name: 'Herdt980D-Zello' })?.id).toBe('herda-hb980-plus');
    expect(matchAccessoryProfile({ name: 'HB980D-Zello' })?.id).toBe('herda-hb980-plus');
    expect(matchAccessoryProfile({ profileId: 'herda-hb980-plus' })?.kind).toBe('speaker-mic');
  });

  it('does not treat phones and earbuds as pairing candidates', () => {
    expect(shouldSkipPairingName('iPhone')).toBe(true);
    expect(shouldSkipPairingName('AirPods Pro')).toBe(true);
    expect(shouldSkipPairingName('Herda PTT')).toBe(false);
    expect(shouldSkipPairingName('')).toBe(false);
  });

  it('normalizes 16-bit and 128-bit Bluetooth UUIDs', () => {
    expect(normalizeBluetoothUuid('FFE0')).toBe('0000FFE000001000800000805F9B34FB');
    expect(bluetoothUuidsEqual('ffe0', '0000FFE0-0000-1000-8000-00805F9B34FB')).toBe(true);
    expect(bluetoothUuidsEqual('FFE1', 'FFE0')).toBe(false);
  });
});

describe('accessory notify codecs', () => {
  it('decodes the PTT-Z01 press and release bytes', () => {
    expect(decodeButtonByte(0x01)).toBe(true);
    expect(decodeButtonByte(0xab)).toBe(true);
    expect(decodeButtonByte(0x00)).toBe(false);
    expect(decodeButtonByte(0xcd)).toBe(false);
    expect(decodeButtonByte(0x02)).toBeNull();
  });

  it('decodes Zello two-byte PTT and ignores volume', () => {
    expect(decodeZelloTwoByte([0x01, 0x01])).toBe(true);
    expect(decodeZelloTwoByte([0x01, 0x00])).toBe(false);
    expect(decodeZelloTwoByte([0x46, 0x03])).toBe(true);
    expect(decodeZelloTwoByte([0x46, 0x02])).toBe(false);
    expect(decodeZelloTwoByte([0x56, 0x01])).toBeNull();
    expect(decodeZelloTwoByte([0x02, 0x01])).toBeNull();
  });

  it('treats Zello and HM-10 notifies as a pairing button command', () => {
    expect(looksLikePttCommand([0x01, 0x01])).toBe(true);
    expect(looksLikePttCommand([0x01, 0x00])).toBe(true);
    expect(looksLikePttCommand([0x01])).toBe(true);
    expect(looksLikePttCommand([0x02])).toBe(true);
    expect(looksLikePttCommand([0x56, 0x01])).toBe(false);
  });

  it('coerces native notify payloads into bytes', () => {
    expect(coerceNotifyBytes([1, 0])).toEqual([1, 0]);
    expect(coerceNotifyBytes(new Uint8Array([0x46, 0x01]))).toEqual([0x46, 0x01]);
    expect(coerceNotifyBytes({ 0: 1, 1: 0 })).toEqual([1, 0]);
  });
});

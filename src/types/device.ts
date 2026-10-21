export const DEVICE_TYPES: Record<number, string> = {
  10: 'GT-3',
  20: 'GT-9 R4 (F1)',
  21: 'GT-9 R5 (F1)',
  22: 'GT-9 R6 (F1)',
  23: 'GT-9 R5 (F1)',
  24: 'GT-9 R6 (F4)',
  25: 'GT-1',
  26: 'GT-9 R8 (F4)',
  90: 'GT-7 (F1)',
  95: 'GT-2',
  96: 'GT-4',
};

/** HW_TYPE (first field of `$VER`) of the GT-2 router — limited settings set. */
export const HW_TYPE_GT2 = 95;

/** HW_TYPE of the GT-4 router — same settings set as GT-2 (plus WiFi hardware). */
export const HW_TYPE_GT4 = 96;

/**
 * True when the connected device is a GT-2-family router (GT-2 or GT-4).
 * `deviceType` is the raw HW_TYPE string from `$VER` kept in connectionStore
 * ('' until detected).
 */
export function isGt2(deviceType: string): boolean {
  const hw = parseInt(deviceType, 10);
  return hw === HW_TYPE_GT2 || hw === HW_TYPE_GT4;
}

/** True when the device has an Ethernet port (`ETH` command) — GT-4 only for now. */
export function hasEthernet(deviceType: string): boolean {
  return parseInt(deviceType, 10) === HW_TYPE_GT4;
}

export interface DeviceInfo {
  deviceType: number;
  deviceName: string;
  deviceId: string;
  imei: string;
  firmwareVersion: string;
  releaseDate: string;
  hardwareVersion: string;
}

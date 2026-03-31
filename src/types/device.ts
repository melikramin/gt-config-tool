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
};

export interface DeviceInfo {
  deviceType: number;
  deviceName: string;
  deviceId: string;
  imei: string;
  firmwareVersion: string;
  releaseDate: string;
  hardwareVersion: string;
}

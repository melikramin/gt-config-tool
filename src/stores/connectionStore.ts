import { create } from 'zustand';

interface ConnectionState {
  port: string;
  baudRate: number;
  isConnected: boolean;
  password: string;
  deviceImei: string;
  deviceType: string;
  firmwareVersion: string;

  setPort: (port: string) => void;
  setBaudRate: (baudRate: number) => void;
  setConnected: (connected: boolean) => void;
  setPassword: (password: string) => void;
  setDeviceImei: (imei: string) => void;
  setDeviceType: (type: string) => void;
  setFirmwareVersion: (version: string) => void;
  reset: () => void;
}

const initialState = {
  port: '',
  baudRate: 115200,
  isConnected: false,
  password: '1234',
  deviceImei: '',
  deviceType: '',
  firmwareVersion: '',
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  ...initialState,
  setPort: (port) => set({ port }),
  setBaudRate: (baudRate) => set({ baudRate }),
  setConnected: (isConnected) => set({ isConnected }),
  setPassword: (password) => set({ password }),
  setDeviceImei: (imei) => set({ deviceImei: imei }),
  setDeviceType: (type) => set({ deviceType: type }),
  setFirmwareVersion: (version) => set({ firmwareVersion: version }),
  reset: () => set(initialState),
}));

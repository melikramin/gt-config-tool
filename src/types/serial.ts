export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  friendlyName?: string;
  vendorId?: string;
  productId?: string;
}

export interface SerialApi {
  listPorts(): Promise<PortInfo[]>;
  connect(port: string, baudRate: number): Promise<void>;
  disconnect(): Promise<void>;
  sendCommand(cmd: string, timeout?: number): Promise<string>;
  startPolling(commands: string[], intervalMs: number): Promise<void>;
  stopPolling(): Promise<void>;
  onRawData(callback: (data: string) => void): () => void;
  onConnectionChange(callback: (connected: boolean) => void): () => void;
  onPollingData(callback: (command: string, response: string) => void): () => void;
}

export interface DialogApi {
  saveFile(content: string, defaultName: string): Promise<boolean>;
  openFile(): Promise<string | null>;
}

declare global {
  interface Window {
    serial: SerialApi;
    dialog: DialogApi;
  }
}

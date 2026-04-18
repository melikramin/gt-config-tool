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

export type FirmwareMode =
  | { mode: 'boot'; mountPath: string; label: string }
  | { mode: 'dfu'; name: string; status: string };

export interface FirmwareApi {
  pickFile(): Promise<{ path: string; name: string } | null>;
  waitForBootDrive(timeoutMs: number): Promise<{ mountPath: string; label: string }>;
  copyToBoot(srcPath: string, destDir: string): Promise<string>;
  waitForMode(timeoutMs: number): Promise<FirmwareMode>;
  launchDfuSeDemo(): Promise<void>;
}

export interface UpdateAvailablePayload {
  version: string;
  releaseNotes: string | null;
  releaseDate: string | null;
  isPortable: boolean;
  releaseUrl?: string;
}

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdaterApi {
  check(): Promise<boolean>;
  download(): Promise<boolean>;
  installAndRestart(): Promise<void>;
  isPortable(): Promise<boolean>;
  openReleasePage(url?: string): Promise<void>;
  onAvailable(cb: (info: UpdateAvailablePayload) => void): () => void;
  onNotAvailable(cb: () => void): () => void;
  onProgress(cb: (p: DownloadProgress) => void): () => void;
  onDownloaded(cb: () => void): () => void;
  onError(cb: (msg: string) => void): () => void;
}

declare global {
  interface Window {
    serial: SerialApi;
    dialog: DialogApi;
    firmware: FirmwareApi;
    updater: UpdaterApi;
  }
}

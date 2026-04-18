import { contextBridge, ipcRenderer } from 'electron';

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

const serialApi = {
  listPorts: (): Promise<PortInfo[]> => {
    return ipcRenderer.invoke('serial:listPorts');
  },

  connect: (port: string, baudRate: number): Promise<void> => {
    return ipcRenderer.invoke('serial:connect', port, baudRate);
  },

  disconnect: (): Promise<void> => {
    return ipcRenderer.invoke('serial:disconnect');
  },

  sendCommand: (cmd: string, timeout?: number): Promise<string> => {
    return ipcRenderer.invoke('serial:sendCommand', cmd, timeout);
  },

  startPolling: (commands: string[], intervalMs: number): Promise<void> => {
    return ipcRenderer.invoke('serial:startPolling', commands, intervalMs);
  },

  stopPolling: (): Promise<void> => {
    return ipcRenderer.invoke('serial:stopPolling');
  },

  onRawData: (callback: (data: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string): void => {
      callback(data);
    };
    ipcRenderer.on('serial:rawData', handler);
    return () => ipcRenderer.removeListener('serial:rawData', handler);
  },

  onConnectionChange: (callback: (connected: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, connected: boolean): void => {
      callback(connected);
    };
    ipcRenderer.on('serial:connectionChange', handler);
    return () => ipcRenderer.removeListener('serial:connectionChange', handler);
  },

  onPollingData: (callback: (command: string, response: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: string, response: string): void => {
      callback(command, response);
    };
    ipcRenderer.on('serial:pollingData', handler);
    return () => ipcRenderer.removeListener('serial:pollingData', handler);
  },
};

const dialogApi = {
  saveFile: (content: string, defaultName: string): Promise<boolean> => {
    return ipcRenderer.invoke('dialog:saveFile', content, defaultName);
  },
  openFile: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:openFile');
  },
};

type BootMode = { mode: 'boot'; mountPath: string; label: string };
type DfuMode  = { mode: 'dfu'; name: string; status: string };
type FirmwareMode = BootMode | DfuMode;

const firmwareApi = {
  pickFile: (): Promise<{ path: string; name: string } | null> => {
    return ipcRenderer.invoke('firmware:pickFile');
  },
  waitForBootDrive: (timeoutMs: number): Promise<{ mountPath: string; label: string }> => {
    return ipcRenderer.invoke('firmware:waitForBootDrive', timeoutMs);
  },
  copyToBoot: (srcPath: string, destDir: string): Promise<string> => {
    return ipcRenderer.invoke('firmware:copyToBoot', srcPath, destDir);
  },
  waitForMode: (timeoutMs: number): Promise<FirmwareMode> => {
    return ipcRenderer.invoke('firmware:waitForMode', timeoutMs);
  },
  launchDfuSeDemo: (): Promise<void> => {
    return ipcRenderer.invoke('dfu:launchDemo');
  },
};

type UpdateAvailablePayload = {
  version: string;
  releaseNotes: string | null;
  releaseDate: string | null;
  isPortable: boolean;
  releaseUrl?: string;
};

type DownloadProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

const updaterApi = {
  check: (): Promise<boolean> => ipcRenderer.invoke('update:check'),
  download: (): Promise<boolean> => ipcRenderer.invoke('update:download'),
  installAndRestart: (): Promise<void> => ipcRenderer.invoke('update:install-and-restart'),
  isPortable: (): Promise<boolean> => ipcRenderer.invoke('update:is-portable'),
  openReleasePage: (url?: string): Promise<void> => ipcRenderer.invoke('update:open-release-page', url),

  onAvailable: (cb: (info: UpdateAvailablePayload) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: UpdateAvailablePayload): void => cb(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onNotAvailable: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on('update:not-available', handler);
    return () => ipcRenderer.removeListener('update:not-available', handler);
  },
  onProgress: (cb: (p: DownloadProgress) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: DownloadProgress): void => cb(p);
    ipcRenderer.on('update:download-progress', handler);
    return () => ipcRenderer.removeListener('update:download-progress', handler);
  },
  onDownloaded: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },
  onError: (cb: (msg: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string): void => cb(msg);
    ipcRenderer.on('update:error', handler);
    return () => ipcRenderer.removeListener('update:error', handler);
  },
};

contextBridge.exposeInMainWorld('serial', serialApi);
contextBridge.exposeInMainWorld('dialog', dialogApi);
contextBridge.exposeInMainWorld('firmware', firmwareApi);
contextBridge.exposeInMainWorld('updater', updaterApi);

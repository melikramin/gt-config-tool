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

contextBridge.exposeInMainWorld('serial', serialApi);
contextBridge.exposeInMainWorld('dialog', dialogApi);

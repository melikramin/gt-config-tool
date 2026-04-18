import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { SerialManager } from './serial/SerialManager';
import { waitForBootDrive, copyFirmwareWithRetry } from './firmware';
import { listDfuDevices, waitForDfuDevice, launchDfuSeDemo } from './dfu-stm';
import { initAutoUpdater } from './updater';

// Catch native exceptions (e.g. serial port yanked out) so the app doesn't crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  mainWindow?.webContents.send('serial:connectionChange', false);
});

let mainWindow: BrowserWindow | null = null;
const serialManager = new SerialManager();

const isDev = !app.isPackaged;

const DEV_URL = 'http://localhost:5173';

async function loadDevUrl(win: BrowserWindow, retries = 10): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await win.loadURL(DEV_URL);
      return;
    } catch {
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  console.error(`Failed to connect to ${DEV_URL} after ${retries} retries`);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'GT-9 Configurator v2.0',
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  initAutoUpdater(mainWindow);

  if (isDev) {
    loadDevUrl(mainWindow);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC Handlers ---

ipcMain.handle('serial:listPorts', async () => {
  return serialManager.listPorts();
});

ipcMain.handle('serial:connect', async (_event, port: string, baudRate: number) => {
  await serialManager.connect(port, baudRate);
  mainWindow?.webContents.send('serial:connectionChange', true);
});

ipcMain.handle('serial:disconnect', async () => {
  await serialManager.disconnect();
  mainWindow?.webContents.send('serial:connectionChange', false);
});

ipcMain.handle('serial:sendCommand', async (_event, cmd: string, timeout?: number) => {
  return serialManager.sendCommand(cmd, timeout);
});

ipcMain.handle('serial:startPolling', (_event, commands: string[], intervalMs: number) => {
  serialManager.startPolling(commands, intervalMs, (cmd, response) => {
    mainWindow?.webContents.send('serial:pollingData', cmd, response);
  });
});

ipcMain.handle('serial:stopPolling', () => {
  serialManager.stopPolling();
});

// Forward raw data to renderer for diagnostics
serialManager.onRawData((data: string) => {
  mainWindow?.webContents.send('serial:rawData', data);
});

serialManager.onConnectionChange((connected: boolean) => {
  mainWindow?.webContents.send('serial:connectionChange', connected);
});

// --- File dialog ---

ipcMain.handle('dialog:saveFile', async (_event, content: string, defaultName: string) => {
  if (!mainWindow) return false;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'Text Files', extensions: ['txt', 'log'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (canceled || !filePath) return false;
  writeFileSync(filePath, content, 'utf8');
  return true;
});

ipcMain.handle('dialog:openFile', async (_event, filters?: { name: string; extensions: string[] }[]) => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: filters ?? [
      { name: 'Text Files', extensions: ['txt', 'log', 'gtcfg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  return readFileSync(filePaths[0], 'utf8');
});

// --- Firmware update (F4 / mass storage flow) ---

ipcMain.handle('firmware:pickFile', async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'DFU Firmware', extensions: ['dfu'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

ipcMain.handle('firmware:waitForBootDrive', async (_event, timeoutMs: number) => {
  const drive = await waitForBootDrive(timeoutMs);
  return { mountPath: drive.mountPath, label: drive.label };
});

ipcMain.handle('firmware:copyToBoot', async (_event, srcPath: string, destDir: string) => {
  const dest = await copyFirmwareWithRetry(srcPath, destDir, 5, 1000);
  return dest;
});

// --- Firmware update (DFU flow, non-F4 devices) ---

ipcMain.handle('dfu:listDevices', () => {
  return listDfuDevices();
});

ipcMain.handle('dfu:waitForDevice', async (_event, timeoutMs: number) => {
  return waitForDfuDevice(timeoutMs);
});

ipcMain.handle('dfu:launchDemo', () => {
  launchDfuSeDemo();
});

// Race F4 mass-storage detection against DFU device detection.
// Returns whichever path becomes available first, so the renderer doesn't need to know
// the device type in advance.
ipcMain.handle('firmware:waitForMode', async (_event, timeoutMs: number) => {
  const bootPromise = waitForBootDrive(timeoutMs)
    .then((drive) => ({ mode: 'boot' as const, mountPath: drive.mountPath, label: drive.label }));
  const dfuPromise = waitForDfuDevice(timeoutMs)
    .then((dev) => ({ mode: 'dfu' as const, name: dev.name, status: dev.status }));
  return Promise.any([bootPromise, dfuPromise]).catch(() => {
    throw new Error('Neither BOOT drive nor DFU device appeared within timeout');
  });
});

// --- App lifecycle ---

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => {
  serialManager.disconnect().catch(() => {});
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

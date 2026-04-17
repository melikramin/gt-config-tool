import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { SerialManager } from './serial/SerialManager';

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'GT-9 Configurator v2.0',
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

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

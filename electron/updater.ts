import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import https from 'https';

const GITHUB_API = 'https://api.github.com/repos/melikramin/gt-config-tool/releases/latest';
const GITHUB_RELEASES_PAGE = 'https://github.com/melikramin/gt-config-tool/releases/latest';

type UpdateAvailablePayload = {
  version: string;
  releaseNotes: string | null;
  releaseDate: string | null;
  isPortable: boolean;
  releaseUrl?: string;
};

function isPortableRuntime(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

function fetchLatestRelease(): Promise<{ tag: string; body: string; publishedAt: string; htmlUrl: string } | null> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      GITHUB_API,
      { headers: { 'User-Agent': `gt9-configurator/${app.getVersion()}`, Accept: 'application/vnd.github+json' } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https.get(res.headers.location, (r2) => collect(r2, resolve, reject)).on('error', reject);
          return;
        }
        collect(res, resolve, reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('GitHub API timeout')));
  });
}

function collect(
  res: NodeJS.ReadableStream & { statusCode?: number },
  resolve: (v: { tag: string; body: string; publishedAt: string; htmlUrl: string } | null) => void,
  reject: (e: Error) => void,
): void {
  let data = '';
  res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
  res.on('end', () => {
    // 404 = repo has no releases yet. Treat as "no update available".
    if (res.statusCode === 404) {
      resolve(null);
      return;
    }
    if (res.statusCode !== 200) {
      reject(new Error(`GitHub API returned ${res.statusCode}`));
      return;
    }
    try {
      const json = JSON.parse(data);
      resolve({
        tag: json.tag_name ?? '',
        body: json.body ?? '',
        publishedAt: json.published_at ?? '',
        htmlUrl: json.html_url ?? GITHUB_RELEASES_PAGE,
      });
    } catch (err) {
      reject(err as Error);
    }
  });
  res.on('error', reject);
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  const portable = isPortableRuntime();

  const send = <T>(channel: string, payload?: T): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  // Track whether user has initiated a download — only then do we surface errors.
  let userInitiated = false;
  // True while the user is downloading *in this session*. Distinguishes a fresh
  // download from a pending one left over from a previous session.
  let downloadingThisSession = false;

  if (!portable) {
    autoUpdater.autoDownload = false;
    // We handle the install timing ourselves (see update-downloaded handler).
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      const payload: UpdateAvailablePayload = {
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
        releaseDate: info.releaseDate ?? null,
        isPortable: false,
      };
      send('update:available', payload);
    });

    autoUpdater.on('update-not-available', () => send('update:not-available'));
    autoUpdater.on('download-progress', (p: ProgressInfo) => send('update:download-progress', p));

    autoUpdater.on('update-downloaded', () => {
      if (!downloadingThisSession) {
        // Pending install from a previous session (user clicked "On next launch").
        // Apply it silently now, before the user sees the old version.
        console.info('[updater] applying pending update on startup');
        setImmediate(() => autoUpdater.quitAndInstall(true, true));
        return;
      }
      send('update:downloaded');
    });

    autoUpdater.on('error', (err: Error) => {
      // Suppress background errors (no internet, 404, etc.). Only surface
      // errors once the user has clicked Download / Install.
      if (userInitiated) {
        send('update:error', err.message);
      } else {
        console.warn('[updater] background error:', err.message);
      }
    });
  }

  const checkPortable = async (manual: boolean): Promise<boolean> => {
    try {
      const release = await fetchLatestRelease();
      if (!release || !release.tag) {
        if (manual) send('update:not-available');
        return false;
      }
      const current = app.getVersion();
      if (compareSemver(release.tag, current) > 0) {
        const payload: UpdateAvailablePayload = {
          version: release.tag.replace(/^v/, ''),
          releaseNotes: release.body,
          releaseDate: release.publishedAt,
          isPortable: true,
          releaseUrl: release.htmlUrl,
        };
        send('update:available', payload);
        return true;
      }
      if (manual) send('update:not-available');
      return false;
    } catch (err) {
      // Silent on network/API errors — user shouldn't see update errors if they
      // haven't asked for anything. Only log to console for debugging.
      console.warn('[updater] check failed:', (err as Error).message);
      return false;
    }
  };

  ipcMain.handle('update:check', async () => {
    if (portable) return checkPortable(true);
    try {
      const r = await autoUpdater.checkForUpdates();
      return Boolean(r?.updateInfo && compareSemver(r.updateInfo.version, app.getVersion()) > 0);
    } catch (err) {
      send('update:error', (err as Error).message);
      return false;
    }
  });

  ipcMain.handle('update:download', async () => {
    if (portable) return false;
    userInitiated = true;
    downloadingThisSession = true;
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (err) {
      send('update:error', (err as Error).message);
      return false;
    }
  });

  ipcMain.handle('update:install-and-restart', () => {
    if (portable) return;
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('update:open-release-page', async (_e, url?: string) => {
    await shell.openExternal(url ?? GITHUB_RELEASES_PAGE);
  });

  ipcMain.handle('update:is-portable', () => portable);

  // Auto-check on startup. If a pending update is found, the update-downloaded
  // handler applies it immediately — so we run the check without delay to keep
  // the "old-version flash" as short as possible.
  if (!app.isPackaged) return;
  if (portable) {
    setTimeout(() => checkPortable(false), 3000);
  } else {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.warn('[updater] startup check failed:', err.message);
    });
  }
}

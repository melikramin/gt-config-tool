import { exec } from 'child_process';
import { promisify } from 'util';
import { copyFile, stat } from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export interface DriveInfo {
  driveLetter: string;    // e.g. "E:"
  mountPath: string;      // e.g. "E:\\"
  label: string;          // Volume label
  driveType: number;      // 2 = removable, 3 = fixed
}

const PS_LIST_DRIVES =
  `[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | ` +
  `Select-Object Name, VolumeLabel, DriveType | ConvertTo-Json -Compress`;

// Lists all mounted, ready drives on Windows via PowerShell (no native deps).
export async function listDrives(): Promise<DriveInfo[]> {
  const { stdout } = await execAsync(
    `powershell -NoProfile -NonInteractive -Command "${PS_LIST_DRIVES}"`,
    { windowsHide: true },
  );
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const raw = JSON.parse(trimmed);
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((d: { Name: string; VolumeLabel: string | null; DriveType: number }) => ({
    driveLetter: d.Name.replace(/\\$/, ''),
    mountPath: d.Name,
    label: d.VolumeLabel || '',
    driveType: d.DriveType,
  }));
}

// Matches the GT-X BOOT drive (case-insensitive, tolerates GT9 BOOT etc.).
export function isBootDrive(label: string): boolean {
  const l = label.trim().toUpperCase();
  return /^GT[-_ ]?\w*\s*BOOT$/.test(l);
}

// Polls drive list until a matching BOOT drive appears. Returns its mount path or throws on timeout.
export async function waitForBootDrive(timeoutMs: number, pollMs = 500): Promise<DriveInfo> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const drives = await listDrives();
      const hit = drives.find((d) => isBootDrive(d.label));
      if (hit) return hit;
    } catch {
      // retry on transient PS errors
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('BOOT drive not found within timeout');
}

// Copies a file to a target directory, retrying on transient errors (EBUSY, ENOENT while FS settles).
export async function copyFirmwareWithRetry(
  srcPath: string,
  destDir: string,
  retries: number,
  delayMs: number,
): Promise<string> {
  await stat(srcPath); // fail fast if source gone
  const destPath = path.join(destDir, path.basename(srcPath));
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      await copyFile(srcPath, destPath);
      return destPath;
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

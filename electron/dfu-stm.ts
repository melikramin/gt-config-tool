import { app } from 'electron';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { readFile, writeFile, unlink, stat } from 'fs/promises';
import os from 'os';
import path from 'path';

// Run PowerShell via spawn (args array) rather than exec so that cmd.exe never sees
// the command line — critical because "&" in patterns like VID_0483&PID_DF11 gets
// interpreted as a cmd.exe command separator when piped through a shell.
function runPowerShell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `powershell exit ${code}`));
    });
  });
}

// STM DFU bootloader VID:PID — same for all STM32 Cortex-M bootloaders.
const STM_DFU_PNP_MATCH = 'VID_0483&PID_DF11';

// DfuSeCommand.exe is the CLI counterpart of the classic DfuSeDemo. Works with standard
// STM32 bootloaders AND custom/clone ones (unlike STM32CubeProgrammer which bails on
// DevID = 0x0000). Accepts .dfu files natively — no conversion needed.
const FALLBACK_DFUSE_DIRS = [
  'C:\\Program Files (x86)\\STMicroelectronics\\Software\\DfuSe v3.0.6\\Bin',
  'C:\\Program Files (x86)\\STMicroelectronics\\Software\\DfuSe v3.0.5\\Bin',
  'C:\\Program Files\\STMicroelectronics\\Software\\DfuSe v3.0.6\\Bin',
  'C:\\Program Files\\STMicroelectronics\\Software\\DfuSe v3.0.5\\Bin',
];

function resolveDfuSeBinary(name: string): string {
  const bundledRoots = app.isPackaged
    ? [path.join(process.resourcesPath, 'dfuse')]
    : [path.join(app.getAppPath(), 'resources', 'dfuse')];

  for (const root of bundledRoots) {
    const p = path.join(root, name);
    if (existsSync(p)) return p;
  }
  for (const dir of FALLBACK_DFUSE_DIRS) {
    const p = path.join(dir, name);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `${name} not found. Place it under resources/dfuse/ together with its ` +
    'STDFU.dll / STDFUFiles.dll / STDFUPRT.dll / STTubeDevice30.dll, or install DfuSe Utility.',
  );
}

export function resolveDfuSeCommandPath(): string {
  return resolveDfuSeBinary('DfuSeCommand.exe');
}

export function resolveDfuSeDemoPath(): string {
  return resolveDfuSeBinary('DfuSeDemo.exe');
}

// Launch DfuSeDemo GUI as a detached background process. We spawn via cmd.exe `start`
// so the child outlives Electron even if the user closes the app mid-flash.
export function launchDfuSeDemo(): void {
  const exe = resolveDfuSeDemoPath();
  const child = spawn('cmd.exe', ['/c', 'start', '""', exe], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(exe),
  });
  child.unref();
}

// ---- DFU device detection (PowerShell + Win32_PnPEntity) ----

export interface DfuDeviceInfo {
  name: string;
  status: string;
}

// List ALL USB PnP entities, filter in JS by VID/PID. Filtering in PowerShell with
// `-like '*VID_0483&PID_DF11*'` was unreliable — the "&" could be mangled by the shell
// layer on its way to the PowerShell host.
const PS_LIST_USB =
  `Get-CimInstance Win32_PnPEntity | ` +
  `Where-Object { $_.DeviceID -like 'USB*' } | ` +
  `Select-Object Name, DeviceID, Status | ConvertTo-Json -Compress`;

export async function listDfuDevices(): Promise<DfuDeviceInfo[]> {
  try {
    const stdout = await runPowerShell(PS_LIST_USB);
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const raw = JSON.parse(trimmed);
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr
      .filter((d: { DeviceID?: string }) => !!d.DeviceID && d.DeviceID.includes(STM_DFU_PNP_MATCH))
      .map((d: { Name: string; Status: string }) => ({ name: d.Name, status: d.Status }));
  } catch {
    return [];
  }
}

export async function waitForDfuDevice(timeoutMs: number, pollMs = 500): Promise<DfuDeviceInfo> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await listDfuDevices();
    if (list.length > 0) return list[0];
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('DFU device not found within timeout');
}

// ---- Flash via DfuSeCommand.exe ----

export interface FlashProgress {
  phase: 'erase' | 'write' | 'verify' | 'manifest' | 'done' | string;
  bytesWritten: number;   // percent * 100 when we have %, else 0
  bytesTotal: number;     // 10000 when using percent, else 0
  message?: string;
}

// DfuSeCommand v1.2.0 emits fragments like (one big \r-separated stream, no newlines):
//   "Target 00: Upgrading - Erase Phase (NN)..."
//   "Target 00: Upgrading - Download Phase (NN)..."
//   "Target 00: Uploading (NN)..."   <- this is the post-download verify readback
//   " Duration: HH:MM:SS"
//   "Upgrade successful !"
//   "Verify successful !"
// Numbers in parens are percent (0..100). We map them to our phase vocabulary.
function parseDfuSeLine(line: string, current: { phase: FlashProgress['phase'] }): FlashProgress | null {
  const l = line.trim();
  if (!l) return null;

  if (/Erase Phase/i.test(l)) current.phase = 'erase';
  else if (/Download Phase/i.test(l)) current.phase = 'write';
  else if (/Uploading/i.test(l)) current.phase = 'verify';
  else if (/Upgrade successful|Verify successful/i.test(l)) current.phase = 'manifest';

  // "(NN)" percent form (primary) or "NN%" fallback.
  const m = l.match(/\((\d{1,3})\)/) || l.match(/(\d{1,3})\s*%/);
  if (m) {
    const pct = Math.min(100, parseInt(m[1], 10));
    return { phase: current.phase, bytesWritten: pct * 100, bytesTotal: 10_000, message: l };
  }
  return { phase: current.phase, bytesWritten: 0, bytesTotal: 0, message: l };
}

export async function flashDfu(
  filePath: string,
  onProgress: (p: FlashProgress) => void,
): Promise<void> {
  const dfusePath = resolveDfuSeCommandPath();

  // DfuSeCommand writes output through Win32 Console APIs, not C stdio. When we spawn
  // it with stdio: 'pipe' (Node's default), there's no attached console, so its writes
  // either hang or corrupt its own stack (exit 0xC0000409 on Upload). Redirecting output
  // to a file via cmd.exe gives it a real file handle for stdout, which works.
  // We tail the log file while the child runs to stream progress to the UI.
  const tmpDir = os.tmpdir();
  const logPath = path.join(tmpDir, 'gt9-dfu-last.log');
  const batPath = path.join(tmpDir, 'gt9-dfu-run.bat');

  // Fresh log each run — otherwise tailing picks up stale content from a prior flash.
  try { await unlink(logPath); } catch { /* no prior log */ }

  await writeFile(
    batPath,
    `@echo off\r\n"${dfusePath}" -c -d --v --fn "${filePath}" > "${logPath}" 2>&1\r\nexit /b %errorlevel%\r\n`,
    'utf8',
  );

  const state = { phase: 'erase' as FlashProgress['phase'] };
  let offset = 0;
  let lastLine = '';
  let flashSucceeded = false;

  const pump = async (): Promise<void> => {
    let size: number;
    try { size = (await stat(logPath)).size; } catch { return; }
    if (size <= offset) return;
    const buf = await readFile(logPath);
    const slice = buf.subarray(offset).toString('utf8');
    offset = buf.length;
    // DfuSeCommand writes progress on the SAME line using \r, so split on both.
    for (const line of slice.split(/\r?\n|\r/)) {
      const upd = parseDfuSeLine(line, state);
      if (upd) {
        lastLine = line.trim();
        onProgress(upd);
      }
      if (/Verify successful|Upgrade successful/i.test(line)) {
        flashSucceeded = true;
      }
    }
  };

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn('cmd.exe', ['/c', batPath], { windowsHide: true });
    let killed = false;
    // DfuSeCommand v1.2.0 hangs idle after "Verify successful !" without issuing
    // DFU_DETACH / exiting — STM32 still enters manifestation on its own timer and
    // resets. Poll the log and kill the hung CLI once we see the success marker.
    const poll = setInterval(() => {
      void pump().then(() => {
        if (flashSucceeded && !killed) {
          killed = true;
          try { child.kill(); } catch { /* already gone */ }
        }
      });
    }, 250);
    child.on('error', (err) => { clearInterval(poll); reject(err); });
    child.on('close', async (code) => {
      clearInterval(poll);
      await pump(); // drain remainder
      // Treat "killed after success" as success.
      resolve(flashSucceeded ? 0 : (code ?? -1));
    });
  });

  // Clean up wrapper. Keep log for diagnostics.
  try { await unlink(batPath); } catch { /* non-fatal */ }

  if (exitCode !== 0) {
    let tail = '';
    try { tail = (await readFile(logPath, 'utf8')).slice(-1000); } catch { /* ignore */ }
    throw new Error(`${lastLine || `exit code ${exitCode}`}\n\n--- log tail ---\n${tail}\n(full log: ${logPath})`);
  }

  onProgress({
    phase: 'done',
    bytesWritten: 10_000,
    bytesTotal: 10_000,
    message: `log: ${logPath}`,
  });
}

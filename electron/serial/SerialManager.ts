import { EventEmitter } from 'events';

interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  friendlyName?: string;
  vendorId?: string;
  productId?: string;
}

interface QueuedCommand {
  raw: string;
  expectedPrefix: string;
  timeout: number;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

const DEFAULT_TIMEOUT = 3000;
const BAUD_RATE = 115200;

export class SerialManager {
  private port: import('serialport').SerialPort | null = null;
  private buffer = '';
  private commandQueue: QueuedCommand[] = [];
  private currentCommand: QueuedCommand | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private emitter = new EventEmitter();
  private isProcessing = false;

  async listPorts(): Promise<PortInfo[]> {
    const { SerialPort } = await import('serialport');
    return SerialPort.list();
  }

  async connect(portPath: string, baudRate: number = BAUD_RATE): Promise<void> {
    if (this.port?.isOpen) {
      await this.disconnect();
    }

    const { SerialPort } = await import('serialport');

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: portPath,
        baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
      });

      this.port.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        this.emitter.emit('rawData', text);
        this.handleData(text);
      });

      this.port.on('error', (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emitter.emit('error', error);
        this.handlePortLost(error);
      });

      this.port.on('close', () => {
        this.handlePortLost(new Error('Port closed'));
      });

      this.port.open((err: Error | null) => {
        if (err) {
          reject(new Error(`Failed to open port: ${err.message}`));
          return;
        }
        // Drop any stale bytes the device was streaming before we attached
        // (e.g. accumulated LOG output) so the first command isn't drowned.
        this.port?.flush(() => {
          this.buffer = '';
          this.emitter.emit('connectionChange', true);
          resolve();
        });
      });
    });
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.rejectAllPending(new Error('Disconnected'));

    const p = this.port;
    this.port = null;
    this.buffer = '';

    if (p) {
      try {
        if (p.isOpen) {
          await new Promise<void>((resolve) => {
            p.close((err: Error | null) => {
              if (err) {
                // Port already gone (USB removed) — ignore
              }
              resolve();
            });
          });
        }
      } catch {
        // Native exception from closing a removed device — safe to ignore
      }
      p.removeAllListeners();
    }
  }

  sendCommand(raw: string, timeout: number = DEFAULT_TIMEOUT): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.port?.isOpen) {
        reject(new Error('Port is not open'));
        return;
      }

      // Extract command prefix for response matching
      // Raw format: $PASSWORD;COMMAND;...
      const withoutDollar = raw.startsWith('$') ? raw.slice(1) : raw;
      const parts = withoutDollar.split(';');
      const expectedPrefix = ('$' + (parts[1] ?? parts[0])).toUpperCase();

      this.commandQueue.push({ raw, expectedPrefix, timeout, resolve, reject });
      this.processQueue();
    });
  }

  startPolling(
    commands: string[],
    intervalMs: number,
    onData: (command: string, response: string) => void,
  ): void {
    this.stopPolling();

    let index = 0;

    const poll = async (): Promise<void> => {
      if (!this.port?.isOpen || commands.length === 0) return;

      const cmd = commands[index % commands.length];
      index++;

      try {
        const response = await this.sendCommand(cmd);
        onData(cmd, response);
      } catch {
        // Polling errors are non-fatal, skip to next
      }
    };

    // Start immediately, then repeat
    poll();
    this.pollingInterval = setInterval(() => { poll(); }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  onRawData(callback: (data: string) => void): void {
    this.emitter.on('rawData', callback);
  }

  onConnectionChange(callback: (connected: boolean) => void): void {
    this.emitter.on('connectionChange', callback);
  }

  get isConnected(): boolean {
    return this.port?.isOpen ?? false;
  }

  // --- Private ---

  private handlePortLost(error: Error): void {
    this.stopPolling();
    this.rejectAllPending(error);
    const p = this.port;
    this.port = null;
    this.buffer = '';
    if (p) {
      try { p.removeAllListeners(); } catch { /* ignore */ }
    }
    this.emitter.emit('connectionChange', false);
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;

    // Process complete lines (terminated by \r\n)
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\r\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 2);

      if (line.length > 0) {
        this.handleLine(line);
      }
    }
  }

  private static readonly RESPONSE_CODE_RE = /^\$(OK|CE|DE|PE|FE)(;|$)/i;

  private handleLine(line: string): void {
    if (!this.currentCommand) return;

    const upper = line.toUpperCase();
    // Match expected command prefix OR short response codes ($OK, $CE, $DE, $PE, $FE)
    if (
      upper.startsWith(this.currentCommand.expectedPrefix) ||
      SerialManager.RESPONSE_CODE_RE.test(line)
    ) {
      this.clearTimeout();
      const cmd = this.currentCommand;
      this.currentCommand = null;
      cmd.resolve(line);
      this.isProcessing = false;
      this.processQueue();
    }
    // Else: ignore unsolicited data (debug log output, etc.)
  }

  private processQueue(): void {
    if (this.isProcessing || this.currentCommand || this.commandQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.currentCommand = this.commandQueue.shift()!;

    // Set timeout
    this.timeoutHandle = setTimeout(() => {
      if (this.currentCommand) {
        const cmd = this.currentCommand;
        this.currentCommand = null;
        this.isProcessing = false;
        cmd.reject(new Error(`Command timeout: ${cmd.raw.trim()}`));
        this.processQueue();
      }
    }, this.currentCommand.timeout);

    // Send command
    const data = this.currentCommand.raw.endsWith('\r\n')
      ? this.currentCommand.raw
      : this.currentCommand.raw + '\r\n';

    this.port?.write(data, (err: Error | null | undefined) => {
      if (err && this.currentCommand) {
        this.clearTimeout();
        const cmd = this.currentCommand;
        this.currentCommand = null;
        this.isProcessing = false;
        cmd.reject(new Error(`Write error: ${err.message}`));
        this.processQueue();
      }
    });
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private rejectAllPending(error: Error): void {
    this.clearTimeout();
    if (this.currentCommand) {
      this.currentCommand.reject(error);
      this.currentCommand = null;
    }
    for (const cmd of this.commandQueue) {
      cmd.reject(error);
    }
    this.commandQueue = [];
    this.isProcessing = false;
  }
}

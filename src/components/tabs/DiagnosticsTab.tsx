import { type FC, useState, useEffect, useRef, useCallback } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useDiagnosticsStore } from '../../stores/diagnosticsStore';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';

// --- Log channel definitions ---

interface LogChannel {
  id: string;
  labelKey: keyof Translations;
  code: string;
  isDebug?: boolean; // uses double semicolon: LOG;;code
}

const LOG_CHANNELS: LogChannel[] = [
  { id: 'gsm', labelKey: 'diag.channelGsm', code: '2' },
  { id: 'gnss', labelKey: 'diag.channelGnss', code: '3' },
  { id: '1wire', labelKey: 'diag.channel1Wire', code: '5' },
  { id: 'wifi', labelKey: 'diag.channelWifi', code: '4' },
  { id: 'pump', labelKey: 'diag.channelPump', code: '27', isDebug: true },
  { id: 'sflash', labelKey: 'diag.channelSflash', code: '12' },
  { id: 'sd', labelKey: 'diag.channelSd', code: '13' },
  { id: 'rs232', labelKey: 'diag.channelRs232', code: '6' },
  { id: 'rs232a', labelKey: 'diag.channelRs232a', code: '14' },
  { id: 'rs232b', labelKey: 'diag.channelRs232b', code: '15' },
  { id: 'rs485', labelKey: 'diag.channelRs485', code: '7' },
  { id: 'rs485a', labelKey: 'diag.channelRs485a', code: '16' },
  { id: 'rs485b', labelKey: 'diag.channelRs485b', code: '17' },
];

export const DiagnosticsTab: FC = () => {
  const { password, isConnected } = useConnectionStore();
  const { setLastError } = useStatusStore();
  const {
    log,
    commandInput,
    enabledChannels,
    appendLog: appendLogStore,
    clearLog,
    setCommandInput,
    setEnabledChannels,
  } = useDiagnosticsStore();
  const { t } = useI18n();

  const [addTime, setAddTime] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const logRef = useRef<HTMLPreElement>(null);
  const addTimeRef = useRef(addTime);
  addTimeRef.current = addTime;

  const appendLog = useCallback((text: string) => {
    appendLogStore(text, addTimeRef.current);
  }, [appendLogStore]);

  // Subscribe to raw serial data
  useEffect(() => {
    const unsubscribe = window.serial.onRawData((data: string) => {
      appendLog(data);
    });
    return unsubscribe;
  }, [appendLog]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, autoScroll]);

  // Detect manual scroll-up to pause auto-scroll
  const handleLogScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // Send command
  const handleSend = useCallback(async () => {
    const cmd = commandInput.trim();
    if (!cmd || isSending) return;
    if (!isConnected) {
      setLastError(t('diag.notConnected'));
      return;
    }

    const fullCmd = cmd.startsWith('$') ? cmd : `$${password};${cmd}`;
    appendLog(`>> ${fullCmd}\r\n`);
    setIsSending(true);

    try {
      await window.serial.sendCommand(fullCmd);
    } catch (err) {
      appendLog(`!! ${(err as Error).message}\r\n`);
    } finally {
      setIsSending(false);
    }
  }, [commandInput, isSending, isConnected, password, appendLog, setLastError, t]);

  // Client-side timestamp only — do NOT send LOG;TS to the device.
  const handleAddTimeToggle = useCallback((checked: boolean) => {
    setAddTime(checked);
  }, []);

  // Toggle log channel
  const handleChannelToggle = useCallback(async (channel: LogChannel, enable: boolean) => {
    if (!isConnected) {
      setLastError(t('diag.notConnected'));
      return;
    }

    const code = enable ? channel.code : `-${channel.code}`;
    // Debug channels use double semicolon: $PASS;LOG;;code
    const cmd = channel.isDebug
      ? `$${password};LOG;;${code}`
      : `$${password};LOG;${code}`;

    try {
      await window.serial.sendCommand(cmd);
      setEnabledChannels((prev) => {
        const next = new Set(prev);
        if (enable) {
          next.add(channel.id);
        } else {
          next.delete(channel.id);
        }
        return next;
      });
    } catch (err) {
      setLastError(`LOG error: ${(err as Error).message}`);
    }
  }, [isConnected, password, setLastError, t]);

  // Copy all
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(log);
      setLastError(t('diag.copied'));
    } catch {
      // fallback
    }
  }, [log, setLastError, t]);

  // Save to file
  const handleSave = useCallback(async () => {
    const now = new Date();
    const name = `gt9_log_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.txt`;
    try {
      const saved = await window.dialog.saveFile(log, name);
      if (saved) {
        setLastError(t('diag.saved'));
      }
    } catch {
      // silent
    }
  }, [log, setLastError, t]);

  // Clear log (user-initiated only — never clear automatically)
  const handleClear = useCallback(() => {
    clearLog();
  }, [clearLog]);

  return (
    <div className="flex flex-col h-full">
      {/* Top controls */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-zinc-700 bg-zinc-900/50">
        <label className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={addTime}
            onChange={(e) => handleAddTimeToggle(e.target.checked)}
            className="accent-blue-500"
          />
          {t('diag.addTime')}
        </label>

        <label className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={wordWrap}
            onChange={(e) => setWordWrap(e.target.checked)}
            className="accent-blue-500"
          />
          {t('diag.wordWrap')}
        </label>

        <div className="flex-1" />

        <button
          onClick={handleCopy}
          className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-2.5 py-1 rounded"
        >
          {t('diag.copyAll')}
        </button>
        <button
          onClick={handleSave}
          className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-2.5 py-1 rounded"
        >
          {t('diag.saveLog')}
        </button>
      </div>

      {/* Main area: log + channel sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Log display */}
        <pre
          ref={logRef}
          onScroll={handleLogScroll}
          className={`flex-1 p-2 text-xs text-green-400 bg-zinc-950 font-mono overflow-auto select-text ${
            wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
          }`}
        >
          {log || <span className="text-zinc-600 italic">{'...'}</span>}
        </pre>

        {/* Channel sidebar */}
        <div className="w-36 border-l border-zinc-700 bg-zinc-900/50 p-2 overflow-y-auto">
          <div className="text-xs text-zinc-400 font-medium mb-2">{t('diag.channels')}</div>
          {LOG_CHANNELS.map((ch) => (
            <label
              key={ch.id}
              className="flex items-center gap-1.5 text-xs text-zinc-300 py-0.5 cursor-pointer select-none hover:text-white"
            >
              <input
                type="checkbox"
                checked={enabledChannels.has(ch.id)}
                onChange={(e) => handleChannelToggle(ch, e.target.checked)}
                disabled={!isConnected}
                className="accent-blue-500"
              />
              {t(ch.labelKey)}
            </label>
          ))}
        </div>
      </div>

      {/* Bottom: command input */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-700 bg-zinc-900/50">
        <input
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder={t('diag.commandPlaceholder')}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-zinc-800 text-zinc-200 text-sm border border-zinc-600 rounded px-2 py-1 font-mono placeholder:text-zinc-600"
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || isSending}
          className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          {t('diag.send')}
        </button>
        <button
          onClick={handleClear}
          className="text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1 rounded"
        >
          {t('diag.clear')}
        </button>
      </div>
    </div>
  );
};

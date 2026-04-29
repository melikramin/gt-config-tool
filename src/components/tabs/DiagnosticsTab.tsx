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

  // Custom right-click menu state. `target=log` shows just Copy (selection),
  // `target=input` shows Cut/Copy/Paste for the command field. We render our
  // own menu instead of relying on Electron's native one so the labels are
  // localized and the actions can use clipboard / DOM APIs directly.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: 'log' | 'input' } | null>(null);

  const logRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // ---- Context-menu actions ----

  // Copy current text selection (works for both the log <pre> and the input).
  // Falls back to copying the whole log if there's no live selection but the
  // menu was opened on the log.
  const ctxCopySelection = useCallback(async () => {
    const sel = window.getSelection()?.toString() ?? '';
    const text = sel || (ctxMenu?.target === 'log' ? log : '');
    if (text) {
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }
    setCtxMenu(null);
  }, [ctxMenu, log]);

  // Cut: copy the current selection in the input and remove it from the value.
  const ctxCutInput = useCallback(async () => {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      if (start !== end) {
        const cut = commandInput.slice(start, end);
        try { await navigator.clipboard.writeText(cut); } catch { /* ignore */ }
        setCommandInput((commandInput.slice(0, start) + commandInput.slice(end)).toUpperCase());
      }
    }
    setCtxMenu(null);
  }, [commandInput, setCommandInput]);

  // Remove the currently-selected text from the log. The <pre> renders `log`
  // directly, so its textContent maps 1:1 onto the store string — we walk the
  // pre's text nodes to translate the selection's DOM range into character
  // offsets, then splice them out.
  const ctxDeleteLogSelection = useCallback(() => {
    const pre = logRef.current;
    const sel = window.getSelection();
    if (!pre || !sel || sel.rangeCount === 0) { setCtxMenu(null); return; }
    const range = sel.getRangeAt(0);
    if (!pre.contains(range.startContainer) || !pre.contains(range.endContainer)) {
      setCtxMenu(null); return;
    }
    const offsetWithin = (container: Node, offset: number): number => {
      let total = 0;
      const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT, null);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node === container) return total + offset;
        total += node.textContent?.length ?? 0;
      }
      return total;
    };
    const lo = Math.min(offsetWithin(range.startContainer, range.startOffset),
                       offsetWithin(range.endContainer, range.endOffset));
    const hi = Math.max(offsetWithin(range.startContainer, range.startOffset),
                       offsetWithin(range.endContainer, range.endOffset));
    if (lo === hi) { setCtxMenu(null); return; }
    const newLog = log.slice(0, lo) + log.slice(hi);
    const last = newLog.charAt(newLog.length - 1);
    useDiagnosticsStore.setState({
      log: newLog,
      atLineStart: newLog.length === 0 || last === '\n' || last === '\r',
    });
    sel.removeAllRanges();
    setCtxMenu(null);
  }, [log]);

  // Clear: empties the right surface — the log for the log menu, the command
  // field for the input menu.
  const ctxClear = useCallback(() => {
    if (ctxMenu?.target === 'log') {
      clearLog();
    } else if (ctxMenu?.target === 'input') {
      setCommandInput('');
    }
    setCtxMenu(null);
  }, [ctxMenu, clearLog, setCommandInput]);

  // Select-all over the log: build a Range covering the entire <pre> so the
  // user can immediately right-click → Copy afterwards.
  const ctxSelectAllLog = useCallback(() => {
    if (logRef.current) {
      const range = document.createRange();
      range.selectNodeContents(logRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setCtxMenu(null);
  }, []);

  // Paste: insert clipboard text at the input's caret/selection.
  const ctxPasteInput = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const el = inputRef.current;
      const start = el?.selectionStart ?? commandInput.length;
      const end = el?.selectionEnd ?? commandInput.length;
      const next = (commandInput.slice(0, start) + text + commandInput.slice(end)).toUpperCase();
      setCommandInput(next);
      // Move caret after pasted text on next tick.
      requestAnimationFrame(() => {
        if (el) {
          const pos = start + text.length;
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      });
    } catch { /* ignore */ }
    setCtxMenu(null);
  }, [commandInput, setCommandInput]);

  // Dismiss menu on any outside interaction or Escape.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

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
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, target: 'log' });
          }}
          className={`flex-1 p-2 text-xs text-[var(--terminal-fg)] bg-zinc-950 font-mono overflow-auto select-text ${
            wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
          }`}
        >
          {log || <span className="text-zinc-500 italic">{'...'}</span>}
        </pre>

        {/* Channel sidebar */}
        <div className="w-36 border-l border-zinc-700 bg-zinc-900/50 p-2 overflow-y-auto">
          <div className="text-xs text-zinc-400 font-medium mb-2">{t('diag.channels')}</div>
          {LOG_CHANNELS.map((ch) => (
            <label
              key={ch.id}
              className="flex items-center gap-1.5 text-xs text-zinc-300 py-0.5 cursor-pointer select-none hover:text-zinc-100"
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
          ref={inputRef}
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, target: 'input' });
          }}
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

      {/* Right-click context menu */}
      {ctxMenu && (() => {
        // The command input lives at the bottom of the tab — opening downward
        // gets clipped by the window. Anchor by `bottom` for the input so the
        // menu grows upward from the click; for the log, keep the normal
        // downward layout.
        const style: React.CSSProperties = ctxMenu.target === 'input'
          ? { position: 'fixed', left: ctxMenu.x, bottom: window.innerHeight - ctxMenu.y, zIndex: 50 }
          : { position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 50 };
        return (
          <div
            // Stop the global mousedown listener from closing the menu before
            // the menu item's onClick fires.
            onMouseDown={(e) => e.stopPropagation()}
            style={style}
            className="min-w-[140px] bg-zinc-900 border border-zinc-700 rounded shadow-lg py-1 text-xs text-zinc-200"
          >
            {ctxMenu.target === 'input' ? (
              <>
                <button
                  type="button"
                  onClick={ctxCutInput}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-700"
                >
                  {t('diag.ctxCut')}
                </button>
                <button
                  type="button"
                  onClick={ctxCopySelection}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-700"
                >
                  {t('diag.ctxCopy')}
                </button>
                <button
                  type="button"
                  onClick={ctxPasteInput}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-700"
                >
                  {t('diag.ctxPaste')}
                </button>
                <div className="my-1 border-t border-zinc-700" />
                <button
                  type="button"
                  onClick={ctxClear}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-700 text-red-400"
                >
                  {t('diag.ctxClear')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={ctxCopySelection}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-700"
                >
                  {t('diag.ctxCopy')}
                </button>
                <button
                  type="button"
                  onClick={ctxSelectAllLog}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-700"
                >
                  {t('diag.ctxSelectAll')}
                </button>
                <button
                  type="button"
                  onClick={ctxDeleteLogSelection}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-700"
                >
                  {t('diag.ctxDelete')}
                </button>
                <div className="my-1 border-t border-zinc-700" />
                <button
                  type="button"
                  onClick={ctxClear}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-700 text-red-400"
                >
                  {t('diag.ctxClear')}
                </button>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};

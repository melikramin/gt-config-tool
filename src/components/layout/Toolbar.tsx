import { type FC, useState, useEffect, useRef, useCallback } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useThemeStore } from '../../stores/themeStore';
import { useI18n } from '../../i18n';
import type { Locale } from '../../i18n/types';
import type { PortInfo } from '../../types/serial';
import { readAllSettings } from '../../lib/readAllSettings';
import { writeAllSettings } from '../../lib/writeAllSettings';
import { buildTemplateCommands, loadTemplateFromText } from '../../lib/templates';
import { UpdateNotification } from './UpdateNotification';

const PORT_POLL_INTERVAL = 1500;

export const Toolbar: FC = () => {
  const {
    port,
    setPort,
    isConnected,
    setConnected,
    password,
    setPassword,
  } = useConnectionStore();

  const { setLastError, setShowPasswordError } = useStatusStore();
  const isReadingAll = useSettingsStore((s) => s.isReadingAll);
  const isWritingAll = useSettingsStore((s) => s.isWritingAll);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const { t, locale, setLocale } = useI18n();
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const portRef = useRef(port);
  portRef.current = port;

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  const handleReadAll = useCallback(async () => {
    if (!isConnected || isReadingAll) return;
    const ok = await readAllSettings({ onPasswordError: handlePasswordError });
    if (ok) {
      setLastError(t('toolbar.readAllSuccess'), true);
    }
  }, [isConnected, isReadingAll, handlePasswordError, setLastError, t]);

  const handleWriteAll = useCallback(async () => {
    if (!isConnected || isWritingAll || isReadingAll) return;
    const state = useSettingsStore.getState();
    if (!state.serverApn && !state.gpsFilter && !state.protoBuf20) {
      setLastError(t('toolbar.writeAllNoData'));
      return;
    }
    const ok = await writeAllSettings({ onPasswordError: handlePasswordError });
    if (ok) {
      setLastError(t('toolbar.writeAllSuccess'), true);
    }
  }, [isConnected, isWritingAll, isReadingAll, handlePasswordError, setLastError, t]);

  const handleSaveTemplate = useCallback(async () => {
    const lines = buildTemplateCommands();
    if (!lines) {
      setLastError(t('toolbar.templateNoData'));
      return;
    }
    const content = lines.join('\r\n') + '\r\n';
    const saved = await window.dialog.saveFile(content, 'template.txt');
    if (saved) {
      setLastError(t('toolbar.templateSaved'), true);
    }
  }, [setLastError, t]);

  const handleLoadTemplate = useCallback(async () => {
    const content = await window.dialog.openFile();
    if (!content) return; // user cancelled
    try {
      const count = loadTemplateFromText(content);
      if (count > 0) {
        setLastError(t('toolbar.templateLoaded'), true);
      } else {
        setLastError(t('toolbar.templateEmpty'));
      }
    } catch {
      setLastError(t('toolbar.templateParseError'));
    }
  }, [setLastError, t]);

  useEffect(() => {
    if (isConnected) return;

    let active = true;
    const poll = async (): Promise<void> => {
      try {
        const list = await window.serial.listPorts();
        if (!active) return;
        setPorts(list);
        const paths = list.map((p) => p.path);
        if (list.length > 0 && (!portRef.current || !paths.includes(portRef.current))) {
          setPort(list[0].path);
        }
      } catch {
        // silent
      }
    };

    poll();
    const id = setInterval(poll, PORT_POLL_INTERVAL);
    return () => { active = false; clearInterval(id); };
  }, [isConnected, setPort]);

  useEffect(() => {
    const cleanup = window.serial.onConnectionChange((connected) => {
      setConnected(connected);
      setIsConnecting(false);
      if (!connected) {
        useSettingsStore.getState().clearAll();
      }
    });
    return cleanup;
  }, [setConnected]);

  // Close dropdown menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setTemplateMenuOpen(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setSettingsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleConnect = async (): Promise<void> => {
    if (isConnected) {
      try {
        await window.serial.disconnect();
        setConnected(false);
        useSettingsStore.getState().clearAll();
        setLastError('');
      } catch (err) {
        setLastError(`${t('error.disconnect')} ${(err as Error).message}`);
      }
    } else {
      if (!port) {
        setLastError(t('error.selectPort'));
        return;
      }
      setIsConnecting(true);
      try {
        await window.serial.connect(port, 115200);
        setConnected(true);
        setLastError('');
        // Read all settings after connection — runs after StatusTab init
        // commands via the serial command queue (no conflict).
        // Small delay to let StatusTab init commands queue first.
        setTimeout(() => {
          readAllSettings({ onPasswordError: handlePasswordError }).then((ok) => {
            if (ok) {
              useStatusStore.getState().setLastError(t('toolbar.readAllSuccess'));
            }
          });
        }, 500);
      } catch (err) {
        setLastError(`${t('error.connect')} ${(err as Error).message}`);
      } finally {
        setIsConnecting(false);
      }
    }
  };

  const handleRebootClick = (): void => {
    if (!isConnected) return;
    setShowRebootConfirm(true);
  };

  const handleRebootConfirm = async (): Promise<void> => {
    setShowRebootConfirm(false);
    try {
      await window.serial.sendCommand(`$${password};RESET`);
    } catch (err) {
      setLastError(`${t('error.reboot')} ${(err as Error).message}`);
    }
  };

  return (
    <header className="h-12 bg-zinc-900 border-b border-zinc-700 flex items-center gap-3 px-3">
      {/* COM port selector */}
      <select
        value={port}
        onChange={(e) => setPort(e.target.value)}
        disabled={isConnected}
        className="bg-zinc-800 text-zinc-200 text-sm border border-zinc-600 rounded px-2 py-1 disabled:opacity-50"
      >
        {ports.length === 0 && <option value="">{t('toolbar.noPorts')}</option>}
        {ports.map((p) => (
          <option key={p.path} value={p.path}>
            {p.path}
          </option>
        ))}
      </select>

      {/* Connect / Disconnect */}
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className={`text-sm font-medium px-3 py-1 rounded transition-colors ${
          isConnected
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-green-600 hover:bg-green-700 text-white'
        } disabled:opacity-50`}
      >
        {isConnecting ? t('toolbar.connecting') : isConnected ? t('toolbar.disconnect') : t('toolbar.connect')}
      </button>

      {/* Reboot */}
      <button
        onClick={handleRebootClick}
        disabled={!isConnected}
        className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-3 py-1 rounded disabled:opacity-50"
      >
        {t('toolbar.reboot')}
      </button>

      {/* Separator */}
      <div className="w-px h-6 bg-zinc-700" />

      {/* Password (hidden when connected) */}
      {!isConnected && (
        <>
          <div className="flex items-center gap-1">
            <label className="text-zinc-400 text-sm">{t('toolbar.password')}</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-zinc-800 text-zinc-200 text-sm border border-zinc-600 rounded px-2 py-1 w-20"
            />
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-zinc-700" />
        </>
      )}

      {/* Template dropdown */}
      <div className="relative" ref={templateMenuRef}>
        <button
          onClick={() => { setTemplateMenuOpen((v) => !v); setSettingsMenuOpen(false); }}
          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-3 py-1 rounded flex items-center gap-1"
        >
          {t('toolbar.template')}
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4" /></svg>
        </button>
        {templateMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-xl z-50 min-w-[180px]">
            <button
              onClick={() => { setTemplateMenuOpen(false); handleLoadTemplate(); }}
              className="w-full text-left text-sm text-zinc-200 hover:bg-zinc-700 px-3 py-2 rounded-t"
            >
              {t('toolbar.loadTemplate')}
            </button>
            <button
              onClick={() => { setTemplateMenuOpen(false); handleSaveTemplate(); }}
              disabled={!isConnected}
              className="w-full text-left text-sm text-zinc-200 hover:bg-zinc-700 px-3 py-2 rounded-b disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {t('toolbar.saveTemplate')}
            </button>
          </div>
        )}
      </div>

      {/* Settings dropdown */}
      <div className="relative" ref={settingsMenuRef}>
        <button
          onClick={() => { setSettingsMenuOpen((v) => !v); setTemplateMenuOpen(false); }}
          disabled={!isConnected}
          className={`text-sm px-3 py-1 rounded flex items-center gap-1 disabled:opacity-50 ${
            isReadingAll || isWritingAll
              ? 'bg-blue-700 text-white animate-pulse'
              : 'bg-blue-700 hover:bg-blue-600 text-white'
          }`}
        >
          {isReadingAll ? t('toolbar.readingAll') : isWritingAll ? t('toolbar.writingAll') : t('toolbar.settings')}
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4" /></svg>
        </button>
        {settingsMenuOpen && !isReadingAll && !isWritingAll && (
          <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-xl z-50 min-w-[200px]">
            <button
              onClick={() => { setSettingsMenuOpen(false); handleReadAll(); }}
              className="w-full text-left text-sm text-zinc-200 hover:bg-zinc-700 px-3 py-2 rounded-t"
            >
              {t('toolbar.readAll')}
            </button>
            <button
              onClick={() => { setSettingsMenuOpen(false); handleWriteAll(); }}
              className="w-full text-left text-sm text-zinc-200 hover:bg-zinc-700 px-3 py-2 rounded-b"
            >
              {t('toolbar.writeAll')}
            </button>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Updater: icon appears only when an update is available */}
      <UpdateNotification />

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? t('toolbar.themeToLight') : t('toolbar.themeToDark')}
        aria-label={theme === 'dark' ? t('toolbar.themeToLight') : t('toolbar.themeToDark')}
        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600 rounded p-1.5 flex items-center justify-center"
      >
        {theme === 'dark' ? (
          /* Sun — click to go light */
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          /* Moon — click to go dark */
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      {/* Language switcher */}
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="bg-zinc-800 text-zinc-200 text-sm border border-zinc-600 rounded px-1 py-1"
      >
        <option value="en">EN</option>
        <option value="ru">RU</option>
      </select>
      {/* Reboot confirmation modal */}
      {showRebootConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-5 max-w-sm w-full mx-4">
            <h3 className="text-zinc-100 text-base font-semibold mb-2">{t('confirm.reboot')}</h3>
            <p className="text-zinc-400 text-sm mb-5">{t('confirm.rebootMessage')}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRebootConfirm(false)}
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
              >
                {t('confirm.cancel')}
              </button>
              <button
                onClick={handleRebootConfirm}
                className="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-1.5 rounded"
              >
                {t('confirm.yes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

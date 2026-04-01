import { type FC, useState, useEffect, useRef } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import type { Locale } from '../../i18n/types';
import type { PortInfo } from '../../types/serial';

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

  const { setLastError } = useStatusStore();
  const { t, locale, setLocale } = useI18n();
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const portRef = useRef(port);
  portRef.current = port;

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
    });
    return cleanup;
  }, [setConnected]);

  const handleConnect = async (): Promise<void> => {
    if (isConnected) {
      try {
        await window.serial.disconnect();
        setConnected(false);
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

      {/* Template buttons */}
      <button
        disabled={!isConnected}
        className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-3 py-1 rounded disabled:opacity-50"
      >
        {t('toolbar.loadTemplate')}
      </button>
      <button
        disabled={!isConnected}
        className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-3 py-1 rounded disabled:opacity-50"
      >
        {t('toolbar.saveTemplate')}
      </button>

      {/* Spacer */}
      <div className="flex-1" />

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

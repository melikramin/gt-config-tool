import { type FC, useState, useCallback, useEffect, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import {
  RS_PORTS,
  RS_BAUD_RATES,
  RS_DATA_BITS,
  RS_STOP_BITS,
  RS_PARITY,
  RS_DEVICE_TYPES,
  RS_DEVICE_DEFAULTS,
  RS_WRITE_TIMEOUT_MS,
  EMPTY_RS_PORT,
  buildRsReadCmd,
  buildRsWriteCmd,
  parseRsResponse,
  type RsPortParams,
  type RsPortName,
} from '../../lib/commands';

const FREE_RETRY_COUNT = 2;      // retries on DE when clearing a busy port
const FREE_RETRY_DELAY_MS = 800; // wait between retries

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const FREE_DEVICE_TYPE = '0'; // NO — always selectable on every port.

function isErrorResponse(r: string): boolean {
  const t = r.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
}
const isPasswordError = (r: string) => r.trim().endsWith(';PE');
// FE on a specific RS port means the hardware doesn't have that port
// (e.g. GT-7 has no RS232B/RS485B). Hide the row instead of erroring out.
const isFormatError = (r: string) => r.trim().endsWith(';FE');

const Select: FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  className?: string;
}> = ({ value, onChange, disabled, options, className }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-40 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value} disabled={o.disabled}>
        {o.label}
      </option>
    ))}
  </select>
);

export const RsInterfacesTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const [ports, setPorts] = useState<RsPortParams[]>(() =>
    RS_PORTS.map(() => ({ ...EMPTY_RS_PORT, extra: [] })),
  );
  const [available, setAvailable] = useState<boolean[]>(() => RS_PORTS.map(() => true));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!isConnected) {
      setPorts(RS_PORTS.map(() => ({ ...EMPTY_RS_PORT, extra: [] })));
      setAvailable(RS_PORTS.map(() => true));
      setStatusMsg('');
    }
  }, [isConnected]);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  const readAll = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setStatusMsg(t('rs.reading'));
    try {
      const next: RsPortParams[] = [];
      const avail: boolean[] = [];
      for (let i = 0; i < RS_PORTS.length; i++) {
        const name = RS_PORTS[i] as RsPortName;
        const resp = await window.serial.sendCommand(buildRsReadCmd(password, name));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isFormatError(resp)) {
          // Port absent on this hardware — hide row, preserve empty defaults.
          next.push({ ...EMPTY_RS_PORT, extra: [] });
          avail.push(false);
          continue;
        }
        if (isErrorResponse(resp)) throw new Error(`${name}: ${resp.trim()}`);
        const p = parseRsResponse(resp, name);
        if (!p) throw new Error(`${name}: malformed response`);
        next.push(p);
        avail.push(true);
      }
      setPorts(next);
      setAvailable(avail);
      setStatusMsg(t('rs.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('rs.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected) readAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const saveAll = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('rs.saving'));
    try {
      // Write freed ports (deviceType=0) first so a released device type is available
      // when another port tries to claim it in the same save.
      const freeIdx: number[] = [];
      const busyIdx: number[] = [];
      ports.forEach((p, i) => {
        if (!available[i]) return; // skip ports that don't exist on this hardware
        (p.deviceType === FREE_DEVICE_TYPE ? freeIdx : busyIdx).push(i);
      });
      const order = [...freeIdx, ...busyIdx];
      for (const i of order) {
        const name = RS_PORTS[i] as RsPortName;
        setStatusMsg(`${t('rs.savingPort')} ${name}...`);
        const cmd = buildRsWriteCmd(password, name, ports[i]);
        const isFree = ports[i].deviceType === FREE_DEVICE_TYPE;

        // Freeing a busy RS port can answer DE on the first try (firmware is still
        // tearing down the old device driver). Retry a couple of times before failing.
        let resp = '';
        let attempt = 0;
        const maxAttempts = isFree ? 1 + FREE_RETRY_COUNT : 1;
        while (attempt < maxAttempts) {
          attempt++;
          resp = await window.serial.sendCommand(cmd, RS_WRITE_TIMEOUT_MS);
          if (isPasswordError(resp)) { await handlePasswordError(); return; }
          if (!isErrorResponse(resp)) break;
          if (attempt < maxAttempts) await sleep(FREE_RETRY_DELAY_MS);
        }
        if (isErrorResponse(resp)) throw new Error(`${name}: ${resp.trim()}`);
      }
      setStatusMsg(t('rs.saveSuccess'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg(`${t('rs.saveError')}: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, ports, handlePasswordError, t]);

  const updatePort = useCallback(<K extends keyof RsPortParams>(row: number, key: K, value: RsPortParams[K]) => {
    setPorts((prev) => {
      const next = prev.slice();
      next[row] = { ...next[row], [key]: value };
      if (key === 'deviceType') {
        // Clearing a port: drop inherited `extra` fields so they don't leak back
        // on the next save if the user reassigns a real device type.
        if (value === FREE_DEVICE_TYPE) {
          next[row].extra = [];
        } else {
          // Some device types have fixed serial parameters (e.g. TOPAZ = 4800/7/2/Even).
          // Apply them automatically so the user doesn't have to set them by hand.
          const preset = RS_DEVICE_DEFAULTS[value as string];
          if (preset) next[row] = { ...next[row], ...preset };
        }
      }
      return next;
    });
  }, []);

  /** Device types already taken on *other* ports (NO/0 stays free everywhere). */
  const takenElsewhere = useMemo(() => {
    const sets: Array<Set<string>> = [];
    for (let i = 0; i < ports.length; i++) {
      const s = new Set<string>();
      for (let j = 0; j < ports.length; j++) {
        if (j === i) continue;
        if (!available[j]) continue;
        const v = ports[j].deviceType;
        if (v && v !== FREE_DEVICE_TYPE) s.add(v);
      }
      sets.push(s);
    }
    return sets;
  }, [ports, available]);

  const busy = loading || saving;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.rsInterfaces')}</h2>
        <p className="text-zinc-500 mt-2">{t('rs.notConnected')}</p>
      </div>
    );
  }

  const baudOptions = RS_BAUD_RATES.map((v) => ({ value: v, label: v }));

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <h2 className="text-lg font-semibold text-zinc-200">{t('tab.rsInterfaces')}</h2>

      <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
        <div className="overflow-x-auto">
          <table className="text-xs text-zinc-200">
            <thead>
              <tr className="text-zinc-400">
                <th className="text-left font-normal pr-3 pb-2 w-20">{t('rs.colPort')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('rs.colDeviceType')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('rs.colBaudRate')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('rs.colDataBits')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('rs.colStopBits')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('rs.colParity')}</th>
              </tr>
            </thead>
            <tbody>
              {ports.map((p, idx) => {
                if (!available[idx]) return null;
                const taken = takenElsewhere[idx];
                const deviceOptions = RS_DEVICE_TYPES
                  .filter((opt) => opt.value === p.deviceType || !taken.has(opt.value))
                  .map((opt) => ({
                    value: opt.value,
                    label: opt.value === FREE_DEVICE_TYPE
                      ? t('rs.deviceNone')
                      : `${opt.value} — ${opt.label}`,
                  }));
                const paramsDisabled = busy || p.deviceType === FREE_DEVICE_TYPE;
                return (
                  <tr key={RS_PORTS[idx]} className="align-middle">
                    <td className="pr-3 py-1 text-zinc-300 font-mono">{RS_PORTS[idx]}</td>
                    <td className="px-2 py-1">
                      <Select
                        value={p.deviceType}
                        onChange={(v) => updatePort(idx, 'deviceType', v)}
                        disabled={busy}
                        options={deviceOptions}
                        className="w-44"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={p.baudRate}
                        onChange={(v) => updatePort(idx, 'baudRate', v)}
                        disabled={paramsDisabled}
                        options={baudOptions}
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={p.dataBits}
                        onChange={(v) => updatePort(idx, 'dataBits', v)}
                        disabled={paramsDisabled}
                        options={RS_DATA_BITS}
                        className="w-20"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={p.stopBits}
                        onChange={(v) => updatePort(idx, 'stopBits', v)}
                        disabled={paramsDisabled}
                        options={RS_STOP_BITS}
                        className="w-20"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Select
                        value={p.parity}
                        onChange={(v) => updatePort(idx, 'parity', v)}
                        disabled={paramsDisabled}
                        options={RS_PARITY}
                        className="w-20"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readAll}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('rs.reading') : t('common.read')}
        </button>
        <button
          onClick={saveAll}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('rs.saving') : t('common.save')}
        </button>
        {saving && (
          <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-500 border-t-blue-400 animate-spin" />
        )}
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>
      {saving && (
        <p className="text-[11px] text-amber-400/80">{t('rs.waitHint')}</p>
      )}
    </div>
  );
};

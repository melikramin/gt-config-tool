import { type FC, useState, useEffect, useCallback } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useI18n } from '../../i18n';
import { buildEthInfoCmd, buildEthReadCmd, buildEthWriteCmd } from '../../lib/commands';
import {
  parseEthInfo,
  parseEthSettings,
  ethStatusText,
  type EthInfoData,
  type EthSettingsData,
} from '../../lib/parsers';

/**
 * Ethernet settings (GT-2 family). `ETH;GET` / `ETH;SET` hold the stored
 * settings (enable, DHCP or static IP/mask/gateway/DNS); plain `ETH` returns
 * the live state (status bits, MAC, assigned address, lease) shown read-only.
 */

const EMPTY_ETHERNET: EthSettingsData = {
  enabled: '1',
  dhcp: '1',
  ip: '',
  mask: '',
  gateway: '',
  dns1: '',
  dns2: '',
};

const ENABLE_OPTIONS = [
  { value: '1', labelKey: 'eth.enabledOn' as const },
  { value: '0', labelKey: 'eth.enabledOff' as const },
];

const DHCP_OPTIONS = [
  { value: '1', labelKey: 'wifi.dhcpOn' as const },
  { value: '0', labelKey: 'wifi.dhcpOff' as const },
];

// ---- Helpers ----

function isErrorResponse(response: string): boolean {
  const trimmed = response.trim();
  return trimmed.endsWith(';CE') || trimmed.endsWith(';PE') || trimmed.endsWith(';FE') || trimmed.endsWith(';DE');
}

function isPasswordError(response: string): boolean {
  return response.trim().endsWith(';PE');
}

// ---- UI components ----

const InputField: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, disabled, placeholder }) => (
  <div className="flex items-center gap-2 mb-2">
    <label className="text-zinc-400 text-xs w-24 shrink-0">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none"
    />
  </div>
);

const SelectField: FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ label, value, options, onChange, disabled }) => (
  <div className="flex items-center gap-2 mb-2">
    <label className="text-zinc-400 text-xs w-24 shrink-0">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

const InfoRow: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center gap-2 mb-1.5 text-xs">
    <span className="text-zinc-400 w-24 shrink-0">{label}</span>
    <span className="text-zinc-200 font-mono select-text">{value || '—'}</span>
  </div>
);

// ---- Main component ----

export const EthernetTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t, locale } = useI18n();

  const storeEth = useSettingsStore((s) => s.ethSettings);

  const [data, setData] = useState<EthSettingsData>(() => storeEth ?? EMPTY_ETHERNET);
  const [info, setInfo] = useState<EthInfoData | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Populate from store when readAllSettings / template load finishes
  useEffect(() => {
    if (storeEth) setData(storeEth);
  }, [storeEth]);

  useEffect(() => {
    if (!isConnected) {
      setData(EMPTY_ETHERNET);
      setInfo(null);
      setStatusMsg('');
    }
  }, [isConnected]);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  /** Live state (`ETH`). Returns false on password error. */
  const readInfo = useCallback(async (): Promise<boolean> => {
    const resp = await window.serial.sendCommand(buildEthInfoCmd(password));
    if (isPasswordError(resp)) { await handlePasswordError(); return false; }
    setInfo(isErrorResponse(resp) ? null : parseEthInfo(resp));
    return true;
  }, [password, handlePasswordError]);

  const readAll = useCallback(async () => {
    if (!isConnected) return;
    setBusy(true);
    setStatusMsg(t('eth.reading'));
    try {
      const resp = await window.serial.sendCommand(buildEthReadCmd(password));
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) {
        setStatusMsg(`${t('eth.readError')}: ${resp.trim()}`);
        return;
      }
      const settings = parseEthSettings(resp);
      setData(settings);
      useSettingsStore.getState().setEthSettings(settings);
      if (!(await readInfo())) return;
      setStatusMsg(t('eth.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('eth.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [isConnected, password, handlePasswordError, readInfo, t]);

  useEffect(() => {
    if (!isConnected) return;
    if (useSettingsStore.getState().ethSettings) {
      // Settings already read (read-all / earlier visit) — refresh live state only.
      readInfo().catch(() => { /* shown as empty info */ });
    } else {
      readAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const refreshInfo = useCallback(async () => {
    setBusy(true);
    try {
      await readInfo();
    } catch (err) {
      setStatusMsg(`${t('eth.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [readInfo, t]);

  const save = useCallback(async () => {
    if (!isConnected) return;
    setBusy(true);
    setStatusMsg(t('eth.saving'));
    try {
      const resp = await window.serial.sendCommand(buildEthWriteCmd(password, data));
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) {
        setStatusMsg(`${t('eth.saveError')}: ${resp.trim()}`);
        return;
      }
      useSettingsStore.getState().setEthSettings(data);
      setStatusMsg(t('eth.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('eth.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [isConnected, password, data, handlePasswordError, t]);

  const update = (patch: Partial<EthSettingsData>): void => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.ethernet')}</h2>
        <p className="text-zinc-500 mt-2">{t('eth.notConnected')}</p>
      </div>
    );
  }

  const enableOptions = ENABLE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const dhcpOptions = DHCP_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const staticDisabled = busy || data.dhcp === '1';

  return (
    <div className="p-4 flex gap-4 items-start flex-wrap">
      <div className="bg-zinc-900 border border-zinc-700 rounded p-3 w-full max-w-md">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">
          {t('eth.settings')}
        </h3>

        <SelectField label={t('eth.enabled')} value={data.enabled} options={enableOptions} onChange={(v) => update({ enabled: v })} disabled={busy} />
        <SelectField label={t('wifi.dhcp')} value={data.dhcp} options={dhcpOptions} onChange={(v) => update({ dhcp: v })} disabled={busy} />
        <InputField label={t('wifi.ip')} value={data.ip} onChange={(v) => update({ ip: v })} disabled={staticDisabled} placeholder="192.168.1.100" />
        <InputField label={t('wifi.mask')} value={data.mask} onChange={(v) => update({ mask: v })} disabled={staticDisabled} placeholder="255.255.255.0" />
        <InputField label={t('wifi.gateway')} value={data.gateway} onChange={(v) => update({ gateway: v })} disabled={staticDisabled} />
        <InputField label={t('wifi.dns1')} value={data.dns1} onChange={(v) => update({ dns1: v })} disabled={staticDisabled} />
        <InputField label={t('wifi.dns2')} value={data.dns2} onChange={(v) => update({ dns2: v })} disabled={staticDisabled} />

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={readAll}
            disabled={busy}
            className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.read')}
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.save')}
          </button>
        </div>
        {statusMsg && <p className="text-xs text-zinc-400 mt-3">{statusMsg}</p>}
      </div>

      <div className="bg-zinc-900 border border-zinc-700 rounded p-3 w-full max-w-sm">
        <div className="flex items-center justify-between mb-3 border-b border-zinc-700 pb-1">
          <h3 className="text-sm font-semibold text-zinc-300">{t('eth.info')}</h3>
          <button
            onClick={refreshInfo}
            disabled={busy}
            className="px-2 py-0.5 text-[11px] rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('eth.refresh')}
          </button>
        </div>
        <InfoRow label={t('eth.state')} value={info ? ethStatusText(info.status, locale) : ''} />
        <InfoRow label={t('eth.mac')} value={info?.mac ?? ''} />
        <InfoRow label={t('eth.ipNet')} value={info?.ip ?? ''} />
        <InfoRow label={t('wifi.mask')} value={info?.mask ?? ''} />
        <InfoRow label={t('wifi.gateway')} value={info?.gateway ?? ''} />
        <InfoRow label={t('eth.dns')} value={info?.dns ?? ''} />
        <InfoRow
          label={t('eth.lease')}
          value={info && info.dhcp === '1' && info.leaseTime ? `${info.leaseTime} ${t('eth.leaseSec')}` : ''}
        />
      </div>
    </div>
  );
};

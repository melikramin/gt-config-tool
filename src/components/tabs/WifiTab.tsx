import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import {
  buildWifiCountCmd,
  buildWifiNetReadCmd,
  buildWifiNetWriteCmd,
  buildWifiDeleteCmd,
  buildWifiDeleteAllCmd,
  WIFI_MAX_NETWORKS,
  type WifiNetworkParams,
} from '../../lib/commands';
import { parseWifiCount, parseWifiNetwork, type WifiNetworkData } from '../../lib/parsers';

// ---- Types ----

interface NetworkEntry {
  /** Stable UI id — unchanged across re-renders and list updates. */
  uid: string;
  /** Device index (1-based) for existing networks, `null` for unsaved draft. */
  index: number | null;
  data: WifiNetworkData;
}

let draftCounter = 0;
const nextDraftUid = () => `draft-${++draftCounter}`;

const EMPTY_NETWORK: WifiNetworkData = {
  channel: '0',
  ssid: '',
  auth: '1',
  encrypt: '4',
  key: '',
  ipMode: '1',
  ip: '',
  mask: '',
  gateway: '',
  dns1: '',
  dns2: '',
};

const ENCRYPT_OPTIONS = [
  { value: '0', labelKey: 'wifi.encryptNone' as const },
  { value: '1', labelKey: 'wifi.encryptWep64' as const },
  { value: '2', labelKey: 'wifi.encryptWep128' as const },
  { value: '3', labelKey: 'wifi.encryptWpa' as const },
  { value: '4', labelKey: 'wifi.encryptWpa2' as const },
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

function toParams(d: WifiNetworkData): WifiNetworkParams {
  return {
    ssid: d.ssid,
    encrypt: d.encrypt,
    key: d.key,
    ipMode: d.ipMode,
    ip: d.ip,
    mask: d.mask,
    gateway: d.gateway,
    dns1: d.dns1,
    dns2: d.dns2,
  };
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

// ---- Main component ----

export const WifiTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const [networks, setNetworks] = useState<NetworkEntry[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!isConnected) {
      setNetworks([]);
      setSelectedUid(null);
      setStatusMsg('');
    }
  }, [isConnected]);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  // ---- Read all ----

  const readAll = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setStatusMsg(t('wifi.reading'));

    try {
      const countResp = await window.serial.sendCommand(buildWifiCountCmd(password));
      if (isPasswordError(countResp)) { await handlePasswordError(); return; }
      const count = isErrorResponse(countResp) ? 0 : parseWifiCount(countResp);

      const entries: NetworkEntry[] = [];
      const max = Math.min(count, WIFI_MAX_NETWORKS);
      for (let i = 1; i <= max; i++) {
        const resp = await window.serial.sendCommand(buildWifiNetReadCmd(password, i));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) continue;
        entries.push({ uid: `idx-${i}`, index: i, data: parseWifiNetwork(resp) });
      }

      setNetworks(entries);
      setSelectedUid(entries.length > 0 ? entries[0]!.uid : null);
      setStatusMsg(t('wifi.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('wifi.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected) readAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // ---- Selection ----

  const selected = networks.find((e) => e.uid === selectedUid) ?? null;

  const updateSelected = useCallback((patch: Partial<WifiNetworkData>) => {
    if (!selectedUid) return;
    setNetworks((prev) => prev.map((e) => e.uid === selectedUid ? { ...e, data: { ...e.data, ...patch } } : e));
  }, [selectedUid]);

  // ---- Add draft ----

  const addDraft = useCallback(() => {
    if (networks.length >= WIFI_MAX_NETWORKS) {
      setStatusMsg(t('wifi.maxReached'));
      return;
    }
    // Safety: clear any stuck busy/loading so the form is guaranteed editable.
    setLoading(false);
    setBusy(false);
    const entry: NetworkEntry = { uid: nextDraftUid(), index: null, data: { ...EMPTY_NETWORK } };
    setNetworks((prev) => [...prev, entry]);
    setSelectedUid(entry.uid);
    setStatusMsg('');
  }, [networks.length, t]);

  // ---- Save (ADD or EDIT) ----

  const saveSelected = useCallback(async () => {
    if (!isConnected || !selected) return;
    if (!selected.data.ssid.trim()) {
      setStatusMsg(t('wifi.ssidRequired'));
      return;
    }
    setBusy(true);
    setStatusMsg(t('wifi.saving'));

    try {
      const params = toParams(selected.data);
      // For a new draft, write into the next free slot (count + 1).
      const targetIndex = selected.index ?? (networks.filter((e) => e.index !== null).length + 1);
      const cmd = buildWifiNetWriteCmd(password, targetIndex, params);

      const resp = await window.serial.sendCommand(cmd);
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) {
        setStatusMsg(`${t('wifi.saveError')}: ${resp.trim()}`);
        return;
      }

      setStatusMsg(t('wifi.saveSuccess'));
      await readAll();
    } catch (err) {
      setStatusMsg(`${t('wifi.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [isConnected, selected, networks, password, handlePasswordError, readAll, t]);

  // ---- Delete selected ----

  const deleteSelected = useCallback(async () => {
    if (!isConnected || !selected) return;

    // Draft: just drop locally.
    if (selected.index === null) {
      setNetworks((prev) => prev.filter((e) => e.uid !== selected.uid));
      setSelectedUid(null);
      return;
    }

    if (!window.confirm(t('wifi.confirmDelete'))) return;

    setBusy(true);
    setStatusMsg(t('wifi.deleting'));
    try {
      const resp = await window.serial.sendCommand(buildWifiDeleteCmd(password, selected.index));
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) {
        setStatusMsg(`${t('wifi.deleteError')}: ${resp.trim()}`);
        return;
      }
      setStatusMsg(t('wifi.deleteSuccess'));
      await readAll();
    } catch (err) {
      setStatusMsg(`${t('wifi.deleteError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [isConnected, selected, password, handlePasswordError, readAll, t]);

  // ---- Delete all ----

  const deleteAll = useCallback(async () => {
    if (!isConnected) return;
    if (!window.confirm(t('wifi.confirmDeleteAll'))) return;

    setBusy(true);
    setStatusMsg(t('wifi.deleting'));
    try {
      const resp = await window.serial.sendCommand(buildWifiDeleteAllCmd(password));
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) {
        setStatusMsg(`${t('wifi.deleteError')}: ${resp.trim()}`);
        return;
      }
      setStatusMsg(t('wifi.deleteSuccess'));
      await readAll();
    } catch (err) {
      setStatusMsg(`${t('wifi.deleteError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [isConnected, password, handlePasswordError, readAll, t]);

  // ---- Render ----

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.wifi')}</h2>
        <p className="text-zinc-500 mt-2">{t('wifi.notConnected')}</p>
      </div>
    );
  }

  const anyBusy = loading || busy;
  const encryptOptions = ENCRYPT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const dhcpOptions = DHCP_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const dhcpOn = selected?.data.ipMode === '1';

  return (
    <div className="p-4 flex gap-4 max-w-4xl">
      {/* Left: networks list */}
      <div className="w-64 shrink-0 bg-zinc-900 border border-zinc-700 rounded p-3 flex flex-col">
        <h3 className="text-sm font-semibold text-zinc-300 mb-2 border-b border-zinc-700 pb-1">
          {t('wifi.networks')} ({networks.length}/{WIFI_MAX_NETWORKS})
        </h3>

        <div className="flex-1 overflow-y-auto mb-2 min-h-[200px]">
          {networks.length === 0 ? (
            <p className="text-zinc-500 text-xs p-2">{t('wifi.noNetworks')}</p>
          ) : (
            <ul className="space-y-1">
              {networks.map((e) => {
                const active = e.uid === selectedUid;
                const label = e.index !== null
                  ? `${e.index}. ${e.data.ssid || '—'}`
                  : `★ ${e.data.ssid || t('wifi.network')}`;
                return (
                  <li key={e.uid}>
                    <button
                      onClick={() => setSelectedUid(e.uid)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={addDraft}
            disabled={anyBusy || networks.length >= WIFI_MAX_NETWORKS}
            className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('wifi.add')}
          </button>
          <button
            onClick={readAll}
            disabled={anyBusy}
            className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('wifi.reading') : t('common.read')}
          </button>
          <button
            onClick={deleteAll}
            disabled={anyBusy || networks.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded bg-red-900/60 text-red-200 hover:bg-red-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('wifi.deleteAll')}
          </button>
        </div>
      </div>

      {/* Right: edit form */}
      <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded p-3">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">
          {t('wifi.settings')}
          {selected && selected.index !== null && ` — ${t('wifi.network')} ${selected.index}`}
        </h3>

        {!selected ? (
          <p className="text-zinc-500 text-xs">{t('wifi.selectNetwork')}</p>
        ) : (
          <>
            <InputField
              label={t('wifi.ssid')}
              value={selected.data.ssid}
              onChange={(v) => updateSelected({ ssid: v })}
              disabled={anyBusy}
            />
            <InputField
              label={t('wifi.key')}
              value={selected.data.key}
              onChange={(v) => updateSelected({ key: v })}
              disabled={anyBusy}
            />
            <SelectField
              label={t('wifi.encrypt')}
              value={selected.data.encrypt}
              options={encryptOptions}
              onChange={(v) => updateSelected({ encrypt: v })}
              disabled={anyBusy}
            />
            <SelectField
              label={t('wifi.dhcp')}
              value={selected.data.ipMode}
              options={dhcpOptions}
              onChange={(v) => updateSelected({ ipMode: v })}
              disabled={anyBusy}
            />

            <InputField
              label={t('wifi.ip')}
              value={selected.data.ip}
              onChange={(v) => updateSelected({ ip: v })}
              disabled={anyBusy || dhcpOn}
            />
            <InputField
              label={t('wifi.mask')}
              value={selected.data.mask}
              onChange={(v) => updateSelected({ mask: v })}
              disabled={anyBusy || dhcpOn}
            />
            <InputField
              label={t('wifi.gateway')}
              value={selected.data.gateway}
              onChange={(v) => updateSelected({ gateway: v })}
              disabled={anyBusy || dhcpOn}
            />
            <InputField
              label={t('wifi.dns1')}
              value={selected.data.dns1}
              onChange={(v) => updateSelected({ dns1: v })}
              disabled={anyBusy || dhcpOn}
            />
            <InputField
              label={t('wifi.dns2')}
              value={selected.data.dns2}
              onChange={(v) => updateSelected({ dns2: v })}
              disabled={anyBusy || dhcpOn}
            />

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={saveSelected}
                disabled={anyBusy}
                className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? t('wifi.saving') : t('common.save')}
              </button>
              <button
                onClick={deleteSelected}
                disabled={anyBusy}
                className="px-4 py-1.5 text-xs font-medium rounded bg-red-900/60 text-red-200 hover:bg-red-800/60 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('wifi.delete')}
              </button>
            </div>
          </>
        )}

        {statusMsg && (
          <p className="text-xs text-zinc-400 mt-3">{statusMsg}</p>
        )}
      </div>
    </div>
  );
};

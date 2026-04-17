import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useI18n } from '../../i18n';
import {
  buildApnReadCmd,
  buildApnWriteCmd,
  buildServerReadCmd,
  buildServerWriteCmd,
} from '../../lib/commands';
import { parseApn, parseServer, type ApnData } from '../../lib/parsers';

// ---- Types ----

interface ServerFormData {
  ip: string;
  port: string;
  channel: string;
  protocol: string;
}

interface ServerTabState {
  apn: ApnData;
  server: ServerFormData;
}

const EMPTY_APN: ApnData = { name: '', login: '', password: '' };
const EMPTY_SERVER: ServerFormData = { ip: '', port: '', channel: '0', protocol: '1' };

const INITIAL_STATE: ServerTabState = {
  apn: { ...EMPTY_APN },
  server: { ...EMPTY_SERVER },
};

const CHANNEL_OPTIONS = [
  { value: '0', labelKey: 'server.channelGsm' as const },
  { value: '1', labelKey: 'server.channelWifi' as const },
  { value: '2', labelKey: 'server.channelGsmWifi' as const },
  { value: '3', labelKey: 'server.channelWifiGsm' as const },
];

const PROTOCOL_OPTIONS = [
  { value: '0', labelKey: 'server.protoIps' as const },
  { value: '1', labelKey: 'server.protoGt9' as const },
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

const Panel: FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-zinc-900 border border-zinc-700 rounded p-3 ${className ?? ''}`}>
    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">{title}</h3>
    {children}
  </div>
);

const InputField: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, disabled, placeholder }) => (
  <div className="flex items-center gap-2 mb-2">
    <label className="text-zinc-400 text-xs w-28 shrink-0">{label}</label>
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

const InlineInput: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  widthClass?: string;
}> = ({ label, value, onChange, disabled, placeholder, widthClass = 'w-40' }) => (
  <div className="flex flex-col gap-1">
    <label className="text-zinc-400 text-[10px] uppercase tracking-wide">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={`${widthClass} bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none`}
    />
  </div>
);

const InlineSelect: FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  widthClass?: string;
}> = ({ label, value, options, onChange, disabled, widthClass = 'w-32' }) => (
  <div className="flex flex-col gap-1">
    <label className="text-zinc-400 text-[10px] uppercase tracking-wide">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${widthClass} bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
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
    <label className="text-zinc-400 text-xs w-28 shrink-0">{label}</label>
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

export const ServerTab: FC = () => {
  const { password, isConnected, deviceImei, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const storeApn = useSettingsStore((s) => s.serverApn);
  const storeSrv = useSettingsStore((s) => s.serverData);

  const [state, setState] = useState<ServerTabState>(() => {
    if (storeApn && storeSrv) {
      return { apn: storeApn, server: { ip: storeSrv.ip, port: storeSrv.port, channel: storeSrv.channel, protocol: storeSrv.protocol } };
    }
    return INITIAL_STATE;
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Populate from store when readAllSettings finishes
  useEffect(() => {
    if (storeApn && storeSrv) {
      setState({ apn: storeApn, server: { ip: storeSrv.ip, port: storeSrv.port, channel: storeSrv.channel, protocol: storeSrv.protocol } });
    }
  }, [storeApn, storeSrv]);

  // Reset on disconnect
  useEffect(() => {
    if (!isConnected) {
      setState(INITIAL_STATE);
      setStatusMsg('');
    }
  }, [isConnected]);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try {
      await window.serial.disconnect();
    } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  // ---- Read ----

  const readSettings = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setStatusMsg(t('server.reading'));

    try {
      // Read APN
      const apnResponse = await window.serial.sendCommand(buildApnReadCmd(password));
      if (isPasswordError(apnResponse)) {
        await handlePasswordError();
        return;
      }
      const apnData = isErrorResponse(apnResponse) ? { ...EMPTY_APN } : parseApn(apnResponse);

      // Read SERVER1
      const srv1Response = await window.serial.sendCommand(buildServerReadCmd(password, 1));
      if (isPasswordError(srv1Response)) {
        await handlePasswordError();
        return;
      }
      const srv1 = isErrorResponse(srv1Response) ? null : parseServer(srv1Response);

      setState({
        apn: apnData,
        server: srv1
          ? { ip: srv1.ip, port: srv1.port, channel: srv1.channel, protocol: srv1.protocol }
          : { ...EMPTY_SERVER },
      });

      // Update central store
      useSettingsStore.getState().setServerSettings(apnData, srv1 || {
        serverProp: '0F', protoProp: '01', ip: '', port: '', login: '', pass: '',
        timeout1: '10', timeout2: '0', timeout3: '120', timeout4: '30',
        ipProto: '1', channel: '0', protocol: '1',
      });

      setStatusMsg(t('server.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('server.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  // Auto-read on connect only if store doesn't have data yet
  useEffect(() => {
    if (isConnected && !useSettingsStore.getState().serverApn) {
      readSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // ---- Save ----

  const saveSettings = useCallback(async () => {
    if (!isConnected) return;

    // IMEI is required for SERVER write
    if (!deviceImei || deviceImei === '0') {
      setStatusMsg(t('server.imeiNotReady'));
      return;
    }

    setSaving(true);
    setStatusMsg(t('server.saving'));

    try {
      // Write APN
      const apnResp = await window.serial.sendCommand(
        buildApnWriteCmd(password, state.apn.name, state.apn.login, state.apn.password),
      );
      if (isPasswordError(apnResp)) {
        await handlePasswordError();
        return;
      }

      // Write SERVER1
      const srv1Resp = await window.serial.sendCommand(
        buildServerWriteCmd(password, 1, state.server.ip, state.server.port, deviceImei, state.server.channel, state.server.protocol),
      );
      if (isPasswordError(srv1Resp)) {
        await handlePasswordError();
        return;
      }

      setStatusMsg(t('server.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('server.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, deviceImei, state, handlePasswordError, t]);

  // ---- State updaters ----

  const updateApn = useCallback((field: keyof ApnData, value: string) => {
    setState((prev) => ({ ...prev, apn: { ...prev.apn, [field]: value } }));
  }, []);

  const updateServer = useCallback((field: keyof ServerFormData, value: string) => {
    setState((prev) => ({ ...prev, server: { ...prev.server, [field]: value } }));
  }, []);

  const busy = loading || saving;

  const channelOptions = CHANNEL_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const protocolOptions = PROTOCOL_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));

  // ---- Render ----

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.server')}</h2>
        <p className="text-zinc-500 mt-2">{t('server.notConnected')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      {/* APN Panel — lighter background to distinguish from server */}
      <Panel title={t('server.apnSettings')} className="bg-zinc-900/60 border-zinc-600">
        <InputField
          label={t('server.apnName')}
          value={state.apn.name}
          onChange={(v) => updateApn('name', v)}
          disabled={busy}
          placeholder="internet.mts.ru"
        />
        <InputField
          label={t('server.apnLogin')}
          value={state.apn.login}
          onChange={(v) => updateApn('login', v)}
          disabled={busy}
          placeholder="mts"
        />
        <InputField
          label={t('server.apnPassword')}
          value={state.apn.password}
          onChange={(v) => updateApn('password', v)}
          disabled={busy}
          placeholder="mts"
        />
      </Panel>

      {/* Server 1 & Server 2 side by side */}
      <div className="flex gap-3">
        <Panel title={`${t('server.server')} 1`} className="flex-1">
          <div className="flex flex-wrap items-end gap-2">
            <InlineInput
              label={t('server.ip')}
              value={state.server.ip}
              onChange={(v) => updateServer('ip', v)}
              disabled={busy}
              placeholder="s4.geotek.online"
              widthClass="w-56"
            />
            <InlineInput
              label={t('server.port')}
              value={state.server.port}
              onChange={(v) => updateServer('port', v)}
              disabled={busy}
              placeholder="5601"
              widthClass="w-16"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 mt-2">
            <InlineSelect
              label={t('server.channel')}
              value={state.server.channel}
              options={channelOptions}
              onChange={(v) => updateServer('channel', v)}
              disabled={busy}
              widthClass="w-28"
            />
            <InlineSelect
              label={t('server.protocol')}
              value={state.server.protocol}
              options={protocolOptions}
              onChange={(v) => updateServer('protocol', v)}
              disabled={busy}
              widthClass="w-28"
            />
          </div>
        </Panel>

        {/* Server 2 Panel — disabled */}
        <Panel title={`${t('server.server')} 2`} className="flex-1 opacity-40 pointer-events-none">
          <div className="flex flex-wrap items-end gap-2">
            <InlineInput label={t('server.ip')} value="" onChange={() => {}} disabled placeholder="—" widthClass="w-56" />
            <InlineInput label={t('server.port')} value="" onChange={() => {}} disabled placeholder="—" widthClass="w-16" />
          </div>
          <div className="flex flex-wrap items-end gap-2 mt-2">
            <InlineSelect label={t('server.channel')} value="0" options={channelOptions} onChange={() => {}} disabled widthClass="w-28" />
            <InlineSelect label={t('server.protocol')} value="1" options={protocolOptions} onChange={() => {}} disabled widthClass="w-28" />
          </div>
          <p className="text-zinc-500 text-[10px] mt-2">{t('server.server2NotSupported')}</p>
        </Panel>
      </div>

      {/* Action buttons + status */}
      <div className="flex items-center gap-3">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('server.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('server.saving') : t('common.save')}
        </button>
        {statusMsg && (
          <span className="text-xs text-zinc-400">{statusMsg}</span>
        )}
      </div>
    </div>
  );
};

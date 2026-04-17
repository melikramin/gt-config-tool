import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';
import {
  buildUimReadCmd,
  buildUimWriteCmd,
  buildUimxReadCmd,
  buildUimxWriteCmd,
  parseUimResponse,
  parseUimxResponse,
  type UimParams,
  type UimxParams,
  EMPTY_UIM,
  EMPTY_UIMX,
} from '../../lib/commands';

// ---- Response helpers ----

function isErrorResponse(response: string): boolean {
  const t = response.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
}

function isPasswordError(response: string): boolean {
  return response.trim().endsWith(';PE');
}

// ---- UI helpers ----

const Panel: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">{title}</h3>
    {children}
  </div>
);

const CheckboxRow: FC<{
  labelKey: keyof Translations;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ labelKey, checked, onChange, disabled }) => {
  const { t } = useI18n();
  return (
    <label className="flex items-center gap-2 text-zinc-300 text-xs cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-blue-500"
      />
      <span>{t(labelKey)}</span>
    </label>
  );
};

const TextRow: FC<{
  labelKey: keyof Translations;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
}> = ({ labelKey, value, onChange, disabled, maxLength = 16 }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-zinc-300 text-xs w-40 shrink-0">{t(labelKey)}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        disabled={disabled}
        maxLength={maxLength}
        className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none max-w-xs"
      />
    </div>
  );
};

// ---- Main component ----

export const KeyboardTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const storeUim = useSettingsStore((s) => s.keyboardUim);
  const storeUimx = useSettingsStore((s) => s.keyboardUimx);

  const [uim, setUim] = useState<UimParams>(() => storeUim || EMPTY_UIM);
  const [uimx, setUimx] = useState<UimxParams>(() => storeUimx || EMPTY_UIMX);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (storeUim) setUim(storeUim);
    if (storeUimx) setUimx(storeUimx);
  }, [storeUim, storeUimx]);

  useEffect(() => {
    if (!isConnected) {
      setUim(EMPTY_UIM);
      setUimx(EMPTY_UIMX);
      setStatusMsg('');
    }
  }, [isConnected]);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  const readSettings = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setStatusMsg(t('kbd.reading'));

    try {
      const respU = await window.serial.sendCommand(buildUimReadCmd(password));
      if (isPasswordError(respU)) { await handlePasswordError(); return; }
      if (isErrorResponse(respU)) throw new Error(`UIM: ${respU.trim()}`);
      const u = parseUimResponse(respU);
      if (!u) throw new Error('UIM: malformed response');

      const respX = await window.serial.sendCommand(buildUimxReadCmd(password));
      if (isPasswordError(respX)) { await handlePasswordError(); return; }
      if (isErrorResponse(respX)) throw new Error(`UIMX: ${respX.trim()}`);
      const x = parseUimxResponse(respX);
      if (!x) throw new Error('UIMX: malformed response');

      setUim(u);
      setUimx(x);
      useSettingsStore.getState().setKeyboardSettings(u, x);
      setStatusMsg(t('kbd.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('kbd.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected && !useSettingsStore.getState().keyboardUim) readSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const saveSettings = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('kbd.saving'));

    try {
      const respU = await window.serial.sendCommand(buildUimWriteCmd(password, uim));
      if (isPasswordError(respU)) { await handlePasswordError(); return; }
      if (isErrorResponse(respU)) throw new Error(`UIM: ${respU.trim()}`);

      const respX = await window.serial.sendCommand(buildUimxWriteCmd(password, uimx));
      if (isPasswordError(respX)) { await handlePasswordError(); return; }
      if (isErrorResponse(respX)) throw new Error(`UIMX: ${respX.trim()}`);

      setStatusMsg(t('kbd.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('kbd.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, uim, uimx, handlePasswordError, t]);

  const updateUim = useCallback(<K extends keyof UimParams>(k: K, v: UimParams[K]) => {
    setUim((prev) => ({ ...prev, [k]: v }));
  }, []);

  const updateUimx = useCallback(<K extends keyof UimxParams>(k: K, v: UimxParams[K]) => {
    setUimx((prev) => ({ ...prev, [k]: v }));
  }, []);

  const busy = loading || saving;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.keyboard')}</h2>
        <p className="text-zinc-500 mt-2">{t('kbd.notConnected')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <Panel title={t('kbd.panelSettings')}>
        {/* Checkboxes in 4-column grid matching screenshot layout */}
        <div className="grid grid-cols-4 gap-x-4 gap-y-1 mb-4">
          {/* Column 1 */}
          <CheckboxRow labelKey="kbd.reqPump" checked={uim.reqPump} onChange={(v) => updateUim('reqPump', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.reqVehid" checked={uim.reqVehid} onChange={(v) => updateUim('reqVehid', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.reqOdo" checked={uim.reqOdo} onChange={(v) => updateUim('reqOdo', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.keySound" checked={uim.keySound} onChange={(v) => updateUim('keySound', v)} disabled={busy} />

          {/* Column 2 */}
          <CheckboxRow labelKey="kbd.reqLimit" checked={uim.reqLimit} onChange={(v) => updateUim('reqLimit', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.checkVid" checked={uim.checkVid} onChange={(v) => updateUim('checkVid', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.compareOdo" checked={uim.compareOdo} onChange={(v) => updateUim('compareOdo', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.termSound" checked={uim.termSound} onChange={(v) => updateUim('termSound', v)} disabled={busy} />

          {/* Column 3 */}
          <CheckboxRow labelKey="kbd.reqPin" checked={uim.reqPin} onChange={(v) => updateUim('reqPin', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.driverTagType" checked={uimx.driverTagType} onChange={(v) => updateUimx('driverTagType', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.engine" checked={uim.engine} onChange={(v) => updateUim('engine', v)} disabled={busy} />
          <CheckboxRow labelKey="kbd.projectId" checked={uim.projectId} onChange={(v) => updateUim('projectId', v)} disabled={busy} />

          {/* Column 4 — partial */}
          <div />
          <CheckboxRow labelKey="kbd.allowDriverCode" checked={uimx.allowDriverCode} onChange={(v) => updateUimx('allowDriverCode', v)} disabled={busy} />
        </div>

        {/* Text fields */}
        <TextRow labelKey="kbd.greeting" value={uim.greeting} onChange={(v) => updateUim('greeting', v)} disabled={busy} />
        <TextRow labelKey="kbd.tagSearch" value={uim.tagSearch} onChange={(v) => updateUim('tagSearch', v)} disabled={busy} />
      </Panel>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('kbd.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('kbd.saving') : t('common.save')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>
    </div>
  );
};

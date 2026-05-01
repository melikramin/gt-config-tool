import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useI18n } from '../../i18n';
import {
  buildEmstopReadCmd,
  buildEmstopWriteCmd,
  buildTagcfgReadCmd,
  buildTagcfgWriteCmd,
  buildBypassReadCmd,
  buildBypassWriteCmd,
  buildPumpsecReadCmd,
  buildPumpsecWriteCmd,
  buildDateReadCmd,
  buildDateSyncWriteCmd,
  parseEmstopResponse,
  parseTagcfgResponse,
  parseBypassResponse,
  parsePumpsecResponse,
  parseDateSyncResponse,
  TAGCFG_MODE_VALUES,
  PUMPSEC_AUTH_METHOD_VALUES,
  EMPTY_DATE_SYNC,
  type EmstopParams,
  type TagcfgParams,
  type BypassParams,
  type PumpsecParams,
  type DateSyncParams,
} from '../../lib/commands';
import type { Translations } from '../../i18n/types';

// ---- Defaults ----

const EMPTY_EMSTOP: EmstopParams = { enable: false, input: '3', level: false, operatorCheck: false };
const EMPTY_TAGCFG: TagcfgParams = { mode: '0', mask: 'xxxxxxxxxxxx', saveSd: false };
const EMPTY_BYPASS: BypassParams = { enable: false, motion: false, minThreshold: '1.0' };
const EMPTY_PUMPSEC: PumpsecParams = {
  maxDozeEn: false, lowLvlEn: false, lowLvlThresh: '0', maxDozeThresh: '0',
  alarmEn: false, alarmOutput: '4', alarmTimer: '0',
  authType: '1f', authMethod: '0', onlineTimeout: '15',
};

// ---- Input options ----

const EMSTOP_INPUT_OPTIONS = [
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
];

/** Allow only hex characters (0-9, a-f, A-F) and wildcard 'x'/'X'. */
function sanitizeHexMask(v: string): string {
  return v.replace(/[^0-9a-fA-FxX]/g, '').slice(0, 12);
}

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

const Checkbox: FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ label, checked, onChange, disabled }) => (
  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="accent-blue-500"
    />
    <span>{label}</span>
  </label>
);

const Select: FC<{
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  className?: string;
}> = ({ value, onChange, options, disabled, className }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

const NumberInput: FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  step?: string;
}> = ({ value, onChange, disabled, className, step }) => (
  <input
    type="number"
    value={value}
    step={step}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
  />
);

const TextInput: FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
}> = ({ value, onChange, disabled, className, maxLength }) => (
  <input
    type="text"
    value={value}
    maxLength={maxLength}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
  />
);

// ---- Main component ----

export const SecurityTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const storeEmstop = useSettingsStore((s) => s.securityEmstop);
  const storeTagcfg = useSettingsStore((s) => s.securityTagcfg);
  const storeBypass = useSettingsStore((s) => s.securityBypass);
  const storePumpsec = useSettingsStore((s) => s.securityPumpsec);
  const storeDateSync = useSettingsStore((s) => s.securityDateSync);

  const [emstop, setEmstop] = useState<EmstopParams>(() => storeEmstop || EMPTY_EMSTOP);
  const [tagcfg, setTagcfg] = useState<TagcfgParams>(() => storeTagcfg || EMPTY_TAGCFG);
  const [bypass, setBypass] = useState<BypassParams>(() => storeBypass || EMPTY_BYPASS);
  const [pumpsec, setPumpsec] = useState<PumpsecParams>(() => storePumpsec || EMPTY_PUMPSEC);
  const [dateSync, setDateSync] = useState<DateSyncParams>(() => storeDateSync || EMPTY_DATE_SYNC);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Populate from store when readAllSettings finishes
  useEffect(() => {
    if (storeEmstop) setEmstop(storeEmstop);
    if (storeTagcfg) setTagcfg(storeTagcfg);
    if (storeBypass) setBypass(storeBypass);
    if (storePumpsec) setPumpsec(storePumpsec);
    if (storeDateSync) setDateSync(storeDateSync);
  }, [storeEmstop, storeTagcfg, storeBypass, storePumpsec, storeDateSync]);

  useEffect(() => {
    if (!isConnected) {
      setEmstop(EMPTY_EMSTOP);
      setTagcfg(EMPTY_TAGCFG);
      setBypass(EMPTY_BYPASS);
      setPumpsec(EMPTY_PUMPSEC);
      setDateSync(EMPTY_DATE_SYNC);
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
    setStatusMsg(t('sec.reading'));

    try {
      const respE = await window.serial.sendCommand(buildEmstopReadCmd(password));
      if (isPasswordError(respE)) { await handlePasswordError(); return; }
      if (isErrorResponse(respE)) throw new Error(`EMSTOP: ${respE.trim()}`);
      const e = parseEmstopResponse(respE);
      if (!e) throw new Error('EMSTOP: malformed response');

      const respT = await window.serial.sendCommand(buildTagcfgReadCmd(password));
      if (isPasswordError(respT)) { await handlePasswordError(); return; }
      if (isErrorResponse(respT)) throw new Error(`TAGCFG: ${respT.trim()}`);
      const tc = parseTagcfgResponse(respT);
      if (!tc) throw new Error('TAGCFG: malformed response');

      const respB = await window.serial.sendCommand(buildBypassReadCmd(password));
      if (isPasswordError(respB)) { await handlePasswordError(); return; }
      if (isErrorResponse(respB)) throw new Error(`BYPASS: ${respB.trim()}`);
      const b = parseBypassResponse(respB);
      if (!b) throw new Error('BYPASS: malformed response');

      const respP = await window.serial.sendCommand(buildPumpsecReadCmd(password));
      if (isPasswordError(respP)) { await handlePasswordError(); return; }
      if (isErrorResponse(respP)) throw new Error(`PUMPSEC: ${respP.trim()}`);
      const p = parsePumpsecResponse(respP);
      if (!p) throw new Error('PUMPSEC: malformed response');

      const respD = await window.serial.sendCommand(buildDateReadCmd(password));
      if (isPasswordError(respD)) { await handlePasswordError(); return; }
      if (isErrorResponse(respD)) throw new Error(`DATE: ${respD.trim()}`);
      const ds = parseDateSyncResponse(respD);
      if (!ds) throw new Error('DATE: malformed response');

      setEmstop(e);
      setTagcfg(tc);
      setBypass(b);
      setPumpsec(p);
      setDateSync(ds);
      useSettingsStore.getState().setSecuritySettings(e, tc, b, p);
      useSettingsStore.getState().setSecurityDateSync(ds);
      setStatusMsg(t('sec.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('sec.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected && !useSettingsStore.getState().securityEmstop) readSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const saveSettings = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('sec.saving'));

    try {
      const respB = await window.serial.sendCommand(buildBypassWriteCmd(password, bypass));
      if (isPasswordError(respB)) { await handlePasswordError(); return; }
      if (isErrorResponse(respB)) throw new Error(`BYPASS: ${respB.trim()}`);

      const respE = await window.serial.sendCommand(buildEmstopWriteCmd(password, emstop));
      if (isPasswordError(respE)) { await handlePasswordError(); return; }
      if (isErrorResponse(respE)) throw new Error(`EMSTOP: ${respE.trim()}`);

      const respT = await window.serial.sendCommand(buildTagcfgWriteCmd(password, tagcfg));
      if (isPasswordError(respT)) { await handlePasswordError(); return; }
      if (isErrorResponse(respT)) throw new Error(`TAGCFG: ${respT.trim()}`);

      const respP = await window.serial.sendCommand(buildPumpsecWriteCmd(password, pumpsec));
      if (isPasswordError(respP)) { await handlePasswordError(); return; }
      if (isErrorResponse(respP)) throw new Error(`PUMPSEC: ${respP.trim()}`);

      const respD = await window.serial.sendCommand(buildDateSyncWriteCmd(password, dateSync));
      if (isPasswordError(respD)) { await handlePasswordError(); return; }
      if (isErrorResponse(respD)) throw new Error(`DATE: ${respD.trim()}`);
      useSettingsStore.getState().setSecurityDateSync(dateSync);

      setStatusMsg(t('sec.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('sec.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, emstop, tagcfg, bypass, pumpsec, dateSync, handlePasswordError, t]);

  const updateEmstop = useCallback(<K extends keyof EmstopParams>(k: K, v: EmstopParams[K]) => {
    setEmstop((prev) => ({ ...prev, [k]: v }));
  }, []);
  const updateTagcfg = useCallback(<K extends keyof TagcfgParams>(k: K, v: TagcfgParams[K]) => {
    setTagcfg((prev) => ({ ...prev, [k]: v }));
  }, []);
  const updateBypass = useCallback(<K extends keyof BypassParams>(k: K, v: BypassParams[K]) => {
    setBypass((prev) => ({ ...prev, [k]: v }));
  }, []);
  const updatePumpsec = useCallback(<K extends keyof PumpsecParams>(k: K, v: PumpsecParams[K]) => {
    setPumpsec((prev) => ({ ...prev, [k]: v }));
  }, []);
  const updateDateSync = useCallback(<K extends keyof DateSyncParams>(k: K, v: DateSyncParams[K]) => {
    setDateSync((prev) => ({ ...prev, [k]: v }));
  }, []);

  const busy = loading || saving;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.security')}</h2>
        <p className="text-zinc-500 mt-2">{t('sec.notConnected')}</p>
      </div>
    );
  }

  // Auth type bitmask helpers
  const authBits = parseInt(pumpsec.authType, 16) || 0;
  const AUTH_BIT_DEFS: Array<{ bit: number; labelKey: keyof Translations }> = [
    { bit: 0, labelKey: 'sec.authBitAll' },
    { bit: 1, labelKey: 'sec.authBitCode' },
    { bit: 2, labelKey: 'sec.authBitIbutton' },
    { bit: 3, labelKey: 'sec.authBitRfid' },
    { bit: 4, labelKey: 'sec.authBitRemote' },
  ];
  const toggleAuthBit = (bit: number, on: boolean) => {
    let val = authBits;
    if (on) val |= (1 << bit);
    else val &= ~(1 << bit);
    updatePumpsec('authType', val.toString(16).padStart(2, '0'));
  };

  const emstopDisabled = busy || !emstop.enable;

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      {/* Top row: Emergency Stop + Authorization Type + Bypass */}
      <div className="flex flex-wrap gap-4">
        {/* Panel 1: Emergency Stop */}
        <Panel title={t('sec.panelEmstop')}>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <Checkbox
                label={t('sec.emstopEnable')}
                checked={emstop.enable}
                onChange={(v) => updateEmstop('enable', v)}
                disabled={busy}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{t('sec.emstopInput')}</span>
                <Select
                  value={emstop.input}
                  onChange={(v) => updateEmstop('input', v)}
                  options={EMSTOP_INPUT_OPTIONS}
                  disabled={emstopDisabled}
                  className="w-16"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Checkbox
                label={t('sec.emstopInvert')}
                checked={emstop.level}
                onChange={(v) => updateEmstop('level', v)}
                disabled={emstopDisabled}
              />
              <Checkbox
                label={t('sec.emstopOperator')}
                checked={emstop.operatorCheck}
                onChange={(v) => updateEmstop('operatorCheck', v)}
                disabled={emstopDisabled}
              />
            </div>
          </div>
        </Panel>

        {/* Panel 2: Authorization Type (TAGCFG) */}
        <Panel title={t('sec.panelTagcfg')}>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{t('sec.tagcfgMode')}</span>
                <Select
                  value={tagcfg.mode}
                  onChange={(v) => updateTagcfg('mode', v)}
                  options={TAGCFG_MODE_VALUES.map((v) => ({ value: v, label: t(`sec.tagcfgMode${v}` as keyof Translations) }))}
                  disabled={busy}
                  className="w-52"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Checkbox
                label={t('sec.tagcfgSaveSd')}
                checked={tagcfg.saveSd}
                onChange={(v) => updateTagcfg('saveSd', v)}
                disabled={busy}
              />
              {tagcfg.mode === '1' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">{t('sec.tagcfgMask')}</span>
                  <TextInput
                    value={tagcfg.mask}
                    onChange={(v) => updateTagcfg('mask', sanitizeHexMask(v))}
                    disabled={busy}
                    maxLength={12}
                    className="w-28 font-mono"
                  />
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Panel 3: Bypass */}
        <Panel title={t('sec.panelBypass')}>
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <Checkbox
                label={t('sec.bypassEnable')}
                checked={bypass.enable}
                onChange={(v) => updateBypass('enable', v)}
                disabled={busy}
              />
              <Checkbox
                label={t('sec.bypassMotion')}
                checked={bypass.motion}
                onChange={(v) => updateBypass('motion', v)}
                disabled={busy || !bypass.enable}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{t('sec.bypassThreshold')}</span>
                <NumberInput
                  value={bypass.minThreshold}
                  onChange={(v) => updateBypass('minThreshold', v)}
                  disabled={busy || !bypass.enable}
                  step="0.1"
                  className="w-20"
                />
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Panel 4: Dispensing & Alarm */}
      <div className="flex flex-wrap gap-4">
        <Panel title={t('sec.panelPumpsec')}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                label={t('sec.maxDoze')}
                checked={pumpsec.maxDozeEn}
                onChange={(v) => updatePumpsec('maxDozeEn', v)}
                disabled={busy}
              />
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-zinc-400">{t('sec.maxDozeThresh')}</span>
                <NumberInput
                  value={pumpsec.maxDozeThresh}
                  onChange={(v) => updatePumpsec('maxDozeThresh', v)}
                  disabled={busy}
                  className="w-24"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                label={t('sec.lowLevel')}
                checked={pumpsec.lowLvlEn}
                onChange={(v) => updatePumpsec('lowLvlEn', v)}
                disabled={busy}
              />
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-zinc-400">{t('sec.lowLevelThresh')}</span>
                <NumberInput
                  value={pumpsec.lowLvlThresh}
                  onChange={(v) => updatePumpsec('lowLvlThresh', v)}
                  disabled={busy}
                  className="w-24"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                label={t('sec.alarmEnable')}
                checked={pumpsec.alarmEn}
                onChange={(v) => updatePumpsec('alarmEn', v)}
                disabled={busy}
              />
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-zinc-400">{t('sec.alarmTimer')}</span>
                <NumberInput
                  value={pumpsec.alarmTimer}
                  onChange={(v) => updatePumpsec('alarmTimer', v)}
                  disabled={busy}
                  className="w-24"
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* Panel 5: Authorization Settings */}
        <Panel title={t('sec.panelAuth')}>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-zinc-400">{t('sec.authType')}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                <Checkbox
                  label={t('sec.authBitAll')}
                  checked={(authBits & 1) !== 0}
                  onChange={(v) => toggleAuthBit(0, v)}
                  disabled={busy}
                />
                {(authBits & 1) === 0 && AUTH_BIT_DEFS.filter(({ bit }) => bit > 0).map(({ bit, labelKey }) => (
                  <Checkbox
                    key={bit}
                    label={t(labelKey)}
                    checked={(authBits & (1 << bit)) !== 0}
                    onChange={(v) => toggleAuthBit(bit, v)}
                    disabled={busy}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 shrink-0">{t('sec.authMethod')}</span>
              <Select
                value={pumpsec.authMethod}
                onChange={(v) => updatePumpsec('authMethod', v)}
                options={PUMPSEC_AUTH_METHOD_VALUES.map((v) => ({ value: v, label: t(`sec.authMethod${v}` as keyof Translations) }))}
                disabled={busy}
                className="w-36"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 shrink-0">{t('sec.onlineTimeout')}</span>
              <NumberInput
                value={pumpsec.onlineTimeout}
                onChange={(v) => updatePumpsec('onlineTimeout', v)}
                disabled={busy || (pumpsec.authMethod !== '1' && pumpsec.authMethod !== '2')}
                className="w-24"
              />
            </div>
          </div>
        </Panel>

        {/* Panel 6: Time Synchronization */}
        <Panel title={t('sec.panelDateSync')}>
          <div className="space-y-2">
            <Checkbox
              label={t('sec.dateSyncGps')}
              checked={dateSync.gpsSync}
              onChange={(v) => updateDateSync('gpsSync', v)}
              disabled={busy}
            />
            <Checkbox
              label={t('sec.dateSyncNtp')}
              checked={dateSync.ntpSync}
              onChange={(v) => updateDateSync('ntpSync', v)}
              disabled={busy}
            />
            <Checkbox
              label={t('sec.dateSyncGsm')}
              checked={dateSync.gsmSync}
              onChange={(v) => updateDateSync('gsmSync', v)}
              disabled={busy}
            />
          </div>
        </Panel>
      </div>

      {/* Read / Save buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('sec.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('sec.saving') : t('common.save')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>

    </div>
  );
};

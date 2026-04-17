import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';
import {
  buildFilterReadCmd,
  buildFilterWriteCmd,
  buildMsensReadCmd,
  buildMsensWriteCmd,
  buildTiltReadCmd,
  buildTiltWriteCmd,
  parseFilterResponse,
  parseMsensResponse,
  parseTiltResponse,
  type FilterParams,
  type MsensParams,
  type TiltParams,
} from '../../lib/commands';

// ---- Defaults ----

const EMPTY_FILTER: FilterParams = {
  dstEn: false, distance: '300',
  hdgEn: false, heading: '15',
  spdEn: false, minSpeed: '2',
  hspdEn: false, maxSpeed: '60',
  minTimeout: '1',
  drivingInterval: '120',
  parkingInterval: '120',
};

const EMPTY_MSENS: MsensParams = {
  motionEn: false, motionThresh: '6',
  shockEn: false, shockThresh: '127',
  extra: ['0', '1', '0'],
};

const EMPTY_TILT: TiltParams = { enable: false, threshold: '30' };

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

const NumberInput: FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  className?: string;
}> = ({ value, onChange, disabled, min, max, className }) => (
  <input
    type="number"
    value={value}
    min={min}
    max={max}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
  />
);

const CheckboxNumberRow: FC<{
  labelKey: keyof Translations;
  checked: boolean;
  onCheck: (v: boolean) => void;
  value: string;
  onValue: (v: string) => void;
  min: number;
  max: number;
  disabled?: boolean;
}> = ({ labelKey, checked, onCheck, value, onValue, min, max, disabled }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 mb-2">
      <label className="flex items-center gap-2 flex-1 text-zinc-300 text-xs cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          disabled={disabled}
          className="accent-blue-500"
        />
        <span>{t(labelKey)}</span>
      </label>
      <NumberInput
        value={value}
        onChange={onValue}
        disabled={disabled || !checked}
        min={min}
        max={max}
        className="w-20"
      />
    </div>
  );
};

const NumberRow: FC<{
  labelKey: keyof Translations;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  disabled?: boolean;
}> = ({ labelKey, value, onChange, min, max, disabled }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 mb-2">
      <label className="text-zinc-300 text-xs flex-1">{t(labelKey)}</label>
      <NumberInput value={value} onChange={onChange} disabled={disabled} min={min} max={max} className="w-20" />
    </div>
  );
};

const SliderRow: FC<{
  enableLabel: string;
  thresholdLabel: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onValue: (v: string) => void;
  min: number;
  max: number;
  disabled?: boolean;
}> = ({ enableLabel, thresholdLabel, enabled, onToggle, value, onValue, min, max, disabled }) => {
  const clamped = Math.max(min, Math.min(max, Number(value) || min));
  const sliderDisabled = disabled || !enabled;
  return (
    <div className="flex items-center gap-3 mb-3 last:mb-0">
      <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer w-56 shrink-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={disabled}
          className="accent-blue-500"
        />
        <span>{enableLabel}</span>
      </label>
      <span className="text-zinc-400 text-xs w-44 shrink-0">{thresholdLabel}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={clamped}
        onChange={(e) => onValue(e.target.value)}
        disabled={sliderDisabled}
        className="flex-1 accent-blue-500 disabled:opacity-50"
      />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        disabled={sliderDisabled}
        className="w-20 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none"
      />
      <span className="text-[10px] text-zinc-500 w-14 shrink-0">({min}-{max})</span>
    </div>
  );
};

// ---- Main component ----

export const GpsTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const storeFilter = useSettingsStore((s) => s.gpsFilter);
  const storeMsens = useSettingsStore((s) => s.gpsMsens);
  const storeTilt = useSettingsStore((s) => s.gpsTilt);

  const [filter, setFilter] = useState<FilterParams>(() => storeFilter || EMPTY_FILTER);
  const [msens, setMsens] = useState<MsensParams>(() => storeMsens || EMPTY_MSENS);
  const [tilt, setTilt] = useState<TiltParams>(() => storeTilt || EMPTY_TILT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Populate from store when readAllSettings finishes
  useEffect(() => {
    if (storeFilter) setFilter(storeFilter);
    if (storeMsens) setMsens(storeMsens);
    if (storeTilt) setTilt(storeTilt);
  }, [storeFilter, storeMsens, storeTilt]);

  useEffect(() => {
    if (!isConnected) {
      setFilter(EMPTY_FILTER);
      setMsens(EMPTY_MSENS);
      setTilt(EMPTY_TILT);
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
    setStatusMsg(t('gps.reading'));

    try {
      const respF = await window.serial.sendCommand(buildFilterReadCmd(password));
      if (isPasswordError(respF)) { await handlePasswordError(); return; }
      if (isErrorResponse(respF)) throw new Error(`FILTER: ${respF.trim()}`);
      const f = parseFilterResponse(respF);
      if (!f) throw new Error('FILTER: malformed response');

      const respM = await window.serial.sendCommand(buildMsensReadCmd(password));
      if (isPasswordError(respM)) { await handlePasswordError(); return; }
      if (isErrorResponse(respM)) throw new Error(`MSENS: ${respM.trim()}`);
      const m = parseMsensResponse(respM);
      if (!m) throw new Error('MSENS: malformed response');

      const respT = await window.serial.sendCommand(buildTiltReadCmd(password));
      if (isPasswordError(respT)) { await handlePasswordError(); return; }
      if (isErrorResponse(respT)) throw new Error(`TILT: ${respT.trim()}`);
      const tp = parseTiltResponse(respT);
      if (!tp) throw new Error('TILT: malformed response');

      setFilter(f);
      setMsens(m);
      setTilt(tp);
      useSettingsStore.getState().setGpsSettings(f, m, tp);
      setStatusMsg(t('gps.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('gps.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected && !useSettingsStore.getState().gpsFilter) readSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const saveSettings = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('gps.saving'));

    try {
      const respF = await window.serial.sendCommand(buildFilterWriteCmd(password, filter));
      if (isPasswordError(respF)) { await handlePasswordError(); return; }
      if (isErrorResponse(respF)) throw new Error(`FILTER: ${respF.trim()}`);

      const respM = await window.serial.sendCommand(buildMsensWriteCmd(password, msens));
      if (isPasswordError(respM)) { await handlePasswordError(); return; }
      if (isErrorResponse(respM)) throw new Error(`MSENS: ${respM.trim()}`);

      const respT = await window.serial.sendCommand(buildTiltWriteCmd(password, tilt));
      if (isPasswordError(respT)) { await handlePasswordError(); return; }
      if (isErrorResponse(respT)) throw new Error(`TILT: ${respT.trim()}`);

      setStatusMsg(t('gps.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('gps.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, filter, msens, tilt, handlePasswordError, t]);

  const updateFilter = useCallback(<K extends keyof FilterParams>(k: K, v: FilterParams[K]) => {
    setFilter((prev) => ({ ...prev, [k]: v }));
  }, []);
  const updateMsens = useCallback(<K extends keyof MsensParams>(k: K, v: MsensParams[K]) => {
    setMsens((prev) => ({ ...prev, [k]: v }));
  }, []);
  const updateTilt = useCallback(<K extends keyof TiltParams>(k: K, v: TiltParams[K]) => {
    setTilt((prev) => ({ ...prev, [k]: v }));
  }, []);

  const busy = loading || saving;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.gps')}</h2>
        <p className="text-zinc-500 mt-2">{t('gps.notConnected')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <Panel title={t('gps.panelGps')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <CheckboxNumberRow
              labelKey="gps.distance"
              checked={filter.dstEn}
              onCheck={(v) => updateFilter('dstEn', v)}
              value={filter.distance}
              onValue={(v) => updateFilter('distance', v)}
              min={5} max={10000} disabled={busy}
            />
            <CheckboxNumberRow
              labelKey="gps.heading"
              checked={filter.hdgEn}
              onCheck={(v) => updateFilter('hdgEn', v)}
              value={filter.heading}
              onValue={(v) => updateFilter('heading', v)}
              min={1} max={360} disabled={busy}
            />
            <CheckboxNumberRow
              labelKey="gps.minSpeed"
              checked={filter.spdEn}
              onCheck={(v) => updateFilter('spdEn', v)}
              value={filter.minSpeed}
              onValue={(v) => updateFilter('minSpeed', v)}
              min={1} max={10} disabled={busy}
            />
            <CheckboxNumberRow
              labelKey="gps.maxSpeed"
              checked={filter.hspdEn}
              onCheck={(v) => updateFilter('hspdEn', v)}
              value={filter.maxSpeed}
              onValue={(v) => updateFilter('maxSpeed', v)}
              min={1} max={200} disabled={busy}
            />
          </div>
          <div>
            <NumberRow
              labelKey="gps.minTimeout"
              value={filter.minTimeout}
              onChange={(v) => updateFilter('minTimeout', v)}
              min={0} max={10000} disabled={busy}
            />
            <NumberRow
              labelKey="gps.drivingInterval"
              value={filter.drivingInterval}
              onChange={(v) => updateFilter('drivingInterval', v)}
              min={3} max={10000} disabled={busy}
            />
            <NumberRow
              labelKey="gps.parkingInterval"
              value={filter.parkingInterval}
              onChange={(v) => updateFilter('parkingInterval', v)}
              min={3} max={10000} disabled={busy}
            />
          </div>
        </div>
      </Panel>

      <Panel title={t('gps.panelAccel')}>
        <SliderRow
          enableLabel={t('gps.motion')}
          thresholdLabel={t('gps.motionThreshold')}
          enabled={msens.motionEn}
          onToggle={(v) => updateMsens('motionEn', v)}
          value={msens.motionThresh}
          onValue={(v) => updateMsens('motionThresh', v)}
          min={1} max={127}
          disabled={busy}
        />
        <SliderRow
          enableLabel={t('gps.shock')}
          thresholdLabel={t('gps.shockThreshold')}
          enabled={msens.shockEn}
          onToggle={(v) => updateMsens('shockEn', v)}
          value={msens.shockThresh}
          onValue={(v) => updateMsens('shockThresh', v)}
          min={1} max={127}
          disabled={busy}
        />
        <SliderRow
          enableLabel={t('gps.tilt')}
          thresholdLabel={t('gps.tiltThreshold')}
          enabled={tilt.enable}
          onToggle={(v) => updateTilt('enable', v)}
          value={tilt.threshold}
          onValue={(v) => updateTilt('threshold', v)}
          min={1} max={180}
          disabled={busy}
        />
      </Panel>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('gps.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('gps.saving') : t('common.save')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>
    </div>
  );
};

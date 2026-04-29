import { type FC, useState, useCallback, useEffect, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useI18n } from '../../i18n';
import {
  PUMP_COUNT,
  PUMP_TYPES,
  PUMP_TYPES_RU,
  PUMP_INPUT_OPTIONS,
  PUMP_PRODUCT_OPTIONS,
  PUMP_RELAY1_OPTIONS,
  PUMP_RELAY2_OPTIONS,
  PUMP_RELAY2_OPTIONS_RU,
  EMPTY_PUMP,
  EMPTY_PUMP_FORMAT,
  PUMP_FORMAT_OPTIONS,
  PUMP_FORMAT_LEN_OPTIONS,
  buildPumpReadCmd,
  buildPumpWriteCmd,
  buildPumpFormatReadCmd,
  buildPumpFormatWriteCmd,
  parsePumpResponse,
  parsePumpFormatResponse,
  type PumpParams,
  type PumpFormatParams,
} from '../../lib/commands';

// ---- Helpers ----

const isErrorResponse = (r: string): boolean => {
  const t = r.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
};
const isPasswordError = (r: string) => r.trim().endsWith(';PE');

/**
 * Sanitize free-form decimal input: comma → dot (some locales emit `,` from the
 * numeric keypad), strip everything except digits and at most one dot. The
 * device's protocol only accepts `.` as the decimal separator.
 */
const sanitizeDecimal = (raw: string): string => {
  let v = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  }
  return v;
};

/** Format a numeric string to exactly N decimals; pass through unparseable input. */
const formatDecimal = (v: string, decimals: number | undefined): string => {
  if (decimals === undefined) return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(decimals) : v;
};

/**
 * Check if a value is used by another active pump.
 * Returns true if duplicated (conflict).
 */
function isDuplicate(
  pumps: PumpParams[],
  activePumpIdx: number,
  getter: (p: PumpParams) => string,
  zeroValue?: string,
): boolean {
  const current = getter(pumps[activePumpIdx]);
  if (zeroValue !== undefined && current === zeroValue) return false;
  if (pumps[activePumpIdx].type === '0') return false;
  for (let i = 0; i < pumps.length; i++) {
    if (i === activePumpIdx) continue;
    if (pumps[i].type === '0') continue;
    const v = getter(pumps[i]);
    if (zeroValue !== undefined && v === zeroValue) continue;
    if (v === current) return true;
  }
  return false;
}

/**
 * Check if a relay value (1-4) conflicts with any relay (output or secondOut)
 * used by OTHER active pumps, plus the OTHER relay field of the SAME pump.
 * "0" (relay 2 disabled) never conflicts.
 */
function isRelayConflict(
  pumps: PumpParams[],
  activePumpIdx: number,
  field: 'output' | 'secondOut',
): boolean {
  const pump = pumps[activePumpIdx];
  const current = pump[field];
  if (current === '0') return false;
  if (pump.type === '0') return false;

  // Check against the OTHER relay of the same pump
  const otherField = field === 'output' ? 'secondOut' : 'output';
  const otherVal = pump[otherField];
  if (otherVal !== '0' && otherVal === current) return true;

  // Check against both relays of every other active pump
  for (let i = 0; i < pumps.length; i++) {
    if (i === activePumpIdx) continue;
    if (pumps[i].type === '0') continue;
    if (pumps[i].output === current) return true;
    if (pumps[i].secondOut !== '0' && pumps[i].secondOut === current) return true;
  }
  return false;
}

// ---- Small UI primitives ----

const Panel: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">{title}</h3>
    {children}
  </div>
);

const Field: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[11px] text-zinc-500">{label}</span>
    {children}
  </div>
);

const NumInput: FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: string;
  className?: string;
}> = ({ value, onChange, disabled, min, max, step, className }) => (
  <input
    type="number"
    value={value}
    min={min}
    max={max}
    step={step}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-40 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
  />
);

/**
 * Decimal text input that the user can edit freely (no reformatting per
 * keystroke) and that always emits a dot-separated value, regardless of
 * keyboard locale.
 *
 * When `decimals` is set, the value is shown formatted to that precision while
 * the field is unfocused (and on blur), but the user can type freely once the
 * field is focused — this is what lets a user delete `1.00` and type `1.12`
 * without each keystroke snapping the value back.
 */
const DecimalInput: FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  decimals?: number;
}> = ({ value, onChange, disabled, className, placeholder, decimals }) => {
  const [focused, setFocused] = useState(false);
  const [editValue, setEditValue] = useState(() => formatDecimal(value, decimals));

  // Sync formatted display when the parent value changes externally (e.g.
  // settings load). Skip while focused so user input isn't clobbered.
  useEffect(() => {
    if (!focused) setEditValue(formatDecimal(value, decimals));
  }, [value, focused, decimals]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editValue}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const formatted = formatDecimal(editValue, decimals);
        setEditValue(formatted);
        if (formatted !== value) onChange(formatted);
      }}
      onChange={(e) => {
        const clean = sanitizeDecimal(e.target.value);
        setEditValue(clean);
        onChange(clean);
      }}
      onPaste={(e) => {
        e.preventDefault();
        const clean = sanitizeDecimal(e.clipboardData.getData('text'));
        setEditValue(clean);
        onChange(clean);
      }}
      disabled={disabled}
      className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-40 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
    />
  );
};

const Select: FC<{
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  conflict?: boolean;
}> = ({ value, options, onChange, disabled, className, conflict }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`bg-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-40 focus:border-blue-500 focus:outline-none border ${
      conflict ? 'border-red-500 text-red-400' : 'border-zinc-600'
    } ${className ?? ''}`}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

// ---- Single pump form (grouped layout) ----

interface PumpFormProps {
  pumps: PumpParams[];
  activePumpIdx: number;
  onChange: <K extends keyof PumpParams>(key: K, value: PumpParams[K]) => void;
  disabled: boolean;
}

const PumpForm: FC<PumpFormProps> = ({ pumps, activePumpIdx, onChange, disabled }) => {
  const { t, locale } = useI18n();
  const pump = pumps[activePumpIdx];
  const fieldsDisabled = disabled || pump.type === '0';

  const pumpTypeOptions = locale === 'ru' ? PUMP_TYPES_RU : PUMP_TYPES;
  const relay2Options = locale === 'ru' ? PUMP_RELAY2_OPTIONS_RU : PUMP_RELAY2_OPTIONS;

  const inputConflict = useMemo(
    () => isDuplicate(pumps, activePumpIdx, (p) => p.input),
    [pumps, activePumpIdx],
  );

  const relay1Conflict = useMemo(
    () => isRelayConflict(pumps, activePumpIdx, 'output'),
    [pumps, activePumpIdx],
  );

  const relay2Conflict = useMemo(
    () => isRelayConflict(pumps, activePumpIdx, 'secondOut'),
    [pumps, activePumpIdx],
  );

  const relay2Disabled = fieldsDisabled || pump.secondOut === '0';

  return (
    <Panel title={t('pumps.panelSettings')}>
      <div className="space-y-3">
        {/* Row 1: Type, Input, Imp/L, Start timer, Stop timer */}
        <div className="grid grid-cols-5 gap-3">
          <Field label={t('pumps.pumpType')}>
            <Select
              value={pump.type}
              options={pumpTypeOptions}
              onChange={(v) => onChange('type', v)}
              disabled={disabled}
              className="w-full"
            />
          </Field>
          <Field label={t('pumps.input')}>
            <Select
              value={pump.input}
              options={PUMP_INPUT_OPTIONS}
              onChange={(v) => onChange('input', v)}
              disabled={fieldsDisabled}
              className="w-full"
              conflict={inputConflict}
            />
          </Field>
          <Field label={t('pumps.pulsePerLiter')}>
            <DecimalInput
              value={pump.pulse}
              onChange={(v) => onChange('pulse', v)}
              disabled={fieldsDisabled}
              className="w-full"
            />
          </Field>
          <Field label={t('pumps.startTimer')}>
            <NumInput
              value={pump.startTout}
              onChange={(v) => onChange('startTout', v)}
              disabled={fieldsDisabled}
              min={0}
              max={120}
              className="w-full"
            />
          </Field>
          <Field label={t('pumps.stopTimer')}>
            <NumInput
              value={pump.stopTout}
              onChange={(v) => onChange('stopTout', v)}
              disabled={fieldsDisabled}
              min={0}
              max={120}
              className="w-full"
            />
          </Field>
        </div>

        {/* Row 2: Relay 1, Relay 2, Start L, Stop L, Rounding */}
        <div className="grid grid-cols-5 gap-3">
          <Field label={t('pumps.relay1')}>
            <Select
              value={pump.output}
              options={PUMP_RELAY1_OPTIONS}
              onChange={(v) => onChange('output', v)}
              disabled={fieldsDisabled}
              className="w-full"
              conflict={relay1Conflict}
            />
          </Field>
          <Field label={t('pumps.relay2')}>
            <Select
              value={pump.secondOut}
              options={relay2Options}
              onChange={(v) => onChange('secondOut', v)}
              disabled={fieldsDisabled}
              className="w-full"
              conflict={relay2Conflict}
            />
          </Field>
          <Field label={t('pumps.relay2Start')}>
            <DecimalInput
              value={pump.secondStart}
              onChange={(v) => onChange('secondStart', v)}
              disabled={relay2Disabled}
              decimals={2}
              className="w-full"
            />
          </Field>
          <Field label={t('pumps.relay2Stop')}>
            <DecimalInput
              value={pump.secondStop}
              onChange={(v) => onChange('secondStop', v)}
              disabled={relay2Disabled}
              decimals={2}
              className="w-full"
            />
          </Field>
          <Field label={t('pumps.rounding')}>
            <DecimalInput
              value={pump.round}
              onChange={(v) => onChange('round', v)}
              disabled={fieldsDisabled}
              decimals={2}
              className="w-full"
            />
          </Field>
        </div>

        {/* Row 3: RFID #, RFID timer, Passive RFID */}
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-2">
            <Field label={t('pumps.rfidId')}>
              <input
                type="text"
                value={pump.rfidId}
                maxLength={12}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\s+/g, '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
                  onChange('rfidId', clean);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData('text');
                  const clean = text.replace(/\s+/g, '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
                  onChange('rfidId', clean);
                }}
                disabled={fieldsDisabled}
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 font-mono disabled:opacity-40 focus:border-blue-500 focus:outline-none"
                placeholder="000000000000"
              />
            </Field>
          </div>
          <Field label={t('pumps.rfidTimer')}>
            <NumInput
              value={pump.rfidTout}
              onChange={(v) => onChange('rfidTout', v)}
              disabled={fieldsDisabled}
              min={0}
              max={120}
              className="w-full"
            />
          </Field>
          <div className="col-span-2 flex items-end pb-0.5">
            <label className="flex items-center gap-1.5 text-xs text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                checked={pump.rfidMode === '1'}
                onChange={(e) => onChange('rfidMode', e.target.checked ? '1' : '0')}
                disabled={fieldsDisabled}
                className="accent-blue-500 disabled:opacity-40"
              />
              {t('pumps.passiveRfid')}
            </label>
          </div>
        </div>

        {/* Row 4: Product, Price, Totalizer */}
        <div className="grid grid-cols-5 gap-3">
          <Field label={t('pumps.product')}>
            <Select
              value={pump.product}
              options={PUMP_PRODUCT_OPTIONS}
              onChange={(v) => onChange('product', v)}
              disabled={fieldsDisabled}
              className="w-full"
            />
          </Field>
          <Field label={t('pumps.pricePerLiter')}>
            <DecimalInput
              value={pump.price}
              onChange={(v) => onChange('price', v)}
              disabled={fieldsDisabled}
              decimals={3}
              className="w-full"
            />
          </Field>
          <Field label={t('pumps.totalizer')}>
            {pump.type === '1' ? (
              <DecimalInput
                value={pump.total}
                onChange={(v) => onChange('total', v)}
                disabled={fieldsDisabled}
                className="w-full"
              />
            ) : (
              <span className="text-xs text-zinc-300 font-mono bg-zinc-800 border border-zinc-700 rounded px-2 py-1 block">
                {pump.total}
              </span>
            )}
          </Field>
          <div className="col-span-2 flex items-end pb-0.5">
            <label className="flex items-center gap-1.5 text-xs text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                checked={pump.totalCheck === '1'}
                onChange={(e) => onChange('totalCheck', e.target.checked ? '1' : '0')}
                disabled={fieldsDisabled}
                className="accent-blue-500 disabled:opacity-40"
              />
              {t('pumps.totalCheck')}
            </label>
          </div>
        </div>
      </div>
    </Panel>
  );
};

// ---- Pump Format Dialog ----

interface PumpFormatDialogProps {
  pumpIndex: number;
  format: PumpFormatParams;
  open: boolean;
  onClose: () => void;
  password: string;
  isConnected: boolean;
  onSaved: (fmt: PumpFormatParams) => void;
}

const PumpFormatDialog: FC<PumpFormatDialogProps> = ({
  pumpIndex, format: initial, open, onClose, password, isConnected, onSaved,
}) => {
  const { t } = useI18n();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { setConnected } = useConnectionStore();

  const [fmt, setFmt] = useState<PumpFormatParams>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  /** Return options list, adding current value if it's non-standard. */
  const fmtOptions = useCallback((current: string) => {
    const isKnown = PUMP_FORMAT_OPTIONS.some((o) => o.value === current);
    if (isKnown) return PUMP_FORMAT_OPTIONS;
    return [{ value: current, label: current }, ...PUMP_FORMAT_OPTIONS];
  }, []);

  useEffect(() => {
    if (open) {
      setFmt({ ...initial });
      setStatusMsg('');
    }
  }, [open, initial]);

  const handleSave = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('pumps.formatSaving'));
    try {
      const resp = await window.serial.sendCommand(
        buildPumpFormatWriteCmd(password, pumpIndex + 1, fmt),
      );
      if (isPasswordError(resp)) {
        setLastError(t('error.wrongPassword'));
        setShowPasswordError(true);
        try { await window.serial.disconnect(); } catch { /* ignore */ }
        setConnected(false);
        return;
      }
      if (isErrorResponse(resp)) throw new Error(resp.trim());
      onSaved(fmt);
      onClose();
    } catch (err) {
      setStatusMsg(`${t('pumps.formatSaveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, pumpIndex, fmt, onSaved, setLastError, setShowPasswordError, setConnected, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 min-w-[420px] relative">
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute top-2 right-3 text-zinc-500 hover:text-zinc-200 text-lg leading-none"
        >
          ✕
        </button>
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">
          {t('pumps.formatTitle')} — PUMP {pumpIndex + 1}
        </h3>
        <div className="flex items-end gap-3">
          <Field label={t('pumps.formatVolume')}>
            <Select
              value={fmt.valueFmt}
              options={fmtOptions(fmt.valueFmt)}
              onChange={(v) => setFmt((p) => ({ ...p, valueFmt: v }))}
              disabled={saving}
              className="w-20"
            />
          </Field>
          <Field label={t('pumps.formatTotalizer')}>
            <Select
              value={fmt.totalFmt}
              options={fmtOptions(fmt.totalFmt)}
              onChange={(v) => setFmt((p) => ({ ...p, totalFmt: v }))}
              disabled={saving}
              className="w-20"
            />
          </Field>
          <Field label={t('pumps.formatPreset')}>
            <Select
              value={fmt.limitFmt}
              options={fmtOptions(fmt.limitFmt)}
              onChange={(v) => setFmt((p) => ({ ...p, limitFmt: v }))}
              disabled={saving}
              className="w-20"
            />
          </Field>
          <Field label={t('pumps.formatDoseLen')}>
            <Select
              value={fmt.limitLen}
              options={PUMP_FORMAT_LEN_OPTIONS}
              onChange={(v) => setFmt((p) => ({ ...p, limitLen: v }))}
              disabled={saving}
              className="w-16"
            />
          </Field>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '...' : t('pumps.formatOk')}
          </button>
        </div>
        {statusMsg && <p className="text-xs text-zinc-400 mt-2">{statusMsg}</p>}
      </div>
    </div>
  );
};

// ---- Main tab ----

export const PumpsTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const storePumps = useSettingsStore((s) => s.pumps);
  const storeFormats = useSettingsStore((s) => s.pumpFormats);

  const [pumps, setPumps] = useState<PumpParams[]>(() =>
    storePumps || Array.from({ length: PUMP_COUNT }, () => ({ ...EMPTY_PUMP })),
  );
  const [formats, setFormats] = useState<PumpFormatParams[]>(() =>
    storeFormats || Array.from({ length: PUMP_COUNT }, () => ({ ...EMPTY_PUMP_FORMAT })),
  );
  const [activePump, setActivePump] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);

  // Populate from store when readAllSettings finishes
  useEffect(() => {
    if (storePumps) setPumps(storePumps);
  }, [storePumps]);

  useEffect(() => {
    if (storeFormats) setFormats(storeFormats);
  }, [storeFormats]);

  useEffect(() => {
    if (!isConnected) {
      setPumps(Array.from({ length: PUMP_COUNT }, () => ({ ...EMPTY_PUMP })));
      setFormats(Array.from({ length: PUMP_COUNT }, () => ({ ...EMPTY_PUMP_FORMAT })));
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
    setStatusMsg(t('pumps.reading'));
    try {
      const next = Array.from({ length: PUMP_COUNT }, () => ({ ...EMPTY_PUMP }));
      for (let i = 1; i <= PUMP_COUNT; i++) {
        const resp = await window.serial.sendCommand(buildPumpReadCmd(password, i));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) continue;
        const p = parsePumpResponse(resp);
        if (p) next[i - 1] = p;
      }
      setPumps(next);
      useSettingsStore.getState().setPumpsSettings(next);

      // Read pump formats
      const fmts = Array.from({ length: PUMP_COUNT }, () => ({ ...EMPTY_PUMP_FORMAT }));
      for (let i = 1; i <= PUMP_COUNT; i++) {
        const fResp = await window.serial.sendCommand(buildPumpFormatReadCmd(password, i));
        if (isPasswordError(fResp)) { await handlePasswordError(); return; }
        if (isErrorResponse(fResp)) continue;
        const f = parsePumpFormatResponse(fResp);
        if (f) fmts[i - 1] = f;
      }
      setFormats(fmts);
      useSettingsStore.getState().setPumpFormats(fmts);

      setStatusMsg(t('pumps.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('pumps.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected && (!useSettingsStore.getState().pumps || !useSettingsStore.getState().pumpFormats)) readSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const saveSettings = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('pumps.saving'));
    try {
      for (let i = 1; i <= PUMP_COUNT; i++) {
        const resp = await window.serial.sendCommand(buildPumpWriteCmd(password, i, pumps[i - 1]));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) throw new Error(`PUMP${i}: ${resp.trim()}`);
      }
      setStatusMsg(t('pumps.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('pumps.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, pumps, handlePasswordError, t]);

  const updatePump = useCallback(<K extends keyof PumpParams>(key: K, value: PumpParams[K]) => {
    setPumps((prev) => {
      const next = prev.slice();
      next[activePump] = { ...next[activePump], [key]: value };
      return next;
    });
  }, [activePump]);

  const busy = loading || saving;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.pumps')}</h2>
        <p className="text-zinc-500 mt-2">{t('pumps.notConnected')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      {/* Sub-tabs for 4 pumps */}
      <div className="flex gap-1">
        {Array.from({ length: PUMP_COUNT }, (_, i) => {
          const isActive = activePump === i;
          const configured = pumps[i].type !== '0';
          return (
            <button
              key={i}
              onClick={() => setActivePump(i)}
              disabled={busy}
              className={`px-5 py-2 text-xs font-medium rounded transition-colors disabled:opacity-50
                ${isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : configured
                    ? 'bg-zinc-800 text-zinc-300 border border-zinc-600 hover:bg-zinc-700'
                    : 'bg-zinc-900 text-zinc-500 border border-zinc-700 hover:bg-zinc-800'
                }`}
            >
              PUMP {i + 1}
            </button>
          );
        })}
      </div>

      {/* Active pump form */}
      <PumpForm
        pumps={pumps}
        activePumpIdx={activePump}
        onChange={updatePump}
        disabled={busy}
      />

      {/* Read / Save / Format buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('pumps.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('pumps.saving') : t('common.save')}
        </button>
        <button
          onClick={() => setFormatDialogOpen(true)}
          disabled={busy || pumps[activePump].type === '0'}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('pumps.formatTitle')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>

      {/* Pump Format Dialog */}
      <PumpFormatDialog
        pumpIndex={activePump}
        format={formats[activePump]}
        open={formatDialogOpen}
        onClose={() => setFormatDialogOpen(false)}
        password={password}
        isConnected={isConnected}
        onSaved={(fmt) => {
          setFormats((prev) => {
            const next = prev.slice();
            next[activePump] = fmt;
            return next;
          });
          useSettingsStore.getState().setPumpFormats(
            formats.map((f, i) => i === activePump ? fmt : f),
          );
        }}
      />
    </div>
  );
};

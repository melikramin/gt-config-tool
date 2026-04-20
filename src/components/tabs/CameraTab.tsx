import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';
import {
  buildCameraReadCmd,
  buildCameraWriteCmd,
  buildCameraConfigCmd,
  buildCameraGetPicCmd,
  parseCameraResponse,
  type CameraParams,
  EMPTY_CAMERA,
  CAMERA_SLOT_COUNT,
  CAMERA_CONFIG_TIMEOUT_MS,
  CAMERA_GETPIC_TIMEOUT_MS,
  CAMERA_BAUDRATE_OPTIONS,
  CAMERA_PIC_SIZE_OPTIONS,
} from '../../lib/commands';

// ---- Response helpers ----

function isErrorResponse(response: string): boolean {
  const t = response.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE') || t.endsWith(';EE');
}

function isPasswordError(response: string): boolean {
  return response.trim().endsWith(';PE');
}

function clampInt(v: string, min: number, max: number, fallback: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return String(Math.max(min, Math.min(max, Math.round(n))));
}

// 16-bit hex mask <-> per-input boolean array. bit 0 = IN1, bit 5 = IN6.
const INPUT_COUNT = 6;

function maskToBits(hex: string): boolean[] {
  const v = parseInt(hex || '0', 16) || 0;
  return Array.from({ length: INPUT_COUNT }, (_, i) => Boolean(v & (1 << i)));
}

function bitsToMask(bits: boolean[], originalHex: string): string {
  // Preserve high bits we don't expose (positions 6..15) so round-trip is lossless.
  const original = parseInt(originalHex || '0', 16) || 0;
  const lowMask = (1 << INPUT_COUNT) - 1;
  let v = original & ~lowMask;
  bits.forEach((b, i) => { if (b) v |= (1 << i); });
  return v.toString(16).toUpperCase().padStart(4, '0');
}

// ---- UI primitives ----

const Panel: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">{title}</h3>
    {children}
  </div>
);

const Cb: FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <div
    onClick={disabled ? undefined : () => onChange(!checked)}
    className={`w-4 h-4 rounded border inline-flex items-center justify-center select-none
      ${disabled ? 'cursor-default opacity-50' : 'cursor-pointer'}
      ${checked ? 'bg-blue-500 border-blue-500' : 'bg-zinc-800 border-zinc-500'}`}
  >
    {checked && (
      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 6l3 3 5-5" />
      </svg>
    )}
  </div>
);

const SelectRow: FC<{
  labelKey: keyof Translations;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}> = ({ labelKey, value, options, onChange, disabled, hint }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-zinc-300 text-xs w-40 shrink-0">{t(labelKey)}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="text-zinc-500 text-xs">{hint}</span>}
    </div>
  );
};

const NumberRow: FC<{
  labelKey: keyof Translations;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  min: number;
  max: number;
  suffix?: string;
  hint?: string;
  widthClass?: string;
}> = ({ labelKey, value, onChange, onBlur, disabled, min, max, suffix, hint, widthClass = 'w-24' }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-zinc-300 text-xs w-40 shrink-0">{t(labelKey)}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none ${widthClass}`}
      />
      {suffix && <span className="text-zinc-400 text-xs">{suffix}</span>}
      {hint && <span className="text-zinc-500 text-xs">{hint}</span>}
    </div>
  );
};

const BitGridRow: FC<{
  labelKey: keyof Translations;
  bits: boolean[];
  onToggle: (idx: number, checked: boolean) => void;
  disabled?: boolean;
}> = ({ labelKey, bits, onToggle, disabled }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-zinc-300 text-xs w-40 shrink-0">{t(labelKey)}</label>
      <div className="flex items-center gap-3">
        {bits.map((b, i) => (
          <label key={i} className={`flex items-center gap-1 text-xs ${disabled ? 'text-zinc-500' : 'text-zinc-300 cursor-pointer'}`}>
            <Cb checked={b} onChange={(v) => onToggle(i, v)} disabled={disabled} />
            <span>IN{i + 1}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

// ---- Main component ----

export const CameraTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const storeCameras = useSettingsStore((s) => s.cameras);

  const emptyList = (): CameraParams[] =>
    Array.from({ length: CAMERA_SLOT_COUNT }, () => ({ ...EMPTY_CAMERA }));

  const [cameras, setCameras] = useState<CameraParams[]>(() => {
    if (!storeCameras) return emptyList();
    return Array.from({ length: CAMERA_SLOT_COUNT }, (_, i) => storeCameras[i] ?? { ...EMPTY_CAMERA });
  });
  const [activeSlot, setActiveSlot] = useState(0);
  const [loaded, setLoaded] = useState<boolean[]>(() =>
    Array.from({ length: CAMERA_SLOT_COUNT }, (_, i) => Boolean(storeCameras?.[i])),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [testingSlot, setTestingSlot] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [confirmConfig, setConfirmConfig] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setCameras(emptyList());
      setLoaded(Array.from({ length: CAMERA_SLOT_COUNT }, () => false));
      setStatusMsg('');
    }
  }, [isConnected]);

  // Sync local state when the store changes (e.g. template load, Read All).
  useEffect(() => {
    if (!storeCameras) return;
    setCameras(Array.from({ length: CAMERA_SLOT_COUNT }, (_, i) => storeCameras[i] ?? { ...EMPTY_CAMERA }));
    setLoaded(Array.from({ length: CAMERA_SLOT_COUNT }, (_, i) => Boolean(storeCameras[i])));
  }, [storeCameras]);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  const persistStore = useCallback((list: CameraParams[], loadedFlags: boolean[]) => {
    useSettingsStore.getState().setCameras(list.map((c, i) => (loadedFlags[i] ? c : null)));
  }, []);

  // ---- Read single slot ----
  const readSlot = useCallback(async (slot: number): Promise<CameraParams | null> => {
    const resp = await window.serial.sendCommand(buildCameraReadCmd(password, slot));
    if (isPasswordError(resp)) { await handlePasswordError(); return null; }
    if (isErrorResponse(resp)) throw new Error(`CAMERA${slot}: ${resp.trim()}`);
    const parsed = parseCameraResponse(resp);
    if (!parsed) throw new Error(`CAMERA${slot}: malformed response`);
    return parsed.params;
  }, [password, handlePasswordError]);

  // ---- Read all slots ----
  const readAll = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setStatusMsg(t('camera.reading'));
    const next = emptyList();
    const flags = Array.from({ length: CAMERA_SLOT_COUNT }, () => false);
    try {
      for (let i = 0; i < CAMERA_SLOT_COUNT; i++) {
        const p = await readSlot(i);
        if (!p) return;
        next[i] = p;
        flags[i] = true;
      }
      setCameras(next);
      setLoaded(flags);
      persistStore(next, flags);
      setStatusMsg(t('camera.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('camera.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, readSlot, persistStore, t]);

  // ---- Read all slots on first connect ----
  useEffect(() => {
    if (!isConnected) return;
    if (useSettingsStore.getState().cameras) return;
    void readAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // ---- Save all slots ----
  const saveAll = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('camera.saving'));
    try {
      for (let i = 0; i < CAMERA_SLOT_COUNT; i++) {
        const cmd = buildCameraWriteCmd(password, i, cameras[i]);
        const resp = await window.serial.sendCommand(cmd);
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) throw new Error(`CAMERA${i}: ${resp.trim()}`);
      }
      persistStore(cameras, Array.from({ length: CAMERA_SLOT_COUNT }, () => true));
      setLoaded(Array.from({ length: CAMERA_SLOT_COUNT }, () => true));
      setStatusMsg(t('camera.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('camera.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, cameras, persistStore, handlePasswordError, t]);

  // ---- Auto-config active slot ----
  const runAutoConfig = useCallback(async () => {
    setConfirmConfig(false);
    if (!isConnected) return;
    setConfiguring(true);
    setStatusMsg(t('camera.configRunning'));
    try {
      const resp = await window.serial.sendCommand(
        buildCameraConfigCmd(password, activeSlot),
        CAMERA_CONFIG_TIMEOUT_MS,
      );
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) throw new Error(resp.trim());
      setStatusMsg(t('camera.configSuccess'));
    } catch (err) {
      setStatusMsg(`${t('camera.configError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConfiguring(false);
    }
  }, [isConnected, password, activeSlot, handlePasswordError, t]);

  // ---- Test capture (GETPIC<n>) ----
  const testSlot = useCallback(async (slot: number) => {
    if (!isConnected) return;
    setTestingSlot(slot);
    setStatusMsg(`${t('camera.testRunning')} (CAMERA${slot})`);
    try {
      const resp = await window.serial.sendCommand(buildCameraGetPicCmd(password, slot), CAMERA_GETPIC_TIMEOUT_MS);
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      const trimmed = resp.trim();
      // OK = camera works; any other tail (EE/CE/FE/DE) = not configured / not responding.
      if (trimmed.endsWith(';OK')) {
        setStatusMsg(`${t('camera.testOk')} (CAMERA${slot})`);
      } else {
        setStatusMsg(`${t('camera.testFail')} (CAMERA${slot}): ${trimmed}`);
      }
    } catch (err) {
      setStatusMsg(`${t('camera.testFail')} (CAMERA${slot}): ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestingSlot(null);
    }
  }, [isConnected, password, handlePasswordError, t]);

  // ---- Local field update ----
  const updateField = useCallback(<K extends keyof CameraParams>(key: K, value: CameraParams[K]) => {
    setCameras((prev) => {
      const next = prev.slice();
      next[activeSlot] = { ...next[activeSlot], [key]: value };
      return next;
    });
  }, [activeSlot]);

  const busy = loading || saving || configuring || testingSlot !== null;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.camera')}</h2>
        <p className="text-zinc-500 mt-2">{t('camera.notConnected')}</p>
      </div>
    );
  }

  const cam = cameras[activeSlot];
  // Camera0 is RS232; Camera1/2 are on RS485.
  const interfaceLabel = activeSlot === 0 ? t('camera.rs232') : t('camera.rs485');

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      {/* Slot selector */}
      <div className="flex gap-1 items-center flex-wrap">
        {Array.from({ length: CAMERA_SLOT_COUNT }, (_, i) => {
          const isActive = activeSlot === i;
          const isLoaded = loaded[i];
          return (
            <button
              key={i}
              onClick={() => setActiveSlot(i)}
              disabled={busy}
              className={`px-4 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-50
                ${isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : isLoaded
                    ? 'bg-zinc-800 text-zinc-300 border border-zinc-600 hover:bg-zinc-700'
                    : 'bg-zinc-900 text-zinc-500 border border-zinc-700 hover:bg-zinc-800'
                }`}
            >
              {t('camera.slot')} {i}
            </button>
          );
        })}
        <span className="text-xs text-zinc-500 ml-3">
          {t('camera.interface')}: <span className="text-zinc-300">{interfaceLabel}</span>
        </span>
      </div>

      <Panel title={t('camera.panelHardware')}>
        <div className="flex items-center gap-3 mb-2">
          <label className="text-zinc-300 text-xs w-40 shrink-0">{t('camera.enable')}</label>
          <Cb checked={cam.enable} onChange={(v) => updateField('enable', v)} disabled={busy} />
        </div>
        <NumberRow
          labelKey="camera.address"
          value={cam.address}
          onChange={(v) => updateField('address', v)}
          onBlur={() => updateField('address', clampInt(cam.address, 0, 16, '0'))}
          disabled={busy}
          min={0}
          max={16}
          hint={t('camera.addressHint')}
        />
        <SelectRow
          labelKey="camera.baudrate"
          value={cam.baudrate}
          options={CAMERA_BAUDRATE_OPTIONS}
          onChange={(v) => updateField('baudrate', v)}
          disabled={busy}
        />
        <SelectRow
          labelKey="camera.picSize"
          value={cam.picSize}
          options={CAMERA_PIC_SIZE_OPTIONS}
          onChange={(v) => updateField('picSize', v)}
          disabled={busy}
        />
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-700/60">
          <span className="text-zinc-300 text-xs w-40 shrink-0">{t('camera.testHint')}</span>
          <button
            onClick={() => testSlot(activeSlot)}
            disabled={busy}
            className="px-4 py-1.5 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {testingSlot === activeSlot ? t('camera.testRunning') : t('camera.test')}
          </button>
        </div>
      </Panel>

      <Panel title={t('camera.panelTriggers')}>
        {/* Timer trigger */}
        <div className="flex items-center gap-3 mb-2">
          <label className="text-zinc-300 text-xs w-40 shrink-0">{t('camera.timerOn')}</label>
          <Cb checked={cam.timerOn} onChange={(v) => updateField('timerOn', v)} disabled={busy} />
        </div>
        <NumberRow
          labelKey="camera.timerInterval"
          value={cam.timerInterval}
          onChange={(v) => updateField('timerInterval', v)}
          onBlur={() => updateField('timerInterval', clampInt(cam.timerInterval, 0, 65535, '0'))}
          disabled={busy || !cam.timerOn}
          min={0}
          max={65535}
          suffix={t('camera.minutes')}
        />

        {/* Input trigger */}
        <div className="flex items-center gap-3 mb-2 mt-3">
          <label className="text-zinc-300 text-xs w-40 shrink-0">{t('camera.inOn')}</label>
          <Cb checked={cam.inOn} onChange={(v) => updateField('inOn', v)} disabled={busy} />
        </div>
        <BitGridRow
          labelKey="camera.inputs"
          bits={maskToBits(cam.inputs)}
          onToggle={(idx, v) => {
            const bits = maskToBits(cam.inputs);
            bits[idx] = v;
            updateField('inputs', bitsToMask(bits, cam.inputs));
          }}
          disabled={busy || !cam.inOn}
        />
        <BitGridRow
          labelKey="camera.inputsPolarity"
          bits={maskToBits(cam.inputsPolarity)}
          onToggle={(idx, v) => {
            const bits = maskToBits(cam.inputsPolarity);
            bits[idx] = v;
            updateField('inputsPolarity', bitsToMask(bits, cam.inputsPolarity));
          }}
          disabled={busy || !cam.inOn}
        />

        {/* Boolean triggers */}
        <div className="flex items-center gap-3 mb-2 mt-3">
          <label className="text-zinc-300 text-xs w-40 shrink-0">{t('camera.shokeOn')}</label>
          <Cb checked={cam.shokeOn} onChange={(v) => updateField('shokeOn', v)} disabled={busy} />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <label className="text-zinc-300 text-xs w-40 shrink-0">{t('camera.tiltOn')}</label>
          <Cb checked={cam.tiltOn} onChange={(v) => updateField('tiltOn', v)} disabled={busy} />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <label className="text-zinc-300 text-xs w-40 shrink-0">{t('camera.ekeyOn')}</label>
          <Cb checked={cam.ekeyOn} onChange={(v) => updateField('ekeyOn', v)} disabled={busy} />
        </div>
      </Panel>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readAll}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading ? t('camera.reading') : t('camera.read')}
        </button>
        <button
          onClick={saveAll}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? t('camera.saving') : t('camera.save')}
        </button>
        <button
          onClick={() => setConfirmConfig(true)}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
        >
          {configuring ? t('camera.configRunning') : t('camera.autoConfig')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>

      {confirmConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-5 max-w-sm w-full mx-4">
            <h3 className="text-zinc-100 text-base font-semibold mb-2">{t('camera.confirmConfigTitle')}</h3>
            <p className="text-zinc-400 text-sm mb-5">{t('camera.confirmConfigDesc')}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmConfig(false)}
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
              >
                {t('sys.confirmCancel')}
              </button>
              <button
                onClick={runAutoConfig}
                className="bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-1.5 rounded"
              >
                {t('sys.confirmProceed')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

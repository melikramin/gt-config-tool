import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import {
  buildInCountCmd,
  buildInputReadCmd,
  buildInputWriteCmd,
  buildEncoderReadCmd,
  buildEncoderWriteCmd,
  parseInputResponse,
  parseEncoderResponse,
  parseInCount,
  EMPTY_INPUT,
  EMPTY_ENCODER,
  type InputParams,
  type EncoderParams,
} from '../../lib/commands';

const MAX_INPUTS = 6;
const THRESHOLD_MAX = 33000;

function isErrorResponse(r: string): boolean {
  const t = r.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
}
const isPasswordError = (r: string) => r.trim().endsWith(';PE');

// ---- small UI primitives ----

const Panel: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">{title}</h3>
    {children}
  </div>
);

const NumInput: FC<{
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
    className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-40 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
  />
);

const Select: FC<{
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
  className?: string;
}> = ({ value, onChange, disabled, options, className }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={`bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-40 focus:border-blue-500 focus:outline-none ${className ?? ''}`}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

const Checkbox: FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled }) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={(e) => onChange(e.target.checked)}
    disabled={disabled}
    className="accent-blue-500 disabled:opacity-40"
  />
);

/**
 * Read-only visualisation of the two thresholds as a single 0..33000 bar:
 *   red  zone [LD..LT]  — non-trigger
 *   gap  zone [LT..HD]  — yellow uncertainty band
 *   green zone [HD..HT] — trigger
 * Values outside [LD..HT] stay neutral (zinc).
 */
const ZoneBar: FC<{
  lowDown: number;
  lowTop: number;
  highDown: number;
  highTop: number;
  disabled?: boolean;
}> = ({ lowDown, lowTop, highDown, highTop, disabled }) => {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / THRESHOLD_MAX) * 100))}%`;
  const redLeft = Math.min(lowDown, lowTop);
  const redRight = Math.max(lowDown, lowTop);
  const greenLeft = Math.min(highDown, highTop);
  const greenRight = Math.max(highDown, highTop);
  return (
    <div
      className={`relative h-2 w-full rounded bg-zinc-800 border border-zinc-700 overflow-hidden ${disabled ? 'opacity-40' : ''}`}
      title={`0 — ${THRESHOLD_MAX} mV`}
    >
      {/* yellow uncertainty band between red and green */}
      {redRight < greenLeft && (
        <div
          className="absolute top-0 bottom-0 bg-yellow-500/70"
          style={{ left: pct(redRight), width: `calc(${pct(greenLeft)} - ${pct(redRight)})` }}
        />
      )}
      <div
        className="absolute top-0 bottom-0 bg-red-500"
        style={{ left: pct(redLeft), width: `calc(${pct(redRight)} - ${pct(redLeft)})` }}
      />
      <div
        className="absolute top-0 bottom-0 bg-green-500"
        style={{ left: pct(greenLeft), width: `calc(${pct(greenRight)} - ${pct(greenLeft)})` }}
      />
    </div>
  );
};

// ---- main component ----

export const InputsOutputsTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const [inputs, setInputs] = useState<InputParams[]>(() =>
    Array.from({ length: MAX_INPUTS }, () => ({ ...EMPTY_INPUT })),
  );
  const [activeCount, setActiveCount] = useState(0);
  const [enc1, setEnc1] = useState<EncoderParams>(EMPTY_ENCODER);
  const [enc2, setEnc2] = useState<EncoderParams>({ ...EMPTY_ENCODER, pinA: '3', pinB: '4' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!isConnected) {
      setInputs(Array.from({ length: MAX_INPUTS }, () => ({ ...EMPTY_INPUT })));
      setActiveCount(0);
      setEnc1(EMPTY_ENCODER);
      setEnc2({ ...EMPTY_ENCODER, pinA: '3', pinB: '4' });
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
    setStatusMsg(t('io.reading'));
    try {
      const respCount = await window.serial.sendCommand(buildInCountCmd(password));
      if (isPasswordError(respCount)) { await handlePasswordError(); return; }
      if (isErrorResponse(respCount)) throw new Error(`IN: ${respCount.trim()}`);
      const count = Math.min(MAX_INPUTS, parseInCount(respCount));
      setActiveCount(count);

      const next = Array.from({ length: MAX_INPUTS }, () => ({ ...EMPTY_INPUT }));
      for (let i = 1; i <= count; i++) {
        const resp = await window.serial.sendCommand(buildInputReadCmd(password, i));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) throw new Error(`IN${i}: ${resp.trim()}`);
        const p = parseInputResponse(resp);
        if (!p) throw new Error(`IN${i}: malformed response`);
        next[i - 1] = p;
      }
      setInputs(next);

      const respE1 = await window.serial.sendCommand(buildEncoderReadCmd(password, 1));
      if (isPasswordError(respE1)) { await handlePasswordError(); return; }
      if (isErrorResponse(respE1)) throw new Error(`ENCODER1: ${respE1.trim()}`);
      const e1 = parseEncoderResponse(respE1);
      if (!e1) throw new Error('ENCODER1: malformed response');
      setEnc1(e1);

      const respE2 = await window.serial.sendCommand(buildEncoderReadCmd(password, 2));
      if (isPasswordError(respE2)) { await handlePasswordError(); return; }
      if (isErrorResponse(respE2)) throw new Error(`ENCODER2: ${respE2.trim()}`);
      const e2 = parseEncoderResponse(respE2);
      if (!e2) throw new Error('ENCODER2: malformed response');
      setEnc2(e2);

      setStatusMsg(t('io.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('io.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected) readSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const saveSettings = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('io.saving'));
    try {
      for (let i = 1; i <= activeCount; i++) {
        const resp = await window.serial.sendCommand(buildInputWriteCmd(password, i, inputs[i - 1]));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) throw new Error(`IN${i}: ${resp.trim()}`);
      }
      const respE1 = await window.serial.sendCommand(buildEncoderWriteCmd(password, 1, enc1));
      if (isPasswordError(respE1)) { await handlePasswordError(); return; }
      if (isErrorResponse(respE1)) throw new Error(`ENCODER1: ${respE1.trim()}`);
      const respE2 = await window.serial.sendCommand(buildEncoderWriteCmd(password, 2, enc2));
      if (isPasswordError(respE2)) { await handlePasswordError(); return; }
      if (isErrorResponse(respE2)) throw new Error(`ENCODER2: ${respE2.trim()}`);
      setStatusMsg(t('io.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('io.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, inputs, activeCount, enc1, enc2, handlePasswordError, t]);

  const updateInput = useCallback(<K extends keyof InputParams>(row: number, key: K, value: InputParams[K]) => {
    setInputs((prev) => {
      const next = prev.slice();
      next[row] = { ...next[row], [key]: value };
      return next;
    });
  }, []);

  const busy = loading || saving;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.inputsOutputs')}</h2>
        <p className="text-zinc-500 mt-2">{t('io.notConnected')}</p>
      </div>
    );
  }

  const modeOptions = [
    { value: '0', label: t('io.modeDigital') },
    { value: '1', label: t('io.modeAnalog') },
    { value: '2', label: t('io.modeFrequency') },
    { value: '3', label: t('io.modePulse') },
  ];
  const pinCount = activeCount || MAX_INPUTS;
  const pinOptions = Array.from({ length: pinCount }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <Panel title={t('io.panelInputs')}>
        <div className="overflow-x-auto">
          <table className="text-xs text-zinc-200">
            <thead>
              <tr className="text-zinc-400">
                <th className="text-left font-normal pr-2 pb-2 w-10">{t('io.colInput')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('io.colMode')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('io.colNonTriggerZone')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('io.colTriggerZone')}</th>
                <th className="text-left font-normal px-2 pb-2 w-24">{t('io.colZoneView')}</th>
                <th className="text-center font-normal px-2 pb-2">{t('io.colPulseReset')}</th>
                <th className="text-left font-normal px-2 pb-2">{t('io.colFilter')}</th>
                <th className="text-center font-normal px-2 pb-2">{t('io.colPriority')}</th>
              </tr>
            </thead>
            <tbody>
              {inputs.map((inp, idx) => {
                if (activeCount > 0 && idx >= activeCount) return null;
                const rowDisabled = busy || idx >= activeCount;
                const isDigital = inp.mode === '0';
                const isPulse = inp.mode === '3';
                // Zones: Digital + Pulse; Pulse reset & Filter: Pulse only; Priority: Digital only.
                const zonesDisabled = rowDisabled || !(isDigital || isPulse);
                const pulseResetDisabled = rowDisabled || !isPulse;
                const filterDisabled = rowDisabled || !isPulse;
                const priorityDisabled = rowDisabled || !isDigital;
                return (
                  <tr key={idx} className="align-middle">
                    <td className="pr-2 py-1 text-zinc-400">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <Select
                        value={inp.mode}
                        onChange={(v) => updateInput(idx, 'mode', v)}
                        disabled={rowDisabled}
                        options={modeOptions}
                        className="w-36"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <NumInput
                          value={inp.lowDown}
                          onChange={(v) => updateInput(idx, 'lowDown', v)}
                          disabled={zonesDisabled}
                          min={0}
                          max={THRESHOLD_MAX}
                          className="w-16"
                        />
                        <span className="text-zinc-500">–</span>
                        <NumInput
                          value={inp.lowTop}
                          onChange={(v) => updateInput(idx, 'lowTop', v)}
                          disabled={zonesDisabled}
                          min={0}
                          max={THRESHOLD_MAX}
                          className="w-16"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <NumInput
                          value={inp.highDown}
                          onChange={(v) => updateInput(idx, 'highDown', v)}
                          disabled={zonesDisabled}
                          min={0}
                          max={THRESHOLD_MAX}
                          className="w-16"
                        />
                        <span className="text-zinc-500">–</span>
                        <NumInput
                          value={inp.highTop}
                          onChange={(v) => updateInput(idx, 'highTop', v)}
                          disabled={zonesDisabled}
                          min={0}
                          max={THRESHOLD_MAX}
                          className="w-16"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      {!(isDigital || isPulse) ? (
                        <div className="h-2 w-full rounded bg-zinc-800 border border-zinc-700 opacity-30" />
                      ) : (
                        <ZoneBar
                          lowDown={Number(inp.lowDown) || 0}
                          lowTop={Number(inp.lowTop) || 0}
                          highDown={Number(inp.highDown) || 0}
                          highTop={Number(inp.highTop) || 0}
                          disabled={rowDisabled}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <Checkbox
                        checked={inp.pulseReset === '1'}
                        onChange={(v) => updateInput(idx, 'pulseReset', v ? '1' : '0')}
                        disabled={pulseResetDisabled}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <NumInput
                        value={inp.filterPulse}
                        onChange={(v) => updateInput(idx, 'filterPulse', v)}
                        disabled={filterDisabled}
                        min={1}
                        max={250}
                        className="w-16"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <Checkbox
                        checked={inp.reportStatus === '1'}
                        onChange={(v) => updateInput(idx, 'reportStatus', v ? '1' : '0')}
                        disabled={priorityDisabled}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={t('io.panelEncoders')}>
        <div className="grid grid-cols-[160px_repeat(3,auto)] items-center gap-x-4 gap-y-2 text-xs text-zinc-300">
          <div />
          <div className="text-zinc-400">{t('io.channelA')}</div>
          <div className="text-zinc-400">{t('io.channelB')}</div>
          <div className="text-zinc-400">{t('io.value')}</div>

          <div>{t('io.pulsar1')}:</div>
          <Select
            value={enc1.pinA}
            onChange={(v) => setEnc1((p) => ({ ...p, pinA: v }))}
            disabled={busy}
            options={pinOptions}
            className="w-16"
          />
          <Select
            value={enc1.pinB}
            onChange={(v) => setEnc1((p) => ({ ...p, pinB: v }))}
            disabled={busy}
            options={pinOptions}
            className="w-16"
          />
          <div className="text-zinc-400">{enc1.counter}</div>

          <div>{t('io.pulsar2')}:</div>
          <Select
            value={enc2.pinA}
            onChange={(v) => setEnc2((p) => ({ ...p, pinA: v }))}
            disabled={busy}
            options={pinOptions}
            className="w-16"
          />
          <Select
            value={enc2.pinB}
            onChange={(v) => setEnc2((p) => ({ ...p, pinB: v }))}
            disabled={busy}
            options={pinOptions}
            className="w-16"
          />
          <div className="text-zinc-400">{enc2.counter}</div>
        </div>
      </Panel>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('io.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('io.saving') : t('common.save')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>
    </div>
  );
};

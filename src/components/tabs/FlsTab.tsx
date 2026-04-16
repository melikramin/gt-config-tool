import { type FC, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import {
  FLS_MAX_SENSORS,
  FLS_CALIB_POINTS,
  FLS_CALIB_BATCH,
  EMPTY_LLS,
  EMPTY_CALIB_POINT,
  buildLlsReadCmd,
  buildLlsWriteCmd,
  parseLlsSettings,
  buildLlsCalReadCmd,
  buildLlsCalWriteCmd,
  parseLlsCalResponse,
  type LlsSettings,
  type CalibPoint,
} from '../../lib/commands';

// ---- Helpers ----

const isErrorResponse = (r: string): boolean => {
  const t = r.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
};
const isPasswordError = (r: string) => r.trim().endsWith(';PE');

const makeEmptyPoints = (): CalibPoint[] =>
  Array.from({ length: FLS_CALIB_POINTS }, () => ({ ...EMPTY_CALIB_POINT }));

// ---- Small UI primitives ----

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

// ---- Calibration chart (inline SVG) ----

const CalibChart: FC<{ points: CalibPoint[] }> = ({ points }) => {
  const W = 440;
  const H = 240;
  const PAD = 36;

  // Keep points up to the last non-zero entry (so leading (0,0) rows are included).
  const data = useMemo(() => {
    let lastSet = -1;
    for (let i = points.length - 1; i >= 0; i--) {
      const r = Number(points[i].raw);
      const v = Number(points[i].volume);
      if ((Number.isFinite(r) && r > 0) || (Number.isFinite(v) && v > 0)) {
        lastSet = i;
        break;
      }
    }
    if (lastSet < 0) return [];
    const rows = points.slice(0, lastSet + 1).map((p, i) => ({
      idx: i,
      raw: Number(p.raw) || 0,
      vol: Number(p.volume) || 0,
    }));
    rows.sort((a, b) => a.raw - b.raw);
    return rows;
  }, [points]);

  const hasData = data.length >= 2;
  const minX = hasData ? data[0].raw : 0;
  const maxX = hasData ? data[data.length - 1].raw : 4095;
  const minY = 0;
  const maxY = hasData ? Math.max(...data.map((r) => r.vol), 1) : 100;

  const xScale = (x: number) => PAD + ((x - minX) / (maxX - minX || 1)) * (W - PAD * 2);
  const yScale = (y: number) => H - PAD - ((y - minY) / (maxY - minY || 1)) * (H - PAD * 2);

  const path = hasData
    ? data.map((r, i) => `${i === 0 ? 'M' : 'L'}${xScale(r.raw).toFixed(1)},${yScale(r.vol).toFixed(1)}`).join(' ')
    : '';

  // Axis ticks
  const xTicks = 5;
  const yTicks = 5;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => minX + ((maxX - minX) * i) / xTicks);
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minY + ((maxY - minY) * i) / yTicks);

  return (
    <svg width={W} height={H} className="bg-zinc-950 border border-zinc-700 rounded">
      {/* Grid */}
      {xTickVals.map((v, i) => (
        <line key={`vx${i}`} x1={xScale(v)} y1={PAD} x2={xScale(v)} y2={H - PAD} stroke="#27272a" strokeWidth={1} />
      ))}
      {yTickVals.map((v, i) => (
        <line key={`hy${i}`} x1={PAD} y1={yScale(v)} x2={W - PAD} y2={yScale(v)} stroke="#27272a" strokeWidth={1} />
      ))}
      {/* Axes */}
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#52525b" strokeWidth={1} />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#52525b" strokeWidth={1} />
      {/* Tick labels */}
      {xTickVals.map((v, i) => (
        <text key={`tx${i}`} x={xScale(v)} y={H - PAD + 14} fontSize="10" fill="#a1a1aa" textAnchor="middle">
          {Math.round(v)}
        </text>
      ))}
      {yTickVals.map((v, i) => (
        <text key={`ty${i}`} x={PAD - 6} y={yScale(v) + 3} fontSize="10" fill="#a1a1aa" textAnchor="end">
          {Math.round(v)}
        </text>
      ))}
      {/* Curve */}
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth={2} />
      {/* Points */}
      {data.map((r, i) => (
        <circle key={i} cx={xScale(r.raw)} cy={yScale(r.vol)} r={3} fill="#60a5fa" />
      ))}
      {/* Axis labels */}
      <text x={W / 2} y={H - 4} fontSize="10" fill="#71717a" textAnchor="middle">raw</text>
      <text x={10} y={H / 2} fontSize="10" fill="#71717a" textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`}>L</text>
    </svg>
  );
};

// ---- Calibration modal ----

interface CalibModalProps {
  sensorIdx: number;  // 1..6
  onClose: () => void;
}

const CalibModal: FC<CalibModalProps> = ({ sensorIdx, onClose }) => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const [points, setPoints] = useState<CalibPoint[]>(makeEmptyPoints);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);  // 0..FLS_CALIB_POINTS for reads
  const [statusMsg, setStatusMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  const readCalibration = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setProgress(0);
    setStatusMsg(t('fls.readingCalib'));
    const next = makeEmptyPoints();
    try {
      for (let i = 0; i < FLS_CALIB_POINTS; i++) {
        const resp = await window.serial.sendCommand(buildLlsCalReadCmd(password, sensorIdx, i));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) {
          // DE = end-of-data; stop quietly.
          break;
        }
        const pt = parseLlsCalResponse(resp);
        if (pt) next[i] = pt;
        setProgress(i + 1);
      }
      setPoints(next);
      setStatusMsg(t('fls.calibReadSuccess'));
    } catch (err) {
      setStatusMsg(`${t('fls.calibReadError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, sensorIdx, handlePasswordError, t]);

  // Auto-read on modal open.
  useEffect(() => {
    void readCalibration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeCalibration = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setProgress(0);
    setStatusMsg(t('fls.writingCalib'));
    try {
      const batches = Math.ceil(FLS_CALIB_POINTS / FLS_CALIB_BATCH);
      for (let b = 0; b < batches; b++) {
        const start = b * FLS_CALIB_BATCH;
        const slice = points.slice(start, start + FLS_CALIB_BATCH);
        const resp = await window.serial.sendCommand(buildLlsCalWriteCmd(password, sensorIdx, start, slice));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) throw new Error(`LLSCAL${sensorIdx}: ${resp.trim()}`);
        setProgress((b + 1) * FLS_CALIB_BATCH);
      }
      setStatusMsg(t('fls.calibWriteSuccess'));
    } catch (err) {
      setStatusMsg(`${t('fls.calibWriteError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, sensorIdx, points, handlePasswordError, t]);

  const updatePoint = useCallback((idx: number, key: keyof CalibPoint, value: string) => {
    setPoints((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }, []);

  const clearPoints = useCallback(() => {
    setPoints(makeEmptyPoints());
    setStatusMsg('');
  }, []);

  // ---- XLSX import/export ----
  // Format: 2 columns (SensorValue, TrendValue). Only non-empty rows are exported;
  // on import, rows map to positions 0..N-1 (no explicit index column).

  const exportXlsx = useCallback(() => {
    // Drop trailing all-zero rows so the file matches what the user actually set.
    let lastSet = -1;
    for (let i = points.length - 1; i >= 0; i--) {
      const r = Number(points[i].raw);
      const v = Number(points[i].volume);
      if ((Number.isFinite(r) && r > 0) || (Number.isFinite(v) && v > 0)) {
        lastSet = i;
        break;
      }
    }
    const rows: Array<Array<string | number>> = [['SensorValue', 'TrendValue']];
    for (let i = 0; i <= lastSet; i++) {
      rows.push([Number(points[i].raw) || 0, Number(points[i].volume) || 0]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calibration');
    XLSX.writeFile(wb, `lls${sensorIdx}_calibration.xlsx`);
  }, [points, sensorIdx]);

  const onImportFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('empty workbook');
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
      const next = makeEmptyPoints();
      let dst = 0;
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const a = row[0];
        const b = row[1];
        // Skip header: if either cell is non-numeric text, skip the row.
        const an = typeof a === 'number' ? a : Number(a);
        const bn = typeof b === 'number' ? b : Number(b);
        if (!Number.isFinite(an) || !Number.isFinite(bn)) continue;
        if (dst >= FLS_CALIB_POINTS) break;
        next[dst++] = { raw: String(an), volume: String(bn) };
      }
      setPoints(next);
      setStatusMsg(t('fls.csvImportSuccess'));
    } catch (err) {
      setStatusMsg(`${t('fls.csvImportError')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [t]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void onImportFile(file);
    e.target.value = '';
  }, [onImportFile]);

  const busy = loading || saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-[820px] max-w-[95vw] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-200">
            {t('fls.modalTitle')} — LLS {sensorIdx}
          </h3>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-zinc-400 hover:text-zinc-200 disabled:opacity-40 text-xl leading-none px-2"
            title={t('fls.modalClose')}
          >
            ×
          </button>
        </div>

        <div className="flex">
          {/* Left: table — scrolls within the chart+buttons column height. */}
          <div className="w-[340px] border-r border-zinc-800 overflow-y-auto max-h-[420px]">
            <table className="w-full text-xs text-zinc-200">
              <thead className="sticky top-0 bg-zinc-900 z-10">
                <tr className="text-zinc-400 border-b border-zinc-700">
                  <th className="text-left font-normal px-2 py-1 w-10">{t('fls.colPointIdx')}</th>
                  <th className="text-left font-normal px-2 py-1">{t('fls.colRaw')}</th>
                  <th className="text-left font-normal px-2 py-1">{t('fls.colVolume')}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((pt, idx) => (
                  <tr key={idx} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                    <td className="px-2 py-0.5 text-zinc-500">{idx}</td>
                    <td className="px-2 py-0.5">
                      <NumInput
                        value={pt.raw}
                        onChange={(v) => updatePoint(idx, 'raw', v)}
                        disabled={busy}
                        min={0}
                        max={4095}
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-0.5">
                      <NumInput
                        value={pt.volume}
                        onChange={(v) => updatePoint(idx, 'volume', v)}
                        disabled={busy}
                        min={0}
                        max={99999}
                        className="w-24"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right: chart + actions */}
          <div className="flex-1 p-4 flex flex-col gap-3">
            <div className="text-xs text-zinc-400">{t('fls.chartTitle')}</div>
            <CalibChart points={points} />

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={readCalibration}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
              >
                {t('fls.readCalib')}
              </button>
              <button
                onClick={writeCalibration}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? t('fls.writingCalib') : t('fls.writeCalib')}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
              >
                {t('fls.importCsv')}
              </button>
              <button
                onClick={exportXlsx}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
              >
                {t('fls.exportCsv')}
              </button>
              <button
                onClick={clearPoints}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
              >
                {t('fls.clearPoints')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={onFileChange}
                className="hidden"
              />
            </div>

            <div className="text-xs text-zinc-400 min-h-[1rem]">
              {loading ? `${t('fls.readingCalib')} ${progress}/${FLS_CALIB_POINTS}` : statusMsg}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- Main tab ----

export const FlsTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const [sensors, setSensors] = useState<LlsSettings[]>(() =>
    Array.from({ length: FLS_MAX_SENSORS }, () => ({ ...EMPTY_LLS })),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [calibSensor, setCalibSensor] = useState<number | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setSensors(Array.from({ length: FLS_MAX_SENSORS }, () => ({ ...EMPTY_LLS })));
      setStatusMsg('');
      setCalibSensor(null);
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
    setStatusMsg(t('fls.reading'));
    try {
      const next = Array.from({ length: FLS_MAX_SENSORS }, () => ({ ...EMPTY_LLS }));
      for (let i = 1; i <= FLS_MAX_SENSORS; i++) {
        const resp = await window.serial.sendCommand(buildLlsReadCmd(password, i));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) {
          // Leave defaults for this slot; keep going.
          continue;
        }
        const p = parseLlsSettings(resp);
        if (p) next[i - 1] = p;
      }
      setSensors(next);
      setStatusMsg(t('fls.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('fls.readError')}: ${err instanceof Error ? err.message : String(err)}`);
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
    setStatusMsg(t('fls.saving'));
    try {
      for (let i = 1; i <= FLS_MAX_SENSORS; i++) {
        const resp = await window.serial.sendCommand(buildLlsWriteCmd(password, i, sensors[i - 1]));
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) throw new Error(`LLS${i}: ${resp.trim()}`);
      }
      setStatusMsg(t('fls.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('fls.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, sensors, handlePasswordError, t]);

  const updateSensor = useCallback(<K extends keyof LlsSettings>(row: number, key: K, value: LlsSettings[K]) => {
    setSensors((prev) => {
      const next = prev.slice();
      next[row] = { ...next[row], [key]: value };
      return next;
    });
  }, []);

  const busy = loading || saving;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.fls')}</h2>
        <p className="text-zinc-500 mt-2">{t('fls.notConnected')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <Panel title={t('fls.panelSensors')}>
        <table className="text-xs text-zinc-200">
          <thead>
            <tr className="text-zinc-400">
              <th className="text-left font-normal pr-2 pb-2 w-8">{t('fls.colNum')}</th>
              <th className="text-center font-normal px-2 pb-2">{t('fls.colEnable')}</th>
              <th className="text-left font-normal px-2 pb-2">{t('fls.colAddress')}</th>
              <th className="text-left font-normal px-2 pb-2">{t('fls.colCapacity')}</th>
              <th className="text-left font-normal px-2 pb-2">{t('fls.colLowAlarm')}</th>
              <th className="text-left font-normal px-2 pb-2">{t('fls.colHighAlarm')}</th>
              <th className="text-left font-normal px-2 pb-2">{t('fls.colProduct')}</th>
              <th className="text-left font-normal px-2 pb-2">{t('fls.colCalibration')}</th>
            </tr>
          </thead>
          <tbody>
            {sensors.map((s, idx) => {
              const rowDisabled = busy;
              const fieldsDisabled = rowDisabled || !s.enable;
              return (
                <tr key={idx} className="align-middle">
                  <td className="pr-2 py-1 text-zinc-400">{idx + 1}</td>
                  <td className="px-2 py-1 text-center">
                    <Checkbox
                      checked={s.enable}
                      onChange={(v) => updateSensor(idx, 'enable', v)}
                      disabled={rowDisabled}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <NumInput
                      value={s.address}
                      onChange={(v) => updateSensor(idx, 'address', v)}
                      disabled={fieldsDisabled}
                      min={1}
                      max={6}
                      className="w-14"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <NumInput
                      value={s.capacity}
                      onChange={(v) => updateSensor(idx, 'capacity', v)}
                      disabled={fieldsDisabled}
                      min={0}
                      className="w-24"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <NumInput
                      value={s.lowAlarm}
                      onChange={(v) => updateSensor(idx, 'lowAlarm', v)}
                      disabled={fieldsDisabled}
                      min={0}
                      className="w-20"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <NumInput
                      value={s.highAlarm}
                      onChange={(v) => updateSensor(idx, 'highAlarm', v)}
                      disabled={fieldsDisabled}
                      min={0}
                      className="w-20"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value=""
                      disabled
                      className="w-28 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-500 opacity-60"
                    >
                      <option value="">{t('fls.productPlaceholder')}</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <button
                      onClick={() => setCalibSensor(idx + 1)}
                      disabled={rowDisabled || !s.enable}
                      className="px-3 py-1 text-xs rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
                    >
                      {t('fls.calibrate')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('fls.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('fls.saving') : t('common.save')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>

      {calibSensor !== null && (
        <CalibModal sensorIdx={calibSensor} onClose={() => setCalibSensor(null)} />
      )}
    </div>
  );
};

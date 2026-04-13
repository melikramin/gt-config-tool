import { type FC, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import { usePolling } from '../../hooks/usePolling';
import {
  buildInitCommands,
  buildGsmCommand,
  buildPollingCommands,
  buildOutputCmd,
  buildAddTagCmd,
} from '../../lib/commands';
import {
  parseDev,
  parseGsm,
  parseVer,
  parseDate,
  parseRep,
  parseFuel,
  parseIn,
  parseOut,
  parseLls,
  parseEncoder,
  parseTags,
  gsmStatusText,
  wifiStatusText,
  rssiToPercent,
  INPUT_TYPES,
  INPUT_TYPES_RU,
  type DevData,
  type GsmData,
  type VerData,
  type DateData,
  type RepData,
  type FuelData,
  type InData,
  type OutData,
  type LlsData,
  type EncoderData,
  type TagsData,
} from '../../lib/parsers';

// ---- State shape ----

interface StatusState {
  dev: DevData;
  gsm: GsmData;
  ver: VerData;
  date: DateData;
  rep: RepData;
  fuel: FuelData;
  inputs: InData;
  outputs: OutData;
  lls: LlsData[];
  encoder1: EncoderData;
  encoder2: EncoderData;
  tags: TagsData;
}

const EMPTY_LLS: LlsData = { height: '', volume: '', temperature: '', density: '', mass: '' };

const INITIAL_STATE: StatusState = {
  dev: { deviceName: '', deviceId: '' },
  gsm: { status: '', rssi: '', imei: '' },
  ver: { hardwareType: '', firmwareVersion: '', releaseDate: '', deviceName: '' },
  date: { date: '', time: '' },
  rep: { extBattery: '', latitude: '', longitude: '', satellites: '', gsmStatus: '', gsmRssi: '', wifiStatus: '', wifiRssi: '', intTemp: '', lastTagId: '' },
  fuel: { pumps: [{ status: '', dose: '', total: '' }, { status: '', dose: '', total: '' }, { status: '', dose: '', total: '' }, { status: '', dose: '', total: '' }] },
  inputs: { count: 0, inputs: [] },
  outputs: { count: 0, outputs: [] },
  lls: [EMPTY_LLS, EMPTY_LLS, EMPTY_LLS, EMPTY_LLS, EMPTY_LLS, EMPTY_LLS],
  encoder1: { counter: '' },
  encoder2: { counter: '' },
  tags: { memory: '', limit: '', added: '' },
};

// ---- Helpers ----

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

const CopyBtn: FC<{ value: string }> = ({ value }) => {
  if (!value) return null;
  return (
    <button
      onClick={() => copyToClipboard(value)}
      className="ml-1.5 text-zinc-500 hover:text-zinc-300 text-[10px] border border-zinc-600 rounded px-1 leading-4"
      title="Copy"
    >
      copy
    </button>
  );
};

const Field: FC<{ label: string; value: string; copy?: boolean }> = ({ label, value, copy }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-zinc-400 text-xs">{label}</span>
    <span className="text-zinc-200 text-xs font-mono flex items-center">
      {value || '—'}
      {copy && <CopyBtn value={value} />}
    </span>
  </div>
);

const Panel: FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-zinc-900 border border-zinc-700 rounded p-3 ${className ?? ''}`}>
    <h3 className="text-sm font-semibold text-zinc-300 mb-2 border-b border-zinc-700 pb-1">{title}</h3>
    {children}
  </div>
);

// ---- Main component ----

export const StatusTab: FC = () => {
  const { password, isConnected, setConnected, setDeviceImei } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t, locale } = useI18n();

  const [state, setState] = useState<StatusState>(INITIAL_STATE);
  const [addTagInput, setAddTagInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [initDone, setInitDone] = useState(false);
  const [imeiLoaded, setImeiLoaded] = useState(false);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try {
      await window.serial.disconnect();
    } catch {
      // ignore
    }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const debugRef = useRef<HTMLPreElement>(null);

  const addDebugLine = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions);
    setDebugLog((prev) => {
      const next = [...prev, `[${ts}] ${line}`];
      return next.length > 300 ? next.slice(-300) : next;
    });
  }, []);

  // Auto-scroll debug log
  useEffect(() => {
    if (debugRef.current) {
      debugRef.current.scrollTop = debugRef.current.scrollHeight;
    }
  }, [debugLog]);

  // Reset state on disconnect
  useEffect(() => {
    if (!isConnected) {
      setState(INITIAL_STATE);
      setInitDone(false);
      setImeiLoaded(false);
    }
  }, [isConnected]);

  // --- Phase 1: One-shot init commands (LOG;RESET, DEV, VER) on connect ---
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    const init = async () => {
      const cmds = buildInitCommands(password);
      for (const cmd of cmds) {
        if (cancelled) return;
        try {
          addDebugLine(`TX → ${cmd}`);
          const response = await window.serial.sendCommand(cmd);
          addDebugLine(`RX ← ${response}`);
          if (cancelled) return;
          const cmdName = cmd.replace(/^\$[^;]*;/, '').split(';')[0].toUpperCase();
          if (cmdName === 'DEV') {
            const dev = parseDev(response);
            setState((prev) => ({ ...prev, dev }));
          } else if (cmdName === 'VER') {
            const ver = parseVer(response);
            setState((prev) => ({ ...prev, ver }));
          }
        } catch (err) {
          addDebugLine(`ERR: ${(err as Error).message}`);
        }
      }
      if (!cancelled) {
        addDebugLine('--- Init done, starting polling ---');
        setInitDone(true);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [isConnected, password]);

  // --- Phase 2: GSM polling until IMEI is loaded ---
  const gsmCommand = useMemo(() => buildGsmCommand(password), [password]);
  const gsmCommands = useMemo(() => [gsmCommand], [gsmCommand]);

  const handleGsmResponse = useCallback((_cmd: string, response: string) => {
    addDebugLine(`TX → ${_cmd}`);
    addDebugLine(`RX ← ${response}`);
    const gsm = parseGsm(response);
    setState((prev) => ({ ...prev, gsm }));
    if (gsm.imei && gsm.imei !== '0' && gsm.imei !== '') {
      setImeiLoaded(true);
      setDeviceImei(gsm.imei);
    }
  }, [addDebugLine, setDeviceImei]);

  usePolling(gsmCommands, isConnected && initDone && !imeiLoaded, handleGsmResponse, 1000, 50, handlePasswordError);

  // --- Phase 3: Cyclic polling for everything else ---
  const pollingCommands = useMemo(() => buildPollingCommands(password), [password]);

  const handleResponse = useCallback((_cmd: string, response: string) => {
    addDebugLine(`TX → ${_cmd}`);
    addDebugLine(`RX ← ${response}`);
    // Extract command name from the response itself ($COMMAND;...)
    const trimmed = response.trim();
    if (!trimmed.startsWith('$')) {
      addDebugLine(`⚠ SKIP: response doesn't start with $`);
      return;
    }
    const cmdName = trimmed.slice(1).split(';')[0].toUpperCase();

    setState((prev) => {
      switch (cmdName) {
        case 'DATE':
          return { ...prev, date: parseDate(response) };
        case 'REP':
          return { ...prev, rep: parseRep(response) };
        case 'FUEL':
          return { ...prev, fuel: parseFuel(response) };
        case 'IN':
          return { ...prev, inputs: parseIn(response) };
        case 'OUT':
          return { ...prev, outputs: parseOut(response) };
        case 'LLS1': case 'LLS2': case 'LLS3':
        case 'LLS4': case 'LLS5': case 'LLS6': {
          const idx = parseInt(cmdName.slice(3), 10) - 1;
          const lls = [...prev.lls];
          lls[idx] = parseLls(response);
          return { ...prev, lls };
        }
        case 'ENCODER1':
          return { ...prev, encoder1: parseEncoder(response) };
        case 'ENCODER2':
          return { ...prev, encoder2: parseEncoder(response) };
        case 'TAGS':
          return { ...prev, tags: parseTags(response) };
        default:
          addDebugLine(`⚠ UNKNOWN cmd: ${cmdName}`);
          return prev;
      }
    });
  }, [addDebugLine]);

  usePolling(pollingCommands, isConnected && initDone, handleResponse, 200, 50, handlePasswordError);

  // Toggle output ON/OFF
  const handleOutputToggle = useCallback(async (index: number, on: boolean) => {
    if (!isConnected || isSending) return;
    setIsSending(true);
    try {
      await window.serial.sendCommand(buildOutputCmd(password, index, on));
    } catch (err) {
      setLastError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }, [isConnected, isSending, password, setLastError]);

  // Add tag
  const handleAddTag = useCallback(async (tagId: string) => {
    const id = tagId.trim();
    if (!id || !isConnected || isSending) return;
    setIsSending(true);
    try {
      await window.serial.sendCommand(buildAddTagCmd(password, id));
      setAddTagInput('');
    } catch (err) {
      setLastError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }, [isConnected, isSending, password, setLastError]);

  const { dev, gsm, ver, date: dt, rep, fuel, inputs, outputs, lls, encoder1, encoder2, tags } = state;

  const inputTypeMap = locale === 'ru' ? INPUT_TYPES_RU : INPUT_TYPES;

  return (
    <div className="p-3 overflow-auto h-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">

        {/* ---- 1. Identification ---- */}
        <Panel title={t('status.identification')}>
          <Field label={t('status.series')} value={dev.deviceId} copy />
          <Field label="IMEI" value={gsm.imei} copy />
          <Field
            label={t('status.firmware')}
            value={ver.firmwareVersion && ver.releaseDate ? `${ver.firmwareVersion} — ${ver.releaseDate}` : ''}
          />
          <Field label={t('status.device')} value={ver.deviceName || dev.deviceName} />
        </Panel>

        {/* ---- 2. Status ---- */}
        <Panel title={t('status.statusPanel')}>
          <Field
            label={t('status.time')}
            value={dt.date && dt.time ? `${dt.date} ${dt.time}` : ''}
          />
          {(() => {
            const mv = parseInt(rep.extBattery, 10);
            const hasValue = Number.isFinite(mv);
            const volts = hasValue ? (mv / 1000).toFixed(2) : '';
            const low = hasValue && mv < 11000;
            return (
              <div className="flex items-center justify-between py-0.5">
                <span className="text-zinc-400 text-xs">{t('status.power')}</span>
                <span
                  className={`text-xs font-mono ${low ? 'text-red-500 font-semibold' : 'text-zinc-200'}`}
                >
                  {hasValue ? `${volts} В` : '—'}
                </span>
              </div>
            );
          })()}
          <div className="flex items-center justify-between py-0.5">
            <span className="text-zinc-400 text-xs">{t('status.latLon')}</span>
            <span className="text-zinc-200 text-xs font-mono">
              {rep.latitude && rep.longitude ? (
                <a
                  href={`https://www.google.com/maps?q=${rep.latitude},${rep.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline"
                >
                  {rep.latitude}, {rep.longitude}
                </a>
              ) : (
                'NA, NA'
              )}
            </span>
          </div>
          <Field label={t('status.satellites')} value={rep.satellites} />
          <Field
            label={t('status.gsmStatus')}
            value={rep.gsmStatus ? `${gsmStatusText(rep.gsmStatus, locale)} (${rssiToPercent(rep.gsmRssi)})` : ''}
          />
          <Field
            label={t('status.wifiStatus')}
            value={rep.wifiStatus ? `${wifiStatusText(rep.wifiStatus, locale)} (${rep.wifiRssi} dBm)` : ''}
          />
          <Field label={t('status.intTemp')} value={rep.intTemp ? `${rep.intTemp} °C` : ''} />
        </Panel>

        {/* ---- 3. Pumps ---- */}
        <Panel title={t('status.pumps')}>
          <div className="grid grid-cols-4 gap-2 text-center">
            {fuel.pumps.map((p, i) => {
              const active = p.status !== '' && p.status !== '-0001';
              return (
                <div key={i} className="space-y-1">
                  <div
                    className={`text-xs font-bold rounded px-1 py-0.5 ${
                      active ? 'bg-green-800 text-green-200' : 'bg-red-900/60 text-red-300'
                    }`}
                  >
                    P{i + 1}
                  </div>
                  <div className="text-xs text-zinc-300 font-mono">{p.dose || '—'}</div>
                  <div className="text-[10px] text-zinc-500">C{i + 1}: {p.total || '—'}</div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* ---- 4. Inputs / Outputs ---- */}
        <Panel title={t('status.inputsOutputs')}>
          {/* Inputs */}
          <div className="mb-2">
            <div className="text-xs text-zinc-500 mb-1">{t('status.inputs')} ({inputs.count})</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {inputs.inputs.map((inp, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-zinc-400">
                    IN{i + 1}
                    <span className="text-zinc-600 ml-1 text-[10px]">
                      {inputTypeMap[inp.type] ?? inp.type}
                    </span>
                  </span>
                  <span className="text-zinc-200 font-mono">{inp.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Encoders */}
          <div className="mb-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">E1</span>
                <span className="text-zinc-200 font-mono">{encoder1.counter || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">E2</span>
                <span className="text-zinc-200 font-mono">{encoder2.counter || '—'}</span>
              </div>
            </div>
          </div>

          {/* Outputs with ON/OFF */}
          <div>
            <div className="text-xs text-zinc-500 mb-1">{t('status.outputs')} ({outputs.count})</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {outputs.outputs.map((out, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">OUT{i + 1}</span>
                  <span className="text-zinc-200 font-mono mr-2">{out.value}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOutputToggle(i + 1, true)}
                      disabled={!isConnected || isSending}
                      className="text-[10px] bg-green-700 hover:bg-green-600 text-white px-1.5 py-0.5 rounded disabled:opacity-40"
                    >
                      ON
                    </button>
                    <button
                      onClick={() => handleOutputToggle(i + 1, false)}
                      disabled={!isConnected || isSending}
                      className="text-[10px] bg-red-700 hover:bg-red-600 text-white px-1.5 py-0.5 rounded disabled:opacity-40"
                    >
                      OFF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* ---- 5. Level Sensors ---- */}
        <Panel title={t('status.levelSensors')}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="text-left py-1 pr-1 font-medium">#</th>
                <th className="text-right py-1 px-1 font-medium">{t('status.height')}</th>
                <th className="text-right py-1 px-1 font-medium">{t('status.volume')}</th>
                <th className="text-right py-1 px-1 font-medium">{t('status.temperature')}</th>
                <th className="text-right py-1 px-1 font-medium">{t('status.density')}</th>
                <th className="text-right py-1 pl-1 font-medium">{t('status.mass')}</th>
              </tr>
            </thead>
            <tbody>
              {lls.map((sensor, i) => {
                const noData = !sensor.height && !sensor.volume;
                const disconnected = sensor.height === '-1' && sensor.volume === '-1';
                if (noData) {
                  return (
                    <tr key={i} className="border-b border-zinc-800 opacity-40">
                      <td className="py-1 pr-1 text-zinc-400 font-medium">{i + 1}</td>
                      <td colSpan={5} className="py-1 px-1 text-center text-zinc-500">—</td>
                    </tr>
                  );
                }
                if (disconnected) {
                  return (
                    <tr key={i} className="border-b border-zinc-800 opacity-50">
                      <td className="py-1 pr-1 text-zinc-400 font-medium">{i + 1}</td>
                      <td colSpan={5} className="py-1 px-1 text-center text-red-400">{t('status.noSensorData')}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={i} className="border-b border-zinc-800">
                    <td className="py-1 pr-1 text-zinc-400 font-medium">{i + 1}</td>
                    <td className="py-1 px-1 text-right text-zinc-200 font-mono">{sensor.height}</td>
                    <td className="py-1 px-1 text-right text-zinc-200 font-mono">{sensor.volume}</td>
                    <td className="py-1 px-1 text-right text-zinc-200 font-mono">{sensor.temperature}</td>
                    <td className="py-1 px-1 text-right text-zinc-200 font-mono">{sensor.density}</td>
                    <td className="py-1 pl-1 text-right text-zinc-200 font-mono">{sensor.mass}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        {/* ---- 6. Cards ---- */}
        <Panel title={t('status.cards')}>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{t('status.lastTag')}</span>
              <span className="text-xs text-zinc-200 font-mono flex items-center">
                {rep.lastTagId || '—'}
                {rep.lastTagId && (
                  <button
                    onClick={() => handleAddTag(rep.lastTagId)}
                    disabled={!isConnected || isSending || !rep.lastTagId}
                    className="ml-2 text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-1.5 py-0.5 rounded disabled:opacity-40"
                  >
                    + {t('status.add')}
                  </button>
                )}
              </span>
            </div>
            <Field label={t('status.tagsMemory')} value={tags.memory} />
            <Field label={t('status.tagsLimit')} value={tags.limit} />
            <Field label={t('status.tagsAdded')} value={tags.added} />
          </div>

          {/* Manual add */}
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-zinc-700">
            <input
              type="text"
              value={addTagInput}
              onChange={(e) => setAddTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(addTagInput); }}
              placeholder="Tag ID"
              maxLength={12}
              className="flex-1 bg-zinc-800 text-zinc-200 text-xs border border-zinc-600 rounded px-2 py-1 font-mono placeholder:text-zinc-600"
            />
            <button
              onClick={() => handleAddTag(addTagInput)}
              disabled={!isConnected || isSending || !addTagInput.trim()}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded disabled:opacity-40"
            >
              {t('status.add')}
            </button>
          </div>
        </Panel>

      </div>

      {/* Debug panel */}
      <div className="mt-3">
        <button
          onClick={() => setShowDebug((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-2 py-0.5 mb-1"
        >
          {showDebug ? 'Hide' : 'Show'} Debug Log
        </button>
        {showDebug && (
          <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-zinc-500">Command / Response exchange ({debugLog.length} lines)</span>
              <button
                onClick={() => setDebugLog([])}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-1.5"
              >
                Clear
              </button>
            </div>
            <pre
              ref={debugRef}
              className="h-64 overflow-auto text-[11px] font-mono bg-black/40 rounded p-2 text-zinc-300 whitespace-pre-wrap"
            >
              {debugLog.join('\n') || 'Waiting for data...'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

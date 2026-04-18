import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';

function isErrorResponse(response: string): boolean {
  const t = response.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE') || t.endsWith(';EE');
}

function isPasswordError(response: string): boolean {
  return response.trim().endsWith(';PE');
}

interface SystemAction {
  key: string;
  titleKey: keyof Translations;
  descKey: keyof Translations;
  btnKey: keyof Translations;
  command: string;
  sendResetAfter?: boolean;
  irreversible: boolean;
  accent: 'red' | 'orange' | 'blue';
}

const ACTIONS: SystemAction[] = [
  { key: 'factory',  titleKey: 'sys.factoryTitle',  descKey: 'sys.factoryDesc',  btnKey: 'sys.factoryBtn',  command: 'FACTORY',      irreversible: true,  accent: 'red'    },
  { key: 'default',  titleKey: 'sys.defaultTitle',  descKey: 'sys.defaultDesc',  btnKey: 'sys.defaultBtn',  command: 'DEFAULT',      irreversible: false, accent: 'orange' },
  { key: 'erasure',  titleKey: 'sys.erasureTitle',  descKey: 'sys.erasureDesc',  btnKey: 'sys.erasureBtn',  command: 'ERASURE',      irreversible: true,  accent: 'red'    },
  { key: 'tagsDel',  titleKey: 'sys.tagsDelTitle',  descKey: 'sys.tagsDelDesc',  btnKey: 'sys.tagsDelBtn',  command: 'TAGS;DEL;ALL', irreversible: true,  accent: 'red'    },
  { key: 'msensCal', titleKey: 'sys.msensCalTitle', descKey: 'sys.msensCalDesc', btnKey: 'sys.msensCalBtn', command: 'MSENS;CAL;A',  irreversible: false, accent: 'blue'   },
];

const SD_ON: SystemAction  = { key: 'sdOn',  titleKey: 'sys.sdOnTitle',  descKey: 'sys.sdDesc', btnKey: 'sys.sdOnBtn',  command: 'SDCARD;SET;1', sendResetAfter: true, irreversible: false, accent: 'blue' };
const SD_OFF: SystemAction = { key: 'sdOff', titleKey: 'sys.sdOffTitle', descKey: 'sys.sdDesc', btnKey: 'sys.sdOffBtn', command: 'SDCARD;SET;0', sendResetAfter: true, irreversible: false, accent: 'blue' };

const ACCENT_CLASSES: Record<SystemAction['accent'], string> = {
  red:    'bg-red-600 hover:bg-red-700',
  orange: 'bg-orange-600 hover:bg-orange-700',
  blue:   'bg-blue-600 hover:bg-blue-700',
};

const ACCENT_BORDER: Record<SystemAction['accent'], string> = {
  red:    'border-red-900/50',
  orange: 'border-orange-900/50',
  blue:   'border-zinc-700',
};

const Panel: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
    <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">{title}</h3>
    {children}
  </div>
);

const FirmwareStep: FC<{ active: boolean; done: boolean; label: string }> = ({ active, done, label }) => (
  <li className="flex items-center gap-2">
    <span
      className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[10px] ${
        done ? 'bg-green-600 text-white' : active ? 'bg-blue-600 text-white animate-pulse' : 'bg-zinc-700 text-zinc-500'
      }`}
    >
      {done ? '✓' : active ? '•' : ''}
    </span>
    <span className={done ? 'text-zinc-400' : active ? 'text-zinc-100' : 'text-zinc-500'}>{label}</span>
  </li>
);

export const SystemTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError, setSystemBusy } = useStatusStore();
  const { t } = useI18n();

  const [pendingAction, setPendingAction] = useState<SystemAction | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [firmwarePath, setFirmwarePath] = useState('');
  const [firmwareFileName, setFirmwareFileName] = useState('');
  const [firmwareStep, setFirmwareStep] = useState<'command' | 'wait-mode' | 'copy' | 'launchDemo' | 'done' | ''>('');
  const [firmwareMode, setFirmwareMode] = useState<'boot' | 'dfu' | null>(null);
  const [firmwareConfirm, setFirmwareConfirm] = useState(false);
  const [firmwareRecoveryConfirm, setFirmwareRecoveryConfirm] = useState(false);
  const [firmwareError, setFirmwareError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  const runAction = useCallback(async (action: SystemAction) => {
    if (!isConnected) return;
    setRunningKey(action.key);
    setStatusMsg(t('sys.running'));

    try {
      const resp = await window.serial.sendCommand(`$${password};${action.command}`);
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) throw new Error(resp.trim());

      if (action.sendResetAfter) {
        await window.serial.sendCommand(`$${password};RESET`).catch(() => {});
      }

      setStatusMsg(`${t('sys.success')}: ${action.command}`);
    } catch (err) {
      setStatusMsg(`${t('sys.error')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunningKey(null);
    }
  }, [isConnected, password, handlePasswordError, t]);

  const handleClick = (action: SystemAction): void => {
    setPendingAction(action);
  };

  const handleConfirm = (): void => {
    const action = pendingAction;
    setPendingAction(null);
    if (action) void runAction(action);
  };

  const handleFirmwareChoose = async (): Promise<void> => {
    const result = await window.firmware.pickFile();
    if (result) {
      setFirmwarePath(result.path);
      setFirmwareFileName(result.name);
    }
  };

  const handleFirmwareUpload = (): void => {
    if (!firmwarePath) return;
    setFirmwareConfirm(true);
  };

  const runFirmwareUpdate = useCallback(async (options?: { skipUpdateCmd?: boolean }) => {
    if (!firmwarePath) return;
    const skipUpdate = options?.skipUpdateCmd === true;

    setRunningKey('firmware');
    setSystemBusy(true);
    setStatusMsg('');
    setFirmwareError('');
    setFirmwareMode(null);
    setRecoveryMode(skipUpdate);
    setFirmwareStep(skipUpdate ? 'wait-mode' : 'command');

    try {
      let mode: { mode: 'boot' | 'dfu'; mountPath?: string };

      if (skipUpdate) {
        // Recovery: user asserts device is already in DFU. Skip detection entirely —
        // STM CLI will report a clear error if nothing is actually there.
        mode = { mode: 'dfu' };
      } else {
        // Step 1: send UPDATE command. The device reboots to DFU/BOOT within milliseconds
        // of accepting the command, so port-close DURING the send is the normal success
        // signal. A timeout without disconnect, however, means the device ignored the
        // command (wrong password / unsupported firmware) and is still in normal mode —
        // we must abort in that case, not disconnect and hang in waitForMode.
        let updateAccepted = false;
        try {
          const resp = await window.serial.sendCommand(`$${password};UPDATE`, 3000);
          if (isPasswordError(resp)) { await handlePasswordError(); return; }
          if (isErrorResponse(resp)) {
            throw new Error(`${t('sys.fwErrorUpdateCmd')}: ${resp.trim()}`);
          }
          updateAccepted = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/Port is not open|Port closed|Disconnected/i.test(msg)) {
            // Port lost mid-send → device rebooted → success.
            updateAccepted = true;
          } else if (/Command timeout/i.test(msg)) {
            // Device still alive but didn't respond → UPDATE wasn't accepted.
            throw new Error(t('sys.fwErrorUpdateCmd'));
          } else if (/sys\.fwErrorUpdateCmd/.test(msg) || /;CE|;FE|;DE/i.test(msg)) {
            throw err;
          }
        }

        if (!updateAccepted) {
          throw new Error(t('sys.fwErrorUpdateCmd'));
        }

        // Device is rebooting. Close serial from our side so COM port releases.
        try { await window.serial.disconnect(); } catch { /* device is already gone */ }
        setConnected(false);

        // Step 2: race BOOT drive vs DFU device — the first one to appear wins.
        setFirmwareStep('wait-mode');
        try {
          const detected = await window.firmware.waitForMode(60_000);
          mode = detected.mode === 'boot'
            ? { mode: 'boot', mountPath: detected.mountPath }
            : { mode: 'dfu' };
        } catch {
          throw new Error(t('sys.fwErrorDriveTimeout'));
        }
      }

      setFirmwareMode(mode.mode);

      if (mode.mode === 'boot') {
        // F4 path — copy file to the mounted drive.
        if (!mode.mountPath) throw new Error('BOOT drive mount path missing');
        setFirmwareStep('copy');
        try {
          await window.firmware.copyToBoot(firmwarePath, mode.mountPath);
        } catch (err) {
          throw new Error(`${t('sys.fwErrorCopy')}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        // DFU path — hand off to DfuSeDemo GUI. DfuSeCommand CLI v1.2.0 can't issue
        // DFU_DETACH and leaves the chip stuck in DFU after verify; DfuSeDemo's
        // "Leave DFU mode" button does it correctly.
        setFirmwareStep('launchDemo');
        try {
          await window.firmware.launchDfuSeDemo();
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          if (/DfuSeDemo\.exe not found/i.test(raw)) {
            throw new Error(t('sys.fwErrorDfuAccess'));
          }
          throw new Error(`${t('sys.fwErrorDfuGeneric')}: ${raw}`);
        }
      }

      setFirmwareStep('done');
      setStatusMsg(t('sys.fwStepDone'));
    } catch (err) {
      // Keep isSystemBusy=true so App.tsx doesn't yank the user to Status mid-failure.
      // User dismisses the error below, which clears busy state.
      setFirmwareError(err instanceof Error ? err.message : String(err));
      setStatusMsg('');
      setFirmwareStep('');
      setFirmwareMode(null);
    } finally {
      setRunningKey(null);
    }
  }, [firmwarePath, password, handlePasswordError, setConnected, setSystemBusy, t]);

  // Clear isSystemBusy only when the user dismisses the done/error banner.
  const dismissFirmwareResult = useCallback(() => {
    setFirmwareStep('');
    setFirmwareMode(null);
    setStatusMsg('');
    setFirmwareError('');
    setRecoveryMode(false);
    setSystemBusy(false);
  }, [setSystemBusy]);

  const handleFirmwareConfirm = (): void => {
    setFirmwareConfirm(false);
    void runFirmwareUpdate();
  };

  const handleFirmwareRecovery = (): void => {
    if (!firmwarePath) return;
    setFirmwareRecoveryConfirm(true);
  };

  const handleFirmwareRecoveryConfirm = (): void => {
    setFirmwareRecoveryConfirm(false);
    void runFirmwareUpdate({ skipUpdateCmd: true });
  };

  // Block tab switching / window close while a command is running.
  useEffect(() => {
    if (!runningKey) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [runningKey]);

  // Safety: release the global isSystemBusy flag if this component ever unmounts.
  useEffect(() => {
    return () => setSystemBusy(false);
  }, [setSystemBusy]);

  const allActions: SystemAction[] = [...ACTIONS, SD_ON, SD_OFF];
  const currentAction = runningKey ? allActions.find((a) => a.key === runningKey) : null;
  const currentActionLabel = currentAction ? t(currentAction.titleKey) : '';

  // Keep rendered during firmware flow (we intentionally disconnect mid-way) and after it completes.
  const firmwareActive = runningKey === 'firmware' || firmwareStep !== '' || firmwareError !== '';

  // When not connected and no firmware operation is in progress, show the recovery panel
  // so users can still flash a device stuck in DFU mode.
  if (!isConnected && !firmwareActive) {
    return (
      <div className="p-4 space-y-4 max-w-4xl">
        <div>
          <h2 className="text-lg font-semibold text-zinc-200">{t('tab.system')}</h2>
          <p className="text-zinc-500 mt-1 text-sm">{t('sys.notConnected')}</p>
        </div>

        <Panel title={t('sys.fwRecoveryTitle')}>
          <div className="flex flex-col gap-3">
            <p className="text-zinc-400 text-xs">{t('sys.fwRecoveryHint')}</p>
            <div className="flex items-center gap-3">
              <label className="text-zinc-300 text-xs w-32 shrink-0">{t('sys.firmwareFile')}</label>
              <button
                onClick={handleFirmwareChoose}
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs px-3 py-1.5 rounded"
              >
                {t('sys.firmwareChoose')}
              </button>
              <span className="text-zinc-400 text-xs truncate" title={firmwarePath}>
                {firmwareFileName || t('sys.firmwareNoFile')}
              </span>
            </div>
            <div>
              <button
                onClick={handleFirmwareRecovery}
                disabled={!firmwarePath}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded"
              >
                {t('sys.fwRecoveryButton')}
              </button>
            </div>
          </div>
        </Panel>

        {firmwareRecoveryConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-5 max-w-md w-full mx-4">
              <h3 className="text-zinc-100 text-base font-semibold mb-2">{t('sys.fwRecoveryTitle')}</h3>
              <p className="text-zinc-400 text-xs mb-3">{t('sys.fwRecoveryConfirmDesc')}</p>
              <div className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 mb-4">
                <code className="text-zinc-300 text-xs break-all">{firmwareFileName}</code>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setFirmwareRecoveryConfirm(false)}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
                >
                  {t('sys.confirmCancel')}
                </button>
                <button
                  onClick={handleFirmwareRecoveryConfirm}
                  className="bg-orange-600 hover:bg-orange-700 text-white text-sm px-4 py-1.5 rounded"
                >
                  {t('sys.fwRecoveryButton')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      {firmwareStep === 'done' && (
        <div className="bg-green-900/30 border border-green-700/60 rounded p-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-green-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <h4 className="text-green-300 text-sm font-semibold mb-1">
              {firmwareMode === 'dfu' ? t('sys.fwDemoLaunchedTitle') : t('sys.fwDoneTitle')}
            </h4>
            <p className="text-zinc-300 text-xs mb-2 whitespace-pre-wrap">
              {firmwareMode === 'dfu'
                ? `${t('sys.fwDemoLaunchedHint')}\n${firmwarePath}`
                : t('sys.fwDoneHint')}
            </p>
            <button
              onClick={dismissFirmwareResult}
              className="bg-green-700 hover:bg-green-600 text-white text-xs font-medium px-3 py-1 rounded"
            >
              {t('sys.fwDoneDismiss')}
            </button>
          </div>
        </div>
      )}

      {firmwareError && (
        <div className="bg-red-900/30 border border-red-700/60 rounded p-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <h4 className="text-red-300 text-sm font-semibold mb-1">{t('sys.fwErrorDfuGeneric')}</h4>
            <p className="text-zinc-300 text-xs mb-2 whitespace-pre-wrap">{firmwareError}</p>
            <button
              onClick={dismissFirmwareResult}
              className="bg-red-700 hover:bg-red-600 text-white text-xs font-medium px-3 py-1 rounded"
            >
              {t('sys.fwDoneDismiss')}
            </button>
          </div>
        </div>
      )}

      <Panel title={t('sys.panelActions')}>
        <div className="flex flex-wrap gap-3">
          {ACTIONS.map((action) => {
            const running = runningKey === action.key;
            const anyRunning = runningKey !== null;
            return (
              <div
                key={action.key}
                className={`basis-[calc((100%-1.5rem)/3)] min-w-[240px] grow bg-zinc-800/60 border ${ACCENT_BORDER[action.accent]} rounded p-3 flex flex-col`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <h4 className="text-zinc-100 text-sm font-semibold flex-1">{t(action.titleKey)}</h4>
                  {action.irreversible && (
                    <span className="text-[10px] font-bold text-red-400 border border-red-900/60 rounded px-1.5 py-0.5 leading-none">
                      !
                    </span>
                  )}
                </div>
                <p className="text-zinc-400 text-xs mb-3 flex-1">{t(action.descKey)}</p>
                <button
                  onClick={() => handleClick(action)}
                  disabled={anyRunning}
                  className={`${ACCENT_CLASSES[action.accent]} disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded self-start`}
                >
                  {running ? t('sys.running') : t(action.btnKey)}
                </button>
              </div>
            );
          })}

          {/* Combined SD card */}
          <div className={`basis-[calc((100%-1.5rem)/3)] min-w-[240px] grow bg-zinc-800/60 border ${ACCENT_BORDER.blue} rounded p-3 flex flex-col`}>
            <div className="flex items-start gap-2 mb-2">
              <h4 className="text-zinc-100 text-sm font-semibold flex-1">{t('sys.sdTitle')}</h4>
            </div>
            <p className="text-zinc-400 text-xs mb-3 flex-1">{t('sys.sdDesc')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleClick(SD_ON)}
                disabled={runningKey !== null}
                className={`${ACCENT_CLASSES.blue} disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded`}
              >
                {runningKey === SD_ON.key ? t('sys.running') : t(SD_ON.btnKey)}
              </button>
              <button
                onClick={() => handleClick(SD_OFF)}
                disabled={runningKey !== null}
                className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-xs font-medium px-3 py-1.5 rounded"
              >
                {runningKey === SD_OFF.key ? t('sys.running') : t(SD_OFF.btnKey)}
              </button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title={t('sys.panelFirmware')}>
        <div className="flex flex-col gap-3">
          <p className="text-zinc-400 text-xs">{t('sys.fwHint')}</p>
          <div className="flex items-center gap-3">
            <label className="text-zinc-300 text-xs w-32 shrink-0">{t('sys.firmwareFile')}</label>
            <button
              onClick={handleFirmwareChoose}
              disabled={runningKey !== null}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-xs px-3 py-1.5 rounded"
            >
              {t('sys.firmwareChoose')}
            </button>
            <span className="text-zinc-400 text-xs truncate" title={firmwarePath}>
              {firmwareFileName || t('sys.firmwareNoFile')}
            </span>
          </div>
          <div>
            <button
              onClick={handleFirmwareUpload}
              disabled={!firmwarePath || runningKey !== null}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded"
            >
              {t('sys.firmwareUpload')}
            </button>
          </div>
        </div>
      </Panel>

      {statusMsg && (
        <div className="text-zinc-400 text-xs px-1">{statusMsg}</div>
      )}

      {runningKey && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 cursor-wait"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.preventDefault()}
        >
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <svg className="w-6 h-6 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <h3 className="text-zinc-100 text-base font-semibold">
                {runningKey === 'firmware' ? t('sys.panelFirmware') : t('sys.blockingTitle')}
              </h3>
            </div>

            {runningKey === 'firmware' ? (
              <>
                <p className="text-zinc-300 text-sm mb-3 truncate" title={firmwareFileName}>
                  {firmwareFileName}
                  {firmwareMode && <span className="text-zinc-500 ml-2 text-xs">({firmwareMode === 'boot' ? 'F4 / Mass storage' : 'DFU'})</span>}
                </p>

                <ol className="space-y-1.5 mb-3 text-xs">
                  {!recoveryMode && (
                    <FirmwareStep
                      active={firmwareStep === 'command'}
                      done={firmwareStep !== '' && firmwareStep !== 'command'}
                      label={t('sys.fwStepCommand')}
                    />
                  )}
                  <FirmwareStep
                    active={firmwareStep === 'wait-mode'}
                    done={firmwareStep === 'copy' || firmwareStep === 'launchDemo' || firmwareStep === 'done'}
                    label={t('sys.fwStepWaitMode')}
                  />
                  {firmwareMode === 'boot' && (
                    <FirmwareStep
                      active={firmwareStep === 'copy'}
                      done={firmwareStep === 'done'}
                      label={t('sys.fwStepCopy')}
                    />
                  )}
                  {firmwareMode === 'dfu' && (
                    <FirmwareStep
                      active={firmwareStep === 'launchDemo'}
                      done={firmwareStep === 'done'}
                      label={t('sys.fwStepLaunchDemo')}
                    />
                  )}
                </ol>

                <p className="text-zinc-400 text-xs">{t('sys.blockingDesc')}</p>
              </>
            ) : (
              <>
                <p className="text-zinc-300 text-sm mb-2">{currentActionLabel}</p>
                <p className="text-zinc-400 text-xs mb-3">{t('sys.blockingDesc')}</p>
                <p className="text-zinc-500 text-xs italic">{t('sys.blockingWait')}</p>
              </>
            )}
          </div>
        </div>
      )}

      {firmwareConfirm && !runningKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-5 max-w-md w-full mx-4">
            <h3 className="text-zinc-100 text-base font-semibold mb-2">{t('sys.fwConfirmTitle')}</h3>
            <p className="text-zinc-400 text-xs mb-3">{t('sys.fwConfirmDesc')}</p>
            <div className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 mb-4">
              <code className="text-zinc-300 text-xs break-all">{firmwareFileName}</code>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setFirmwareConfirm(false)}
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
              >
                {t('sys.confirmCancel')}
              </button>
              <button
                onClick={handleFirmwareConfirm}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded"
              >
                {t('sys.firmwareUpload')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAction && !runningKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-5 max-w-md w-full mx-4">
            <h3 className="text-zinc-100 text-base font-semibold mb-2">{t('sys.confirmTitle')}</h3>
            <p className="text-zinc-200 text-sm mb-2">{t(pendingAction.titleKey)}</p>
            <p className="text-zinc-400 text-xs mb-3">{t(pendingAction.descKey)}</p>
            {pendingAction.irreversible && (
              <p className="text-red-400 text-xs font-semibold mb-3">{t('sys.confirmIrreversible')}</p>
            )}
            <div className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 mb-4">
              <code className="text-zinc-300 text-xs">${password};{pendingAction.command}</code>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingAction(null)}
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
              >
                {t('sys.confirmCancel')}
              </button>
              <button
                onClick={handleConfirm}
                className={`${ACCENT_CLASSES[pendingAction.accent]} text-white text-sm px-4 py-1.5 rounded`}
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

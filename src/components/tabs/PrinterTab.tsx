import { type FC, useState, useCallback, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';
import {
  buildPrinterReadCmd,
  buildPrinterWriteCmd,
  buildPrntnReadCmd,
  buildPrntnWriteCmd,
  buildPrntpReadCmd,
  buildPrntpWriteCmd,
  buildPrntwReadCmd,
  buildPrntwWriteCmd,
  buildPrinterMakeCmd,
  parsePrinterResponse,
  parsePrntnResponse,
  parsePrntpResponse,
  parsePrntwResponse,
  type PrinterParams,
  type PrinterTextFields,
  EMPTY_PRINTER,
  EMPTY_PRINTER_TEXT,
  PRINTER_CONTROL_OPTIONS,
  PRINTER_CONTROL_OPTIONS_RU,
  PRINTER_LANG_OPTIONS,
  PRINTER_LANG_OPTIONS_RU,
  PRINTER_TIME_SHIFT_OPTIONS,
} from '../../lib/commands';

// ---- Response helpers ----

function isErrorResponse(response: string): boolean {
  const t = response.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE') || t.endsWith(';EE');
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

const InlineSelect: FC<{
  labelKey: keyof Translations;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ labelKey, value, options, onChange, disabled }) => {
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
    </div>
  );
};

const TextRow: FC<{
  labelKey: keyof Translations;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
}> = ({ labelKey, value, onChange, disabled, maxLength = 40 }) => {
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
        className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none max-w-sm"
      />
    </div>
  );
};

// ---- Main component ----

export const PrinterTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t, locale } = useI18n();

  const storePrinter = useSettingsStore((s) => s.printerSettings);
  const storeText = useSettingsStore((s) => s.printerText);

  const [printer, setPrinter] = useState<PrinterParams>(() => storePrinter || EMPTY_PRINTER);
  const [text, setText] = useState<PrinterTextFields>(() => storeText || EMPTY_PRINTER_TEXT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (storePrinter) setPrinter(storePrinter);
    if (storeText) setText(storeText);
  }, [storePrinter, storeText]);

  useEffect(() => {
    if (!isConnected) {
      setPrinter(EMPTY_PRINTER);
      setText(EMPTY_PRINTER_TEXT);
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
    setStatusMsg(t('printer.reading'));

    try {
      // Read PRINTER;GET
      const respP = await window.serial.sendCommand(buildPrinterReadCmd(password));
      if (isPasswordError(respP)) { await handlePasswordError(); return; }
      if (isErrorResponse(respP)) throw new Error(`PRINTER: ${respP.trim()}`);
      const p = parsePrinterResponse(respP);
      if (!p) throw new Error('PRINTER: malformed response');

      // Read PRNTN (station name)
      const respN = await window.serial.sendCommand(buildPrntnReadCmd(password));
      if (isPasswordError(respN)) { await handlePasswordError(); return; }
      const stationName = isErrorResponse(respN) ? '' : (parsePrntnResponse(respN) ?? '');

      // Read PRNTP (phone)
      const respPhone = await window.serial.sendCommand(buildPrntpReadCmd(password));
      if (isPasswordError(respPhone)) { await handlePasswordError(); return; }
      const phone = isErrorResponse(respPhone) ? '' : (parsePrntpResponse(respPhone) ?? '');

      // Read PRNTW (website)
      const respW = await window.serial.sendCommand(buildPrntwReadCmd(password));
      if (isPasswordError(respW)) { await handlePasswordError(); return; }
      const website = isErrorResponse(respW) ? '' : (parsePrntwResponse(respW) ?? '');

      const textFields: PrinterTextFields = { stationName, phone, website };
      setPrinter(p);
      setText(textFields);
      useSettingsStore.getState().setPrinterSettings(p, textFields);
      setStatusMsg(t('printer.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('printer.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected && !useSettingsStore.getState().printerSettings) readSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const saveSettings = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('printer.saving'));

    try {
      // Write PRINTER;SET
      const respP = await window.serial.sendCommand(buildPrinterWriteCmd(password, printer));
      if (isPasswordError(respP)) { await handlePasswordError(); return; }
      if (isErrorResponse(respP)) throw new Error(`PRINTER: ${respP.trim()}`);

      // Write PRNTN
      const respN = await window.serial.sendCommand(buildPrntnWriteCmd(password, text.stationName));
      if (isPasswordError(respN)) { await handlePasswordError(); return; }
      if (isErrorResponse(respN)) throw new Error(`PRNTN: ${respN.trim()}`);

      // Write PRNTP
      const respPhone = await window.serial.sendCommand(buildPrntpWriteCmd(password, text.phone));
      if (isPasswordError(respPhone)) { await handlePasswordError(); return; }
      if (isErrorResponse(respPhone)) throw new Error(`PRNTP: ${respPhone.trim()}`);

      // Write PRNTW
      const respW = await window.serial.sendCommand(buildPrntwWriteCmd(password, text.website));
      if (isPasswordError(respW)) { await handlePasswordError(); return; }
      if (isErrorResponse(respW)) throw new Error(`PRNTW: ${respW.trim()}`);

      setStatusMsg(t('printer.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('printer.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, printer, text, handlePasswordError, t]);

  const testPrint = useCallback(async () => {
    if (!isConnected) return;
    setPrinting(true);
    setStatusMsg(t('printer.printing'));

    try {
      const resp = await window.serial.sendCommand(buildPrinterMakeCmd(password));
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) throw new Error(resp.trim());
      setStatusMsg(t('printer.printSuccess'));
    } catch (err) {
      setStatusMsg(`${t('printer.printError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPrinting(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  const controlOptions = locale === 'ru' ? PRINTER_CONTROL_OPTIONS_RU : PRINTER_CONTROL_OPTIONS;
  const langOptions = locale === 'ru' ? PRINTER_LANG_OPTIONS_RU : PRINTER_LANG_OPTIONS;

  const busy = loading || saving || printing;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.printer')}</h2>
        <p className="text-zinc-500 mt-2">{t('printer.notConnected')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <Panel title={t('printer.panelSettings')}>
        <InlineSelect
          labelKey="printer.control"
          value={printer.control}
          options={controlOptions}
          onChange={(v) => setPrinter((prev) => ({ ...prev, control: v }))}
          disabled={busy}
        />
        <InlineSelect
          labelKey="printer.lang"
          value={printer.lang}
          options={langOptions}
          onChange={(v) => setPrinter((prev) => ({ ...prev, lang: v }))}
          disabled={busy}
        />
        <InlineSelect
          labelKey="printer.timeShift"
          value={printer.timeShift}
          options={PRINTER_TIME_SHIFT_OPTIONS}
          onChange={(v) => setPrinter((prev) => ({ ...prev, timeShift: v }))}
          disabled={busy}
        />
        <TextRow
          labelKey="printer.stationName"
          value={text.stationName}
          onChange={(v) => setText((prev) => ({ ...prev, stationName: v }))}
          disabled={busy}
        />
        <TextRow
          labelKey="printer.phone"
          value={text.phone}
          onChange={(v) => setText((prev) => ({ ...prev, phone: v }))}
          disabled={busy}
        />
        <TextRow
          labelKey="printer.website"
          value={text.website}
          onChange={(v) => setText((prev) => ({ ...prev, website: v }))}
          disabled={busy}
        />
      </Panel>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('printer.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('printer.saving') : t('common.save')}
        </button>
        <button
          onClick={testPrint}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-green-700 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {printing ? t('printer.printing') : t('printer.testPrint')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>
    </div>
  );
};

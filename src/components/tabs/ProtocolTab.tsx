import { type FC, useState, useCallback, useEffect, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';
import {
  buildPrset20GetCmd,
  buildPrset21GetCmd,
  buildPrset20SetCmd,
  buildPrset21SetCmd,
  parsePrsetResponse,
  decodePrsetTags,
  updatePrsetBuffer,
  bytesToHex,
} from '../../lib/commands';

// ---- Tag ID definitions (CTR protocol) ----

interface TagDef {
  id: number;
  labelKey: keyof Translations;
  label?: string;
}

interface Column {
  titleKey: keyof Translations;
  tags: TagDef[];
}

const COLUMNS: Column[] = [
  {
    titleKey: 'proto.colStatus',
    tags: [
      { id: 0x0E, labelKey: 'proto.statusDevice' },
      { id: 0x0F, labelKey: 'proto.statusPacket' },
      { id: 0x17, labelKey: 'proto.statusHdop' },
      { id: 0x20, labelKey: 'proto.statusExtPower' },
      { id: 0x21, labelKey: 'proto.statusBattery' },
      { id: 0x24, labelKey: 'proto.statusIntTemp' },
      { id: 0x32, labelKey: 'proto.statusGsmLbs' },
      { id: 0x31, labelKey: 'proto.statusGsmRssi' },
      { id: 0x30, labelKey: 'proto.statusGsm' },
      { id: 0x40, labelKey: 'proto.statusWifi' },
    ],
  },
  {
    titleKey: 'proto.colInputs',
    tags: [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: 0x50 + i,
        labelKey: 'proto.colInputs' as const,
        label: `IN${i + 1}`,
      })),
      { id: 0x28, labelKey: 'proto.colInputs' as const, label: 'E1' },
      { id: 0x29, labelKey: 'proto.colInputs' as const, label: 'E2' },
    ],
  },
  {
    titleKey: 'proto.colOutputs',
    tags: Array.from({ length: 4 }, (_, i) => ({
      id: 0x60 + i,
      labelKey: 'proto.colOutputs' as const,
      label: `OUT${i + 1}`,
    })),
  },
  {
    titleKey: 'proto.colDut',
    tags: Array.from({ length: 6 }, (_, i) => ({
      id: 0x71 + i,
      labelKey: 'proto.colDut' as const,
      label: `LLS${i + 1}`,
    })),
  },
  {
    titleKey: 'proto.colDutNpp',
    tags: Array.from({ length: 6 }, (_, i) => ({
      id: 0xC1 + i,
      labelKey: 'proto.colDutNpp' as const,
      label: `LLS${i + 1}`,
    })),
  },
];

/** Mutual-exclusion pairs: selecting one clears its counterpart. */
const LLS_EXCLUSIVE_PAIRS: Array<[number, number]> = Array.from(
  { length: 6 },
  (_, i) => [0x71 + i, 0xC1 + i],
);

const ALL_TAG_IDS: number[] = COLUMNS.flatMap((c) => c.tags.map((t) => t.id));

/** Format tag ID as 2-char uppercase hex (e.g. 14 → "0E"). */
function tagHex(id: number): string {
  return id.toString(16).toUpperCase().padStart(2, '0');
}

// ---- Response helpers (shared pattern with ServerTab) ----

function isErrorResponse(response: string): boolean {
  const t = response.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
}

function isPasswordError(response: string): boolean {
  return response.trim().endsWith(';PE');
}

// ---- Main component ----

export const ProtocolTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const [enabled, setEnabled] = useState<Set<number>>(new Set());
  const [initialEnabled, setInitialEnabled] = useState<Set<number>>(new Set());
  // Raw buffers last read from the device. Preserved so that bits outside
  // the UI's known tag set are not clobbered on save.
  const [buf20, setBuf20] = useState<Uint8Array>(() => new Uint8Array(16));
  const [buf21, setBuf21] = useState<Uint8Array>(() => new Uint8Array(16));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!isConnected) {
      setEnabled(new Set());
      setInitialEnabled(new Set());
      setBuf20(new Uint8Array(16));
      setBuf21(new Uint8Array(16));
      setStatusMsg('');
    }
  }, [isConnected]);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try {
      await window.serial.disconnect();
    } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  // ---- Read (2 commands: PRSET20;GET + PRSET21;GET) ----
  const readSettings = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setStatusMsg(t('proto.reading'));

    try {
      const resp20 = await window.serial.sendCommand(buildPrset20GetCmd(password));
      if (isPasswordError(resp20)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp20)) throw new Error(`PRSET20: ${resp20.trim()}`);
      const b20 = parsePrsetResponse(resp20);
      if (!b20) throw new Error(`PRSET20: malformed response`);

      const resp21 = await window.serial.sendCommand(buildPrset21GetCmd(password));
      if (isPasswordError(resp21)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp21)) throw new Error(`PRSET21: ${resp21.trim()}`);
      const b21 = parsePrsetResponse(resp21);
      if (!b21) throw new Error(`PRSET21: malformed response`);

      const tags20 = decodePrsetTags(b20, 0);
      const tags21 = decodePrsetTags(b21, 8);
      // Keep only the tags the UI knows about; unknown bits live in the buffers.
      const loaded = new Set<number>();
      for (const id of ALL_TAG_IDS) {
        if (tags20.has(id) || tags21.has(id)) loaded.add(id);
      }

      setBuf20(b20);
      setBuf21(b21);
      setEnabled(new Set(loaded));
      setInitialEnabled(new Set(loaded));
      setStatusMsg(t('proto.readSuccess'));
    } catch (err) {
      setStatusMsg(`${t('proto.readError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  useEffect(() => {
    if (isConnected) readSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // ---- Save (2 commands: PRSET20;SET + PRSET21;SET) ----
  const saveSettings = useCallback(async () => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('proto.saving'));

    try {
      // Start from the last-read buffers so unknown bits are preserved,
      // then overlay the UI's known tags from current checkbox state.
      const next20 = new Uint8Array(buf20);
      const next21 = new Uint8Array(buf21);
      for (const id of ALL_TAG_IDS) {
        const on = enabled.has(id);
        if (id < 0x80) updatePrsetBuffer(next20, 0, id, on);
        else updatePrsetBuffer(next21, 8, id, on);
      }

      const resp20 = await window.serial.sendCommand(
        buildPrset20SetCmd(password, bytesToHex(next20)),
      );
      if (isPasswordError(resp20)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp20)) throw new Error(`PRSET20: ${resp20.trim()}`);

      const resp21 = await window.serial.sendCommand(
        buildPrset21SetCmd(password, bytesToHex(next21)),
      );
      if (isPasswordError(resp21)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp21)) throw new Error(`PRSET21: ${resp21.trim()}`);

      setBuf20(next20);
      setBuf21(next21);
      setInitialEnabled(new Set(enabled));
      setStatusMsg(t('proto.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('proto.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, enabled, buf20, buf21, handlePasswordError, t]);

  // ---- State updaters ----
  const toggleTag = useCallback((id: number) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Enforce LLS / LLS Extended mutual exclusion — cannot enable both for the same index.
        for (const [a, b] of LLS_EXCLUSIVE_PAIRS) {
          if (id === a) next.delete(b);
          else if (id === b) next.delete(a);
        }
      }
      return next;
    });
  }, []);

  const busy = loading || saving;

  const dirty = useMemo(() => {
    if (enabled.size !== initialEnabled.size) return true;
    for (const id of enabled) if (!initialEnabled.has(id)) return true;
    return false;
  }, [enabled, initialEnabled]);

  // ---- Render ----
  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.protocol')}</h2>
        <p className="text-zinc-500 mt-2">{t('proto.notConnected')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {COLUMNS.map((col) => (
          <div
            key={col.titleKey}
            className="bg-zinc-900 border border-zinc-700 rounded p-3"
          >
            <h3 className="text-sm font-semibold text-zinc-300 mb-2 border-b border-zinc-700 pb-1">
              {t(col.titleKey)}
            </h3>
            <div className="space-y-1">
              {col.tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-zinc-100"
                >
                  <input
                    type="checkbox"
                    checked={enabled.has(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                    disabled={busy}
                    className="accent-blue-500"
                  />
                  <span>{tag.label ?? t(tag.labelKey)}</span>
                  <span className="ml-auto text-[10px] text-zinc-500 font-mono">
                    0x{tagHex(tag.id)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={readSettings}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('proto.reading') : t('common.read')}
        </button>
        <button
          onClick={saveSettings}
          disabled={busy || !dirty}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('proto.saving') : t('common.save')}
        </button>
        {statusMsg && <span className="text-xs text-zinc-400">{statusMsg}</span>}
      </div>
    </div>
  );
};

import { type FC, useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';
import {
  buildTagsCountCmd,
  buildTagGetByIndexCmd,
  buildTagAddByIndexCmd,
  parseTagsResponse,
  parseTagGetResponse,
  decodeTagParam2,
  encodeTagParam2,
  TAG_EMPTY_ID,
  type TagEntry,
} from '../../lib/commands';

// ---- Response helpers ----

function isErrorResponse(response: string): boolean {
  const t = response.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
}

function isPasswordError(response: string): boolean {
  return response.trim().endsWith(';PE');
}

// ---- Inline edit state ----

interface EditState {
  index: number;
  tagId: string;
  limit: string;
  pin: string;
  fuel1: boolean;
  fuel2: boolean;
  fuel3: boolean;
  fuel4: boolean;
  operator: boolean;
  driver: boolean;
}

function tagToEdit(tag: TagEntry): EditState {
  const flags = decodeTagParam2(tag.param2);
  return {
    index: tag.index,
    tagId: tag.tagId,
    limit: String(tag.limit),
    pin: String(tag.pin),
    ...flags,
  };
}

// ---- Styled checkbox — bright blue when checked, visible border when unchecked ----

const Cb: FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <div
    onClick={disabled ? undefined : () => onChange(!checked)}
    className={`w-4 h-4 rounded border inline-flex items-center justify-center cursor-pointer select-none
      ${disabled ? 'cursor-default' : ''}
      ${checked
        ? 'bg-blue-500 border-blue-500'
        : 'bg-zinc-800 border-zinc-500'
      }`}
  >
    {checked && (
      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 6l3 3 5-5" />
      </svg>
    )}
  </div>
);

// ---- Main component ----

export const TagsTab: FC = () => {
  const { password, isConnected, setConnected } = useConnectionStore();
  const { setLastError, setShowPasswordError } = useStatusStore();
  const { t } = useI18n();

  const [tags, setTags] = useState<TagEntry[]>([]);
  const [totalSlots, setTotalSlots] = useState(0);
  const [, setUsedSlots] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [editRow, setEditRow] = useState<EditState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  // Cancel reading on unmount (tab switch)
  useEffect(() => {
    return () => { cancelRef.current = true; };
  }, []);

  const handlePasswordError = useCallback(async () => {
    setLastError(t('error.wrongPassword'));
    setShowPasswordError(true);
    try { await window.serial.disconnect(); } catch { /* ignore */ }
    setConnected(false);
  }, [setLastError, setShowPasswordError, setConnected, t]);

  // ---- Stop reading ----

  const stopReading = useCallback(() => {
    cancelRef.current = true;
  }, []);

  // ---- Read all keys ----

  const readKeys = useCallback(async () => {
    if (!isConnected) return;
    cancelRef.current = false;
    setLoading(true);
    setEditRow(null);
    setStatusMsg(t('tags.reading'));
    setProgress(0);
    setProgressLabel(t('tags.progress'));

    const entries: TagEntry[] = [];
    try {
      const tagsCmd = buildTagsCountCmd(password);
      const respTags = await window.serial.sendCommand(tagsCmd);
      if (cancelRef.current) throw new Error('stopped');
      if (isPasswordError(respTags)) { await handlePasswordError(); return; }
      if (isErrorResponse(respTags)) throw new Error(`TAGS: ${respTags.trim()}`);
      const info = parseTagsResponse(respTags);
      if (!info) throw new Error('TAGS: malformed response');

      setTotalSlots(info.limit);
      setUsedSlots(info.added);

      if (info.added === 0) {
        setTags([]);
        setLoaded(true);
        setStatusMsg(t('tags.dbEmpty'));
        return;
      }

      const count = info.limit;
      setProgressTotal(count);

      let validCount = 0;
      for (let i = 1; i <= count; i++) {
        if (cancelRef.current) break;
        setProgress(i);
        const cmd = buildTagGetByIndexCmd(password, i);
        const resp = await window.serial.sendCommand(cmd);
        if (cancelRef.current) break;
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) break;
        const tag = parseTagGetResponse(resp);
        if (!tag) continue;
        entries.push(tag);
        if (tag.tagId !== TAG_EMPTY_ID) {
          validCount++;
          if (validCount >= info.added) break;
        }
      }

      setTags(entries);
      setLoaded(true);
      if (cancelRef.current) {
        setStatusMsg(`${t('tags.readSuccess')} (${entries.length}/${count})`);
      } else {
        setStatusMsg(t('tags.readSuccess'));
      }
    } catch (err) {
      // On stop, still show what we got
      if (entries.length > 0) {
        setTags(entries);
        setLoaded(true);
        setStatusMsg(`${t('tags.readSuccess')} (${entries.length})`);
      } else {
        setStatusMsg(`${t('tags.readError')}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressTotal(0);
    }
  }, [isConnected, password, handlePasswordError, t]);

  // ---- Write all keys (skip empty FFFFFFFFFFFF) ----

  const writeKeys = useCallback(async () => {
    if (!isConnected || tags.length === 0) return;
    setWriting(true);
    setEditRow(null);
    setStatusMsg(t('tags.writing'));
    setProgressLabel(t('tags.writeProgress'));

    const nonEmpty = tags.filter((tag) => tag.tagId !== TAG_EMPTY_ID);
    setProgressTotal(nonEmpty.length);
    setProgress(0);

    try {
      for (let i = 0; i < nonEmpty.length; i++) {
        setProgress(i + 1);
        const tag = nonEmpty[i];
        const cmd = buildTagAddByIndexCmd(password, tag.index, tag.tagId, tag.limit, tag.param2, tag.pin);
        const resp = await window.serial.sendCommand(cmd);
        if (isPasswordError(resp)) { await handlePasswordError(); return; }
        if (isErrorResponse(resp)) throw new Error(`TAG ${tag.index}: ${resp.trim()}`);
      }
      setStatusMsg(t('tags.writeSuccess'));
    } catch (err) {
      setStatusMsg(`${t('tags.writeError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWriting(false);
      setProgress(0);
      setProgressTotal(0);
    }
  }, [isConnected, tags, password, handlePasswordError, t]);

  // ---- Save single tag (inline edit) ----

  const saveTag = useCallback(async (edit: EditState) => {
    if (!isConnected) return;
    setSaving(true);
    setStatusMsg(t('tags.saving'));

    try {
      const limit = parseInt(edit.limit, 10);
      const pin = parseInt(edit.pin, 10);
      if (!Number.isFinite(limit) || limit < -1 || limit > 9999) throw new Error('Invalid limit');
      if (!Number.isFinite(pin) || pin < 0 || pin > 9999) throw new Error('Invalid PIN');

      const param2 = encodeTagParam2({
        fuel1: edit.fuel1, fuel2: edit.fuel2, fuel3: edit.fuel3, fuel4: edit.fuel4,
        operator: edit.operator, driver: edit.driver,
      });

      const cmd = buildTagAddByIndexCmd(password, edit.index, edit.tagId.toUpperCase(), limit, param2, pin);
      const resp = await window.serial.sendCommand(cmd);
      if (isPasswordError(resp)) { await handlePasswordError(); return; }
      if (isErrorResponse(resp)) throw new Error(resp.trim());

      setTags((prev) => prev.map((tag) =>
        tag.index === edit.index
          ? { ...tag, tagId: edit.tagId.toUpperCase(), limit, param2, pin }
          : tag,
      ));
      setEditRow(null);
      setStatusMsg(t('tags.saveSuccess'));
    } catch (err) {
      setStatusMsg(`${t('tags.saveError')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [isConnected, password, handlePasswordError, t]);

  // ---- XLSX Export ----

  const exportXlsx = useCallback(() => {
    const nonEmpty = tags.filter((tag) => tag.tagId !== TAG_EMPTY_ID);
    const header = ['Index', 'TagID', 'Limit', 'PIN', 'Fuel1', 'Fuel2', 'Fuel3', 'Fuel4', 'Operator', 'Driver'];
    const rows: Array<Array<string | number>> = [header];
    for (const tag of nonEmpty) {
      const f = decodeTagParam2(tag.param2);
      rows.push([
        tag.index,
        tag.tagId,
        tag.limit,
        tag.pin,
        f.fuel1 ? 1 : 0,
        f.fuel2 ? 1 : 0,
        f.fuel3 ? 1 : 0,
        f.fuel4 ? 1 : 0,
        f.operator ? 1 : 0,
        f.driver ? 1 : 0,
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 8 }, { wch: 6 },
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
      { wch: 9 }, { wch: 7 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tags');
    XLSX.writeFile(wb, 'tags.xlsx');
  }, [tags]);

  // ---- XLSX Import ----

  const onImportFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('empty workbook');
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });

      // Parse rows (skip header)
      const entries: TagEntry[] = [];
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 4) continue;
        const tagId = String(row[1] ?? '').toUpperCase().replace(/[^0-9A-F]/g, '');
        if (!/^[0-9A-F]{12}$/.test(tagId)) continue; // skip header or invalid
        if (tagId === TAG_EMPTY_ID) continue;

        const limit = Number(row[2]) || 0;
        const pin = Number(row[3]) || 0;
        const fuel1 = Number(row[4] ?? 1) === 1;
        const fuel2 = Number(row[5] ?? 1) === 1;
        const fuel3 = Number(row[6] ?? 1) === 1;
        const fuel4 = Number(row[7] ?? 1) === 1;
        const operator = Number(row[8] ?? 0) === 1;
        const driver = Number(row[9] ?? 0) === 1;

        const param2 = encodeTagParam2({ fuel1, fuel2, fuel3, fuel4, operator, driver });
        entries.push({
          index: entries.length + 1,
          tagId,
          limit: Math.max(-1, Math.min(9999, Math.round(limit))),
          param2,
          pin: Math.max(0, Math.min(9999, Math.round(pin))),
        });
      }

      if (entries.length === 0) throw new Error('No valid keys found in file');

      // Check limit
      if (totalSlots > 0 && entries.length > totalSlots) {
        alert(`${t('tags.importLimitExceeded')}: ${entries.length} > ${totalSlots}`);
        return;
      }

      setTags(entries);
      setUsedSlots(entries.length);
      setLoaded(true);
      setStatusMsg(`${t('tags.importSuccess')} (${entries.length})`);
    } catch (err) {
      setStatusMsg(`${t('tags.importError')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [totalSlots, t]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void onImportFile(file);
    e.target.value = '';
  }, [onImportFile]);

  const busy = loading || writing || saving;

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.tags')}</h2>
        <p className="text-zinc-500 mt-2">{t('tags.notConnected')}</p>
      </div>
    );
  }

  // Filter out empty tags for display
  const visibleTags = tags.filter((tag) => tag.tagId !== TAG_EMPTY_ID);

  const limitLabel = (limit: number): string => {
    if (limit === -1) return t('tags.exhausted');
    if (limit === 0) return t('tags.unlimited');
    return String(limit);
  };

  return (
    <div className="p-4 flex flex-col gap-3 h-full">
      {/* Header buttons */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <h2 className="text-lg font-semibold text-zinc-200 mr-1">{t('tags.panelTitle')}</h2>

        {loading ? (
          <button
            onClick={stopReading}
            className="px-3 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-500 text-white"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={readKeys}
            disabled={busy}
            className="px-3 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          >
            {t('tags.readKeys')}
          </button>
        )}

        <button
          onClick={writeKeys}
          disabled={busy || visibleTags.length === 0}
          className="px-3 py-1 rounded text-xs font-medium bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
        >
          {writing ? t('tags.writing') : t('tags.writeKeys')}
        </button>

        <button
          onClick={exportXlsx}
          disabled={busy || visibleTags.length === 0}
          className="px-3 py-1 rounded text-xs font-medium bg-zinc-600 hover:bg-zinc-500 text-white disabled:opacity-50"
        >
          {t('tags.export')}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="px-3 py-1 rounded text-xs font-medium bg-zinc-600 hover:bg-zinc-500 text-white disabled:opacity-50"
        >
          {t('tags.import')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileChange}
          className="hidden"
        />

        {loaded && (
          <span className="text-xs text-zinc-400">
            {t('tags.totalSlots')}: {totalSlots} &middot; {t('tags.usedSlots')}: {visibleTags.length}
          </span>
        )}
        {statusMsg && <span className="text-xs text-zinc-400 ml-auto">{statusMsg}</span>}
      </div>

      {/* Progress bar */}
      {(loading || writing) && progressTotal > 0 && (
        <div className="flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <span>{progressLabel}: {progress} / {progressTotal}</span>
          </div>
          <div className="w-full bg-zinc-700 rounded h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded transition-all"
              style={{ width: `${(progress / progressTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loaded && !loading && (
        <p className="text-zinc-500 mt-2">{t('tags.noData')}</p>
      )}

      {/* Table — only non-empty keys */}
      {loaded && (
        <div className="flex-[3] min-h-0 overflow-auto border border-zinc-700 rounded">
          {visibleTags.length === 0 ? (
            <p className="text-zinc-500 p-4 text-sm">{t('tags.dbEmpty')}</p>
          ) : (
            <table className="w-full text-xs text-zinc-300">
              <thead className="bg-zinc-800 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium border-b border-zinc-700 w-10">{t('tags.colIndex')}</th>
                  <th className="px-2 py-1.5 text-left font-medium border-b border-zinc-700">{t('tags.colTagId')}</th>
                  <th className="px-2 py-1.5 text-left font-medium border-b border-zinc-700 w-20">{t('tags.colLimit')}</th>
                  <th className="px-2 py-1.5 text-left font-medium border-b border-zinc-700 w-16">{t('tags.colPin')}</th>
                  <th className="px-2 py-1.5 text-center font-medium border-b border-zinc-700 w-14">{t('tags.colFuel1')}</th>
                  <th className="px-2 py-1.5 text-center font-medium border-b border-zinc-700 w-14">{t('tags.colFuel2')}</th>
                  <th className="px-2 py-1.5 text-center font-medium border-b border-zinc-700 w-14">{t('tags.colFuel3')}</th>
                  <th className="px-2 py-1.5 text-center font-medium border-b border-zinc-700 w-14">{t('tags.colFuel4')}</th>
                  <th className="px-2 py-1.5 text-center font-medium border-b border-zinc-700 w-20">{t('tags.colOperator')}</th>
                  <th className="px-2 py-1.5 text-center font-medium border-b border-zinc-700 w-20">{t('tags.colDriver')}</th>
                  <th className="px-2 py-1.5 text-center font-medium border-b border-zinc-700 w-24">{t('tags.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleTags.map((tag) => {
                  const editing = editRow?.index === tag.index;
                  const flags = decodeTagParam2(tag.param2);

                  if (editing) {
                    return (
                      <tr key={tag.index} className="bg-zinc-800/60">
                        <td className="px-2 py-1 border-b border-zinc-700/50">{tag.index}</td>
                        <td className="px-2 py-1 border-b border-zinc-700/50">
                          <input
                            type="text"
                            value={editRow.tagId}
                            maxLength={12}
                            onChange={(e) => setEditRow({ ...editRow, tagId: e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 12) })}
                            className="bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-zinc-200 w-28 font-mono focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1 border-b border-zinc-700/50">
                          <input
                            type="number"
                            value={editRow.limit}
                            min={-1}
                            max={9999}
                            onChange={(e) => setEditRow({ ...editRow, limit: e.target.value })}
                            className="bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-zinc-200 w-16 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1 border-b border-zinc-700/50">
                          <input
                            type="number"
                            value={editRow.pin}
                            min={0}
                            max={9999}
                            onChange={(e) => setEditRow({ ...editRow, pin: e.target.value })}
                            className="bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-zinc-200 w-14 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={editRow.fuel1} onChange={(v) => setEditRow({ ...editRow, fuel1: v })} /></td>
                        <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={editRow.fuel2} onChange={(v) => setEditRow({ ...editRow, fuel2: v })} /></td>
                        <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={editRow.fuel3} onChange={(v) => setEditRow({ ...editRow, fuel3: v })} /></td>
                        <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={editRow.fuel4} onChange={(v) => setEditRow({ ...editRow, fuel4: v })} /></td>
                        <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={editRow.operator} onChange={(v) => setEditRow({ ...editRow, operator: v })} /></td>
                        <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={editRow.driver} onChange={(v) => setEditRow({ ...editRow, driver: v })} /></td>
                        <td className="px-2 py-1 border-b border-zinc-700/50 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => saveTag(editRow)}
                              disabled={saving}
                              className="px-2 py-0.5 rounded text-[10px] bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
                            >
                              {t('tags.save')}
                            </button>
                            <button
                              onClick={() => setEditRow(null)}
                              disabled={saving}
                              className="px-2 py-0.5 rounded text-[10px] bg-zinc-600 hover:bg-zinc-500 text-white disabled:opacity-50"
                            >
                              {t('tags.cancel')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={tag.index} className="hover:bg-zinc-800/40">
                      <td className="px-2 py-1 border-b border-zinc-700/50">{tag.index}</td>
                      <td className="px-2 py-1 border-b border-zinc-700/50 font-mono">{tag.tagId}</td>
                      <td className="px-2 py-1 border-b border-zinc-700/50">
                        <span className={tag.limit === -1 ? 'text-red-400' : tag.limit === 0 ? 'text-green-400' : ''}>
                          {limitLabel(tag.limit)}
                        </span>
                      </td>
                      <td className="px-2 py-1 border-b border-zinc-700/50">{tag.pin}</td>
                      <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={flags.fuel1} onChange={() => {}} disabled /></td>
                      <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={flags.fuel2} onChange={() => {}} disabled /></td>
                      <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={flags.fuel3} onChange={() => {}} disabled /></td>
                      <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={flags.fuel4} onChange={() => {}} disabled /></td>
                      <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={flags.operator} onChange={() => {}} disabled /></td>
                      <td className="px-2 py-1 border-b border-zinc-700/50 text-center"><Cb checked={flags.driver} onChange={() => {}} disabled /></td>
                      <td className="px-2 py-1 border-b border-zinc-700/50 text-center">
                        <button
                          onClick={() => setEditRow(tagToEdit(tag))}
                          disabled={busy}
                          className="px-2 py-0.5 rounded text-[10px] bg-zinc-600 hover:bg-zinc-500 text-white disabled:opacity-50"
                        >
                          {t('tags.edit')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

    </div>
  );
};

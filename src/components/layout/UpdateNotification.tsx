import { type FC, useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { UpdateAvailablePayload, DownloadProgress } from '../../types/serial';

type UpdaterState =
  | { kind: 'idle' }
  | { kind: 'available'; info: UpdateAvailablePayload }
  | { kind: 'downloading'; info: UpdateAvailablePayload; progress: number }
  | { kind: 'ready'; info: UpdateAvailablePayload }
  | { kind: 'installing'; info: UpdateAvailablePayload }
  | { kind: 'error'; message: string; info: UpdateAvailablePayload };

// electron-builder wraps the GitHub release body in <p>/<br/> on publish.
// Convert that minimal HTML back to plain text so the <pre> renders cleanly.
function stripReleaseNotesHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const UpdateNotification: FC = () => {
  const { t } = useI18n();
  const isConnected = useConnectionStore((s) => s.isConnected);
  const isReadingAll = useSettingsStore((s) => s.isReadingAll);
  const isWritingAll = useSettingsStore((s) => s.isWritingAll);

  const [state, setState] = useState<UpdaterState>({ kind: 'idle' });
  const [modalOpen, setModalOpen] = useState(false);

  const restartBlocked = isConnected || isReadingAll || isWritingAll;

  useEffect(() => {
    const offAvailable = window.updater.onAvailable((info) => {
      setState({ kind: 'available', info });
      setModalOpen(true);
    });
    const offProgress = window.updater.onProgress((p: DownloadProgress) => {
      setState((prev) =>
        prev.kind === 'downloading' || prev.kind === 'available'
          ? { kind: 'downloading', info: prev.info, progress: p.percent }
          : prev,
      );
    });
    const offDownloaded = window.updater.onDownloaded(() => {
      setState((prev) =>
        prev.kind === 'downloading' || prev.kind === 'available'
          ? { kind: 'ready', info: prev.info }
          : prev,
      );
    });
    const offError = window.updater.onError((message) => {
      // Errors only reach here after user initiated download (main process
      // filters background errors). Attach to current info if we have it.
      setState((prev) =>
        prev.kind === 'idle'
          ? prev
          : { kind: 'error', message, info: prev.info },
      );
    });
    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  const handleDownload = async (): Promise<void> => {
    if (state.kind !== 'available') return;
    if (state.info.isPortable) {
      await window.updater.openReleasePage(state.info.releaseUrl);
      setModalOpen(false);
      return;
    }
    setState({ kind: 'downloading', info: state.info, progress: 0 });
    await window.updater.download();
  };

  const handleRestart = async (): Promise<void> => {
    if (restartBlocked) return;
    if (state.kind !== 'ready') return;
    // Show an "installing" overlay immediately so the user sees feedback —
    // electron-updater's quitAndInstall can take 3-5s to actually close the app.
    setState({ kind: 'installing', info: state.info });
    setModalOpen(true);
    // Defer the install one frame so the overlay paints first.
    setTimeout(() => { window.updater.installAndRestart(); }, 50);
  };

  // Nothing visible when there's no update.
  if (state.kind === 'idle') return null;

  return (
    <>
      {/* Single icon-only indicator. Opens the modal on click. */}
      <button
        onClick={() => setModalOpen(true)}
        title={t('updater.badge')}
        aria-label={t('updater.badge')}
        className="relative w-8 h-8 flex items-center justify-center rounded bg-amber-600 hover:bg-amber-500 text-white"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 3a1 1 0 011 1v7.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V4a1 1 0 011-1z" />
          <path d="M4 15a1 1 0 011 1v1h10v-1a1 1 0 112 0v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2a1 1 0 011-1z" />
        </svg>
        {state.kind === 'downloading' && (
          <span className="absolute -top-1 -right-1 text-[10px] font-mono bg-zinc-900 px-1 rounded">
            {Math.round(state.progress)}%
          </span>
        )}
      </button>

      {modalOpen && state.kind === 'installing' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <svg className="w-12 h-12 animate-spin text-green-500" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="text-center">
              <div className="text-zinc-100 text-lg font-semibold">{t('updater.installingTitle')}</div>
              <div className="text-zinc-400 text-sm mt-1">{t('updater.installingDesc')}</div>
            </div>
          </div>
        </div>
      )}

      {modalOpen && state.kind !== 'installing' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-5 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            {state.kind === 'error' ? (
              <>
                <h3 className="text-zinc-100 text-base font-semibold mb-2">{t('updater.errorTitle')}</h3>
                <p className="text-red-400 text-sm mb-4 break-words">{state.message}</p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => window.updater.openReleasePage(state.info.releaseUrl)}
                    className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
                  >
                    {t('updater.openReleasePage')}
                  </button>
                  <button
                    onClick={() => setModalOpen(false)}
                    className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
                  >
                    {t('confirm.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-zinc-100 text-base font-semibold mb-3">
                  {state.kind === 'ready' ? t('updater.readyTitle') : t('updater.title')}
                </h3>

                {state.kind !== 'ready' && (
                  <div className="text-sm text-zinc-300 mb-3 space-y-1">
                    <div>
                      <span className="text-zinc-500">{t('updater.currentVersion')} </span>
                      <span className="font-mono">{APP_VERSION}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">{t('updater.newVersion')} </span>
                      <span className="font-mono text-green-400">{state.info.version}</span>
                    </div>
                    {state.info.isPortable && (
                      <div className="text-xs text-amber-400 mt-2">{t('updater.portableNotice')}</div>
                    )}
                  </div>
                )}

                {state.kind !== 'ready' && state.info.releaseNotes && (
                  <div className="mb-4 flex-1 overflow-y-auto">
                    <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                      {t('updater.releaseNotes')}
                    </div>
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-sans bg-zinc-900 border border-zinc-700 rounded p-2 max-h-48 overflow-y-auto">
                      {stripReleaseNotesHtml(state.info.releaseNotes)}
                    </pre>
                  </div>
                )}

                {state.kind === 'downloading' && (
                  <div className="mb-4">
                    <div className="text-xs text-zinc-400 mb-1">
                      {t('updater.downloading')} {Math.round(state.progress)}%
                    </div>
                    <div className="h-2 bg-zinc-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${state.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {state.kind === 'ready' && (
                  <>
                    <p className="text-sm text-zinc-300 mb-3">{t('updater.readyDesc')}</p>
                    {restartBlocked && (
                      <p className="text-xs text-amber-400 mb-3">{t('updater.restartBlocked')}</p>
                    )}
                  </>
                )}

                <div className="flex justify-end gap-2 mt-2">
                  {state.kind === 'available' && (
                    <>
                      <button
                        onClick={() => setModalOpen(false)}
                        className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
                      >
                        {t('updater.later')}
                      </button>
                      <button
                        onClick={handleDownload}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded"
                      >
                        {state.info.isPortable ? t('updater.openReleasePage') : t('updater.download')}
                      </button>
                    </>
                  )}
                  {state.kind === 'downloading' && (
                    <button
                      onClick={() => setModalOpen(false)}
                      className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
                    >
                      {t('updater.later')}
                    </button>
                  )}
                  {state.kind === 'ready' && (
                    <>
                      <button
                        onClick={() => setModalOpen(false)}
                        className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
                      >
                        {t('updater.restartLater')}
                      </button>
                      <button
                        onClick={handleRestart}
                        disabled={restartBlocked}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('updater.restartNow')}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

declare const APP_VERSION: string;

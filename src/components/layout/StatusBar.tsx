import { type FC } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useStatusStore } from '../../stores/statusStore';
import { useI18n } from '../../i18n';

export const StatusBar: FC = () => {
  const { isConnected, port } = useConnectionStore();
  const { lastError, lastErrorIsSuccess, progress, progressText } = useStatusStore();
  const { t } = useI18n();

  return (
    <footer className="h-7 bg-zinc-900 border-t border-zinc-700 flex items-center px-3 gap-4 text-xs">
      {/* Connection indicator */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span className="text-zinc-400">
          {isConnected ? `${t('status.connected')} ${port}` : t('status.disconnected')}
        </span>
      </div>

      {/* Progress bar */}
      {progress >= 0 && (
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-200"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          {progressText && (
            <span className="text-zinc-400 whitespace-nowrap">{progressText}</span>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Last message */}
      {lastError && (
        <span className={`${lastErrorIsSuccess ? 'text-green-400' : 'text-red-400'} truncate max-w-md`} title={lastError}>
          {lastError}
        </span>
      )}
    </footer>
  );
};

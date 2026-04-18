import { type FC, useState, useRef, useCallback, useEffect } from 'react';
import { Toolbar } from './components/layout/Toolbar';
import { Sidebar, type TabId } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { StatusTab } from './components/tabs/StatusTab';
import { DiagnosticsTab } from './components/tabs/DiagnosticsTab';
import { ServerTab } from './components/tabs/ServerTab';
import { ProtocolTab } from './components/tabs/ProtocolTab';
import { WifiTab } from './components/tabs/WifiTab';
import { GpsTab } from './components/tabs/GpsTab';
import { InputsOutputsTab } from './components/tabs/InputsOutputsTab';
import { RsInterfacesTab } from './components/tabs/RsInterfacesTab';
import { FlsTab } from './components/tabs/FlsTab';
import { PumpsTab } from './components/tabs/PumpsTab';
import { KeyboardTab } from './components/tabs/KeyboardTab';
import { SecurityTab } from './components/tabs/SecurityTab';
import { PrinterTab } from './components/tabs/PrinterTab';
import { TagsTab } from './components/tabs/TagsTab';
import { SystemTab } from './components/tabs/SystemTab';
import { useConnectionStore } from './stores/connectionStore';
import { useStatusStore } from './stores/statusStore';
import { useDiagnosticsStore } from './stores/diagnosticsStore';
import { useI18n } from './i18n';

const TAB_COMPONENTS: Record<TabId, FC> = {
  status: StatusTab,
  diagnostics: DiagnosticsTab,
  server: ServerTab,
  protocol: ProtocolTab,
  wifi: WifiTab,
  gps: GpsTab,
  'inputs-outputs': InputsOutputsTab,
  'rs-interfaces': RsInterfacesTab,
  fls: FlsTab,
  pumps: PumpsTab,
  keyboard: KeyboardTab,
  security: SecurityTab,
  printer: PrinterTab,
  tags: TagsTab,
  system: SystemTab,
};

const App: FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('status');
  const prevTabRef = useRef<TabId>('status');
  const { password, isConnected } = useConnectionStore();
  const { showPasswordError, setShowPasswordError, isSystemBusy } = useStatusStore();
  const { t } = useI18n();

  // Switch to Status tab on disconnect — unless a system-level op is in progress
  // (e.g. firmware update disconnects mid-way intentionally).
  useEffect(() => {
    if (!isConnected && !isSystemBusy) {
      setActiveTab('status');
      useDiagnosticsStore.getState().clearEnabledChannels();
    }
  }, [isConnected, isSystemBusy]);

  const handleTabChange = useCallback((tab: TabId) => {
    // When leaving diagnostics tab, disable all logs to avoid interference
    // When leaving diagnostics, reset logs — but skip if going to status (its init already sends LOG;RESET)
    if (prevTabRef.current === 'diagnostics' && tab !== 'diagnostics' && tab !== 'status' && isConnected) {
      window.serial.sendCommand(`$${password};LOG;RESET`).catch(() => {});
      useDiagnosticsStore.getState().clearEnabledChannels();
    }
    prevTabRef.current = tab;
    setActiveTab(tab);
  }, [isConnected, password]);

  const ActiveTabComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
        <main className="flex-1 overflow-auto">
          <ActiveTabComponent />
        </main>
      </div>
      <StatusBar />

      {/* Wrong password modal */}
      {showPasswordError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-5 max-w-sm w-full mx-4">
            <h3 className="text-red-400 text-base font-semibold mb-2">{t('error.wrongPassword')}</h3>
            <p className="text-zinc-400 text-sm mb-5">{t('error.wrongPasswordDetail')}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowPasswordError(false)}
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm px-4 py-1.5 rounded"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

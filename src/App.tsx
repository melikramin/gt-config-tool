import { type FC, useState, useRef, useCallback } from 'react';
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
import { useConnectionStore } from './stores/connectionStore';

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
};

const App: FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('status');
  const prevTabRef = useRef<TabId>('status');
  const { password, isConnected } = useConnectionStore();

  const handleTabChange = useCallback((tab: TabId) => {
    // When leaving diagnostics tab, disable all logs to avoid interference
    // When leaving diagnostics, reset logs — but skip if going to status (its init already sends LOG;RESET)
    if (prevTabRef.current === 'diagnostics' && tab !== 'diagnostics' && tab !== 'status' && isConnected) {
      window.serial.sendCommand(`$${password};LOG;RESET`).catch(() => {});
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
    </div>
  );
};

export default App;

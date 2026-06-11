import { type FC } from 'react';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';
import { useTagsStore } from '../../stores/tagsStore';

export type TabId =
  | 'status'
  | 'diagnostics'
  | 'server'
  | 'protocol'
  | 'wifi'
  | 'gps'
  | 'inputs-outputs'
  | 'rs-interfaces'
  | 'fls'
  | 'pumps'
  | 'keyboard'
  | 'security'
  | 'printer'
  | 'camera'
  | 'tags'
  | 'system';

interface TabItem {
  id: TabId;
  labelKey: keyof Translations;
}

const TABS: TabItem[] = [
  { id: 'status', labelKey: 'tab.status' },
  { id: 'diagnostics', labelKey: 'tab.diagnostics' },
  { id: 'server', labelKey: 'tab.server' },
  { id: 'protocol', labelKey: 'tab.protocol' },
  { id: 'wifi', labelKey: 'tab.wifi' },
  { id: 'gps', labelKey: 'tab.gps' },
  { id: 'inputs-outputs', labelKey: 'tab.inputsOutputs' },
  { id: 'rs-interfaces', labelKey: 'tab.rsInterfaces' },
  { id: 'fls', labelKey: 'tab.fls' },
  { id: 'pumps', labelKey: 'tab.pumps' },
  { id: 'keyboard', labelKey: 'tab.keyboard' },
  { id: 'security', labelKey: 'tab.security' },
  { id: 'printer', labelKey: 'tab.printer' },
  { id: 'camera', labelKey: 'tab.camera' },
  { id: 'tags', labelKey: 'tab.tags' },
  { id: 'system', labelKey: 'tab.system' },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export const Sidebar: FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const { t } = useI18n();
  // While keys are being read/written, lock navigation so the operation and
  // its progress bar stay on screen (TagsTab would otherwise unmount).
  const busy = useTagsStore((s) => s.busy);

  return (
    <aside className="w-44 bg-zinc-900 border-r border-zinc-700 flex flex-col py-1 overflow-y-auto">
      {TABS.map((tab, index) => {
        const locked = busy && tab.id !== activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => { if (!locked) onTabChange(tab.id); }}
            disabled={locked}
            title={locked ? t('tags.busyLocked') : undefined}
            className={`
              px-3 py-2 text-left text-sm transition-colors
              ${activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : locked
                  ? 'text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
              }
            `}
          >
            <span className="text-zinc-500 mr-2 text-xs">{index + 1}.</span>
            {t(tab.labelKey)}
          </button>
        );
      })}
    </aside>
  );
};

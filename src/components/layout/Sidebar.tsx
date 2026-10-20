import { type FC } from 'react';
import { useI18n } from '../../i18n';
import type { Translations } from '../../i18n/types';
import { useTagsStore } from '../../stores/tagsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { isGt2 } from '../../types/device';

export type TabId =
  | 'status'
  | 'diagnostics'
  | 'server'
  | 'protocol'
  | 'wifi'
  | 'ethernet'
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
  { id: 'ethernet', labelKey: 'tab.ethernet' },
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

/** GT-2 router: limited settings set (no GSM/GNSS/pumps/sensors/keys). */
const GT2_TABS: ReadonlySet<TabId> = new Set<TabId>([
  'status', 'diagnostics', 'server', 'wifi', 'ethernet', 'rs-interfaces', 'system',
]);

/** Tabs that exist only on GT-2 and are hidden for every other device. */
const GT2_ONLY_TABS: ReadonlySet<TabId> = new Set<TabId>(['ethernet']);

/** Tabs shown for the given HW_TYPE ('' = not detected yet → full GT-9 set). */
export function visibleTabs(deviceType: string): TabId[] {
  const gt2 = isGt2(deviceType);
  return TABS
    .filter((tab) => (gt2 ? GT2_TABS.has(tab.id) : !GT2_ONLY_TABS.has(tab.id)))
    .map((tab) => tab.id);
}

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export const Sidebar: FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const { t } = useI18n();
  // While keys are being read/written, lock navigation so the operation and
  // its progress bar stay on screen (TagsTab would otherwise unmount).
  const busy = useTagsStore((s) => s.busy);
  const deviceType = useConnectionStore((s) => s.deviceType);
  const visible = new Set(visibleTabs(deviceType));

  return (
    <aside className="w-44 bg-zinc-900 border-r border-zinc-700 flex flex-col py-1 overflow-y-auto">
      {TABS.filter((tab) => visible.has(tab.id)).map((tab, index) => {
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

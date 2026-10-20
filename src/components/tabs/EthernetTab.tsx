import { type FC, useState, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useI18n } from '../../i18n';

/**
 * Ethernet settings (GT-2 only). Same IP block as a WiFi network: DHCP or
 * static IP/mask/gateway/DNS.
 *
 * STUB: the firmware has no Ethernet command yet — the form is local-only and
 * Read/Save stay disabled. Wire the command builders/parsers here once it exists.
 */

interface EthernetData {
  ipMode: string; // '1' = DHCP, '0' = static
  ip: string;
  mask: string;
  gateway: string;
  dns1: string;
  dns2: string;
}

const EMPTY_ETHERNET: EthernetData = {
  ipMode: '1',
  ip: '',
  mask: '',
  gateway: '',
  dns1: '',
  dns2: '',
};

const DHCP_OPTIONS = [
  { value: '1', labelKey: 'wifi.dhcpOn' as const },
  { value: '0', labelKey: 'wifi.dhcpOff' as const },
];

// ---- UI components ----

const InputField: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, disabled, placeholder }) => (
  <div className="flex items-center gap-2 mb-2">
    <label className="text-zinc-400 text-xs w-24 shrink-0">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none"
    />
  </div>
);

const SelectField: FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="flex items-center gap-2 mb-2">
    <label className="text-zinc-400 text-xs w-24 shrink-0">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// ---- Main component ----

export const EthernetTab: FC = () => {
  const { isConnected } = useConnectionStore();
  const { t } = useI18n();

  const [data, setData] = useState<EthernetData>(EMPTY_ETHERNET);

  useEffect(() => {
    if (!isConnected) setData(EMPTY_ETHERNET);
  }, [isConnected]);

  const update = (patch: Partial<EthernetData>): void => {
    setData((prev) => ({ ...prev, ...patch }));
  };

  if (!isConnected) {
    return (
      <div className="p-4">
        <h2 className="text-lg font-semibold text-zinc-200">{t('tab.ethernet')}</h2>
        <p className="text-zinc-500 mt-2">{t('eth.notConnected')}</p>
      </div>
    );
  }

  const dhcpOptions = DHCP_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }));
  const dhcpOn = data.ipMode === '1';

  return (
    <div className="p-4 max-w-xl">
      <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 border-b border-zinc-700 pb-1">
          {t('eth.settings')}
        </h3>

        <SelectField
          label={t('wifi.dhcp')}
          value={data.ipMode}
          options={dhcpOptions}
          onChange={(v) => update({ ipMode: v })}
        />
        <InputField label={t('wifi.ip')} value={data.ip} onChange={(v) => update({ ip: v })} disabled={dhcpOn} placeholder="192.168.8.10" />
        <InputField label={t('wifi.mask')} value={data.mask} onChange={(v) => update({ mask: v })} disabled={dhcpOn} placeholder="255.255.255.0" />
        <InputField label={t('wifi.gateway')} value={data.gateway} onChange={(v) => update({ gateway: v })} disabled={dhcpOn} />
        <InputField label={t('wifi.dns1')} value={data.dns1} onChange={(v) => update({ dns1: v })} disabled={dhcpOn} />
        <InputField label={t('wifi.dns2')} value={data.dns2} onChange={(v) => update({ dns2: v })} disabled={dhcpOn} />

        <div className="flex items-center gap-3 mt-4">
          <button
            disabled
            className="px-4 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.read')}
          </button>
          <button
            disabled
            className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.save')}
          </button>
        </div>
        <p className="text-[11px] text-amber-400/80 mt-3">{t('eth.notSupportedYet')}</p>
      </div>
    </div>
  );
};

import { create } from 'zustand';
import type { ApnData, ServerData, WifiNetworkData } from '../lib/parsers';
import type {
  FilterParams,
  MsensParams,
  TiltParams,
  InputParams,
  EncoderParams,
  RsPortParams,
  LlsSettings,
  PumpParams,
  PumpFormatParams,
  UimParams,
  UimxParams,
  EmstopParams,
  TagcfgParams,
  BypassParams,
  PumpsecParams,
  PrinterParams,
  PrinterTextFields,
} from '../lib/commands';

interface SettingsState {
  /** True while readAllSettings is running */
  isReadingAll: boolean;
  /** True while writeAllSettings is running */
  isWritingAll: boolean;

  // Server tab
  serverApn: ApnData | null;
  serverData: ServerData | null;

  // Protocol tab
  protoBuf20: Uint8Array | null;
  protoBuf21: Uint8Array | null;

  // WiFi tab
  wifiNetworks: WifiNetworkData[] | null;

  // GPS tab
  gpsFilter: FilterParams | null;
  gpsMsens: MsensParams | null;
  gpsTilt: TiltParams | null;

  // Inputs/Outputs tab
  inputCount: number | null;
  inputs: InputParams[] | null;
  encoder1: EncoderParams | null;
  encoder2: EncoderParams | null;

  // RS Interfaces tab
  rsPorts: RsPortParams[] | null;
  rsAvailable: boolean[] | null;

  // FLS tab
  flsSensors: LlsSettings[] | null;

  // Pumps tab
  pumps: PumpParams[] | null;
  pumpFormats: PumpFormatParams[] | null;

  // Keyboard tab
  keyboardUim: UimParams | null;
  keyboardUimx: UimxParams | null;

  // Security tab
  securityEmstop: EmstopParams | null;
  securityTagcfg: TagcfgParams | null;
  securityBypass: BypassParams | null;
  securityPumpsec: PumpsecParams | null;

  // Printer tab
  printerSettings: PrinterParams | null;
  printerText: PrinterTextFields | null;

  // Actions
  setIsReadingAll: (v: boolean) => void;
  setIsWritingAll: (v: boolean) => void;
  setServerSettings: (apn: ApnData, server: ServerData) => void;
  setProtocolSettings: (buf20: Uint8Array, buf21: Uint8Array) => void;
  setWifiSettings: (networks: WifiNetworkData[]) => void;
  setGpsSettings: (filter: FilterParams, msens: MsensParams, tilt: TiltParams) => void;
  setInputsSettings: (count: number, inputs: InputParams[], enc1: EncoderParams, enc2: EncoderParams) => void;
  setRsSettings: (ports: RsPortParams[], available: boolean[]) => void;
  setFlsSettings: (sensors: LlsSettings[]) => void;
  setPumpsSettings: (pumps: PumpParams[]) => void;
  setPumpFormats: (formats: PumpFormatParams[]) => void;
  setKeyboardSettings: (uim: UimParams, uimx: UimxParams) => void;
  setSecuritySettings: (emstop: EmstopParams, tagcfg: TagcfgParams, bypass: BypassParams, pumpsec: PumpsecParams) => void;
  setPrinterSettings: (settings: PrinterParams, text: PrinterTextFields) => void;
  clearAll: () => void;
}

const INITIAL: Omit<SettingsState, 'setIsReadingAll' | 'setIsWritingAll' | 'setServerSettings' | 'setProtocolSettings' | 'setWifiSettings' | 'setGpsSettings' | 'setInputsSettings' | 'setRsSettings' | 'setFlsSettings' | 'setPumpsSettings' | 'setPumpFormats' | 'setKeyboardSettings' | 'setSecuritySettings' | 'setPrinterSettings' | 'clearAll'> = {
  isReadingAll: false,
  isWritingAll: false,
  serverApn: null,
  serverData: null,
  protoBuf20: null,
  protoBuf21: null,
  wifiNetworks: null,
  gpsFilter: null,
  gpsMsens: null,
  gpsTilt: null,
  inputCount: null,
  inputs: null,
  encoder1: null,
  encoder2: null,
  rsPorts: null,
  rsAvailable: null,
  flsSensors: null,
  pumps: null,
  pumpFormats: null,
  keyboardUim: null,
  keyboardUimx: null,
  securityEmstop: null,
  securityTagcfg: null,
  securityBypass: null,
  securityPumpsec: null,
  printerSettings: null,
  printerText: null,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...INITIAL,
  setIsReadingAll: (isReadingAll) => set({ isReadingAll }),
  setIsWritingAll: (isWritingAll) => set({ isWritingAll }),
  setServerSettings: (serverApn, serverData) => set({ serverApn, serverData }),
  setProtocolSettings: (protoBuf20, protoBuf21) => set({ protoBuf20, protoBuf21 }),
  setWifiSettings: (wifiNetworks) => set({ wifiNetworks }),
  setGpsSettings: (gpsFilter, gpsMsens, gpsTilt) => set({ gpsFilter, gpsMsens, gpsTilt }),
  setInputsSettings: (inputCount, inputs, encoder1, encoder2) => set({ inputCount, inputs, encoder1, encoder2 }),
  setRsSettings: (rsPorts, rsAvailable) => set({ rsPorts, rsAvailable }),
  setFlsSettings: (flsSensors) => set({ flsSensors }),
  setPumpsSettings: (pumps) => set({ pumps }),
  setPumpFormats: (pumpFormats) => set({ pumpFormats }),
  setKeyboardSettings: (keyboardUim, keyboardUimx) => set({ keyboardUim, keyboardUimx }),
  setSecuritySettings: (securityEmstop, securityTagcfg, securityBypass, securityPumpsec) =>
    set({ securityEmstop, securityTagcfg, securityBypass, securityPumpsec }),
  setPrinterSettings: (printerSettings, printerText) => set({ printerSettings, printerText }),
  clearAll: () => set(INITIAL),
}));

import { DEVICE_TYPES } from '../types/device';

// ---- helpers ----

function fields(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('$')) return [];
  const content = trimmed.slice(1); // remove leading $
  const parts = content.split(';');
  return parts.slice(1); // drop the command echo
}

function safeField(f: string[], idx: number, fallback = ''): string {
  if (idx < 0 || idx >= f.length) return fallback;
  return f[idx] ?? fallback;
}

/** Format DDMMYY → DD.MM.YY */
function formatDate(raw: string): string {
  if (raw.length < 6) return raw;
  return `${raw.slice(0, 2)}.${raw.slice(2, 4)}.${raw.slice(4, 6)}`;
}

/** Format HHMMSS → HH:MM:SS */
function formatTime(raw: string): string {
  if (raw.length < 6) return raw;
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
}

// ---- GSM status (bitfield from REP, matches GSM_STATUS_T) ----
// bit0: hw_detected, bit1: on, bit2: registered, bit3: connected,
// bit4: roaming, bit5: vc_on, bit6: jamming_detected, bit7: sim_ready

export function gsmStatusText(hexCode: string, locale: string): string {
  const val = parseInt(hexCode, 16);
  if (isNaN(val)) return `0x${hexCode}`;
  const ru = locale === 'ru';

  if (val === 0)     return ru ? 'Инициализация' : 'Initializing';
  if (!(val & 0x01)) return ru ? 'Нет модуля'    : 'No HW';
  if (!(val & 0x80)) return ru ? 'Нет SIM'       : 'No SIM';
  if (!(val & 0x02)) return ru ? 'Выключен'      : 'Off';
  if (!(val & 0x04)) return ru ? 'Нет сигнала'   : 'No Signal';
  if (!(val & 0x08)) return ru ? 'Подключение'   : 'Connecting';

  // connected (bit3 set)
  const parts: string[] = [];
  parts.push(ru ? 'Подключён' : 'Connected');
  if (val & 0x10) parts.push(ru ? 'роуминг' : 'roaming');
  if (val & 0x40) parts.push(ru ? 'глушение' : 'jamming');
  return parts.join(', ');
}

// ---- WiFi status (bitfield from REP, matches WIFI_STATUS_T) ----
// bit0: hw_detected, bit1: on, bit2: associated, bit3: connected

export function wifiStatusText(hexCode: string, locale: string): string {
  const val = parseInt(hexCode, 16);
  if (isNaN(val)) return `0x${hexCode}`;
  const ru = locale === 'ru';

  if (!(val & 0x01)) return ru ? 'Нет модуля' : 'No HW';
  if (!(val & 0x02)) return ru ? 'Выключен'   : 'Off';
  if (!(val & 0x04)) return ru ? 'Поиск'      : 'Scanning';
  if (!(val & 0x08)) return ru ? 'Подключён'  : 'Connected';
  return ru ? 'Подключён' : 'Connected';
}

// ---- RSSI conversion ----

/** GSM RSSI from GSM command is hex (e.g. "8f"). Convert to dBm-style percentage. */
export function rssiHexToPercent(rssiHex: string): string {
  const val = parseInt(rssiHex, 16);
  if (isNaN(val) || val === 99) return '—';
  const capped = Math.min(val & 0x1f, 31);
  const pct = Math.round((capped / 31) * 100);
  return `${pct}%`;
}

/** GSM RSSI from REP is decimal (0-30). Convert to percentage. */
export function rssiToPercent(rssiDecimal: string): string {
  const val = parseInt(rssiDecimal, 10);
  if (isNaN(val) || val > 30) return '—';
  const pct = Math.round((val / 30) * 100);
  return `${pct}%`;
}

// ---- Individual parsers ----

// DEV: $DEV;GT-9;123456;305A33543233510E
// [0]=device model name, [1]=series/ID
export interface DevData {
  deviceName: string;
  deviceId: string;
}

export function parseDev(raw: string): DevData {
  const f = fields(raw);
  return {
    deviceName: safeField(f, 0),
    deviceId: safeField(f, 1),
  };
}

// GSM: $GSM;03;8f;860264052879153;25501;23;+0;NA;NA;NA;NA;120;30;0;120;60;60
// [0]=STATUS(hex), [1]=RSSI(hex), [2]=IMEI
export interface GsmData {
  status: string;
  rssi: string;
  imei: string;
}

export function parseGsm(raw: string): GsmData {
  const f = fields(raw);
  return {
    status: safeField(f, 0),
    rssi: safeField(f, 1),
    imei: safeField(f, 2),
  };
}

// VER: $VER;24;01.00;04.85;01.99;30.03.26
// [0]=HW_TYPE, [2]=FW_VERSION, [4]=RELEASE_DATE
export interface VerData {
  hardwareType: string;
  firmwareVersion: string;
  releaseDate: string;
  deviceName: string;
}

export function parseVer(raw: string): VerData {
  const f = fields(raw);
  const hwType = safeField(f, 0);
  const code = parseInt(hwType, 10);
  return {
    hardwareType: hwType,
    firmwareVersion: safeField(f, 2),
    releaseDate: safeField(f, 4),
    deviceName: DEVICE_TYPES[code] ?? `Unknown (${hwType})`,
  };
}

// DATE: $DATE;310326;191406;+0;0;0;0;1
// [0]=DDMMYY, [1]=HHMMSS
export interface DateData {
  date: string;
  time: string;
}

export function parseDate(raw: string): DateData {
  const f = fields(raw);
  return {
    date: formatDate(safeField(f, 0)),
    time: formatTime(safeField(f, 1)),
  };
}

// REP: $REP;CTR;0200;241017;224920;NA;NA;NA;NA;NA;NA;NA;NA;250;1;6340;894;11364;4396;+27;-128;0,2;0f;20;03;+0;000000000000
//
// Fields counted from START (fixed positions):
//   [2]=DATE(DDMMYY), [3]=TIME(HHMMSS), [4]=LONGITUDE, [6]=LATITUDE
//
// Fields counted from END (stable regardless of middle NA count):
//   len-1  = TAG_ID (last 12 hex chars)
//   len-2  = WiFi RSSI (dBm)
//   len-3  = WiFi Status (hex)
//   len-4  = GSM RSSI (0-30)
//   len-5  = GSM Status (hex)
//   len-6  = ???
//   len-7  = Int. Temperature (°C)
//   len-10 = Ext. Battery (mV)
//
// Satellites: ~field[11] (may be NA when no GPS fix)

export interface RepData {
  extBattery: string;
  latitude: string;
  longitude: string;
  satellites: string;
  gsmStatus: string;
  gsmRssi: string;
  wifiStatus: string;
  wifiRssi: string;
  intTemp: string;
  lastTagId: string;
}

export function parseRep(raw: string): RepData {
  const f = fields(raw);
  const len = f.length;

  // Satellites: search from field[8] to field[14] for first non-NA numeric value
  let satellites = '';
  for (let i = 8; i < Math.min(15, len); i++) {
    const v = f[i];
    if (v !== undefined && v !== 'NA' && v !== '') {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= 0 && n <= 50) {
        satellites = v;
        break;
      }
    }
  }

  return {
    extBattery: safeField(f, len - 10),
    latitude: safeField(f, 6),
    longitude: safeField(f, 4),
    satellites,
    gsmStatus: safeField(f, len - 5),
    gsmRssi: safeField(f, len - 4),
    wifiStatus: safeField(f, len - 3),
    wifiRssi: safeField(f, len - 2),
    intTemp: safeField(f, len - 8),
    lastTagId: safeField(f, len - 1),
  };
}

// FUEL: $FUEL;STATUS1;DOSE1;TOTAL1;STATUS2;DOSE2;TOTAL2;...
export interface PumpInfo {
  status: string;
  dose: string;
  total: string;
}

export interface FuelData {
  pumps: PumpInfo[];
}

export function parseFuel(raw: string): FuelData {
  const f = fields(raw);
  const pumps: PumpInfo[] = [];
  for (let i = 0; i < 4; i++) {
    const base = i * 3;
    pumps.push({
      status: safeField(f, base),
      dose: safeField(f, base + 1),
      total: safeField(f, base + 2),
    });
  }
  return { pumps };
}

// IN: $IN;6;3,0;3,0;3,0;3,0;0,1;0,0
// [0]=count, [1..N]="type,value" pairs
// Types: 0=Digital, 1=Analog, 2=Frequency, 3=Pulse
export const INPUT_TYPES: Record<string, string> = {
  '0': 'Digital',
  '1': 'Analog',
  '2': 'Frequency',
  '3': 'Pulse',
};

export const INPUT_TYPES_RU: Record<string, string> = {
  '0': 'Цифр.',
  '1': 'Аналог.',
  '2': 'Частот.',
  '3': 'Импульс.',
};

export interface InputInfo {
  type: string;
  value: string;
}

export interface InData {
  count: number;
  inputs: InputInfo[];
}

export function parseIn(raw: string): InData {
  const f = fields(raw);
  const count = parseInt(safeField(f, 0, '0'), 10) || 0;
  const inputs: InputInfo[] = [];
  for (let i = 1; i <= count; i++) {
    const pair = safeField(f, i).split(',');
    inputs.push({
      type: pair[0] ?? '',
      value: pair[1] ?? '',
    });
  }
  return { count, inputs };
}

// OUT: $OUT;4;0,0;0,0;0,0;0,0
// [0]=count, [1..N]="type,value" pairs
export interface OutputInfo {
  type: string;
  value: string;
}

export interface OutData {
  count: number;
  outputs: OutputInfo[];
}

export function parseOut(raw: string): OutData {
  const f = fields(raw);
  const count = parseInt(safeField(f, 0, '0'), 10) || 0;
  const outputs: OutputInfo[] = [];
  for (let i = 1; i <= count; i++) {
    const pair = safeField(f, i).split(',');
    outputs.push({
      type: pair[0] ?? '',
      value: pair[1] ?? '',
    });
  }
  return { count, outputs };
}

// LLSn live: [0]=ENABLE [1]=ADDR [2]=TYPE [3]=LENGTH [4]=CAPACITY [5]=TEMP [6]=DENSITY
export interface LlsData {
  height: string;
  volume: string;
  temperature: string;
  density: string;
  mass: string;
}

// LLSn live: [0]=ENABLE [1]=ADDR [2]=HEIGHT [3]=VOLUME [4]=TEMP [5]=DENSITY [6]=MASS [7]=FILTER_MODE(ro)
export function parseLls(raw: string): LlsData {
  const f = fields(raw);
  return {
    height: safeField(f, 2),
    volume: safeField(f, 3),
    temperature: safeField(f, 4),
    density: safeField(f, 5),
    mass: safeField(f, 6),
  };
}

// ENCODERn;GET: $ENCODER1;0f;1;2;0
// Counter value is the LAST field
export interface EncoderData {
  counter: string;
}

export function parseEncoder(raw: string): EncoderData {
  const f = fields(raw);
  return { counter: f.length > 0 ? f[f.length - 1] : '' };
}

// TAGS: $TAGS;MEMORY;LIMIT;ADDED
export interface TagsData {
  memory: string;
  limit: string;
  added: string;
}

export function parseTags(raw: string): TagsData {
  const f = fields(raw);
  return {
    memory: safeField(f, 0),
    limit: safeField(f, 1),
    added: safeField(f, 2),
  };
}

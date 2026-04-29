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

  if (val === 0) return ru ? 'Инициализация' : 'Initializing';

  // Trust the high-level connection bits first: real firmware may report a
  // fully-online modem with bit3 (connected) set but bit0/bit1 (hw/on) clear
  // — checking the lower-level prerequisites first wrongly reports "No HW".
  if (val & 0x08) {
    const parts: string[] = [];
    parts.push(ru ? 'Подключён' : 'Connected');
    if (val & 0x10) parts.push(ru ? 'роуминг' : 'roaming');
    if (val & 0x40) parts.push(ru ? 'глушение' : 'jamming');
    return parts.join(', ');
  }
  if (val & 0x04) return ru ? 'Подключение' : 'Connecting';

  if (!(val & 0x01)) return ru ? 'Нет модуля' : 'No HW';
  if (!(val & 0x80)) return ru ? 'Нет SIM'    : 'No SIM';
  if (!(val & 0x02)) return ru ? 'Выключен'   : 'Off';
  return ru ? 'Нет сигнала' : 'No Signal';
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

// REP: $REP;GT-9;0000;130426;181153;5539.9646;N;03734.4980;E;+192;1;0;9;NA;NA;NA;NA;11863;4590;+30;-128;0,0;8f;23;03;+0;00000807EBC6
//
// Fields counted from START (fixed positions):
//   [2]=DATE(DDMMYY), [3]=TIME(HHMMSS)
//   [4]=LAT(DDMM.MMMM), [5]=N/S, [6]=LON(DDDMM.MMMM), [7]=E/W
//   [8]=ALT, [9]=?, [10]=?, [11]=SATELLITES
//
// Fields counted from END:
//   len-1  = TAG_ID, len-2 = WiFi RSSI, len-3 = WiFi Status,
//   len-4  = GSM RSSI, len-5 = GSM Status, len-8 = Int. Temperature,
//   len-10 = Ext. Battery

/**
 * Convert NMEA coordinate `DDMM.MMMM` (or `DDDMM.MMMM`) + hemisphere to
 * signed decimal degrees string. `degDigits` = 2 for latitude, 3 for longitude.
 */
function nmeaToDecimal(raw: string, hemi: string, degDigits: 2 | 3): string {
  if (!raw || raw === 'NA') return '';
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return '';
  const deg = Math.floor(n / 100);
  const min = n - deg * 100;
  let dec = deg + min / 60;
  if (hemi === 'S' || hemi === 'W') dec = -dec;
  // Rough sanity check for latitude vs longitude range
  const maxAbs = degDigits === 2 ? 90 : 180;
  if (Math.abs(dec) > maxAbs) return '';
  return dec.toFixed(6);
}

export interface RepData {
  extBattery: string;
  latitude: string;       // decimal degrees, signed (e.g. "55.666077")
  longitude: string;      // decimal degrees, signed
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

  const latitude = nmeaToDecimal(safeField(f, 4), safeField(f, 5), 2);
  const longitude = nmeaToDecimal(safeField(f, 6), safeField(f, 7), 3);

  // Satellites at fixed position [11]; fall back to '' if NA/missing.
  const satRaw = safeField(f, 11);
  const satN = parseInt(satRaw, 10);
  const satellites = Number.isFinite(satN) && satN >= 0 && satN <= 50 ? String(satN) : '';

  return {
    extBattery: safeField(f, len - 10),
    latitude,
    longitude,
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

// APN: $APN;APN_NAME;APN_LOGIN;APN_PASS
export interface ApnData {
  name: string;
  login: string;
  password: string;
}

export function parseApn(raw: string): ApnData {
  const f = fields(raw);
  return {
    name: safeField(f, 0),
    login: safeField(f, 1),
    password: safeField(f, 2),
  };
}

// SERVER1;GET / SERVER2;GET:
// $SERVER1;SERVER_PROP;PROTO_PROP;IP;PORT;LOGIN;PASS;T1;T2;T3;T4;IP_PROTO;UNK1;UNK2
export interface ServerData {
  serverProp: string;
  protoProp: string;
  ip: string;
  port: string;
  login: string;
  pass: string;
  timeout1: string;
  timeout2: string;
  timeout3: string;
  timeout4: string;
  ipProto: string;
  channel: string;
  protocol: string;
}

export function parseServer(raw: string): ServerData {
  const f = fields(raw);
  const serverProp = safeField(f, 0, '0F');
  const protoProp = safeField(f, 1, '01');

  return {
    serverProp,
    protoProp,
    ip: safeField(f, 2),
    port: safeField(f, 3),
    login: safeField(f, 4),
    pass: safeField(f, 5),
    timeout1: safeField(f, 6, '10'),
    timeout2: safeField(f, 7, '0'),
    timeout3: safeField(f, 8, '120'),
    timeout4: safeField(f, 9, '30'),
    ipProto: safeField(f, 10, '1'),
    channel: safeField(f, 11, '0'),
    protocol: safeField(f, 12, '1'),
  };
}

// WIFINET: $WIFINET;COUNT
export function parseWifiCount(raw: string): number {
  const f = fields(raw);
  const n = parseInt(safeField(f, 0, '0'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// WIFINETn;GET: $WIFINETn;CHANNEL;SSID;AUTH;ENCRYPT;KEY;IP_MODE;IP;MASK;GATEWAY;DNS1;DNS2
export interface WifiNetworkData {
  channel: string;
  ssid: string;
  auth: string;
  encrypt: string;
  key: string;
  ipMode: string;
  ip: string;
  mask: string;
  gateway: string;
  dns1: string;
  dns2: string;
}

export function parseWifiNetwork(raw: string): WifiNetworkData {
  const f = fields(raw);
  return {
    channel: safeField(f, 0, '0'),
    ssid: safeField(f, 1),
    auth: safeField(f, 2, '1'),
    encrypt: safeField(f, 3, '0'),
    key: safeField(f, 4),
    ipMode: safeField(f, 5, '1'),
    ip: safeField(f, 6),
    mask: safeField(f, 7),
    gateway: safeField(f, 8),
    dns1: safeField(f, 9),
    dns2: safeField(f, 10),
  };
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

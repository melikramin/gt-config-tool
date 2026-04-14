/**
 * Command builders for GT-series device communication.
 * Format: $PASSWORD;COMMAND[;PARAMS]\r\n
 */

export function buildCmd(password: string, command: string, params: string[] = []): string {
  const parts = ['$' + password, command, ...params];
  return parts.join(';');
}

/** One-shot commands sent once on connect (disable stale logs, DEV, VER). */
export function buildInitCommands(password: string): string[] {
  return [
    buildCmd(password, 'LOG', ['RESET']),
    buildCmd(password, 'DEV'),
    buildCmd(password, 'VER'),
  ];
}

/** Read device date/time: `$PASS;DATE` → `$DATE;DDMMYY;HHMMSS;...`. */
export function buildDateReadCmd(password: string): string {
  return buildCmd(password, 'DATE');
}

/** Write device date/time (UTC): `$PASS;DATE;DDMMYY;HHMMSS`. */
export function buildDateWriteCmd(password: string, ddmmyy: string, hhmmss: string): string {
  return buildCmd(password, 'DATE', [ddmmyy, hhmmss]);
}

/**
 * Parse a raw `$DATE;DDMMYY;HHMMSS;...` response into a UTC epoch (ms).
 * Returns null if the response is malformed.
 */
export function parseDateResponseToUtcMs(raw: string): number | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'DATE' || parts.length < 3) return null;
  const d = parts[1] ?? '';
  const h = parts[2] ?? '';
  if (!/^\d{6}$/.test(d) || !/^\d{6}$/.test(h)) return null;
  const day  = parseInt(d.slice(0, 2), 10);
  const mon  = parseInt(d.slice(2, 4), 10);
  const year = 2000 + parseInt(d.slice(4, 6), 10);
  const hh = parseInt(h.slice(0, 2), 10);
  const mm = parseInt(h.slice(2, 4), 10);
  const ss = parseInt(h.slice(4, 6), 10);
  return Date.UTC(year, mon - 1, day, hh, mm, ss);
}

/** Format a JS Date as DDMMYY / HHMMSS in UTC. */
export function formatUtcDateParts(d: Date): { ddmmyy: string; hhmmss: string } {
  const p2 = (n: number) => n.toString().padStart(2, '0');
  const ddmmyy = `${p2(d.getUTCDate())}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCFullYear() % 100)}`;
  const hhmmss = `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`;
  return { ddmmyy, hhmmss };
}

/** Device time drift threshold (ms) above which we resync DATE on connect. */
export const DATE_SYNC_THRESHOLD_MS = 60_000;

/** GSM command — polled cyclically until IMEI is loaded. */
export function buildGsmCommand(password: string): string {
  return buildCmd(password, 'GSM');
}

/** Cyclic polling commands for the Status tab (everything except DEV, VER, GSM). */
export function buildPollingCommands(password: string): string[] {
  return [
    buildCmd(password, 'DATE'),
    buildCmd(password, 'REP'),
    buildCmd(password, 'FUEL'),
    buildCmd(password, 'IN'),
    buildCmd(password, 'OUT'),
    buildCmd(password, 'LLS1'),
    buildCmd(password, 'LLS2'),
    buildCmd(password, 'LLS3'),
    buildCmd(password, 'LLS4'),
    buildCmd(password, 'LLS5'),
    buildCmd(password, 'LLS6'),
    buildCmd(password, 'ENCODER1', ['GET']),
    buildCmd(password, 'ENCODER2', ['GET']),
    buildCmd(password, 'TAGS'),
  ];
}

/** Build command to toggle output ON/OFF: $PASS;OUTn;;value */
export function buildOutputCmd(password: string, index: number, on: boolean): string {
  return `$${password};OUT${index};;${on ? '1' : '0'}`;
}

/** Build command to add a tag: $PASS;TAGS;ADD;TAG_ID */
export function buildAddTagCmd(password: string, tagId: string): string {
  return buildCmd(password, 'TAGS', ['ADD', tagId]);
}

// ---- Server tab commands ----

/** Read APN settings */
export function buildApnReadCmd(password: string): string {
  return buildCmd(password, 'APN');
}

/** Write APN settings */
export function buildApnWriteCmd(password: string, name: string, login: string, pass: string): string {
  return buildCmd(password, 'APN', [name, login, pass]);
}

/** Read server settings: $PASS;SERVERn;GET */
export function buildServerReadCmd(password: string, index: number): string {
  return buildCmd(password, `SERVER${index}`, ['GET']);
}

/**
 * Write server settings:
 * $PASS;SERVERn;SET;0F;01;IP;PORT;IMEI;IMEI;10;0;120;30;1;CHANNEL;PROTOCOL
 * Hidden fields: SERVER_PROP=0F, PROTO_PROP=01, LOGIN/PASS=IMEI, timeouts, IP_PROTO=1.
 * CHANNEL: 0=GSM, 1=WiFi, 2=GSM+WiFi, 3=WiFi+GSM
 * PROTOCOL: 0=IPS, 1=GT9
 */
export function buildServerWriteCmd(
  password: string,
  index: number,
  ip: string,
  port: string,
  imei: string,
  channel: string,
  protocol: string,
): string {
  return buildCmd(password, `SERVER${index}`, [
    'SET', '0F', '01', ip, port,
    imei, imei, '10', '0', '120', '30', '1', channel, protocol,
  ]);
}

/** LOG;RESET — sent after saving server settings */
export function buildLogResetCmd(password: string): string {
  return buildCmd(password, 'LOG', ['RESET']);
}

// ---- Protocol tab commands (PRSET20/21 bitmask, CTR) ----

/** Read CTR protocol mask, rows 0-7 (tags 0x00-0x7F). Response: $PRSET20;<32 hex> */
export function buildPrset20GetCmd(password: string): string {
  return buildCmd(password, 'PRSET20', ['GET']);
}

/** Read CTR protocol mask, rows 8-15 (tags 0x80-0xFF). */
export function buildPrset21GetCmd(password: string): string {
  return buildCmd(password, 'PRSET21', ['GET']);
}

/** Write CTR protocol mask for rows 0-7. `hex` must be exactly 32 hex chars (16 bytes). */
export function buildPrset20SetCmd(password: string, hex: string): string {
  return buildCmd(password, 'PRSET20', ['SET', hex]);
}

/** Write CTR protocol mask for rows 8-15. */
export function buildPrset21SetCmd(password: string, hex: string): string {
  return buildCmd(password, 'PRSET21', ['SET', hex]);
}

/**
 * Parse a PRSET2x response into a 16-byte buffer.
 * Accepts the full line like `$PRSET20;C000100003130001000C000300000000\r\n`.
 * Returns null if the payload is not 32 hex chars.
 */
export function parsePrsetResponse(raw: string): Uint8Array | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  const payload = parts[parts.length - 1]?.trim() ?? '';
  if (!/^[0-9a-fA-F]{32}$/.test(payload)) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(payload.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Format a 16-byte buffer as uppercase hex (32 chars). */
export function bytesToHex(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i++) {
    s += buf[i].toString(16).toUpperCase().padStart(2, '0');
  }
  return s;
}

/**
 * Decode a PRSET buffer into the set of enabled tag IDs.
 * @param buf 16-byte buffer from PRSET20 or PRSET21
 * @param rowOffset 0 for PRSET20, 8 for PRSET21
 *
 * Layout: each row = 2 bytes big-endian (16 bits). Bit N of row R is tag R*16+N.
 */
export function decodePrsetTags(buf: Uint8Array, rowOffset: number): Set<number> {
  const set = new Set<number>();
  for (let r = 0; r < 8; r++) {
    const word = (buf[r * 2] << 8) | buf[r * 2 + 1];
    for (let bit = 0; bit < 16; bit++) {
      if (word & (1 << bit)) set.add((rowOffset + r) * 16 + bit);
    }
  }
  return set;
}

/**
 * Update a PRSET buffer in place: set/clear bits for the given tag IDs.
 * Tags outside this buffer's row range are silently ignored.
 */
export function updatePrsetBuffer(
  buf: Uint8Array,
  rowOffset: number,
  tagId: number,
  enabled: boolean,
): void {
  const row = tagId >> 4;
  const localRow = row - rowOffset;
  if (localRow < 0 || localRow > 7) return;
  const bit = tagId & 0x0F;
  const hi = localRow * 2;
  const lo = localRow * 2 + 1;
  let word = (buf[hi] << 8) | buf[lo];
  if (enabled) word |= 1 << bit;
  else word &= ~(1 << bit);
  buf[hi] = (word >> 8) & 0xFF;
  buf[lo] = word & 0xFF;
}

// ---- WiFi tab commands ----

/** Maximum WiFi networks supported in the UI (device allows up to 10). */
export const WIFI_MAX_NETWORKS = 5;

/** WiFi authentication mode sent with every write (hidden from UI). 2=Shared — matches old configurator. */
export const WIFI_AUTH_DEFAULT = '2';

/** WiFi channel sent with every write (0 = automatic). */
export const WIFI_CHANNEL_DEFAULT = '0';

export interface WifiNetworkParams {
  ssid: string;
  encrypt: string;  // 0..4
  key: string;
  ipMode: string;   // '0' manual, '1' auto
  ip: string;
  mask: string;
  gateway: string;
  dns1: string;
  dns2: string;
}

/** Read network count: $PASS;WIFINET */
export function buildWifiCountCmd(password: string): string {
  return buildCmd(password, 'WIFINET');
}

/** Read one network: $PASS;WIFINETn;GET */
export function buildWifiNetReadCmd(password: string, index: number): string {
  return buildCmd(password, `WIFINET${index}`, ['GET']);
}

function wifiParamFields(n: WifiNetworkParams): string[] {
  const head = [
    WIFI_CHANNEL_DEFAULT,
    n.ssid,
    WIFI_AUTH_DEFAULT,
    n.encrypt,
    n.key,
    n.ipMode,
  ];
  // When DHCP=1 (automatic), omit the IP block entirely.
  if (n.ipMode === '1') return head;
  return [...head, n.ip, n.mask, n.gateway, n.dns1, n.dns2];
}

/**
 * Write a network (add or edit) at index n:
 * $PASS;WIFINETn;SET;CHANNEL;SSID;AUTH;ENCRYPT;KEY;IP_MODE[;IP;MASK;GW;DNS1;DNS2]
 * When IP_MODE=1, IP block is omitted entirely (no trailing empty fields).
 */
export function buildWifiNetWriteCmd(password: string, index: number, n: WifiNetworkParams): string {
  return buildCmd(password, `WIFINET${index}`, ['SET', ...wifiParamFields(n)]);
}

/** Delete network by index: $PASS;WIFINET;DEL;IDX */
export function buildWifiDeleteCmd(password: string, index: number): string {
  return buildCmd(password, 'WIFINET', ['DEL', String(index)]);
}

/** Delete all networks: $PASS;WIFINET;DEL;ALL */
export function buildWifiDeleteAllCmd(password: string): string {
  return buildCmd(password, 'WIFINET', ['DEL', 'ALL']);
}

// ---- GPS/GLONASS tab commands (FILTER + MSENS + TILT) ----

export interface FilterParams {
  dstEn: boolean;  distance: string;   // 5-10000
  hdgEn: boolean;  heading: string;    // 1-360
  spdEn: boolean;  minSpeed: string;   // 1-10
  hspdEn: boolean; maxSpeed: string;   // 1-200
  minTimeout: string;                  // 0-10000
  drivingInterval: string;             // 3-10000
  parkingInterval: string;             // 3-10000
}

/** Read FILTER: $PASS;FILTER → $FILTER;DST_EN,DIST;HDG_EN,HDG;SPD_EN,SPD;HSPD_EN,HSPD;MIN_TOUT;DRIVE_INT;PARK_INT */
export function buildFilterReadCmd(password: string): string {
  return buildCmd(password, 'FILTER');
}

/** Write FILTER (same format as read response). */
export function buildFilterWriteCmd(password: string, p: FilterParams): string {
  const b = (v: boolean) => (v ? '1' : '0');
  return buildCmd(password, 'FILTER', [
    `${b(p.dstEn)},${p.distance}`,
    `${b(p.hdgEn)},${p.heading}`,
    `${b(p.spdEn)},${p.minSpeed}`,
    `${b(p.hspdEn)},${p.maxSpeed}`,
    p.minTimeout,
    p.drivingInterval,
    p.parkingInterval,
  ]);
}

/** Parse FILTER response. Returns null on malformed input. */
export function parseFilterResponse(raw: string): FilterParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'FILTER' || parts.length < 8) return null;
  const pair = (s: string): [boolean, string] => {
    const [en, val] = s.split(',');
    return [en === '1', val ?? ''];
  };
  const [dstEn, distance] = pair(parts[1]);
  const [hdgEn, heading] = pair(parts[2]);
  const [spdEn, minSpeed] = pair(parts[3]);
  const [hspdEn, maxSpeed] = pair(parts[4]);
  return {
    dstEn, distance,
    hdgEn, heading,
    spdEn, minSpeed,
    hspdEn, maxSpeed,
    minTimeout: parts[5] ?? '',
    drivingInterval: parts[6] ?? '',
    parkingInterval: parts[7] ?? '',
  };
}

/**
 * MSENS data. The device response contains 7 fields — the TZ documents only the
 * first 4; the remaining 3 are preserved as-is to avoid clobbering unknown state.
 */
export interface MsensParams {
  motionEn: boolean;   // field 0
  motionThresh: string; // field 1 (1-127)
  shockEn: boolean;    // field 2
  shockThresh: string; // field 3 (1-127)
  extra: string[];     // fields 4..6 (undocumented, passed through)
}

/** Read MSENS: $PASS;MSENS;GET → $MSENS;f0;f1;f2;f3;f4;f5;f6 */
export function buildMsensReadCmd(password: string): string {
  return buildCmd(password, 'MSENS', ['GET']);
}

/** Write MSENS (all 7 fields; undocumented tail passed through from last read). */
export function buildMsensWriteCmd(password: string, p: MsensParams): string {
  const b = (v: boolean) => (v ? '1' : '0');
  return buildCmd(password, 'MSENS', [
    'SET',
    b(p.motionEn),
    p.motionThresh,
    b(p.shockEn),
    p.shockThresh,
    ...p.extra,
  ]);
}

/** Parse MSENS response. */
export function parseMsensResponse(raw: string): MsensParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'MSENS' || parts.length < 5) return null;
  return {
    motionEn: parts[1] === '1',
    motionThresh: parts[2] ?? '',
    shockEn: parts[3] === '1',
    shockThresh: parts[4] ?? '',
    extra: parts.slice(5),
  };
}

export interface TiltParams {
  enable: boolean;     // field 0
  threshold: string;   // field 1 (1-180)
}

/** Read TILT: $PASS;TILT;GET → $TILT;ENABLE;THRESHOLD;CUR_ANGLE (read-only) */
export function buildTiltReadCmd(password: string): string {
  return buildCmd(password, 'TILT', ['GET']);
}

/** Write TILT (only 2 fields; current angle is read-only). */
export function buildTiltWriteCmd(password: string, p: TiltParams): string {
  return buildCmd(password, 'TILT', ['SET', p.enable ? '1' : '0', p.threshold]);
}

// ---- Inputs/Outputs tab commands (INn + ENCODERn) ----

/**
 * Input config. Read response has 12 fields; write sends 10.
 * Documented fields: MODE, HT, HD, LT, LD, PULSE_RESET, FILTER_PULSE, REPORT_STATUS.
 * `extra1` (field[1]) and `extra7` (field[7]) are undocumented — preserved from read.
 */
export interface InputParams {
  mode: string;           // 0=Digital, 1=Analog, 2=Frequency, 3=Pulse
  extra1: string;         // undocumented field at position [1]
  highTop: string;        // 0-33000
  highDown: string;       // 0-33000
  lowTop: string;         // 0-33000
  lowDown: string;        // 0-33000
  pulseReset: string;     // 0=NO, 1=YES
  extra7: string;         // undocumented field at position [7]
  filterPulse: string;    // 1-250
  reportStatus: string;   // 0=NO, 1=YES
}

export const EMPTY_INPUT: InputParams = {
  mode: '0', extra1: '1',
  highTop: '33000', highDown: '3000',
  lowTop: '2000', lowDown: '0',
  pulseReset: '0', extra7: '0',
  filterPulse: '5', reportStatus: '0',
};

/** Read IN count + current values: $PASS;IN */
export function buildInCountCmd(password: string): string {
  return buildCmd(password, 'IN');
}

/** Read one input config: $PASS;INn */
export function buildInputReadCmd(password: string, index: number): string {
  return buildCmd(password, `IN${index}`);
}

/** Write one input: $PASS;INn;MODE;X;HT;HD;LT;LD;PRST;X;FPULSE;REPORT (10 fields). */
export function buildInputWriteCmd(password: string, index: number, p: InputParams): string {
  return buildCmd(password, `IN${index}`, [
    p.mode, p.extra1,
    p.highTop, p.highDown, p.lowTop, p.lowDown,
    p.pulseReset, p.extra7,
    p.filterPulse, p.reportStatus,
  ]);
}

/** Parse INn response: `$INn;MODE;X;HT;HD;LT;LD;PRST;X;FPULSE;REPORT;RO;RO`. */
export function parseInputResponse(raw: string): InputParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (!/^IN\d+$/.test(parts[0] ?? '') || parts.length < 11) return null;
  return {
    mode:         parts[1] ?? '0',
    extra1:       parts[2] ?? '1',
    highTop:      parts[3] ?? '0',
    highDown:     parts[4] ?? '0',
    lowTop:       parts[5] ?? '0',
    lowDown:      parts[6] ?? '0',
    pulseReset:   parts[7] ?? '0',
    extra7:       parts[8] ?? '0',
    filterPulse:  parts[9] ?? '0',
    reportStatus: parts[10] ?? '0',
  };
}

/**
 * Encoder config. Read: `$ENCODERn;FLAGS;PIN_A;PIN_B;COUNTER`.
 * Write: `ENCODERn;SET;FLAGS;PIN_A;PIN_B;COUNTER`. FLAGS is undocumented,
 * preserved as-is from last read.
 */
export interface EncoderParams {
  flags: string;    // hex string, undocumented — preserved
  pinA: string;     // 1-8
  pinB: string;     // 1-8
  counter: string;  // read-only value, write echoes it back
}

export const EMPTY_ENCODER: EncoderParams = { flags: '0F', pinA: '1', pinB: '2', counter: '0' };

export function buildEncoderReadCmd(password: string, index: number): string {
  return buildCmd(password, `ENCODER${index}`, ['GET']);
}

export function buildEncoderWriteCmd(password: string, index: number, p: EncoderParams): string {
  return buildCmd(password, `ENCODER${index}`, ['SET', p.flags, p.pinA, p.pinB, p.counter]);
}

export function parseEncoderResponse(raw: string): EncoderParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (!/^ENCODER\d+$/.test(parts[0] ?? '') || parts.length < 5) return null;
  return {
    flags:   parts[1] ?? '0F',
    pinA:    parts[2] ?? '1',
    pinB:    parts[3] ?? '2',
    counter: parts[4] ?? '0',
  };
}

/** Parse IN response count (first field of `$IN;COUNT;...`). */
export function parseInCount(raw: string): number {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'IN') return 0;
  const n = parseInt(parts[1] ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---- RS interfaces tab commands (RS232 / RS232A / RS232B / RS485 / RS485A / RS485B) ----

/** The 6 RS ports in the exact order used for reads/writes. */
export const RS_PORTS = ['RS232', 'RS232A', 'RS232B', 'RS485', 'RS485A', 'RS485B'] as const;
export type RsPortName = (typeof RS_PORTS)[number];

/** Timeout for RS port writes — device can take several seconds to respond. */
export const RS_WRITE_TIMEOUT_MS = 10_000;

/** BAUD_RATE dropdown values (raw values sent to device). */
export const RS_BAUD_RATES = ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'] as const;

/** DATA_BITS dropdown: code → label. */
export const RS_DATA_BITS: Array<{ value: string; label: string }> = [
  { value: '0', label: '5 bit' },
  { value: '1', label: '6 bit' },
  { value: '2', label: '7 bit' },
  { value: '3', label: '8 bit' },
  { value: '4', label: '9 bit' },
];

/** STOP_BITS dropdown. */
export const RS_STOP_BITS: Array<{ value: string; label: string }> = [
  { value: '0', label: '1 bit' },
  { value: '1', label: '0.5 bit' },
  { value: '2', label: '2 bit' },
  { value: '3', label: '1.5 bit' },
];

/** PARITY dropdown. */
export const RS_PARITY: Array<{ value: string; label: string }> = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Even' },
  { value: '2', label: 'Odd' },
];

/** DEVICE_TYPE list (per TZ §4.8). Value 0 = NO (free slot, selectable on every port). */
export const RS_DEVICE_TYPES: Array<{ value: string; label: string }> = [
  { value: '0',   label: '—' },
  { value: '1',   label: 'LLS Omnicom' },
  { value: '2',   label: 'LLS Sensor' },
  { value: '4',   label: 'RFID' },
  { value: '5',   label: 'Keypad' },
  { value: '6',   label: 'CANLOG' },
  { value: '8',   label: 'CAMERA' },
  { value: '9',   label: 'ISKRA' },
  { value: '10',  label: 'THP' },
  { value: '11',  label: 'LCR' },
  { value: '12',  label: 'PLOT3' },
  { value: '13',  label: 'TC002' },
  { value: '14',  label: 'STRUNA' },
  { value: '15',  label: 'AVKO' },
  { value: '16',  label: 'xRF' },
  { value: '19',  label: 'ASN' },
  { value: '20',  label: 'DUO11' },
  { value: '21',  label: 'TOPAZ' },
  { value: '22',  label: 'DART' },
  { value: '23',  label: 'PRINTER' },
  { value: '24',  label: 'SANKI' },
  { value: '25',  label: 'DISPLAY' },
  { value: '26',  label: 'HID' },
  { value: '27',  label: 'LLS Modbus' },
  { value: '28',  label: 'KUP' },
  { value: '29',  label: 'LLS XMT' },
  { value: '30',  label: 'ML' },
  { value: '31',  label: 'BUI' },
  { value: '32',  label: 'EMIS' },
  { value: '33',  label: 'UHF Reader' },
  { value: '34',  label: 'GT2 BLE' },
  { value: '36',  label: 'FLS Display' },
  { value: '37',  label: 'TEX' },
  { value: '38',  label: 'VDM Display' },
  { value: '39',  label: 'MCR' },
  { value: '40',  label: 'EAGLE' },
  { value: '41',  label: 'UNIPUMP' },
];

/**
 * Preset serial parameters recommended for specific device types.
 * When the user picks one of these in the UI, baud/data/stop/parity are overwritten
 * to these values. Extend this map as more device types get confirmed defaults.
 */
export const RS_DEVICE_DEFAULTS: Record<string, { baudRate: string; dataBits: string; stopBits: string; parity: string }> = {
  // 21 — TOPAZ: 4800 / 7 bit / 2 stop / Even
  '21': { baudRate: '4800', dataBits: '2', stopBits: '2', parity: '1' },
};

export interface RsPortParams {
  deviceType: string;
  baudRate: string;
  dataBits: string;
  stopBits: string;
  parity: string;
  /** Undocumented trailing fields returned by the device — preserved on write. */
  extra: string[];
}

export const EMPTY_RS_PORT: RsPortParams = {
  deviceType: '0',
  baudRate: '9600',
  dataBits: '3',
  stopBits: '0',
  parity: '0',
  extra: [],
};

/** Read one RS port: `$PASS;RS232` (etc). */
export function buildRsReadCmd(password: string, port: RsPortName): string {
  return buildCmd(password, port);
}

/**
 * Write one RS port.
 * - When the port is freed (deviceType=0) we send only `$PASS;RS232;0` — sending
 *   trailing baud/data/stop/parity (and especially stale `extra` fields inherited
 *   from the previous device type) makes the firmware answer `DE` (Data Error).
 * - Otherwise: `$PASS;RS232;DEVICE_TYPE;BAUD_RATE;DATA_BITS;STOP_BITS;PARITY[;extra...]`.
 */
export function buildRsWriteCmd(password: string, port: RsPortName, p: RsPortParams): string {
  if (p.deviceType === '0') {
    return buildCmd(password, port, ['0']);
  }
  return buildCmd(password, port, [
    p.deviceType, p.baudRate, p.dataBits, p.stopBits, p.parity, ...p.extra,
  ]);
}

/**
 * Parse `$RS232;DEVICE_TYPE;BAUD_RATE;DATA_BITS;STOP_BITS;PARITY[;extra...]`.
 * Defensive: returns an empty config if the response is malformed.
 */
export function parseRsResponse(raw: string, port: RsPortName): RsPortParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== port || parts.length < 6) return null;
  return {
    deviceType: parts[1] ?? '0',
    baudRate:   parts[2] ?? '9600',
    dataBits:   parts[3] ?? '3',
    stopBits:   parts[4] ?? '0',
    parity:     parts[5] ?? '0',
    extra:      parts.slice(6),
  };
}

/** Parse TILT response. */
export function parseTiltResponse(raw: string): TiltParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'TILT' || parts.length < 3) return null;
  return {
    enable: parts[1] === '1',
    threshold: parts[2] ?? '',
  };
}

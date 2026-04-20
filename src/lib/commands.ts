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

// ---- FLS (LLS) tab commands ----

/** Number of level sensors supported by the device. */
export const FLS_MAX_SENSORS = 6;

/** Calibration points per sensor (indices 0..39). */
export const FLS_CALIB_POINTS = 40;

/** Calibration batch size (4 batches of 10 points each). */
export const FLS_CALIB_BATCH = 10;

/**
 * LLS sensor settings. The device returns 8 fields (7 writable + 1 read-only tail).
 * Only the first 6 are documented; the rest are preserved via `extra` and written
 * back unchanged so we don't clobber unknown state.
 *
 * Documented fields: ENABLE, ADDRESS, CAPACITY, LOW, HIGH, SNIFF.
 */
export interface LlsSettings {
  enable: boolean;
  address: string;    // 1-6
  type: string;       // undocumented — preserved from read (between ADDRESS and CAPACITY)
  capacity: string;
  lowAlarm: string;
  highAlarm: string;
  sniff: string;      // 0/1 — hidden UI for now, repurposed as "Product" placeholder
}

export const EMPTY_LLS: LlsSettings = {
  enable: false,
  address: '1',
  type: '0',
  capacity: '0',
  lowAlarm: '0',
  highAlarm: '0',
  sniff: '0',
};

/** Read one sensor: `$PASS;LLSn;GET`. */
export function buildLlsReadCmd(password: string, index: number): string {
  return buildCmd(password, `LLS${index}`, ['GET']);
}

/**
 * Write one sensor: `$PASS;LLSn;SET;ENABLE;ADDRESS;TYPE;CAPACITY;LOW;HIGH;SNIFF`.
 * 7 writable fields; last read field (FILTER_MODE, read-only) is dropped.
 */
export function buildLlsWriteCmd(password: string, index: number, p: LlsSettings): string {
  return buildCmd(password, `LLS${index}`, [
    'SET',
    p.enable ? '1' : '0',
    p.address,
    p.type,
    p.capacity,
    p.lowAlarm,
    p.highAlarm,
    p.sniff,
  ]);
}

/**
 * Parse `$LLSn;ENABLE;ADDRESS;TYPE;CAPACITY;LOW;HIGH;SNIFF;FILTER_MODE`.
 * 8 fields total, last is read-only.
 */
export function parseLlsSettings(raw: string): LlsSettings | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (!/^LLS\d+$/.test(parts[0] ?? '') || parts.length < 8) return null;
  return {
    enable:    parts[1] === '1',
    address:   parts[2] ?? '1',
    type:      parts[3] ?? '0',
    capacity:  parts[4] ?? '0',
    lowAlarm:  parts[5] ?? '0',
    highAlarm: parts[6] ?? '0',
    sniff:     parts[7] ?? '0',
  };
}

/** A single calibration point. */
export interface CalibPoint {
  raw: string;     // 0-4095
  volume: string;  // 0-99999
}

export const EMPTY_CALIB_POINT: CalibPoint = { raw: '0', volume: '0' };

/** Read one calibration point: `$PASS;LLSCALn;GET;idx` → `$LLSCALn;idx;raw;volume`. */
export function buildLlsCalReadCmd(password: string, sensorIdx: number, pointIdx: number): string {
  return buildCmd(password, `LLSCAL${sensorIdx}`, ['GET', String(pointIdx)]);
}

/**
 * Write a batch of calibration points:
 * `$PASS;LLSCALn;SET;idx,raw,vol;idx,raw,vol;...` (up to 10 points per command).
 */
export function buildLlsCalWriteCmd(
  password: string,
  sensorIdx: number,
  startIdx: number,
  points: CalibPoint[],
): string {
  const triples = points.map((pt, i) => `${startIdx + i},${pt.raw},${pt.volume}`);
  return buildCmd(password, `LLSCAL${sensorIdx}`, ['SET', ...triples]);
}

/**
 * Parse `$LLSCALn;idx,raw,volume` → CalibPoint. The payload after the command
 * prefix is a single comma-separated triple (not semicolon-separated).
 * Returns null on malformed input.
 */
export function parseLlsCalResponse(raw: string): CalibPoint | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (!/^LLSCAL\d+$/.test(parts[0] ?? '') || parts.length < 2) return null;
  const triple = (parts[1] ?? '').split(',');
  if (triple.length < 3) return null;
  return {
    raw:    triple[1] ?? '0',
    volume: triple[2] ?? '0',
  };
}

// ---- Pumps (TRK) tab commands ----

/** Number of pumps shown in the UI (device supports 8, UI shows 4). */
export const PUMP_COUNT = 4;

/**
 * Pump type dropdown values (0-15).
 */
export const PUMP_TYPES: Array<{ value: string; label: string }> = [
  { value: '0',  label: '0 — Disabled' },
  { value: '1',  label: '1 — PULSER' },
  { value: '2',  label: '2 — ISKRA' },
  { value: '3',  label: '3 — LCR' },
  { value: '4',  label: '4 — AVKO' },
  { value: '5',  label: '5 — ASN' },
  { value: '6',  label: '6 — TOPAZ' },
  { value: '7',  label: '7 — DART' },
  { value: '8',  label: '8 — SANKI' },
  { value: '9',  label: '9 — KUP' },
  { value: '10', label: '10 — ML' },
  { value: '11', label: '11 — BUI' },
  { value: '12', label: '12 — EMIS' },
  { value: '13', label: '13 — TEX' },
  { value: '14', label: '14 — EAGLE' },
  { value: '15', label: '15 — UNIPUMP' },
];

/** Russian labels for pump types (used when locale=ru). */
export const PUMP_TYPES_RU: Array<{ value: string; label: string }> = [
  { value: '0',  label: '0 — Выключен' },
  { value: '1',  label: '1 — PULSER' },
  { value: '2',  label: '2 — ISKRA' },
  { value: '3',  label: '3 — LCR' },
  { value: '4',  label: '4 — AVKO' },
  { value: '5',  label: '5 — ASN' },
  { value: '6',  label: '6 — TOPAZ' },
  { value: '7',  label: '7 — DART' },
  { value: '8',  label: '8 — SANKI' },
  { value: '9',  label: '9 — KUP' },
  { value: '10', label: '10 — ML' },
  { value: '11', label: '11 — BUI' },
  { value: '12', label: '12 — EMIS' },
  { value: '13', label: '13 — TEX' },
  { value: '14', label: '14 — EAGLE' },
  { value: '15', label: '15 — UNIPUMP' },
];

/**
 * Pump INPUT dropdown values: 1-6 (digital inputs) + E1, E2 (encoders).
 */
export const PUMP_INPUT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: 'E1', label: 'E1' },
  { value: 'E2', label: 'E2' },
];

/** Product dropdown values (1-4). */
export const PUMP_PRODUCT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

/** Relay 1 dropdown values (1-4). */
export const PUMP_RELAY1_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

/** Relay 2 dropdown values (0=off, 1-4). */
export const PUMP_RELAY2_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '0 — Disabled' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

/** Relay 2 dropdown — Russian labels. */
export const PUMP_RELAY2_OPTIONS_RU: Array<{ value: string; label: string }> = [
  { value: '0', label: '0 — Выключен' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

/**
 * Pump settings. Device response has up to 17 fields after command prefix.
 * Field [10] (total) is read-only; the rest are writable.
 *
 * Fields: TYPE, INPUT, PRODUCT, OUTPUT, RFID_ID, PULSE, START_TOUT, STOP_TOUT,
 *         RFID_TOUT, TOTAL(ro), 2ND_OUT, 2ND_START, 2ND_STOP, RFID_MODE, ROUND, PRICE
 */
export interface PumpParams {
  type: string;        // [1] 0=NO, 1=PULSER, etc.
  input: string;       // [2] 1-8 or E1-E4
  product: string;     // [3] 1-4
  output: string;      // [4] relay 1 (1-4)
  rfidId: string;      // [5] 12 hex chars
  pulse: string;       // [6] imp/L float, 0-2000
  startTout: string;   // [7] 0-120 sec
  stopTout: string;    // [8] 0-120 sec
  rfidTout: string;    // [9] 0-120 sec
  total: string;       // [10] read-only totalizer
  secondOut: string;   // [11] relay 2 (0-4)
  secondStart: string; // [12] float L
  secondStop: string;  // [13] float L
  rfidMode: string;    // [14] 0/1 passive RFID
  round: string;       // [15] float
  price: string;       // [16] float
  extra: string[];     // any undocumented trailing fields
}

export const EMPTY_PUMP: PumpParams = {
  type: '0',
  input: '1',
  product: '1',
  output: '1',
  rfidId: '000000000000',
  pulse: '0',
  startTout: '0',
  stopTout: '0',
  rfidTout: '0',
  total: '0',
  secondOut: '0',
  secondStart: '0',
  secondStop: '0',
  rfidMode: '0',
  round: '0',
  price: '0',
  extra: [],
};

/** Read pump config: `$PASS;PUMPn` */
export function buildPumpReadCmd(password: string, index: number): string {
  return buildCmd(password, `PUMP${index}`);
}

/**
 * Write pump config: `$PASS;PUMPn;TYPE;INPUT;PRODUCT;OUTPUT;RFID_ID;PULSE;
 * START_TOUT;STOP_TOUT;RFID_TOUT;TOTAL;2ND_OUT;2ND_START;2ND_STOP;RFID_MODE;ROUND;PRICE`.
 * TOTAL is read-only but must be included in the write to maintain field positions.
 */
export function buildPumpWriteCmd(password: string, index: number, p: PumpParams): string {
  return buildCmd(password, `PUMP${index}`, [
    p.type, p.input, p.product, p.output, p.rfidId,
    p.pulse, p.startTout, p.stopTout, p.rfidTout,
    p.total, p.secondOut, p.secondStart, p.secondStop,
    p.rfidMode, p.round, p.price, ...p.extra,
  ]);
}

/**
 * Parse `$PUMPn;TYPE;INPUT;PRODUCT;OUTPUT;RFID_ID;PULSE;START_TOUT;STOP_TOUT;
 * RFID_TOUT;TOTAL;2ND_OUT;2ND_START;2ND_STOP;RFID_MODE;ROUND;PRICE[;extra...]`.
 */
export function parsePumpResponse(raw: string): PumpParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (!/^PUMP\d+$/.test(parts[0] ?? '') || parts.length < 17) return null;
  return {
    type:        parts[1] ?? '0',
    input:       parts[2] ?? '1',
    product:     parts[3] ?? '1',
    output:      parts[4] ?? '1',
    rfidId:      parts[5] ?? '000000000000',
    pulse:       parts[6] ?? '0',
    startTout:   parts[7] ?? '0',
    stopTout:    parts[8] ?? '0',
    rfidTout:    parts[9] ?? '0',
    total:       parts[10] ?? '0',
    secondOut:   parts[11] ?? '0',
    secondStart: parts[12] ?? '0',
    secondStop:  parts[13] ?? '0',
    rfidMode:    parts[14] ?? '0',
    round:       parts[15] ?? '0',
    price:       parts[16] ?? '0',
    extra:       parts.slice(17),
  };
}

// ---- Pump Format (PUMPFRMT) commands ----

/**
 * Pump format params: VALUE_FMT, TOTAL_FMT, LIMIT_FMT, LIMIT_LEN.
 * The first three store actual float values as strings (e.g. "0.010", "0.100", "1.000").
 * Device returns/accepts the same float values.
 * LIMIT_LEN is the number of digits for the dose (3-6).
 */
export interface PumpFormatParams {
  valueFmt: string;   // [1] actual float value
  totalFmt: string;   // [2] actual float value
  limitFmt: string;   // [3] actual float value
  limitLen: string;   // [4] 3-6
}

export const EMPTY_PUMP_FORMAT: PumpFormatParams = {
  valueFmt: '1',
  totalFmt: '1',
  limitFmt: '1',
  limitLen: '6',
};

/** Standard dropdown options — multiplier for displayed value. */
export const PUMP_FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0.01', label: '0.01' },
  { value: '0.1',  label: '0.1' },
  { value: '1',    label: '1' },
  { value: '10',   label: '10' },
  { value: '100',  label: '100' },
];

/** Options for LIMIT_LEN dropdown. */
export const PUMP_FORMAT_LEN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
];

/** Known format values. */
const PUMP_FMT_KNOWN = [0.01, 0.1, 1, 10, 100];

/** Normalize device float to a clean value string. */
function normalizeFmtValue(s: string): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return '1';
  for (const known of PUMP_FMT_KNOWN) {
    if (Math.abs(n - known) < 0.001) return String(known);
  }
  // Unknown value — return as-is, no trailing zeros
  return parseFloat(n.toFixed(3)).toString();
}

// ---- Keyboard (UIM / UIMX) tab commands ----

/**
 * UIM settings. Response has 16 fields after the command prefix.
 * Fields: ENABLE, KEYPAD, REQ_PUMP, REQ_LIMIT, REQ_VEHID, REQ_ODO, REQ_PIN,
 *         KEY_SOUND, TERM_SOUND, GREETING, GOODBYE, TAG_SEARCH,
 *         CHECK_VID, PROJECT_ID, COMPARE_ODO, ENGINE
 */
export interface UimParams {
  enable: boolean;       // [1]
  keypad: boolean;       // [2]
  reqPump: boolean;      // [3]
  reqLimit: boolean;     // [4]
  reqVehid: boolean;     // [5]
  reqOdo: boolean;       // [6]
  reqPin: boolean;       // [7]
  keySound: boolean;     // [8]
  termSound: boolean;    // [9]
  greeting: string;      // [10] max 16 ASCII chars
  goodbye: string;       // [11] max 16 ASCII chars
  tagSearch: string;     // [12] max 16 ASCII chars
  checkVid: boolean;     // [13]
  projectId: boolean;    // [14]
  compareOdo: boolean;   // [15]
  engine: boolean;       // [16]
}

export const EMPTY_UIM: UimParams = {
  enable: false,
  keypad: false,
  reqPump: false,
  reqLimit: false,
  reqVehid: false,
  reqOdo: false,
  reqPin: false,
  keySound: false,
  termSound: false,
  greeting: '',
  goodbye: '',
  tagSearch: '',
  checkVid: false,
  projectId: false,
  compareOdo: false,
  engine: false,
};

/** UIMX extended settings. 2 fields: DRIVER_TAG_TYPE, ALLOW_DRIVER_CODE. */
export interface UimxParams {
  driverTagType: boolean;    // [1]
  allowDriverCode: boolean;  // [2]
}

export const EMPTY_UIMX: UimxParams = {
  driverTagType: false,
  allowDriverCode: false,
};

/** Read UIM: `$PASS;UIM` */
export function buildUimReadCmd(password: string): string {
  return buildCmd(password, 'UIM');
}

/** Write UIM: `$PASS;UIM;ENABLE;KEYPAD;REQ_PUMP;...;ENGINE` (16 fields). */
export function buildUimWriteCmd(password: string, p: UimParams): string {
  const b = (v: boolean) => (v ? '1' : '0');
  return buildCmd(password, 'UIM', [
    b(p.enable), b(p.keypad), b(p.reqPump), b(p.reqLimit),
    b(p.reqVehid), b(p.reqOdo), b(p.reqPin),
    b(p.keySound), b(p.termSound),
    p.greeting, p.goodbye, p.tagSearch,
    b(p.checkVid), b(p.projectId), b(p.compareOdo), b(p.engine),
  ]);
}

/**
 * Parse `$UIM;ENABLE;KEYPAD;...;ENGINE` response.
 * GREETING / GOODBYE / TAG_SEARCH keep their padding spaces — operators use
 * leading/trailing spaces to center the text on the device display.
 */
export function parseUimResponse(raw: string): UimParams | null {
  // Strip only the trailing CR/LF, not inner whitespace that belongs to text fields.
  const t = raw.replace(/^\$/, '').replace(/\r?\n$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'UIM' || parts.length < 17) return null;
  return {
    enable:     parts[1] === '1',
    keypad:     parts[2] === '1',
    reqPump:    parts[3] === '1',
    reqLimit:   parts[4] === '1',
    reqVehid:   parts[5] === '1',
    reqOdo:     parts[6] === '1',
    reqPin:     parts[7] === '1',
    keySound:   parts[8] === '1',
    termSound:  parts[9] === '1',
    greeting:   parts[10] ?? '',
    goodbye:    parts[11] ?? '',
    tagSearch:  parts[12] ?? '',
    checkVid:   parts[13] === '1',
    projectId:  parts[14] === '1',
    compareOdo: parts[15] === '1',
    engine:     parts[16] === '1',
  };
}

/** Read UIMX: `$PASS;UIMX` */
export function buildUimxReadCmd(password: string): string {
  return buildCmd(password, 'UIMX');
}

/** Write UIMX: `$PASS;UIMX;DRIVER_TAG_TYPE;ALLOW_DRIVER_CODE` */
export function buildUimxWriteCmd(password: string, p: UimxParams): string {
  const b = (v: boolean) => (v ? '1' : '0');
  return buildCmd(password, 'UIMX', [b(p.driverTagType), b(p.allowDriverCode)]);
}

/** Parse `$UIMX;DRIVER_TAG_TYPE;ALLOW_DRIVER_CODE`. */
export function parseUimxResponse(raw: string): UimxParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'UIMX' || parts.length < 3) return null;
  return {
    driverTagType:   parts[1] === '1',
    allowDriverCode: parts[2] === '1',
  };
}

/** Read pump format: `$PASS;PUMPFRMTn` */
export function buildPumpFormatReadCmd(password: string, index: number): string {
  return buildCmd(password, `PUMPFRMT${index}`);
}

/** Write pump format: `$PASS;PUMPFRMTn;VALUE;TOTAL;LIMIT;LIMIT_LEN` */
export function buildPumpFormatWriteCmd(password: string, index: number, f: PumpFormatParams): string {
  return buildCmd(password, `PUMPFRMT${index}`, [f.valueFmt, f.totalFmt, f.limitFmt, f.limitLen]);
}

/**
 * Parse `$PUMPFRMTn;VALUE;TOTAL;LIMIT;LIMIT_LEN`.
 * Stores actual float values; known values normalized (0.01, 0.1, 1).
 */
export function parsePumpFormatResponse(raw: string): PumpFormatParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (!/^PUMPFRMT\d+$/.test(parts[0] ?? '') || parts.length < 5) return null;
  return {
    valueFmt: normalizeFmtValue(parts[1] ?? '1'),
    totalFmt: normalizeFmtValue(parts[2] ?? '1'),
    limitFmt: normalizeFmtValue(parts[3] ?? '1'),
    limitLen: String(Math.round(parseFloat(parts[4] ?? '6'))),
  };
}

// ---- Security tab commands (EMSTOP / TAGCFG / BYPASS / PUMPSEC) ----

/**
 * Emergency stop settings.
 * Read/Write: `$PASS;EMSTOP[;ENABLE;INPUT;LEVEL;OPERATOR_CHECK]`
 */
export interface EmstopParams {
  enable: boolean;       // [1]
  input: string;         // [2] input number (1-8)
  level: boolean;        // [3] invert
  operatorCheck: boolean; // [4]
}

export const EMPTY_EMSTOP: EmstopParams = {
  enable: false,
  input: '2',
  level: false,
  operatorCheck: false,
};

export function buildEmstopReadCmd(password: string): string {
  return buildCmd(password, 'EMSTOP');
}

export function buildEmstopWriteCmd(password: string, p: EmstopParams): string {
  const b = (v: boolean) => (v ? '1' : '0');
  return buildCmd(password, 'EMSTOP', [b(p.enable), p.input, b(p.level), b(p.operatorCheck)]);
}

/** Parse `$EMSTOP;ENABLE;INPUT;LEVEL;OPERATOR_CHECK`. */
export function parseEmstopResponse(raw: string): EmstopParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'EMSTOP' || parts.length < 5) return null;
  return {
    enable:        parts[1] === '1',
    input:         parts[2] ?? '2',
    level:         parts[3] === '1',
    operatorCheck: parts[4] === '1',
  };
}

/**
 * Tag authorization config.
 * Read/Write: `$PASS;TAGCFG[;MODE;MASK;SAVE_SD]`
 */
export interface TagcfgParams {
  mode: string;    // [1] 0=Memory, 1=Memory+Filter, 2=AnyTag
  mask: string;    // [2] 12-char hex mask (e.g. xxxxxxxxxxxx)
  saveSd: boolean; // [3]
}

export const EMPTY_TAGCFG: TagcfgParams = {
  mode: '0',
  mask: 'xxxxxxxxxxxx',
  saveSd: false,
};

/** TAGCFG mode values (labels are i18n keys: sec.tagcfgMode0, sec.tagcfgMode1, sec.tagcfgMode2). */
export const TAGCFG_MODE_VALUES = ['0', '1', '2'] as const;

export function buildTagcfgReadCmd(password: string): string {
  return buildCmd(password, 'TAGCFG');
}

export function buildTagcfgWriteCmd(password: string, p: TagcfgParams): string {
  return buildCmd(password, 'TAGCFG', [p.mode, p.mask, p.saveSd ? '1' : '0']);
}

/** Parse `$TAGCFG;MODE;MASK;SAVE_SD`. */
export function parseTagcfgResponse(raw: string): TagcfgParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'TAGCFG' || parts.length < 4) return null;
  return {
    mode:   parts[1] ?? '0',
    mask:   parts[2] ?? 'xxxxxxxxxxxx',
    saveSd: parts[3] === '1',
  };
}

/**
 * Bypass settings.
 * Read/Write: `$PASS;BYPASS[;ENABLE;MOTION;MIN_THRESHOLD]`
 */
export interface BypassParams {
  enable: boolean;       // [1]
  motion: boolean;       // [2]
  minThreshold: string;  // [3] float
}

export const EMPTY_BYPASS: BypassParams = {
  enable: false,
  motion: false,
  minThreshold: '1.0',
};

export function buildBypassReadCmd(password: string): string {
  return buildCmd(password, 'BYPASS');
}

export function buildBypassWriteCmd(password: string, p: BypassParams): string {
  const b = (v: boolean) => (v ? '1' : '0');
  return buildCmd(password, 'BYPASS', [b(p.enable), b(p.motion), p.minThreshold]);
}

/** Parse `$BYPASS;ENABLE;MOTION;MIN_THRESHOLD`. */
export function parseBypassResponse(raw: string): BypassParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'BYPASS' || parts.length < 4) return null;
  return {
    enable:       parts[1] === '1',
    motion:       parts[2] === '1',
    minThreshold: parts[3] ?? '1.0',
  };
}

/**
 * Pump security settings.
 * Read: `$PUMPSEC;f1..f10` (10 fields). Write: 9 fields (last is read-only).
 *
 * Fields:
 * [1] MAX_DOZE_EN, [2] LOW_LVL_EN, [3] LOW_LVL_THRESH, [4] MAX_DOZE_THRESH,
 * [5] ALARM_EN, [6] ALARM_OUTPUT, [7] ALARM_TIMER,
 * [8] AUTH_TYPE (hex bitmask), [9] AUTH_METHOD (0/1/2),
 * [10] ONLINE_TIMEOUT (read-only)
 */
export interface PumpsecParams {
  maxDozeEn: boolean;      // [1]
  lowLvlEn: boolean;       // [2]
  lowLvlThresh: string;    // [3]
  maxDozeThresh: string;   // [4]
  alarmEn: boolean;        // [5]
  alarmOutput: string;     // [6] output number
  alarmTimer: string;      // [7] seconds
  authType: string;        // [8] hex bitmask (e.g. '1f', '3f')
  authMethod: string;      // [9] 0=Offline, 1=Online, 2=Online/Offline
  onlineTimeout: string;   // [10] read-only
}

export const EMPTY_PUMPSEC: PumpsecParams = {
  maxDozeEn: false,
  lowLvlEn: false,
  lowLvlThresh: '0',
  maxDozeThresh: '0',
  alarmEn: false,
  alarmOutput: '4',
  alarmTimer: '0',
  authType: '1f',
  authMethod: '0',
  onlineTimeout: '15',
};

/**
 * AUTH_TYPE dropdown: predefined bitmask combinations.
 * Bit0=All, Bit1=Code, Bit2=iButton, Bit3=RFID, Bit4=Remote.
 */
export const PUMPSEC_AUTH_TYPES: Array<{ value: string; label: string }> = [
  { value: '02', label: '02 — UI keypad' },
  { value: '04', label: '04 — iButton' },
  { value: '06', label: '06 — iButton + UI' },
  { value: '08', label: '08 — RFID' },
  { value: '0a', label: '0a — RFID + UI' },
  { value: '1a', label: '1a — RFID + UI + Remote' },
  { value: '1c', label: '1c — RFID + iButton + Remote' },
  { value: '1f', label: '1f — All types' },
  { value: '3f', label: '3f — All types' },
];

/** AUTH_METHOD values (labels are i18n keys: sec.authMethod0, sec.authMethod1, sec.authMethod2). */
export const PUMPSEC_AUTH_METHOD_VALUES = ['0', '1', '2'] as const;

export function buildPumpsecReadCmd(password: string): string {
  return buildCmd(password, 'PUMPSEC');
}

/** Write 9 fields (drop read-only onlineTimeout). */
export function buildPumpsecWriteCmd(password: string, p: PumpsecParams): string {
  const b = (v: boolean) => (v ? '1' : '0');
  return buildCmd(password, 'PUMPSEC', [
    b(p.maxDozeEn), b(p.lowLvlEn), p.lowLvlThresh, p.maxDozeThresh,
    b(p.alarmEn), p.alarmOutput, p.alarmTimer,
    p.authType, p.authMethod,
  ]);
}

/**
 * Parse `$PUMPSEC;f1;f2;f3;f4;f5;f6;f7;f8;f9;f10`.
 * 10 fields total; last (onlineTimeout) is read-only.
 */
export function parsePumpsecResponse(raw: string): PumpsecParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'PUMPSEC' || parts.length < 10) return null;
  return {
    maxDozeEn:      parts[1] === '1',
    lowLvlEn:       parts[2] === '1',
    lowLvlThresh:   parts[3] ?? '0',
    maxDozeThresh:  parts[4] ?? '0',
    alarmEn:        parts[5] === '1',
    alarmOutput:    parts[6] ?? '4',
    alarmTimer:     parts[7] ?? '0',
    authType:       parts[8] ?? '1f',
    authMethod:     parts[9] ?? '0',
    onlineTimeout:  parts[10] ?? '15',
  };
}

// ---- Printer tab commands (PRINTER / PRNTN / PRNTP / PRNTW) ----

/**
 * Printer settings.
 * Read: `$PRINTER;CONTROL;LANG;TIME_SHIFT;DTR_GPIO` (4 fields, last read-only).
 * Write: `$PASS;PRINTER;SET;CONTROL;LANG;TIME_SHIFT` (3 fields).
 */
export interface PrinterParams {
  control: string;    // [1] 00=Off, 01=On, 02=AutoPrint, 03=AUTO Receipt
  lang: string;       // [2] 0=English, 1=Russian
  timeShift: string;  // [3] e.g. "+3", "-5"
  dtrGpio: string;    // [4] read-only
}

export const EMPTY_PRINTER: PrinterParams = {
  control: '00',
  lang: '0',
  timeShift: '+0',
  dtrGpio: '0',
};

/** CONTROL dropdown values. */
export const PRINTER_CONTROL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '00', label: 'Disabled' },
  { value: '01', label: 'Enabled' },
  { value: '03', label: 'Auto Print' },
];

export const PRINTER_CONTROL_OPTIONS_RU: Array<{ value: string; label: string }> = [
  { value: '00', label: 'Выключен' },
  { value: '01', label: 'Включен' },
  { value: '03', label: 'Автопечать' },
];

/** LANG dropdown values. */
export const PRINTER_LANG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: 'English' },
  { value: '1', label: 'Russian' },
];

export const PRINTER_LANG_OPTIONS_RU: Array<{ value: string; label: string }> = [
  { value: '0', label: 'English' },
  { value: '1', label: 'RUSSIAN' },
];

/** TIME_SHIFT dropdown: -12 to +12. */
export const PRINTER_TIME_SHIFT_OPTIONS: Array<{ value: string; label: string }> =
  Array.from({ length: 25 }, (_, i) => {
    const v = i - 12;
    const s = v > 0 ? `+${v}` : String(v);
    return { value: s, label: s };
  });

/** Printer text fields (station name, phone, website). */
export interface PrinterTextFields {
  stationName: string;
  phone: string;
  website: string;
}

export const EMPTY_PRINTER_TEXT: PrinterTextFields = {
  stationName: '',
  phone: '',
  website: '',
};

/** Read printer config: `$PASS;PRINTER;GET` */
export function buildPrinterReadCmd(password: string): string {
  return buildCmd(password, 'PRINTER', ['GET']);
}

/** Write printer config: `$PASS;PRINTER;SET;CONTROL;LANG;TIME_SHIFT` */
export function buildPrinterWriteCmd(password: string, p: PrinterParams): string {
  return buildCmd(password, 'PRINTER', ['SET', p.control, p.lang, p.timeShift]);
}

/** Parse `$PRINTER;CONTROL;LANG;TIME_SHIFT;DTR_GPIO`. */
export function parsePrinterResponse(raw: string): PrinterParams | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'PRINTER' || parts.length < 4) return null;
  return {
    control:   parts[1] ?? '00',
    lang:      parts[2] ?? '0',
    timeShift: parts[3] ?? '+0',
    dtrGpio:   parts[4] ?? '0',
  };
}

/**
 * Decode PRNTN/PRNTP/PRNTW hex payload: `LLDDDDDDDD` → string.
 * LL = 2 decimal digits (byte count), DD = UTF-16 code points as 4 hex digits each.
 */
export function decodePrinterHexText(payload: string): string {
  if (payload.length < 2) return '';
  const hexData = payload.slice(2);
  let result = '';
  for (let i = 0; i + 3 < hexData.length; i += 4) {
    const code = parseInt(hexData.slice(i, i + 4), 16);
    if (Number.isFinite(code) && code > 0) {
      result += String.fromCharCode(code);
    }
  }
  return result;
}

/**
 * Encode string to `LLDDDDDDDD` format for PRNTN/PRNTP/PRNTW write.
 * LL = byte count (string.length * 2), DD = each char as 4-hex-digit code point.
 */
export function encodePrinterHexText(text: string): string {
  const byteLen = text.length * 2;
  const ll = String(byteLen).padStart(2, '0');
  let hex = '';
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).padStart(4, '0');
  }
  return ll + hex;
}

/** Read station name: `$PASS;PRNTN` */
export function buildPrntnReadCmd(password: string): string {
  return buildCmd(password, 'PRNTN');
}

/** Write station name: `$PASS;PRNTN;LLDDDD...` */
export function buildPrntnWriteCmd(password: string, text: string): string {
  return buildCmd(password, 'PRNTN', [encodePrinterHexText(text)]);
}

/** Parse `$PRNTN;LLDDDD...` → decoded text. */
export function parsePrntnResponse(raw: string): string | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'PRNTN' || parts.length < 2) return null;
  return decodePrinterHexText(parts[1] ?? '');
}

/** Read phone: `$PASS;PRNTP` */
export function buildPrntpReadCmd(password: string): string {
  return buildCmd(password, 'PRNTP');
}

/** Write phone: `$PASS;PRNTP;LLDDDD...` */
export function buildPrntpWriteCmd(password: string, text: string): string {
  return buildCmd(password, 'PRNTP', [encodePrinterHexText(text)]);
}

/** Parse `$PRNTP;LLDDDD...` → decoded text. */
export function parsePrntpResponse(raw: string): string | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'PRNTP' || parts.length < 2) return null;
  return decodePrinterHexText(parts[1] ?? '');
}

/** Read website: `$PASS;PRNTW` */
export function buildPrntwReadCmd(password: string): string {
  return buildCmd(password, 'PRNTW');
}

/** Write website: `$PASS;PRNTW;LLDDDD...` */
export function buildPrntwWriteCmd(password: string, text: string): string {
  return buildCmd(password, 'PRNTW', [encodePrinterHexText(text)]);
}

/** Parse `$PRNTW;LLDDDD...` → decoded text. */
export function parsePrntwResponse(raw: string): string | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'PRNTW' || parts.length < 2) return null;
  return decodePrinterHexText(parts[1] ?? '');
}

/** Print last transaction: `$PASS;PRINTER;MAKE` */
export function buildPrinterMakeCmd(password: string): string {
  return buildCmd(password, 'PRINTER', ['MAKE']);
}

// ---- Camera tab commands (CAMERA0..2) ----

/** CONFIG can scan all baud rates — give it ample time. */
export const CAMERA_CONFIG_TIMEOUT_MS = 60_000;

/** GETPIC captures + uploads an image — can take a while. */
export const CAMERA_GETPIC_TIMEOUT_MS = 60_000;

/** Number of camera slots exposed in the UI (0..2). */
export const CAMERA_SLOT_COUNT = 3;

/**
 * Camera per-slot parameters — only the fields we expose in the UI.
 *
 * Wire frame (after `$CAMERA<n>;`) has 13 positional fields:
 *   ENABLE;ADDRESS;BAUDRATE;PIC_SIZE;
 *   TIMER_ON,TIMER_INTERVAL;IGN_ON,IGN_TIMER;SOS_ON;
 *   IN_ON,INPUTS,INPUTS_POLARITY;GEO_ON,GEOFENCE,GEOFENCE_POLARITY;
 *   ECO_ON;SHOKE_ON;TILT_ON;EKEY_ON
 *
 * Unused triggers (IGN, SOS, GEO, ECO) are always written as zeros — the
 * UI never exposes them and any device-stored values are overwritten on
 * save. The position-5/6 ordering above (periodic timer first, ignition
 * second) reflects the live GT-9 device, not the legacy WinForms task doc
 * which has them swapped.
 */
export interface CameraParams {
  enable: boolean;
  address: string;          // 0=RS232, 1..16=RS485 address
  baudrate: string;         // 0..6 (see CAMERA_BAUDRATE_OPTIONS)
  picSize: string;          // 1..3 (see CAMERA_PIC_SIZE_OPTIONS)
  timerOn: boolean;
  timerInterval: string;    // minutes
  inOn: boolean;
  inputs: string;           // 4-hex bitmask
  inputsPolarity: string;   // 4-hex bitmask
  shokeOn: boolean;
  tiltOn: boolean;
  ekeyOn: boolean;
}

export const EMPTY_CAMERA: CameraParams = {
  enable: false,
  address: '0',
  baudrate: '0',
  picSize: '1',
  timerOn: false,
  timerInterval: '0',
  inOn: false,
  inputs: '0000',
  inputsPolarity: 'FFFF',
  shokeOn: false,
  tiltOn: false,
  ekeyOn: false,
};

export const CAMERA_BAUDRATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '9600' },
  { value: '1', label: '19200' },
  { value: '2', label: '38400' },
  { value: '3', label: '57600' },
  { value: '4', label: '115200' },
  { value: '5', label: '2400' },
  { value: '6', label: '14400' },
];

export const CAMERA_PIC_SIZE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '160 x 128' },
  { value: '2', label: '320 x 240' },
  { value: '3', label: '640 x 480' },
];

/** Read camera config: `$PASS;CAMERA<slot>;GET`. */
export function buildCameraReadCmd(password: string, slot: number): string {
  return buildCmd(password, `CAMERA${slot}`, ['GET']);
}

/** Write camera config: `$PASS;CAMERA<slot>;SET;...13 fields`. Hidden triggers always 0. */
export function buildCameraWriteCmd(password: string, slot: number, c: CameraParams): string {
  const b = (v: boolean) => (v ? '1' : '0');
  return buildCmd(password, `CAMERA${slot}`, [
    'SET',
    b(c.enable),
    c.address,
    c.baudrate,
    c.picSize,
    `${b(c.timerOn)},${c.timerInterval}`,
    '0,0',                                    // IGN_ON, IGN_TIMER (always disabled)
    '0',                                      // SOS_ON
    `${b(c.inOn)},${c.inputs},${c.inputsPolarity}`,
    '0,0000,FFFF',                            // GEO_ON, GEOFENCE, GEOFENCE_POLARITY
    '0',                                      // ECO_ON
    b(c.shokeOn),
    b(c.tiltOn),
    b(c.ekeyOn),
  ]);
}

/** Auto-configure camera (scans baud rates): `$PASS;CAMERA<slot>;CONFIG`. */
export function buildCameraConfigCmd(password: string, slot: number): string {
  return buildCmd(password, `CAMERA${slot}`, ['CONFIG']);
}

/** Capture + upload one image now: `$PASS;GETPIC<slot>`. */
export function buildCameraGetPicCmd(password: string, slot: number): string {
  return buildCmd(password, `GETPIC${slot}`);
}

/** Parse `$CAMERA<n>;...13 fields`. Returns slot + params, or null on mismatch. */
export function parseCameraResponse(raw: string): { slot: number; params: CameraParams } | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  const m = parts[0]?.match(/^CAMERA(\d+)$/);
  if (!m || parts.length < 14) return null;

  const sub2 = (s: string | undefined): [string, string] => {
    const [a = '0', b = '0'] = (s ?? '').split(',');
    return [a, b];
  };
  const sub3 = (s: string | undefined): [string, string, string] => {
    const [a = '0', b = '0', c = '0'] = (s ?? '').split(',');
    return [a, b, c];
  };

  const [timerOn, timerInterval] = sub2(parts[5]);
  const [inOn, inputs, inputsPolarity] = sub3(parts[8]);

  return {
    slot: Number(m[1]),
    params: {
      enable: parts[1] === '1',
      address: parts[2] ?? '0',
      baudrate: parts[3] ?? '0',
      picSize: parts[4] ?? '1',
      timerOn: timerOn === '1',
      timerInterval,
      inOn: inOn === '1',
      inputs,
      inputsPolarity,
      shokeOn: parts[11] === '1',
      tiltOn: parts[12] === '1',
      ekeyOn: parts[13] === '1',
    },
  };
}

// ---- Tags/Keys tab commands (TAG / TAGS) ----

/** Empty tag ID — indicates an unused slot. */
export const TAG_EMPTY_ID = 'FFFFFFFFFFFF';

/**
 * Single tag entry read from the device.
 * Response: `$TAG;ID;PARAM1;PARAM2;PARAM3;INDEX`
 */
export interface TagEntry {
  index: number;       // 1-based slot index
  tagId: string;       // 12 hex chars (6 bytes)
  limit: number;       // -1 = exhausted, 0 = unlimited, 1-9999
  param2: number;      // bitmask byte (fuel types + operator + driver flags)
  pin: number;         // 0-9999
}

export const EMPTY_TAG: TagEntry = {
  index: 0,
  tagId: TAG_EMPTY_ID,
  limit: 0,
  param2: 0,
  pin: 0,
};

/** Read tag count / limit: `$PASS;TAGS` → `$TAGS;MEMORY;LIMIT;ADDED` */
export function buildTagsCountCmd(password: string): string {
  return buildCmd(password, 'TAGS');
}

/**
 * Parse TAGS response: `$TAGS;MEMORY;LIMIT;ADDED`.
 * Returns { memory, limit, added } or null.
 */
export function parseTagsResponse(raw: string): { memory: number; limit: number; added: number } | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'TAGS' || parts.length < 4) return null;
  const memory = parseInt(parts[1] ?? '0', 10);
  const limit = parseInt(parts[2] ?? '0', 10);
  const added = parseInt(parts[3] ?? '0', 10);
  if (!Number.isFinite(memory) || !Number.isFinite(limit) || !Number.isFinite(added)) return null;
  return { memory, limit, added };
}

/** Read tag by index (1-based): `$PASS;TAG;GETI;index` */
export function buildTagGetByIndexCmd(password: string, index: number): string {
  return buildCmd(password, 'TAG', ['GETI', String(index)]);
}

/**
 * Parse TAG;GETI response.
 * Short format:    `$TAG;ID;PARAM1;PARAM2;PARAM3;INDEX`
 * Extended (SD):   `$TAG;ID;PARAM1;PARAM2;PARAM3;;...extra...;INDEX`
 *
 * We always take the first 5 fields (TAG,ID,P1,P2,P3) and the **last** field as INDEX.
 * Returns TagEntry or null on malformed input.
 */
export function parseTagGetResponse(raw: string): TagEntry | null {
  const t = raw.trim().replace(/^\$/, '');
  const parts = t.split(';');
  if (parts[0] !== 'TAG' || parts.length < 6) return null;
  const tagId = (parts[1] ?? '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(tagId)) return null;
  const limit = parseInt(parts[2] ?? '0', 10);
  const param2 = parseInt(parts[3] ?? '0', 16); // hex byte
  const pin = parseInt(parts[4] ?? '0', 10);
  // Index is always the last field (handles both short and extended SD responses)
  const index = parseInt(parts[parts.length - 1] ?? '0', 10);
  if (!Number.isFinite(limit) || !Number.isFinite(param2) || !Number.isFinite(pin) || !Number.isFinite(index)) return null;
  return { index, tagId, limit, param2, pin };
}

/**
 * Write tag by index (1-based):
 * `$PASS;TAG;ADDI;INDEX;TAG_ID;PARAM1;PARAM2;PARAM3`
 */
export function buildTagAddByIndexCmd(
  password: string,
  index: number,
  tagId: string,
  limit: number,
  param2: number,
  pin: number,
): string {
  const p2hex = param2.toString(16).toUpperCase().padStart(2, '0');
  return buildCmd(password, 'TAG', ['ADDI', String(index), tagId, String(limit), p2hex, String(pin)]);
}

/** Delete a tag by ID: `$PASS;TAG;DEL;TAG_ID` */
export function buildTagDeleteCmd(password: string, tagId: string): string {
  return buildCmd(password, 'TAG', ['DEL', tagId]);
}

/** Decode PARAM2 bitmask into individual flags. */
export function decodeTagParam2(param2: number): {
  fuel1: boolean; fuel2: boolean; fuel3: boolean; fuel4: boolean;
  operator: boolean; driver: boolean;
} {
  return {
    fuel1: (param2 & 0x01) === 0,     // bit 0: 0=yes, 1=no
    fuel2: (param2 & 0x02) === 0,     // bit 1
    fuel3: (param2 & 0x04) === 0,     // bit 2
    fuel4: (param2 & 0x08) === 0,     // bit 3
    operator: (param2 & 0x10) !== 0,  // bit 4 (5th bit): 1=yes
    driver: (param2 & 0x20) !== 0,    // bit 5 (6th bit): 1=yes
  };
}

/** Encode individual flags back into PARAM2 bitmask. */
export function encodeTagParam2(flags: {
  fuel1: boolean; fuel2: boolean; fuel3: boolean; fuel4: boolean;
  operator: boolean; driver: boolean;
}): number {
  let v = 0;
  if (!flags.fuel1) v |= 0x01;  // 0=yes → set bit means NO
  if (!flags.fuel2) v |= 0x02;
  if (!flags.fuel3) v |= 0x04;
  if (!flags.fuel4) v |= 0x08;
  if (flags.operator) v |= 0x10;
  if (flags.driver) v |= 0x20;
  return v;
}

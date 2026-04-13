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

// ---- Protocol tab commands ----

/** Query a single CTR protocol tag: $PASS;PROTOCOL;GET;1;<ID> — response is 0/1 */
export function buildProtocolGetCmd(password: string, tagIdHex: string): string {
  return buildCmd(password, 'PROTOCOL', ['GET', '1', tagIdHex]);
}

/** Enable tag IDs in CTR protocol: $PASS;PROTOCOL;SET;1;ID1;ID2;... */
export function buildProtocolSetCmd(password: string, tagIdsHex: string[]): string {
  return buildCmd(password, 'PROTOCOL', ['SET', '1', ...tagIdsHex]);
}

/** Disable tag IDs in CTR protocol: $PASS;PROTOCOL;RESET;1;ID1;ID2;... */
export function buildProtocolResetCmd(password: string, tagIdsHex: string[]): string {
  return buildCmd(password, 'PROTOCOL', ['RESET', '1', ...tagIdsHex]);
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

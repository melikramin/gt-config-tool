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

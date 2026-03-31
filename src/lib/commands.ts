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

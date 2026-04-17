/**
 * Template save/load: builds raw command lines from the settings store.
 * Each line is a ready-to-send command like `$1234;APN;internet.mts.ru;mts;mts`.
 * Can be copied and sent via SMS or loaded back into the device.
 *
 * Load: strip the password from each line → the result looks like a device
 * response → reuse existing parsers.  For commands that include a `SET` token
 * (SERVER, PRSET, WIFINET, MSENS, TILT, ENCODER, LLS, PRINTER) we also strip
 * that token so the parser sees the same field layout as a read response.
 */

import { useSettingsStore } from '../stores/settingsStore';
import { useConnectionStore } from '../stores/connectionStore';
import {
  buildApnWriteCmd,
  buildServerWriteCmd,
  buildPrset20SetCmd,
  buildPrset21SetCmd,
  buildWifiNetWriteCmd,
  buildFilterWriteCmd,
  buildMsensWriteCmd,
  buildTiltWriteCmd,
  buildInputWriteCmd,
  buildEncoderWriteCmd,
  buildRsWriteCmd,
  buildLlsWriteCmd,
  buildPumpWriteCmd,
  buildPumpFormatWriteCmd,
  buildUimWriteCmd,
  buildUimxWriteCmd,
  buildEmstopWriteCmd,
  buildTagcfgWriteCmd,
  buildBypassWriteCmd,
  buildPumpsecWriteCmd,
  buildPrinterWriteCmd,
  buildPrntnWriteCmd,
  buildPrntpWriteCmd,
  buildPrntwWriteCmd,
  buildLogResetCmd,
  bytesToHex,
  RS_PORTS,
  parsePrsetResponse,
  parseFilterResponse,
  parseMsensResponse,
  parseTiltResponse,
  parseInputResponse,
  parseEncoderResponse,
  parseRsResponse,
  parseLlsSettings,
  parsePumpResponse,
  parsePumpFormatResponse,
  parseUimResponse,
  parseUimxResponse,
  parseEmstopResponse,
  parseTagcfgResponse,
  parseBypassResponse,
  parsePumpsecResponse,
  parsePrinterResponse,
  parsePrntnResponse,
  parsePrntpResponse,
  parsePrntwResponse,
  EMPTY_INPUT,
  EMPTY_ENCODER,
  EMPTY_LLS,
  EMPTY_PUMP,
  EMPTY_PUMP_FORMAT,
  EMPTY_UIM,
  EMPTY_UIMX,
  EMPTY_EMSTOP,
  EMPTY_TAGCFG,
  EMPTY_BYPASS,
  EMPTY_PUMPSEC,
  EMPTY_PRINTER,
  FLS_MAX_SENSORS,
  PUMP_COUNT,
  type RsPortName,
  type WifiNetworkParams,
  type InputParams,
  type EncoderParams,
  type RsPortParams,
  type LlsSettings,
  type PumpParams,
  type PumpFormatParams,
} from './commands';
import {
  parseApn,
  parseServer,
  parseWifiNetwork,
  type WifiNetworkData,
  type ApnData,
  type ServerData,
} from './parsers';

/**
 * Build an array of raw command strings from the current settings store.
 * Returns null if no settings have been read yet.
 */
export function buildTemplateCommands(): string[] | null {
  const settings = useSettingsStore.getState();
  const { password, deviceImei } = useConnectionStore.getState();

  // Must have at least some data
  if (!settings.serverApn && !settings.gpsFilter && !settings.protoBuf20) {
    return null;
  }

  const lines: string[] = [];

  // ---- Server ----
  if (settings.serverApn && settings.serverData) {
    const apn = settings.serverApn;
    const srv = settings.serverData;
    lines.push(buildApnWriteCmd(password, apn.name, apn.login, apn.password));
    lines.push(buildServerWriteCmd(
      password, 1, srv.ip, srv.port, deviceImei || 'IMEI',
      srv.channel, srv.protocol,
    ));
  }

  // ---- Protocol ----
  if (settings.protoBuf20 && settings.protoBuf21) {
    lines.push(buildPrset20SetCmd(password, bytesToHex(settings.protoBuf20)));
    lines.push(buildPrset21SetCmd(password, bytesToHex(settings.protoBuf21)));
  }

  // ---- WiFi ----
  if (settings.wifiNetworks && settings.wifiNetworks.length > 0) {
    for (let i = 0; i < settings.wifiNetworks.length; i++) {
      const net = settings.wifiNetworks[i];
      const params: WifiNetworkParams = {
        ssid: net.ssid,
        encrypt: net.encrypt,
        key: net.key,
        ipMode: net.ipMode,
        ip: net.ip,
        mask: net.mask,
        gateway: net.gateway,
        dns1: net.dns1,
        dns2: net.dns2,
      };
      lines.push(buildWifiNetWriteCmd(password, i + 1, params));
    }
  }

  // ---- GPS ----
  if (settings.gpsFilter) {
    lines.push(buildFilterWriteCmd(password, settings.gpsFilter));
  }
  if (settings.gpsMsens) {
    lines.push(buildMsensWriteCmd(password, settings.gpsMsens));
  }
  if (settings.gpsTilt) {
    lines.push(buildTiltWriteCmd(password, settings.gpsTilt));
  }

  // ---- Inputs/Outputs ----
  if (settings.inputs && settings.inputCount != null) {
    for (let i = 0; i < settings.inputCount; i++) {
      lines.push(buildInputWriteCmd(password, i + 1, settings.inputs[i]));
    }
  }
  if (settings.encoder1) {
    lines.push(buildEncoderWriteCmd(password, 1, settings.encoder1));
  }
  if (settings.encoder2) {
    lines.push(buildEncoderWriteCmd(password, 2, settings.encoder2));
  }

  // ---- RS Interfaces ----
  if (settings.rsPorts && settings.rsAvailable) {
    for (let i = 0; i < RS_PORTS.length; i++) {
      if (!settings.rsAvailable[i]) continue;
      const name = RS_PORTS[i] as RsPortName;
      lines.push(buildRsWriteCmd(password, name, settings.rsPorts[i]));
    }
  }

  // ---- FLS (Level sensors) ----
  if (settings.flsSensors) {
    for (let i = 0; i < settings.flsSensors.length; i++) {
      lines.push(buildLlsWriteCmd(password, i + 1, settings.flsSensors[i]));
    }
  }

  // ---- Pumps ----
  if (settings.pumps) {
    for (let i = 0; i < settings.pumps.length; i++) {
      lines.push(buildPumpWriteCmd(password, i + 1, settings.pumps[i]));
    }
  }

  // ---- Pump Formats ----
  if (settings.pumpFormats) {
    for (let i = 0; i < settings.pumpFormats.length; i++) {
      lines.push(buildPumpFormatWriteCmd(password, i + 1, settings.pumpFormats[i]));
    }
  }

  // ---- Keyboard ----
  if (settings.keyboardUim) {
    lines.push(buildUimWriteCmd(password, settings.keyboardUim));
  }
  if (settings.keyboardUimx) {
    lines.push(buildUimxWriteCmd(password, settings.keyboardUimx));
  }

  // ---- Security ----
  if (settings.securityEmstop) {
    lines.push(buildEmstopWriteCmd(password, settings.securityEmstop));
  }
  if (settings.securityTagcfg) {
    lines.push(buildTagcfgWriteCmd(password, settings.securityTagcfg));
  }
  if (settings.securityBypass) {
    lines.push(buildBypassWriteCmd(password, settings.securityBypass));
  }
  if (settings.securityPumpsec) {
    lines.push(buildPumpsecWriteCmd(password, settings.securityPumpsec));
  }

  // ---- Printer ----
  if (settings.printerSettings) {
    lines.push(buildPrinterWriteCmd(password, settings.printerSettings));
  }
  if (settings.printerText) {
    lines.push(buildPrntnWriteCmd(password, settings.printerText.stationName));
    lines.push(buildPrntpWriteCmd(password, settings.printerText.phone));
    lines.push(buildPrntwWriteCmd(password, settings.printerText.website));
  }

  // ---- LOG;RESET at the end ----
  lines.push(buildLogResetCmd(password));

  return lines;
}

// ---------------------------------------------------------------------------
// Load template
// ---------------------------------------------------------------------------

/**
 * Convert a write-command line into a "response-like" string that existing
 * parsers understand.
 *
 * 1. Strip `$PASSWORD;` → `$COMMAND;PARAMS`
 * 2. For commands that include a `SET` token, remove it so the layout
 *    matches a read-response.
 *
 * Returns `{ cmd, response }` where `cmd` is the bare command name
 * (e.g. "APN", "SERVER1", "WIFINET2") and `response` is the parser-ready
 * string, or null if the line is not a valid command.
 */
function lineToResponse(line: string): { cmd: string; response: string } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('$')) return null;

  // "$PASSWORD;COMMAND;..." → remove leading $ and split
  const withoutDollar = trimmed.slice(1);
  const parts = withoutDollar.split(';');
  if (parts.length < 2) return null;

  // parts[0] = password, parts[1] = command name, parts[2..] = params
  const cmd = parts[1];
  const params = parts.slice(2);

  // Commands that use SET as the first param — strip it
  const COMMANDS_WITH_SET = [
    'SERVER1', 'SERVER2',
    'PRSET20', 'PRSET21',
    'MSENS', 'TILT',
    'PRINTER',
  ];

  // Pattern-based: WIFINETn, ENCODERn, LLSn
  const isSetPattern =
    /^WIFINET\d+$/.test(cmd) ||
    /^ENCODER\d+$/.test(cmd) ||
    /^LLS\d+$/.test(cmd);

  let effectiveParams = params;
  if ((COMMANDS_WITH_SET.includes(cmd) || isSetPattern) && params[0] === 'SET') {
    effectiveParams = params.slice(1);
  }

  const response = `$${cmd};${effectiveParams.join(';')}`;
  return { cmd, response };
}

/**
 * Parse template text (file contents) and populate the settings store.
 * Does NOT send anything to the device.
 * Returns the number of commands successfully parsed.
 */
export function loadTemplateFromText(text: string): number {
  const settings = useSettingsStore.getState();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) return 0;

  // Accumulators — collect parsed data, then set into store at the end
  let apnData: ApnData | null = null;
  let serverData: ServerData | null = null;
  let buf20: Uint8Array | null = null;
  let buf21: Uint8Array | null = null;
  const wifiNetworks: WifiNetworkData[] = [];
  let filter = settings.gpsFilter;
  let msens = settings.gpsMsens;
  let tilt = settings.gpsTilt;
  const inputs: Map<number, InputParams> = new Map();
  let enc1: EncoderParams | null = null;
  let enc2: EncoderParams | null = null;
  const rsPorts: Map<string, RsPortParams> = new Map();
  const flsSensors: Map<number, LlsSettings> = new Map();
  const pumps: Map<number, PumpParams> = new Map();
  const pumpFormats: Map<number, PumpFormatParams> = new Map();
  let uim = settings.keyboardUim;
  let uimx = settings.keyboardUimx;
  let emstop = settings.securityEmstop;
  let tagcfg = settings.securityTagcfg;
  let bypass = settings.securityBypass;
  let pumpsec = settings.securityPumpsec;
  let printer = settings.printerSettings;
  let stationName: string | null = null;
  let phone: string | null = null;
  let website: string | null = null;

  let parsed = 0;

  for (const line of lines) {
    const lr = lineToResponse(line);
    if (!lr) continue;
    const { cmd, response } = lr;

    // Skip LOG;RESET and other non-setting commands
    if (cmd === 'LOG' || cmd === 'RESET') continue;

    // ---- Server ----
    if (cmd === 'APN') {
      apnData = parseApn(response);
      parsed++;
      continue;
    }
    if (/^SERVER\d+$/.test(cmd)) {
      serverData = parseServer(response);
      parsed++;
      continue;
    }

    // ---- Protocol ----
    if (cmd === 'PRSET20') {
      buf20 = parsePrsetResponse(response);
      if (buf20) parsed++;
      continue;
    }
    if (cmd === 'PRSET21') {
      buf21 = parsePrsetResponse(response);
      if (buf21) parsed++;
      continue;
    }

    // ---- WiFi ----
    if (/^WIFINET\d+$/.test(cmd)) {
      const net = parseWifiNetwork(response);
      if (net) { wifiNetworks.push(net); parsed++; }
      continue;
    }

    // ---- GPS ----
    if (cmd === 'FILTER') {
      filter = parseFilterResponse(response);
      if (filter) parsed++;
      continue;
    }
    if (cmd === 'MSENS') {
      msens = parseMsensResponse(response);
      if (msens) parsed++;
      continue;
    }
    if (cmd === 'TILT') {
      tilt = parseTiltResponse(response);
      if (tilt) parsed++;
      continue;
    }

    // ---- Inputs ----
    const inMatch = cmd.match(/^IN(\d+)$/);
    if (inMatch) {
      const idx = parseInt(inMatch[1], 10);
      const p = parseInputResponse(response);
      if (p) { inputs.set(idx, p); parsed++; }
      continue;
    }

    // ---- Encoders ----
    const encMatch = cmd.match(/^ENCODER(\d+)$/);
    if (encMatch) {
      const idx = parseInt(encMatch[1], 10);
      const p = parseEncoderResponse(response);
      if (p) {
        if (idx === 1) enc1 = p;
        else if (idx === 2) enc2 = p;
        parsed++;
      }
      continue;
    }

    // ---- RS Interfaces ----
    if (RS_PORTS.includes(cmd as RsPortName)) {
      const p = parseRsResponse(response, cmd as RsPortName);
      if (p) { rsPorts.set(cmd, p); parsed++; }
      continue;
    }

    // ---- FLS ----
    const llsMatch = cmd.match(/^LLS(\d+)$/);
    if (llsMatch) {
      const idx = parseInt(llsMatch[1], 10);
      const p = parseLlsSettings(response);
      if (p) { flsSensors.set(idx, p); parsed++; }
      continue;
    }

    // ---- Pumps ----
    const pumpMatch = cmd.match(/^PUMP(\d+)$/);
    if (pumpMatch) {
      const idx = parseInt(pumpMatch[1], 10);
      const p = parsePumpResponse(response);
      if (p) { pumps.set(idx, p); parsed++; }
      continue;
    }

    // ---- Pump Formats ----
    const pfMatch = cmd.match(/^PUMPFRMT(\d+)$/);
    if (pfMatch) {
      const idx = parseInt(pfMatch[1], 10);
      const p = parsePumpFormatResponse(response);
      if (p) { pumpFormats.set(idx, p); parsed++; }
      continue;
    }

    // ---- Keyboard ----
    if (cmd === 'UIM') {
      uim = parseUimResponse(response);
      if (uim) parsed++;
      continue;
    }
    if (cmd === 'UIMX') {
      uimx = parseUimxResponse(response);
      if (uimx) parsed++;
      continue;
    }

    // ---- Security ----
    if (cmd === 'EMSTOP') {
      emstop = parseEmstopResponse(response);
      if (emstop) parsed++;
      continue;
    }
    if (cmd === 'TAGCFG') {
      tagcfg = parseTagcfgResponse(response);
      if (tagcfg) parsed++;
      continue;
    }
    if (cmd === 'BYPASS') {
      bypass = parseBypassResponse(response);
      if (bypass) parsed++;
      continue;
    }
    if (cmd === 'PUMPSEC') {
      pumpsec = parsePumpsecResponse(response);
      if (pumpsec) parsed++;
      continue;
    }

    // ---- Printer ----
    if (cmd === 'PRINTER') {
      printer = parsePrinterResponse(response);
      if (printer) parsed++;
      continue;
    }
    if (cmd === 'PRNTN') {
      stationName = parsePrntnResponse(response) ?? '';
      parsed++;
      continue;
    }
    if (cmd === 'PRNTP') {
      phone = parsePrntpResponse(response) ?? '';
      parsed++;
      continue;
    }
    if (cmd === 'PRNTW') {
      website = parsePrntwResponse(response) ?? '';
      parsed++;
      continue;
    }
  }

  if (parsed === 0) return 0;

  // ---- Populate settings store ----

  if (apnData && serverData) {
    settings.setServerSettings(apnData, serverData);
  } else if (apnData) {
    settings.setServerSettings(apnData, settings.serverData ?? {
      serverProp: '0F', protoProp: '01', ip: '', port: '', login: '', pass: '',
      timeout1: '10', timeout2: '0', timeout3: '120', timeout4: '30',
      ipProto: '1', channel: '0', protocol: '1',
    });
  } else if (serverData) {
    settings.setServerSettings(settings.serverApn ?? { name: '', login: '', password: '' }, serverData);
  }

  if (buf20 || buf21) {
    settings.setProtocolSettings(
      buf20 ?? settings.protoBuf20 ?? new Uint8Array(16),
      buf21 ?? settings.protoBuf21 ?? new Uint8Array(16),
    );
  }

  if (wifiNetworks.length > 0) {
    settings.setWifiSettings(wifiNetworks);
  }

  if (filter || msens || tilt) {
    settings.setGpsSettings(
      filter ?? settings.gpsFilter ?? {
        dstEn: false, distance: '300', hdgEn: false, heading: '15',
        spdEn: false, minSpeed: '2', hspdEn: false, maxSpeed: '60',
        minTimeout: '1', drivingInterval: '120', parkingInterval: '120',
      },
      msens ?? settings.gpsMsens ?? {
        motionEn: false, motionThresh: '6', shockEn: false, shockThresh: '127', extra: ['0', '1', '0'],
      },
      tilt ?? settings.gpsTilt ?? { enable: false, threshold: '30' },
    );
  }

  if (inputs.size > 0 || enc1 || enc2) {
    const maxIdx = inputs.size > 0 ? Math.max(...inputs.keys()) : (settings.inputCount ?? 0);
    const count = Math.max(maxIdx, settings.inputCount ?? 0);
    const inputArr: InputParams[] = Array.from({ length: 6 }, (_, i) => {
      return inputs.get(i + 1) ?? settings.inputs?.[i] ?? { ...EMPTY_INPUT };
    });
    settings.setInputsSettings(
      count,
      inputArr,
      enc1 ?? settings.encoder1 ?? { ...EMPTY_ENCODER },
      enc2 ?? settings.encoder2 ?? { ...EMPTY_ENCODER, pinA: '3', pinB: '4' },
    );
  }

  if (rsPorts.size > 0) {
    const arr: RsPortParams[] = RS_PORTS.map((name, i) => {
      return rsPorts.get(name) ?? settings.rsPorts?.[i] ?? { deviceType: '0', baudRate: '9600', dataBits: '3', stopBits: '0', parity: '0', extra: [] };
    });
    const avail = RS_PORTS.map((name, i) => {
      return rsPorts.has(name) || (settings.rsAvailable?.[i] ?? true);
    });
    settings.setRsSettings(arr, avail);
  }

  if (flsSensors.size > 0) {
    const arr: LlsSettings[] = Array.from({ length: FLS_MAX_SENSORS }, (_, i) => {
      return flsSensors.get(i + 1) ?? settings.flsSensors?.[i] ?? { ...EMPTY_LLS };
    });
    settings.setFlsSettings(arr);
  }

  if (pumps.size > 0) {
    const arr: PumpParams[] = Array.from({ length: PUMP_COUNT }, (_, i) => {
      return pumps.get(i + 1) ?? settings.pumps?.[i] ?? { ...EMPTY_PUMP };
    });
    settings.setPumpsSettings(arr);
  }

  if (pumpFormats.size > 0) {
    const arr: PumpFormatParams[] = Array.from({ length: PUMP_COUNT }, (_, i) => {
      return pumpFormats.get(i + 1) ?? settings.pumpFormats?.[i] ?? { ...EMPTY_PUMP_FORMAT };
    });
    settings.setPumpFormats(arr);
  }

  if (uim || uimx) {
    settings.setKeyboardSettings(
      uim ?? settings.keyboardUim ?? { ...EMPTY_UIM },
      uimx ?? settings.keyboardUimx ?? { ...EMPTY_UIMX },
    );
  }

  if (emstop || tagcfg || bypass || pumpsec) {
    settings.setSecuritySettings(
      emstop ?? settings.securityEmstop ?? { ...EMPTY_EMSTOP },
      tagcfg ?? settings.securityTagcfg ?? { ...EMPTY_TAGCFG },
      bypass ?? settings.securityBypass ?? { ...EMPTY_BYPASS },
      pumpsec ?? settings.securityPumpsec ?? { ...EMPTY_PUMPSEC },
    );
  }

  if (printer || stationName != null || phone != null || website != null) {
    const existingText = settings.printerText ?? { stationName: '', phone: '', website: '' };
    settings.setPrinterSettings(
      printer ?? settings.printerSettings ?? { ...EMPTY_PRINTER },
      {
        stationName: stationName ?? existingText.stationName,
        phone: phone ?? existingText.phone,
        website: website ?? existingText.website,
      },
    );
  }

  return parsed;
}

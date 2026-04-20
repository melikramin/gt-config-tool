/**
 * Reads all device settings at once and populates the settings store.
 * Called after connect and via the "Read All" toolbar button.
 */

import { useSettingsStore } from '../stores/settingsStore';
import { useStatusStore } from '../stores/statusStore';
import { useConnectionStore } from '../stores/connectionStore';
import {
  buildApnReadCmd,
  buildServerReadCmd,
  buildPrset20GetCmd,
  buildPrset21GetCmd,
  buildWifiCountCmd,
  buildWifiNetReadCmd,
  buildFilterReadCmd,
  buildMsensReadCmd,
  buildTiltReadCmd,
  buildInCountCmd,
  buildInputReadCmd,
  buildEncoderReadCmd,
  buildRsReadCmd,
  buildLlsReadCmd,
  buildPumpReadCmd,
  buildPumpFormatReadCmd,
  buildUimReadCmd,
  buildUimxReadCmd,
  buildEmstopReadCmd,
  buildTagcfgReadCmd,
  buildBypassReadCmd,
  buildPumpsecReadCmd,
  buildPrinterReadCmd,
  buildPrntnReadCmd,
  buildPrntpReadCmd,
  buildPrntwReadCmd,
  buildCameraReadCmd,
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
  parseCameraResponse,
  parsePrsetResponse,
  parseInCount,
  EMPTY_INPUT,
  EMPTY_ENCODER,
  EMPTY_RS_PORT,
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
  EMPTY_CAMERA,
  CAMERA_SLOT_COUNT,
  PUMP_COUNT,
  FLS_MAX_SENSORS,
  WIFI_MAX_NETWORKS,
  RS_PORTS,
  type RsPortName,
  type InputParams,
  type RsPortParams,
  type LlsSettings,
  type PumpParams,
  type PumpFormatParams,
  type CameraParams,
} from './commands';
import {
  parseApn,
  parseServer,
  parseWifiCount,
  parseWifiNetwork,
  type WifiNetworkData,
} from './parsers';

function isErrorResponse(r: string): boolean {
  const t = r.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
}

function isPasswordError(r: string): boolean {
  return r.trim().endsWith(';PE');
}

function isFormatError(r: string): boolean {
  return r.trim().endsWith(';FE');
}

const MAX_INPUTS = 6;

interface ReadAllCallbacks {
  onPasswordError: () => Promise<void>;
  /** Optional: called with locale-aware step description */
  onStep?: (step: string) => void;
}

/**
 * Read all device settings sequentially and store in settingsStore.
 * Returns true if completed, false if aborted (password error / disconnect).
 */
export async function readAllSettings(callbacks: ReadAllCallbacks): Promise<boolean> {
  const settings = useSettingsStore.getState();
  const { password, isConnected } = useConnectionStore.getState();
  const status = useStatusStore.getState();

  if (!isConnected) return false;

  settings.setIsReadingAll(true);

  // Total steps for progress
  // Server:2, Protocol:2, WiFi:1+up to 5, GPS:3, IO:1+6+2, RS:6, FLS:6,
  // Pumps:4, PumpFmt:4, Keyboard:2, Security:4, Printer:4, Camera:CAMERA_SLOT_COUNT
  const TOTAL_STEPS = 52 + CAMERA_SLOT_COUNT;
  let step = 0;

  const progress = (text: string) => {
    step++;
    status.setProgress(Math.round((step / TOTAL_STEPS) * 100), text);
    callbacks.onStep?.(text);
  };

  try {
    // ---- Server ----
    progress('APN');
    const apnResp = await window.serial.sendCommand(buildApnReadCmd(password));
    if (isPasswordError(apnResp)) { await callbacks.onPasswordError(); return false; }
    const apnData = isErrorResponse(apnResp)
      ? { name: '', login: '', password: '' }
      : parseApn(apnResp);

    progress('SERVER1');
    const srv1Resp = await window.serial.sendCommand(buildServerReadCmd(password, 1));
    if (isPasswordError(srv1Resp)) { await callbacks.onPasswordError(); return false; }
    const serverData = isErrorResponse(srv1Resp)
      ? {
          serverProp: '0F', protoProp: '01', ip: '', port: '', login: '', pass: '',
          timeout1: '10', timeout2: '0', timeout3: '120', timeout4: '30',
          ipProto: '1', channel: '0', protocol: '1',
        }
      : parseServer(srv1Resp);

    settings.setServerSettings(apnData, serverData);

    // ---- Protocol ----
    progress('PRSET20');
    const resp20 = await window.serial.sendCommand(buildPrset20GetCmd(password));
    if (isPasswordError(resp20)) { await callbacks.onPasswordError(); return false; }
    const buf20 = (!isErrorResponse(resp20) && parsePrsetResponse(resp20)) || new Uint8Array(16);

    progress('PRSET21');
    const resp21 = await window.serial.sendCommand(buildPrset21GetCmd(password));
    if (isPasswordError(resp21)) { await callbacks.onPasswordError(); return false; }
    const buf21 = (!isErrorResponse(resp21) && parsePrsetResponse(resp21)) || new Uint8Array(16);

    settings.setProtocolSettings(buf20, buf21);

    // ---- WiFi ----
    progress('WIFINET');
    const wifiCountResp = await window.serial.sendCommand(buildWifiCountCmd(password));
    if (isPasswordError(wifiCountResp)) { await callbacks.onPasswordError(); return false; }
    const wifiCount = isErrorResponse(wifiCountResp) ? 0 : parseWifiCount(wifiCountResp);
    const wifiNetworks: WifiNetworkData[] = [];
    const maxWifi = Math.min(wifiCount, WIFI_MAX_NETWORKS);
    for (let i = 1; i <= maxWifi; i++) {
      progress(`WIFINET${i}`);
      const resp = await window.serial.sendCommand(buildWifiNetReadCmd(password, i));
      if (isPasswordError(resp)) { await callbacks.onPasswordError(); return false; }
      if (!isErrorResponse(resp)) {
        wifiNetworks.push(parseWifiNetwork(resp));
      }
    }
    // Account for skipped wifi steps in progress
    step += (WIFI_MAX_NETWORKS - maxWifi);
    settings.setWifiSettings(wifiNetworks);

    // ---- GPS ----
    progress('FILTER');
    const filterResp = await window.serial.sendCommand(buildFilterReadCmd(password));
    if (isPasswordError(filterResp)) { await callbacks.onPasswordError(); return false; }
    const filter = (!isErrorResponse(filterResp) && parseFilterResponse(filterResp)) || {
      dstEn: false, distance: '300', hdgEn: false, heading: '15',
      spdEn: false, minSpeed: '2', hspdEn: false, maxSpeed: '60',
      minTimeout: '1', drivingInterval: '120', parkingInterval: '120',
    };

    progress('MSENS');
    const msensResp = await window.serial.sendCommand(buildMsensReadCmd(password));
    if (isPasswordError(msensResp)) { await callbacks.onPasswordError(); return false; }
    const msens = (!isErrorResponse(msensResp) && parseMsensResponse(msensResp)) || {
      motionEn: false, motionThresh: '6', shockEn: false, shockThresh: '127', extra: ['0', '1', '0'],
    };

    progress('TILT');
    const tiltResp = await window.serial.sendCommand(buildTiltReadCmd(password));
    if (isPasswordError(tiltResp)) { await callbacks.onPasswordError(); return false; }
    const tilt = (!isErrorResponse(tiltResp) && parseTiltResponse(tiltResp)) || {
      enable: false, threshold: '30',
    };

    settings.setGpsSettings(filter, msens, tilt);

    // ---- Inputs/Outputs ----
    progress('IN');
    const inCountResp = await window.serial.sendCommand(buildInCountCmd(password));
    if (isPasswordError(inCountResp)) { await callbacks.onPasswordError(); return false; }
    const inputCount = isErrorResponse(inCountResp) ? 0 : Math.min(MAX_INPUTS, parseInCount(inCountResp));

    const inputs: InputParams[] = Array.from({ length: MAX_INPUTS }, () => ({ ...EMPTY_INPUT }));
    for (let i = 1; i <= inputCount; i++) {
      progress(`IN${i}`);
      const resp = await window.serial.sendCommand(buildInputReadCmd(password, i));
      if (isPasswordError(resp)) { await callbacks.onPasswordError(); return false; }
      if (!isErrorResponse(resp)) {
        const p = parseInputResponse(resp);
        if (p) inputs[i - 1] = p;
      }
    }
    step += (MAX_INPUTS - inputCount);

    progress('ENCODER1');
    const e1Resp = await window.serial.sendCommand(buildEncoderReadCmd(password, 1));
    if (isPasswordError(e1Resp)) { await callbacks.onPasswordError(); return false; }
    const enc1 = (!isErrorResponse(e1Resp) && parseEncoderResponse(e1Resp)) || { ...EMPTY_ENCODER };

    progress('ENCODER2');
    const e2Resp = await window.serial.sendCommand(buildEncoderReadCmd(password, 2));
    if (isPasswordError(e2Resp)) { await callbacks.onPasswordError(); return false; }
    const enc2 = (!isErrorResponse(e2Resp) && parseEncoderResponse(e2Resp)) || { ...EMPTY_ENCODER, pinA: '3', pinB: '4' };

    settings.setInputsSettings(inputCount, inputs, enc1, enc2);

    // ---- RS Interfaces ----
    const rsPorts: RsPortParams[] = [];
    const rsAvailable: boolean[] = [];
    for (let i = 0; i < RS_PORTS.length; i++) {
      const name = RS_PORTS[i] as RsPortName;
      progress(name);
      const resp = await window.serial.sendCommand(buildRsReadCmd(password, name));
      if (isPasswordError(resp)) { await callbacks.onPasswordError(); return false; }
      if (isFormatError(resp)) {
        rsPorts.push({ ...EMPTY_RS_PORT, extra: [] });
        rsAvailable.push(false);
        continue;
      }
      if (isErrorResponse(resp)) {
        rsPorts.push({ ...EMPTY_RS_PORT, extra: [] });
        rsAvailable.push(true);
        continue;
      }
      const p = parseRsResponse(resp, name);
      rsPorts.push(p || { ...EMPTY_RS_PORT, extra: [] });
      rsAvailable.push(true);
    }
    settings.setRsSettings(rsPorts, rsAvailable);

    // ---- FLS (Level sensors) ----
    const flsSensors: LlsSettings[] = [];
    for (let i = 1; i <= FLS_MAX_SENSORS; i++) {
      progress(`LLS${i}`);
      const resp = await window.serial.sendCommand(buildLlsReadCmd(password, i));
      if (isPasswordError(resp)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(resp)) {
        flsSensors.push({ ...EMPTY_LLS });
        continue;
      }
      const p = parseLlsSettings(resp);
      flsSensors.push(p || { ...EMPTY_LLS });
    }
    settings.setFlsSettings(flsSensors);

    // ---- Pumps ----
    const pumps: PumpParams[] = [];
    for (let i = 1; i <= PUMP_COUNT; i++) {
      progress(`PUMP${i}`);
      const resp = await window.serial.sendCommand(buildPumpReadCmd(password, i));
      if (isPasswordError(resp)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(resp)) {
        pumps.push({ ...EMPTY_PUMP });
        continue;
      }
      const p = parsePumpResponse(resp);
      pumps.push(p || { ...EMPTY_PUMP });
    }
    settings.setPumpsSettings(pumps);

    // ---- Pump Formats ----
    const pumpFormats: PumpFormatParams[] = [];
    for (let i = 1; i <= PUMP_COUNT; i++) {
      progress(`PUMPFRMT${i}`);
      const resp = await window.serial.sendCommand(buildPumpFormatReadCmd(password, i));
      if (isPasswordError(resp)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(resp)) {
        pumpFormats.push({ ...EMPTY_PUMP_FORMAT });
        continue;
      }
      const f = parsePumpFormatResponse(resp);
      pumpFormats.push(f || { ...EMPTY_PUMP_FORMAT });
    }
    settings.setPumpFormats(pumpFormats);

    // ---- Keyboard (UIM / UIMX) ----
    progress('UIM');
    const uimResp = await window.serial.sendCommand(buildUimReadCmd(password));
    if (isPasswordError(uimResp)) { await callbacks.onPasswordError(); return false; }
    const uim = (!isErrorResponse(uimResp) && parseUimResponse(uimResp)) || { ...EMPTY_UIM };

    progress('UIMX');
    const uimxResp = await window.serial.sendCommand(buildUimxReadCmd(password));
    if (isPasswordError(uimxResp)) { await callbacks.onPasswordError(); return false; }
    const uimx = (!isErrorResponse(uimxResp) && parseUimxResponse(uimxResp)) || { ...EMPTY_UIMX };

    settings.setKeyboardSettings(uim, uimx);

    // ---- Security (EMSTOP / TAGCFG / BYPASS / PUMPSEC) ----
    progress('EMSTOP');
    const emstopResp = await window.serial.sendCommand(buildEmstopReadCmd(password));
    if (isPasswordError(emstopResp)) { await callbacks.onPasswordError(); return false; }
    const emstop = (!isErrorResponse(emstopResp) && parseEmstopResponse(emstopResp)) || { ...EMPTY_EMSTOP };

    progress('TAGCFG');
    const tagcfgResp = await window.serial.sendCommand(buildTagcfgReadCmd(password));
    if (isPasswordError(tagcfgResp)) { await callbacks.onPasswordError(); return false; }
    const tagcfg = (!isErrorResponse(tagcfgResp) && parseTagcfgResponse(tagcfgResp)) || { ...EMPTY_TAGCFG };

    progress('BYPASS');
    const bypassResp = await window.serial.sendCommand(buildBypassReadCmd(password));
    if (isPasswordError(bypassResp)) { await callbacks.onPasswordError(); return false; }
    const bypass = (!isErrorResponse(bypassResp) && parseBypassResponse(bypassResp)) || { ...EMPTY_BYPASS };

    progress('PUMPSEC');
    const pumpsecResp = await window.serial.sendCommand(buildPumpsecReadCmd(password));
    if (isPasswordError(pumpsecResp)) { await callbacks.onPasswordError(); return false; }
    const pumpsec = (!isErrorResponse(pumpsecResp) && parsePumpsecResponse(pumpsecResp)) || { ...EMPTY_PUMPSEC };

    settings.setSecuritySettings(emstop, tagcfg, bypass, pumpsec);

    // ---- Printer ----
    progress('PRINTER');
    const printerResp = await window.serial.sendCommand(buildPrinterReadCmd(password));
    if (isPasswordError(printerResp)) { await callbacks.onPasswordError(); return false; }
    const printerSettings = (!isErrorResponse(printerResp) && parsePrinterResponse(printerResp)) || { ...EMPTY_PRINTER };

    progress('PRNTN');
    const prntnResp = await window.serial.sendCommand(buildPrntnReadCmd(password));
    if (isPasswordError(prntnResp)) { await callbacks.onPasswordError(); return false; }
    const stationName = isErrorResponse(prntnResp) ? '' : (parsePrntnResponse(prntnResp) ?? '');

    progress('PRNTP');
    const prntpResp = await window.serial.sendCommand(buildPrntpReadCmd(password));
    if (isPasswordError(prntpResp)) { await callbacks.onPasswordError(); return false; }
    const phone = isErrorResponse(prntpResp) ? '' : (parsePrntpResponse(prntpResp) ?? '');

    progress('PRNTW');
    const prntwResp = await window.serial.sendCommand(buildPrntwReadCmd(password));
    if (isPasswordError(prntwResp)) { await callbacks.onPasswordError(); return false; }
    const website = isErrorResponse(prntwResp) ? '' : (parsePrntwResponse(prntwResp) ?? '');

    settings.setPrinterSettings(printerSettings, { stationName, phone, website });

    // ---- Cameras ----
    const cameras: Array<CameraParams | null> = Array.from({ length: CAMERA_SLOT_COUNT }, () => null);
    for (let i = 0; i < CAMERA_SLOT_COUNT; i++) {
      progress(`CAMERA${i}`);
      const resp = await window.serial.sendCommand(buildCameraReadCmd(password, i));
      if (isPasswordError(resp)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(resp)) {
        cameras[i] = { ...EMPTY_CAMERA };
        continue;
      }
      const parsed = parseCameraResponse(resp);
      cameras[i] = parsed ? parsed.params : { ...EMPTY_CAMERA };
    }
    settings.setCameras(cameras);

    return true;
  } catch (err) {
    status.setLastError(`Read error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    settings.setIsReadingAll(false);
    status.clearProgress();
  }
}

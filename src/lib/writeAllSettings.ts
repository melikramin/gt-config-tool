/**
 * Writes all device settings at once from the settings store.
 * Called via the "Write Settings" toolbar button.
 * Skips the Tags tab (written separately).
 */

import { useSettingsStore } from '../stores/settingsStore';
import { useStatusStore } from '../stores/statusStore';
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
  RS_WRITE_TIMEOUT_MS,
  type RsPortName,
  type WifiNetworkParams,
} from './commands';

function isErrorResponse(r: string): boolean {
  const t = r.trim();
  return t.endsWith(';CE') || t.endsWith(';PE') || t.endsWith(';FE') || t.endsWith(';DE');
}

function isPasswordError(r: string): boolean {
  return r.trim().endsWith(';PE');
}

interface WriteAllCallbacks {
  onPasswordError: () => Promise<void>;
}

/**
 * Write all device settings sequentially from settingsStore.
 * Returns true if completed, false if aborted (password error / disconnect / no data).
 */
export async function writeAllSettings(callbacks: WriteAllCallbacks): Promise<boolean> {
  const settings = useSettingsStore.getState();
  const { password, isConnected, deviceImei } = useConnectionStore.getState();
  const status = useStatusStore.getState();

  if (!isConnected) return false;

  // Check that we have data to write (readAll must have been done first)
  if (!settings.serverApn && !settings.gpsFilter && !settings.protoBuf20) {
    return false;
  }

  settings.setIsWritingAll(true);

  // Approximate total steps for progress bar
  // Server:2, Protocol:2, WiFi:up to 5, GPS:3, IO:up to 6+2, RS:6, FLS:6,
  // Pumps:4, PumpFmt:4, Keyboard:2, Security:4, Printer:4, LogReset:1
  const TOTAL_STEPS = 51;
  let step = 0;
  let errors: string[] = [];

  const progress = (text: string) => {
    step++;
    status.setProgress(Math.round((step / TOTAL_STEPS) * 100), text);
  };

  const send = async (cmd: string, timeout?: number): Promise<string> => {
    return window.serial.sendCommand(cmd, timeout);
  };

  try {
    // ---- Server ----
    if (settings.serverApn && settings.serverData) {
      const apn = settings.serverApn;
      const srv = settings.serverData;

      progress('APN');
      const apnResp = await send(buildApnWriteCmd(password, apn.name, apn.login, apn.password));
      if (isPasswordError(apnResp)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(apnResp)) errors.push(`APN: ${apnResp.trim()}`);

      progress('SERVER1');
      const srvResp = await send(buildServerWriteCmd(
        password, 1, srv.ip, srv.port, deviceImei || 'IMEI',
        srv.channel, srv.protocol,
      ));
      if (isPasswordError(srvResp)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(srvResp)) errors.push(`SERVER1: ${srvResp.trim()}`);
    } else {
      step += 2;
    }

    // ---- Protocol ----
    if (settings.protoBuf20 && settings.protoBuf21) {
      progress('PRSET20');
      const r20 = await send(buildPrset20SetCmd(password, bytesToHex(settings.protoBuf20)));
      if (isPasswordError(r20)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r20)) errors.push(`PRSET20: ${r20.trim()}`);

      progress('PRSET21');
      const r21 = await send(buildPrset21SetCmd(password, bytesToHex(settings.protoBuf21)));
      if (isPasswordError(r21)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r21)) errors.push(`PRSET21: ${r21.trim()}`);
    } else {
      step += 2;
    }

    // ---- WiFi ----
    if (settings.wifiNetworks && settings.wifiNetworks.length > 0) {
      for (let i = 0; i < settings.wifiNetworks.length; i++) {
        const net = settings.wifiNetworks[i];
        progress(`WIFINET${i + 1}`);
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
        const resp = await send(buildWifiNetWriteCmd(password, i + 1, params));
        if (isPasswordError(resp)) { await callbacks.onPasswordError(); return false; }
        if (isErrorResponse(resp)) errors.push(`WIFINET${i + 1}: ${resp.trim()}`);
      }
      step += (5 - settings.wifiNetworks.length); // account for skipped steps
    } else {
      step += 5;
    }

    // ---- GPS ----
    if (settings.gpsFilter) {
      progress('FILTER');
      const r = await send(buildFilterWriteCmd(password, settings.gpsFilter));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`FILTER: ${r.trim()}`);
    } else { step++; }

    if (settings.gpsMsens) {
      progress('MSENS');
      const r = await send(buildMsensWriteCmd(password, settings.gpsMsens));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`MSENS: ${r.trim()}`);
    } else { step++; }

    if (settings.gpsTilt) {
      progress('TILT');
      const r = await send(buildTiltWriteCmd(password, settings.gpsTilt));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`TILT: ${r.trim()}`);
    } else { step++; }

    // ---- Inputs/Outputs ----
    if (settings.inputs && settings.inputCount != null) {
      for (let i = 0; i < settings.inputCount; i++) {
        progress(`IN${i + 1}`);
        const r = await send(buildInputWriteCmd(password, i + 1, settings.inputs[i]));
        if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
        if (isErrorResponse(r)) errors.push(`IN${i + 1}: ${r.trim()}`);
      }
      step += (6 - settings.inputCount);
    } else {
      step += 6;
    }

    if (settings.encoder1) {
      progress('ENCODER1');
      const r = await send(buildEncoderWriteCmd(password, 1, settings.encoder1));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`ENCODER1: ${r.trim()}`);
    } else { step++; }

    if (settings.encoder2) {
      progress('ENCODER2');
      const r = await send(buildEncoderWriteCmd(password, 2, settings.encoder2));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`ENCODER2: ${r.trim()}`);
    } else { step++; }

    // ---- RS Interfaces ----
    if (settings.rsPorts && settings.rsAvailable) {
      for (let i = 0; i < RS_PORTS.length; i++) {
        const name = RS_PORTS[i] as RsPortName;
        progress(name);
        if (!settings.rsAvailable[i]) continue; // port not available on hardware
        const r = await send(
          buildRsWriteCmd(password, name, settings.rsPorts[i]),
          RS_WRITE_TIMEOUT_MS,
        );
        if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
        if (isErrorResponse(r)) errors.push(`${name}: ${r.trim()}`);
      }
    } else {
      step += 6;
    }

    // ---- FLS (Level sensors) ----
    if (settings.flsSensors) {
      for (let i = 0; i < settings.flsSensors.length; i++) {
        progress(`LLS${i + 1}`);
        const r = await send(buildLlsWriteCmd(password, i + 1, settings.flsSensors[i]));
        if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
        if (isErrorResponse(r)) errors.push(`LLS${i + 1}: ${r.trim()}`);
      }
    } else {
      step += 6;
    }

    // ---- Pumps ----
    if (settings.pumps) {
      for (let i = 0; i < settings.pumps.length; i++) {
        progress(`PUMP${i + 1}`);
        const r = await send(buildPumpWriteCmd(password, i + 1, settings.pumps[i]));
        if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
        if (isErrorResponse(r)) errors.push(`PUMP${i + 1}: ${r.trim()}`);
      }
    } else {
      step += 4;
    }

    // ---- Pump Formats ----
    if (settings.pumpFormats) {
      for (let i = 0; i < settings.pumpFormats.length; i++) {
        progress(`PUMPFRMT${i + 1}`);
        const r = await send(buildPumpFormatWriteCmd(password, i + 1, settings.pumpFormats[i]));
        if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
        if (isErrorResponse(r)) errors.push(`PUMPFRMT${i + 1}: ${r.trim()}`);
      }
    } else {
      step += 4;
    }

    // ---- Keyboard (UIM / UIMX) ----
    if (settings.keyboardUim) {
      progress('UIM');
      const r = await send(buildUimWriteCmd(password, settings.keyboardUim));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`UIM: ${r.trim()}`);
    } else { step++; }

    if (settings.keyboardUimx) {
      progress('UIMX');
      const r = await send(buildUimxWriteCmd(password, settings.keyboardUimx));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`UIMX: ${r.trim()}`);
    } else { step++; }

    // ---- Security ----
    if (settings.securityEmstop) {
      progress('EMSTOP');
      const r = await send(buildEmstopWriteCmd(password, settings.securityEmstop));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`EMSTOP: ${r.trim()}`);
    } else { step++; }

    if (settings.securityTagcfg) {
      progress('TAGCFG');
      const r = await send(buildTagcfgWriteCmd(password, settings.securityTagcfg));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`TAGCFG: ${r.trim()}`);
    } else { step++; }

    if (settings.securityBypass) {
      progress('BYPASS');
      const r = await send(buildBypassWriteCmd(password, settings.securityBypass));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`BYPASS: ${r.trim()}`);
    } else { step++; }

    if (settings.securityPumpsec) {
      progress('PUMPSEC');
      const r = await send(buildPumpsecWriteCmd(password, settings.securityPumpsec));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`PUMPSEC: ${r.trim()}`);
    } else { step++; }

    // ---- Printer ----
    if (settings.printerSettings) {
      progress('PRINTER');
      const r = await send(buildPrinterWriteCmd(password, settings.printerSettings));
      if (isPasswordError(r)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r)) errors.push(`PRINTER: ${r.trim()}`);
    } else { step++; }

    if (settings.printerText) {
      progress('PRNTN');
      const r1 = await send(buildPrntnWriteCmd(password, settings.printerText.stationName));
      if (isPasswordError(r1)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r1)) errors.push(`PRNTN: ${r1.trim()}`);

      progress('PRNTP');
      const r2 = await send(buildPrntpWriteCmd(password, settings.printerText.phone));
      if (isPasswordError(r2)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r2)) errors.push(`PRNTP: ${r2.trim()}`);

      progress('PRNTW');
      const r3 = await send(buildPrntwWriteCmd(password, settings.printerText.website));
      if (isPasswordError(r3)) { await callbacks.onPasswordError(); return false; }
      if (isErrorResponse(r3)) errors.push(`PRNTW: ${r3.trim()}`);
    } else {
      step += 3;
    }

    // ---- LOG;RESET after writing RS/Server ----
    progress('LOG;RESET');
    await send(buildLogResetCmd(password));

    if (errors.length > 0) {
      status.setLastError(`Write errors: ${errors.join(', ')}`);
    }

    return errors.length === 0;
  } catch (err) {
    status.setLastError(`Write error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    settings.setIsWritingAll(false);
    status.clearProgress();
  }
}

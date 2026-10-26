import { describe, it, expect } from 'vitest';
import { parseRep, parseVer, parseServer, parseEthInfo, parseEthSettings, ethStatusText } from './parsers';
import { buildGt2ServerWriteCmd, gt2ServerChannel, buildGt2PollingCommands, parseRsResponse, buildEthWriteCmd, buildEthReadCmd, buildEthInfoCmd } from './commands';
import { isGt2, hasEthernet } from '../types/device';
import { visibleTabs } from '../components/layout/Sidebar';

describe('GT-2 detection', () => {
  it('maps HW_TYPE 95 to GT-2', () => {
    const ver = parseVer('$VER;95;01.00;04.95;02.00;11.10.26');
    expect(ver.hardwareType).toBe('95');
    expect(ver.deviceName).toBe('GT-2');
    expect(ver.firmwareVersion).toBe('04.95');
    expect(isGt2(ver.hardwareType)).toBe(true);
  });

  it('maps HW_TYPE 96 to GT-4 and treats it as GT-2 family', () => {
    const ver = parseVer('$VER;96;01.00;04.96;02.00;11.10.26');
    expect(ver.deviceName).toBe('GT-4');
    expect(isGt2(ver.hardwareType)).toBe(true);
    expect(visibleTabs('96')).toContain('wifi');
    expect(visibleTabs('96')).toContain('ethernet');
    expect(hasEthernet('96')).toBe(true);
  });

  it('hides Ethernet on GT-2 (no ETH command) and on GT-9', () => {
    expect(hasEthernet('95')).toBe(false);
    expect(visibleTabs('95')).not.toContain('ethernet');
    expect(visibleTabs('95')).toContain('wifi');
    expect(visibleTabs('24')).not.toContain('ethernet');
    expect(visibleTabs('96').filter((id) => id !== 'ethernet')).toEqual(visibleTabs('95'));
  });

  it('does not treat other models or unknown type as GT-2', () => {
    expect(isGt2('24')).toBe(false);
    expect(isGt2('')).toBe(false);
  });
});

describe('GT-2 REP', () => {
  const rep = parseRep(
    '$REP;GT2X;0000;201026;065245;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;12177;4331;+32;-128;0,0;NA;NA;00;+0;000000000000',
  );

  it('reads model name, power, battery and internal temperature', () => {
    expect(rep.model).toBe('GT2X');
    expect(rep.extBattery).toBe('12177');
    expect(rep.intBattery).toBe('4331');
    expect(rep.intTemp).toBe('+32');
  });

  it('polls only REP', () => {
    expect(buildGt2PollingCommands('1234')).toEqual(['$1234;REP']);
  });
});

describe('GT-2 SERVER', () => {
  it('builds the WiFi example command', () => {
    expect(buildGt2ServerWriteCmd('1234', 1, '192.168.4.1', '5050', '1'))
      .toBe('$1234;SERVER1;SET;07;00;192.168.4.1;5050;;;;0;10;5;1;1;6;1');
  });

  it('builds the Ethernet example command', () => {
    expect(buildGt2ServerWriteCmd('1234', 1, '192.168.8.10', '5050', '4'))
      .toBe('$1234;SERVER1;SET;07;00;192.168.8.10;5050;;;;0;10;5;1;4;6;1');
  });

  it('replaces GSM channels with WiFi (no GSM modem)', () => {
    expect(gt2ServerChannel('0')).toBe('1');
    expect(gt2ServerChannel('')).toBe('1');
    expect(gt2ServerChannel('3')).toBe('1');
    expect(gt2ServerChannel('4')).toBe('4');
    expect(gt2ServerChannel('6')).toBe('6');
    expect(buildGt2ServerWriteCmd('1234', 1, '1.2.3.4', '5050', '0'))
      .toBe('$1234;SERVER1;SET;07;00;1.2.3.4;5050;;;;0;10;5;1;1;6;1');
  });

  it('parses a real GT-2 SERVER1 response', () => {
    const srv = parseServer('$SERVER1;07;00;192.196.2.1;2222;;;120;0;10;5;1;1;6;1');
    expect(srv.ip).toBe('192.196.2.1');
    expect(srv.port).toBe('2222');
    expect(srv.channel).toBe('1');
    expect(srv.protocol).toBe('6');
  });

  it('parses channel and protocol from the GT-2 layout', () => {
    const srv = parseServer('$SERVER1;07;00;192.168.8.10;5050;;;;0;10;5;1;4;6;1');
    expect(srv.ip).toBe('192.168.8.10');
    expect(srv.port).toBe('5050');
    expect(srv.channel).toBe('4');
    expect(srv.protocol).toBe('6');
  });
});

describe('GT-2 RS ports', () => {
  it('parses both ports with the GT2 slave type', () => {
    expect(parseRsResponse('$RS232;51;19200;3;0;0', 'RS232')?.deviceType).toBe('51');
    expect(parseRsResponse('$RS485;51;19200;3;0;0', 'RS485')?.deviceType).toBe('51');
  });
});

describe('GT-2 tabs', () => {
  it('shows only the GT-2 tab set', () => {
    expect(visibleTabs('95')).toEqual([
      'status', 'diagnostics', 'server', 'wifi', 'rs-interfaces', 'system',
    ]);
  });

  it('shows only Status with no device connected', () => {
    expect(visibleTabs('', false)).toEqual(['status']);
    expect(visibleTabs('95', false)).toEqual(['status']);
  });

  it('hides Ethernet for other devices', () => {
    expect(visibleTabs('24')).not.toContain('ethernet');
    expect(visibleTabs('')).not.toContain('ethernet');
    expect(visibleTabs('24')).toContain('pumps');
  });
});

describe('ETH', () => {
  it('builds read commands', () => {
    expect(buildEthInfoCmd('1234')).toBe('$1234;ETH');
    expect(buildEthReadCmd('1234')).toBe('$1234;ETH;GET');
  });

  it('parses live info', () => {
    const info = parseEthInfo('$ETH;1;1;ff;02:36:06:18:39:21;192.168.8.168;255.255.255.0;192.168.8.1;192.168.8.1;43200');
    expect(info.enabled).toBe('1');
    expect(info.status).toBe('ff');
    expect(info.mac).toBe('02:36:06:18:39:21');
    expect(info.ip).toBe('192.168.8.168');
    expect(info.gateway).toBe('192.168.8.1');
    expect(info.leaseTime).toBe('43200');
  });

  it('parses stored settings', () => {
    const s = parseEthSettings('$ETH;1;1;192.168.1.100;255.255.255.0;192.168.1.1;8.8.8.8;8.8.4.4');
    expect(s).toEqual({
      enabled: '1', dhcp: '1', ip: '192.168.1.100', mask: '255.255.255.0',
      gateway: '192.168.1.1', dns1: '8.8.8.8', dns2: '8.8.4.4',
    });
  });

  it('builds write commands', () => {
    const empty = { enabled: '0', dhcp: '1', ip: '', mask: '', gateway: '', dns1: '', dns2: '' };
    expect(buildEthWriteCmd('1234', empty)).toBe('$1234;ETH;SET;0;1');
    expect(buildEthWriteCmd('1234', {
      enabled: '1', dhcp: '0', ip: '192.168.1.100', mask: '255.255.255.0',
      gateway: '192.168.1.1', dns1: '8.8.8.8', dns2: '8.8.4.4',
    })).toBe('$1234;ETH;SET;1;0;192.168.1.100;255.255.255.0;192.168.1.1;8.8.8.8;8.8.4.4');
  });

  it('describes status bits', () => {
    expect(ethStatusText('ff', 'en')).toBe('Server connected (100 Mbps, full duplex)');
    expect(ethStatusText('03', 'en')).toBe('No link');
    expect(ethStatusText('00', 'ru')).toBe('Нет модуля');
  });
});

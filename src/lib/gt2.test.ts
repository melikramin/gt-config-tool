import { describe, it, expect } from 'vitest';
import { parseRep, parseVer, parseServer } from './parsers';
import { buildGt2ServerWriteCmd, buildGt2PollingCommands, parseRsResponse } from './commands';
import { isGt2 } from '../types/device';
import { visibleTabs } from '../components/layout/Sidebar';

describe('GT-2 detection', () => {
  it('maps HW_TYPE 95 to GT-2', () => {
    const ver = parseVer('$VER;95;01.00;04.95;02.00;11.10.26');
    expect(ver.hardwareType).toBe('95');
    expect(ver.deviceName).toBe('GT-2');
    expect(ver.firmwareVersion).toBe('04.95');
    expect(isGt2(ver.hardwareType)).toBe(true);
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
      'status', 'diagnostics', 'server', 'wifi', 'ethernet', 'rs-interfaces', 'system',
    ]);
  });

  it('hides Ethernet for other devices', () => {
    expect(visibleTabs('24')).not.toContain('ethernet');
    expect(visibleTabs('')).not.toContain('ethernet');
    expect(visibleTabs('24')).toContain('pumps');
  });
});

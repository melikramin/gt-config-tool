# GT-9 Configurator v2.0

Desktop application for configuring Geotek GT-series devices (GT-9, GT-1, GT-3, GT-7) via USB COM port.

## Tech Stack

- **Runtime:** Electron 33+
- **UI:** React 18+ with TypeScript (strict mode)
- **Styling:** Tailwind CSS 3
- **UI Components:** shadcn/ui
- **Tables:** TanStack Table v8 (with virtual scrolling for 20k+ rows)
- **Serial:** `serialport` npm package (v12+)
- **Build:** Vite + electron-builder
- **State:** Zustand for global state (connection, device info)
- **Package manager:** npm

## Project Structure

```
gt9-configurator/
├── electron/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # IPC bridge (contextBridge)
│   └── serial/
│       ├── SerialManager.ts # SerialPort wrapper, command queue
│       └── protocol.ts      # Command builder/parser
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Toolbar.tsx       # COM port, connect, password, template buttons
│   │   │   ├── Sidebar.tsx       # Tab navigation (14 tabs)
│   │   │   └── StatusBar.tsx     # Connection status, progress bar, errors
│   │   ├── tabs/
│   │   │   ├── StatusTab.tsx
│   │   │   ├── DiagnosticsTab.tsx
│   │   │   ├── ServerTab.tsx
│   │   │   ├── ProtocolTab.tsx
│   │   │   ├── WifiTab.tsx
│   │   │   ├── GpsTab.tsx
│   │   │   ├── InputsOutputsTab.tsx
│   │   │   ├── RsInterfacesTab.tsx
│   │   │   ├── FlsTab.tsx
│   │   │   ├── PumpsTab.tsx
│   │   │   ├── KeyboardTab.tsx
│   │   │   ├── SecurityTab.tsx
│   │   │   ├── PrinterTab.tsx
│   │   │   └── TagsTab.tsx
│   │   └── common/
│   │       ├── FormField.tsx     # Reusable form field wrapper
│   │       ├── DropdownField.tsx
│   │       ├── CheckboxField.tsx
│   │       └── ProgressBar.tsx
│   ├── hooks/
│   │   ├── useSerial.ts         # Serial port hook (send, receive, status)
│   │   ├── usePolling.ts        # Cyclic polling for Status tab
│   │   └── useTemplate.ts       # Template save/load
│   ├── lib/
│   │   ├── commands.ts          # Command constants & builders
│   │   ├── parsers.ts           # Response parsers for each command
│   │   ├── protocol.ts          # PRSET bitmask encode/decode
│   │   ├── templates.ts         # .gtcfg file read/write
│   │   ├── unicode.ts           # UTF-16LE hex encode/decode for printer
│   │   └── constants.ts         # Device types, baud rates, etc.
│   ├── stores/
│   │   ├── connectionStore.ts   # Zustand: port, connected, password, device info
│   │   └── statusStore.ts       # Zustand: live status data from polling
│   └── types/
│       ├── device.ts            # Device config types
│       ├── commands.ts          # Command/response types
│       └── serial.ts            # Serial port types
├── docs/
│   ├── commands.md              # Full command protocol reference
│   └── GT9_Configurator_TZ.md   # Technical specification (Russian)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
├── tailwind.config.ts
└── CLAUDE.md                    # This file
```

## Communication Protocol

### Format
```
Request:  $<PASSWORD>;<COMMAND>[;<PARAMS>]\r\n
Response: $<COMMAND>;<DATA>\r\n
```

- Default password: `1234`
- Field separator: `;`
- Sub-field separator: `,`
- Data protocol: **CTR only** (DATA_PROTO_TYPE = 1)
- Line ending: `\r\n`

### Response Codes
| Code | Meaning |
|------|---------|
| `OK` | Success |
| `CE` | Command Error |
| `DE` | Data Error / End of data |
| `PE` | Password Error |
| `FE` | Format Error |

### Serial Communication Architecture

All serial communication goes through Electron main process via IPC:

```
React Component → IPC invoke → SerialManager → COM port
                 ← IPC reply ←              ← Response
```

**SerialManager** must implement:
- Command queue (sequential execution, one command at a time)
- Configurable timeout per command (default 2s, RS ports 10s)
- Response matching (match response prefix to sent command)
- Auto-reconnect on disconnect
- Raw data forwarding for Diagnostics tab

```typescript
// Key interface
interface SerialManager {
  connect(port: string, baudRate: number): Promise<void>;
  disconnect(): Promise<void>;
  sendCommand(cmd: string, timeout?: number): Promise<string>;
  startPolling(commands: string[], intervalMs: number): void;
  stopPolling(): void;
  onRawData(callback: (data: string) => void): void;
  listPorts(): Promise<PortInfo[]>;
}
```

### Timeouts
| Operation | Timeout |
|-----------|---------|
| Normal command | 2 sec |
| RS port configuration | 5-10 sec |
| Tag reading (per command) | 2 sec |
| Calibration point (per command) | 2 sec |

## Tabs Overview

### Tab 1: Status (read-only, cyclic polling)

**Polling commands** (sent in loop every ~1-2 sec):
```
DEV → GSM → VER → DATE → REP → FUEL → IN → OUT → LLS1..LLS6 → ENCODER1;GET → ENCODER2;GET → TAGS
```

**Panels:**
1. **Identification:** Series (DEV→DEV_ID), IMEI (GSM→IMEI), Firmware (VER→FW_VERSION+DATE), Device (VER→HW_TYPE mapped to name)
2. **Status:** Time (DATE), Power mV (REP→EXT_BAT), Lat/Lon (REP), Satellites (REP→SATINUSE), GSM status/RSSI (GSM), WiFi status/RSSI (REP), Internal temp (REP→INT_TEMP)
3. **Pumps:** P1-P4 dose + C1-C4 totalizer from FUEL. Color: red=inactive, green=active
4. **Inputs/Outputs:** IN1-IN6 values, E1/E2 encoder counters, OUT1-OUT4 with ON/OFF buttons (`OUTn;;1` / `OUTn;;0`)
5. **Level Sensors:** LLS1-LLS6 live data (height mm, volume L, temp °C, density kg/m³)
6. **Cards:** Last tag (REP→LAST_TAG_ID), Memory/Limit/Added (TAGS), Add button (`TAGS;ADD;TAG_ID`)

### Tab 2: Diagnostics (terminal)

- Raw COM port log display (auto-scroll)
- Manual command input field + Send button
- Log channel checkboxes (13 channels via LOG command)
- Timestamp toggle: `LOG;TS;1` / `LOG;TS;0`
- PUMP uses debug channel: `LOG;;27` (double semicolon)
- Buttons: Clear (UI), Save to file, Copy all

### Tab 3: Server Settings

**Read:** `APN` + `SERVER1;GET`
**Write:** `APN;name;login;pass` + `SERVER1;SET;...` + `LOG;RESET`

Fields: APN (name/login/pass), Server (IP/hostname, port, channel dropdown, protocol dropdown).
Hidden fields auto-filled on write: SERVER_PROP=0F, PROTO_PROP=01 (00 for tsense), LOGIN/PASS=device IMEI, timeouts=10/0/120/30, IP_PROTO=1.

### Tab 4: Protocol

CTR protocol only. Checkboxes for protocol fields in 5 columns (Status, Inputs, Outputs, DUT, DUT NPP).

**Read:** `PRSET20;GET` + `PRSET21;GET` → decode bitmask → set checkboxes
**Write:** encode checkboxes → `PRSET20;SET;{hex}` + `PRSET21;SET;{hex}`

Tag IDs: Status(0x0E,0x0F,0x17,0x20,0x21,0x24,0x32,0x31), Inputs(0x50-0x57), Outputs(0x60-0x63), DUT(0x70-0x75), DUT_NPP(0x78-0x7D).

### Tab 5: WiFi Settings

**Multiple networks** (unlike old configurator with single network).

**Read:** `WIFINET` → count, then `WIFINETn;GET` for each
**Add:** `WIFINET;ADD;CHANNEL;SSID;AUTH;ENCRYPT;KEY;IP_MODE;IP;MASK;GW;DNS1;DNS2`
**Edit:** `WIFINET;EDIT;IDX;...`
**Delete:** `WIFINET;DEL;IDX` or `WIFINET;DEL;ALL`

IP fields hidden when DHCP=1.

### Tab 6: GPS/GLONASS

**Read:** `FILTER` + `MSENS;GET` + `TILT;GET`
**Write:** `FILTER;DST_EN,DST;HDG_EN,HDG;SPD_EN,SPD;HSPD_EN,HSPD;MIN_TOUT;DRIVE_INT;PARK_INT` + `MSENS;SET;...` + `TILT;SET;...`

GPS panel: 4 checkbox+number pairs (distance/heading/min speed/max speed) + 3 numbers (min timeout, driving interval, parking interval).
Accelerometer panel: motion enable+threshold, shock enable+threshold, tilt enable+threshold.

### Tab 7: Inputs/Outputs

**Read:** `IN1`..`IN6` (count from `IN`) + `ENCODER1;GET` + `ENCODER2;GET`
**Write:** `IN1;MODE;FILTER;HT;HD;LT;LD;PRST;NVM;FPULSE;REPORT` + encoders

8 rows (IN1-IN8), inactive rows disabled based on device input count.
Encoder section: Pulsar1(E1) and Pulsar2(E2) with Channel A/B dropdowns.
Note: Read returns 12 fields, write sends 10 (last 2 are read-only reserved).

### Tab 8: RS Interfaces

6 rows: RS232, RS232A, RS232B, RS485, RS485A, RS485B.
Each: DEVICE_TYPE dropdown (40+ types), BAUD_RATE, DATA_BITS, STOP_BITS, PARITY.

**IMPORTANT:** Use 5-10 sec timeout for RS port writes. Show loading indicator.
After save: send `LOG;RESET`.

Full DEVICE_TYPE list in commands.md.

### Tab 9: FLS (LLS) - Fuel Level Sensors

6 sensors (FLS1-FLS6): Enable, Address, Capacity, Low alarm, High alarm, Sniff.

**Calibration table** (40 points per sensor):
- Read: `LLSCALn;GET;0`..`LLSCALn;GET;39` (40 sequential commands, show progress)
- Write: 4 batches of 10 points via `LLSCALn;SET;idx,raw,vol;idx,raw,vol;...`
- **CSV Import/Export mandatory** (columns: index, raw_code, volume)

Note: LLSn;GET returns 8 fields, write sends 7 (last field FILTER_MODE is read-only).

### Tab 10: Pumps (TRK)

**8 pumps** (PUMP1-PUMP8), each in **separate sub-tab**.
17 fields per pump (see commands.md for full list).
INPUT field supports values: 1-8 or E1-E4.

### Tab 11: Keyboard (UIM)

**Read:** `UIM` + `UIMX`
**Write:** `UIM;ENABLE;KEYPAD;REQ_PUMP;REQ_LIMIT;REQ_VEHID;REQ_ODO;REQ_PIN;KEY_SOUND;TERM_SOUND;GREETING;GOODBYE;TAG_SEARCH;CHECK_VID;PROJECT_ID;COMPARE_ODO;ENGINE` + `UIMX;DRIVER_TAG_TYPE;ALLOW_DRIVER_CODE`

13 checkboxes + 3 text fields (16 ASCII chars each: GREETING, GOODBYE, TAG_SEARCH).
Pump format section: `PUMPFRMTn;VALUE_FMT;TOTAL_FMT;LIMIT_FMT;LIMIT_LEN` for pumps 1-8.

### Tab 12: Security

4 panels:
1. **Emergency Stop (EMSTOP):** enable, input#, invert, operator check
2. **Auth Type (TAGCFG):** mode (Memory/Filter/AnyTag), SD save
3. **Bypass:** enable, motion, min threshold (float)
4. **Pump Security (PUMPSEC):** low level, max dose, alarm, auth type bitmask, auth method

Note: PUMPSEC read returns 10 fields, write sends 9 (last is read-only).

### Tab 13: Printer

**Read:** `PRINTER;GET` + `PRNTN` + `PRNTP` + `PRNTW`
**Write:** `PRINTER;SET;ENABLE;LANGUAGE;TIMEZONE` + `PRNTN;hex` + `PRNTP;hex` + `PRNTW;hex`

Text fields (station name, phone, website) use **UTF-16LE hex encoding**.
See `lib/unicode.ts` for encode/decode functions.

PRINTER;GET returns 4 fields, write sends 3 (last is read-only).

### Tab 14: Tags/Keys

**Single large table** with virtual scrolling (up to 20,000 entries).
Columns: #, Tag ID (12 hex), Limit (0-9999), Parameter (hex bitmask), PIN (0-9999), Actions.

**Read all:** `TAGS` → get ADDED count, then `TAG;GETI;0`..`TAG;GETI;N-1`. Show progress bar.
**Add:** `TAGS;ADD;TAG_ID`
**Edit:** `TAG;SET;TAG_ID;LIMIT;PARAM;PIN`
**Delete:** `TAG;DEL;TAG_ID`
**Import/Export:** CSV/TXT file support

Use TanStack Table with `@tanstack/react-virtual` for virtualization — DO NOT render 20k rows.

## Template System

### File Format (.gtcfg)

Plain text file with raw commands, one per line:
```
$1234;APN;internet.mts.ru;mts;mts
$1234;SERVER1;SET;0F;01;s4.geotek.online;5601;IMEI;IMEI;10;0;120;30;1;0;1
$1234;FILTER;1,300;1,15;1,2;1,60;1;120;120
...
```

### Save Template
Collect current field values from all tabs → build write commands → save to .gtcfg file.

### Load Template
1. Read .gtcfg file line by line
2. Replace password placeholder with current password
3. Replace IMEI placeholder with current device IMEI
4. Send each command sequentially, wait for response
5. Show progress bar + result log

## Development Guidelines

### Code Style
- TypeScript strict mode, no `any` types
- Functional React components with hooks
- Small, focused components (max ~200 lines)
- Shared types in `types/` directory
- Business logic in `lib/`, not in components

### Error Handling
- All serial commands must handle timeout and error responses
- Show user-friendly error messages in StatusBar
- Log all commands and responses for debugging
- Never crash on malformed device response — parse defensively

### Testing Approach
- Test parsers and protocol helpers with unit tests
- Test UI components can render without serial connection (mock mode)
- Add a "Demo mode" that works without a real device (for UI development)

### Build Order (Phases)

1. **Phase 1:** Electron + Vite scaffold, SerialManager, Toolbar, Sidebar, StatusBar
2. **Phase 2:** Status tab (polling, read-only panels)
3. **Phase 3:** Diagnostics tab (terminal, log channels)
4. **Phase 4:** Settings tabs (Server, Protocol, WiFi, GPS, Inputs/Outputs, RS)
5. **Phase 5:** Device tabs (FLS, Pumps, Keyboard, Security, Printer)
6. **Phase 6:** Tags tab (virtual scrolling, import/export)
7. **Phase 7:** Template system (save/load .gtcfg)

### Important Notes
- COM port baud rate for device connection: **115200** (default)
- Always send `\r\n` at end of each command
- Parse responses by splitting on `;` — first element is command echo
- Some commands have long response times (RS port config, tag operations) — use appropriate timeouts
- The device can only process one command at a time — implement command queue
- When switching away from Status tab, stop polling to avoid conflicts with manual commands

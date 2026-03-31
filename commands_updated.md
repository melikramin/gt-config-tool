# GT9 Device Command Reference

Complete command protocol documentation for Geotek GT-series devices (GT-9, GT-1, GT-3, GT-7).

## Protocol Format

All commands follow this structure:

```
Request:  $<PASSWORD>;<COMMAND>[;<PARAMS>]\r\n
Response: $<COMMAND>;<DATA>\r\n
```

- Default password: `1234`
- Fields are separated by `;` (semicolon)
- Sub-fields within a field use `,` (comma)

### Error Responses

| Code | Meaning |
|------|---------|
| `OK` | Success |
| `CE` | Command Error |
| `DE` | Data Error / End of data |
| `PE` | Password Error |
| `FE` | Format Error |

### Device Types

| Code | Device |
|------|--------|
| 10 | GT-3 |
| 20 | GT-9 R4 (F1) |
| 21 | GT-9 R5 (F1) |
| 22 | GT-9 R6 (F1) |
| 23 | GT-9 R5 (F1) |
| 24 | GT-9 R6 (F4) |
| 25 | GT-1 |
| 26 | GT-9 R8 (F4) |
| 90 | GT-7 (F1) |

---

## 1. Device Information

### VER - Firmware Version (Read Only)

```
$1234;VER
$VER;HW_TYPE;HW_VERSION;FW_VERSION;FLEX_VERSION;RELEASE_DATE
```

| Field | Description |
|-------|-------------|
| HW_TYPE | Hardware type code (see Device Types) |
| HW_VERSION | Hardware version (Major.Minor) |
| FW_VERSION | Firmware version (Major.Minor) |
| FLEX_VERSION | Flex version (Major.Minor) |
| RELEASE_DATE | Release date (DD.MM.YY) |

**Example:**
```
$1234;VER
$VER;0;01.00;00.10;00.05;15.08.14
```

### HWCFG - Hardware Config (Read/Write)

For internal use only.

```
Read:  $1234;HWCFG
       $HWCFG;HW_TYPE;SERIAL

Write: $1234;HWCFG;HW_TYPE;SERIAL
       $HWCFG;OK
```

| Field | Description |
|-------|-------------|
| HW_TYPE | Hardware type code |
| SERIAL | Serial number (12 digits) |

**Example:**
```
$1234;HWCFG;2;012345678910
$HWCFG;OK
```

### DEV - Device Info (Read/Write)

```
Read:  $1234;DEV
       $DEV;DEV_NAME;DEV_ID;SERIAL

Write: $1234;DEV;DEV_NAME;DEV_ID
       $DEV;OK
```

| Field | Description |
|-------|-------------|
| DEV_NAME | Device name (up to 8 symbols) |
| DEV_ID | Device ID (up to 8 symbols) |
| SERIAL | Serial number (12 digits, read only) |

**Example:**
```
$1234;DEV
$DEV;xLine;01234567;012345678910
```

### GT2 - GT2 Module Version (Read Only)

```
$1234;GT2;VER
$GT2;?;?;VERSION;?;BUILD_DATE
```

---

## 2. Security

### PASS - Password (Read/Write)

```
Read:  $1234;PASS
       $PASS;PASSWORD;PASS_STATE

Write: $1234;PASS;CURRENT_PASS;NEW_PASS;NEW_PASS;PASS_CONTROL
       $PASS;PC   (password changed)
       $PASS;PE   (password error)
```

| Field | Description | Range |
|-------|-------------|-------|
| PASS_CONTROL | Password enabled/disabled | 0=disabled, 1=enabled |
| Password | Up to 8 symbols | |

**Example:**
```
$1234;PASS;1234;5678;5678;0
$PASS;PC
```

---

## 3. Date and Time

### DATE (Read/Write)

```
Read:  $1234;DATE
       $DATE;DATE;TIME;HOUR_SHIFT;GPS_SYNC;DST;NTP_SYNC;GSM_SYNC

Write: $1234;DATE;DATE;TIME;HOUR_SHIFT;GPS_SYNC;DST;NTP_SYNC;GSM_SYNC
       $DATE;OK
```

| Field | Description | Range |
|-------|-------------|-------|
| DATE | Date | DDMMYY |
| TIME | Time | HHMMSS |
| HOUR_SHIFT | Timezone offset | -12...+13 |
| GPS_SYNC | Sync time with GPS | 0=off, 1=on |
| DST | Daylight saving time | 0=off, 1=on |
| NTP_SYNC | Sync time with NTP (Simcom modem) | 0=off, 1=on |
| GSM_SYNC | Sync time with GSM | 0=off, 1=on |

**Example:**
```
$1234;DATE
$DATE;131019;141734;+0;1;0;0;0

$1234;DATE;060915;224500;+0;1;0;0;0
$DATE;OK
```

---

## 4. Mode and Status

### MODE (Read/Write)

```
Read:  $1234;MODE
       $MODE;DEV_MODE

Write: $1234;MODE;DEV_MODE;EVENTS
       $MODE;OK
```

### REP - Live Report (Read Only)

```
$1234;REP
$REP;DEV_NAME;EVENTS;DATE;TIME;LATITUDE;SN;LONGITUDE;WE;ALTITUDE;FIX_MODE;SPEED;SATINUSE;LBS_MCC;LBS_MNC;LBS_LAC;LBS_CID;EXT_BAT;INT_BAT;RSV_BAT;INT_TEMP;EXT_TEMP;ACC_XYZ;GSM_STATUS;GSM_RSSI;WIFI_STATUS;WIFI_RSSI;LAST_TAG_ID
```

| Field | Description |
|-------|-------------|
| DATE | Date (DD/MM/YY) |
| TIME | Time (HH:MM:SS) |
| LATITUDE | Latitude value |
| SN | N/S |
| LONGITUDE | Longitude value |
| WE | W/E |
| ALTITUDE | Altitude |
| FIX_MODE | GPS fix mode |
| SPEED | Ground speed |
| SATINUSE | Satellites in use |
| LBS_MCC/MNC/LAC/CID | Cell tower info |
| EXT_BAT | External battery voltage (mV) |
| INT_BAT | Internal battery voltage (mV) |
| INT_TEMP | Internal temperature |
| GSM_STATUS | GSM status code (hex) |
| GSM_RSSI | GSM signal strength |
| WIFI_STATUS | WiFi status code |
| WIFI_RSSI | WiFi signal strength (dBm) |
| LAST_TAG_ID | Last presented tag/key ID (12 hex chars) |

**Example:**
```
$1234;REP
$REP;GTX;0200;300326;182908;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;NA;11849;4600;+32;-128;0,0;8f;23;03;+0;00000807EBC6
```

---

## 5. Network Configuration

### APN (Read/Write)

```
Read:  $1234;APN
       $APN;APN_NAME;APN_LOGIN;APN_PASS

Write: $1234;APN;APN_NAME;APN_LOGIN;APN_PASS
       $APN;OK
```

**Example:**
```
$1234;APN;internet.mts.ru;mts;mts
$APN;OK
```

### SERVER1 - Server Configuration (Read/Write)

Uses `SERVER1;GET` and `SERVER1;SET` commands directly (not the generic SERVER;ADD/EDIT/DEL from older protocol versions).

**Read:**
```
$1234;SERVER1;GET
$SERVER1;SERVER_PROP;PROTO_PROP;IP;PORT;LOGIN;PASS;LOGIN_TOUT;TRANSFER_TOUT;PING_TOUT;RESP_TOUT;IP_PROTO;CHANNEL;DATA_PROTO
```

Response field mapping:
| Rdata index | Field | Description |
|-------------|-------|-------------|
| [1] | SERVER_PROP | Server property bitmask (hex) |
| [2] | PROTO_PROP | Protocol property (hex) |
| [3] | IP | Server IP address |
| [4] | PORT | Server port |
| [5] | LOGIN | Login (typically IMEI) |
| [6] | PASS | Password (typically IMEI) |
| [7] | LOGIN_TOUT | Login timeout (sec) |
| [8] | TRANSFER_TOUT | Transfer timeout (sec) |
| [9] | PING_TOUT | Ping/keep-alive timeout (sec) |
| [10] | RESP_TOUT | Response timeout (sec) |
| [11] | IP_PROTO | 1=TCP |
| [12] | CHANNEL | Wireless channel |
| [13] | DATA_PROTO | Data protocol type |

**Write:**
```
$1234;SERVER1;SET;SERVER_PROP;PROTO_PROP;IP;PORT;LOGIN;PASS;LOGIN_TOUT;TRANSFER_TOUT;PING_TOUT;RESP_TOUT;IP_PROTO;CHANNEL;DATA_PROTO
$SERVER1;OK
```

| Field | Description | Values |
|-------|-------------|--------|
| SERVER_PROP | Server property bitmask | `0F` = valid+enabled+main+monitoring |
| PROTO_PROP | Protocol property | `01` = login required, `00` = no login (used for tsense) |
| IP | Server IP address or hostname | e.g. `81.177.143.114` or `s4.geotek.online` |
| PORT | Server port | e.g. `5601` |
| LOGIN | Server login | Typically device IMEI |
| PASS | Server password | Typically device IMEI |
| LOGIN_TOUT | Login timeout | `10` (sec) |
| TRANSFER_TOUT | Transfer timeout | `0` (sec) |
| PING_TOUT | Ping timeout | `120` (sec) |
| RESP_TOUT | Response timeout | `30` (sec) |
| IP_PROTO | IP protocol | `1` = TCP |
| CHANNEL | Wireless channel | `0`=GSM, `1`=WiFi, `2`=GSM+WiFi, `3`=WiFi+GSM |
| DATA_PROTO | Data protocol | `0`=IPS, `1`=GT9, `5`=tsense |

**Example (from configurator):**
```
// Read server settings
$1234;SERVER1;GET
$SERVER1;0f;01;81.177.143.114;5601;865209030717012;865209030717012;60;0;60;45;1;0;1;0

// Set server: GT9 protocol, GSM channel, TCP
$1234;SERVER1;SET;0F;01;81.177.143.114;5601;865209030717012;865209030717012;10;0;120;30;1;0;1
$SERVER1;OK

// Set server: tsense protocol (PROTO_PROP=00), WiFi+GSM channel
$1234;SERVER1;SET;0F;00;192.168.1.100;8080;865209030717012;865209030717012;10;0;120;30;1;3;5
$SERVER1;OK
```

> **Note:** When DATA_PROTO is `5` (tsense), PROTO_PROP is set to `00` (no login required). For all other protocols, PROTO_PROP is `01`.

### FOTAFTP - FTP Update Server (Read/Write)

```
Read:  $1234;FOTAFTP;GET
       $FOTAFTP;?;SERVER;PORT;LOGIN;PASSWORD

Write: $1234;FOTAFTP;SET;SERVER;PORT;LOGIN;PASSWORD
       $FOTAFTP;OK
```

---

## 6. GSM / Cellular

### GSM - GSM Module (Read/Write)

```
Read:  $1234;GSM
       $GSM;ENABLE;STATUS;IMEI;HOME_ID;RSSI;BALANCE;MCC;MNC;LAC;CID;FAIL_RECONN;ACTIVE_RECONN;ACTIVE_DATA;PING_TOUT;RESP_TOUT_HOME;RESP_TOUT_ROAM

Write: $1234;GSM;STATUS;HOME_ID;HOME_CONN;HOME_TRANSFER;HOME_ACTIVE;ROAM_CONN;ROAM_TRANSFER;ROAM_ACTIVE
       $GSM;OK
```

| Rdata index | Field | Description |
|-------------|-------|-------------|
| [1] | ENABLE | GSM module enabled (hex bitmask) |
| [2] | STATUS | GSM status code (hex, see status table below) |
| [3] | IMEI | Module IMEI |
| [4] | HOME_ID | Home network ID |
| [5] | RSSI | Signal strength (raw value, convert to %) |
| [6] | BALANCE | Account balance |
| [7] | MCC | Mobile Country Code |
| [8] | MNC | Mobile Network Code |
| [9] | LAC | Location Area Code |
| [10] | CID | Cell ID |
| [11] | FAIL_RECONN | Fail reconnect timeout (sec) |
| [12] | ACTIVE_RECONN | Active reconnect timeout (sec) |
| [13] | ACTIVE_DATA | Active datalink timeout (sec) |
| [14] | PING_TOUT | Ping timeout (sec) |
| [15] | RESP_TOUT_HOME | Response timeout home (sec) |
| [16] | RESP_TOUT_ROAM | Response timeout roaming (sec) |

#### GSM Status Codes

> TODO: Complete mapping. Known values from configurator UI:

| Status hex | Description |
|------------|-------------|
| `8f` | Connected to Server |
| `03` | Not connected / Searching |

Special control:
```
$1234;GSM;01    (modem mode 1)
$1234;GSM;03    (restart modem)
```

### CELL - LTE/Cellular Mode Selection

```
// Automatic
$1234;CELL;SET;0;2;0

// GSM Only
$1234;CELL;SET;1;2;1

// CAT M1
$1234;CELL;SET;2;0;2

// CAT NB1
$1234;CELL;SET;2;1;3
```

### SIMS - SIM Cards Management (Read/Write)

```
Read:  $1234;SIMS
       $SIMS;SUPPORTED;DETECTED;SIM_CONTROL;ACTIVE

Write: $1234;SIMS;SIM_CONTROL
       $SIMS;OK
```

| SIM_CONTROL | Mode |
|-------------|------|
| 0 | No SIM |
| 1 | SIM1 only |
| 2 | SIM2 only |
| 3 | SIM1 then SIM2 |
| 4 | SIM2 then SIM1 |

### SIMn - SIM Card Info (Read Only)

```
$1234;SIM1
$SIM1;SUPPORTED;DETECTED;ENABLED;ACTIVE;IMSI;PHONE_NUMBER;OPERATOR;BALANCE;SMS_GW;PHONE_REQ;BALANCE_REQ
```

### BAL - Balance Check (Read/Write)

```
Read:  $1234;BAL
       $BAL;ENABLE;USSD_STRING;REQUEST_TIMEOUT

Write: $1234;BAL;ENABLE;USSD_STRING;REQUEST_TIMEOUT
       $BAL;OK
```

### PHONE - Phone Numbers (Read/Write)

```
Read:  $1234;PHONE
       $PHONE;NUMBER1;NUMBER2;NUMBER3

Write: $1234;PHONE;NUMBER1;NUMBER2;NUMBER3
       $PHONE;OK
```

### SMS - SMS Numbers (Read/Write)

```
Read:  $1234;SMS
       $SMS;NUMBER1;NUMBER2;NUMBER3

Write: $1234;SMS;NUMBER1;NUMBER2;NUMBER3
       $SMS;OK
```

### SENDSMS - Send SMS (Write Only)

```
$1234;SENDSMS;PHONE_NUMBER;TEXT
$SENDSMS;OK
```
Max 30 characters for SMS text.

### AUDIO - GSM Audio (Read/Write)

```
Read:  $1234;AUDIO
       $AUDIO;MIC_GAIN;SPEAKER_VOLUME

Write: $1234;AUDIO;MIC_GAIN;SPEAKER_VOLUME
       $AUDIO;OK
```

### RING - Auto-answer (Read/Write)

```
Read:  $1234;RING
       $RING;AUTOANSWER_RINGS;CALL_ATTEMPTS

Write: $1234;RING;AUTOANSWER_RINGS;CALL_ATTEMPTS
       $RING;OK
```

---

## 7. WiFi Configuration

### WIFI - WiFi Module (Read/Write)

```
Read:  $1234;WIFI
       $WIFI;ENABLE;STATUS;MAC;NET_IDX;RSSI

Write: $1234;WIFI;STATUS;HOME_ID;WIFI_CONN;WIFI_TRANSFER;WIFI_ACTIVE
       $WIFI;OK
```

| STATUS code | Meaning |
|-------------|---------|
| 0x01 | Gateway connection |
| 0x02 | Server connection |

### WIFINET - WiFi Networks Management

```
Read total: $1234;WIFINET
            $WIFINET;NETWORK_COUNT

Add:    $1234;WIFINET;ADD;CHANNEL;SSID;AUTH;ENCRYPT;KEY;IP_MODE;IP;MASK;GW;DNS1;DNS2
Edit:   $1234;WIFINET;EDIT;IDX;CHANNEL;SSID;AUTH;ENCRYPT;KEY;IP_MODE;IP;MASK;GW;DNS1;DNS2
Delete: $1234;WIFINET;DEL;IDX
        $1234;WIFINET;DEL;ALL
```

### WIFINETn - Read WiFi Network Settings

```
$1234;WIFINET1;GET
$WIFINET1;CHANNEL;SSID;AUTH;ENCRYPT;KEY;IP_MODE;IP;MASK;GATEWAY;DNS1;DNS2
```

| Field | Values |
|-------|--------|
| CHANNEL | 0=Auto, 1-12 |
| AUTH | 0=None, 1=Open, 2=Shared |
| ENCRYPT | 0=None, 1=WEP64, 2=WEP128, 3=WPA, 4=WPA2 |
| IP_MODE | 0=Manual, 1=DHCP |

**Example:**
```
$1234;WIFINET;ADD;0;AlexanderA;1;4;Alexander A;1;;;;
$WIFINET;OK
```

---

## 8. GPS/GLONASS

### GPS (Read/Write)

```
Read:  $1234;GPS
       $GPS;ENABLE;STATE;MODE;AGPS_SERVER;AGPS_LOGIN;AGPS_PASS

Write: $1234;GPS;STATE;MODE;AGPS_SERVER;AGPS_LOGIN;AGPS_PASS
       $GPS;OK
```

| Field | Values |
|-------|--------|
| STATE | 0=Off, 1=On, 2=Cold restart, 3=Warm restart, 4=Hot restart |
| MODE | 0=GPS+GLONASS, 1=GPS only, 2=GLONASS only |

### FILTER - GPS Tracking Filter (Read/Write)

Also: `RFILTER` (roaming filter), `UFILTER` (unknown operator filter).

```
Read:  $1234;FILTER
       $FILTER;DST_EN,DISTANCE;HDG_EN,HEADING;SPD_EN,MIN_SPEED;HSPD_EN,MAX_SPEED;MIN_TIMEOUT;DRIVING_INTERVAL;PARKING_INTERVAL

Write: $1234;FILTER;DST_EN,DISTANCE;HDG_EN,HEADING;SPD_EN,MIN_SPEED;HSPD_EN,MAX_SPEED;MIN_TIMEOUT;DRIVING_INTERVAL;PARKING_INTERVAL
       $FILTER;OK
```

| Field | Description | Range |
|-------|-------------|-------|
| DISTANCE | Distance filter | 5-10000 meters |
| HEADING | Heading angle filter | 1-360 degrees |
| MIN_SPEED | Minimum speed filter | 1-10 km/h |
| MAX_SPEED | Maximum speed filter | 1-200 km/h |
| MIN_TIMEOUT | Minimum report interval | 0-10000 sec |
| DRIVING_INTERVAL | Interval while moving | 3-10000 sec |
| PARKING_INTERVAL | Interval while parked | 3-10000 sec |

Enable flags: `0`=disabled, `1`=enabled (comma-separated with value).

**Example:**
```
$1234;FILTER;1,100;1,10;1,2;1,60;2;30;180
$FILTER;OK
```

---

## 9. Sensors

### MSENS - Motion Sensor / Accelerometer (Read/Write)

```
Read data: $1234;MSENS
           $MSENS;ACC_X;ACC_Y;ACC_Z

Read config: $1234;MSENS;GET
             $MSENS;MOTION_EN;MOTION_THRESH;SHOCK_EN;SHOCK_THRESH;X_DIR;Y_DIR;Z_DIR

Write: $1234;MSENS;SET;MOTION_EN;MOTION_THRESH;SHOCK_EN;SHOCK_THRESH;X_DIR;Y_DIR;Z_DIR
       $MSENS;OK

Calibrate: $1234;MSENS;CAL;AXIS   (AXIS = X, Y, or Z)
           $MSENS;OK
```

| Field | Description | Range |
|-------|-------------|-------|
| MOTION_EN | Motion detection enable | 0/1 |
| MOTION_THRESH | Motion threshold | 1-127 |
| SHOCK_EN | Shock detection enable | 0/1 |
| SHOCK_THRESH | Shock threshold | 1-127 |
| X/Y/Z_DIR | Axis direction | 0=normal, 1=opposite |

### TILT - Tilt Sensor (Read/Write)

```
Read data: $1234;TILT
           $TILT;TILT_X;TILT_Y

Read config: $1234;TILT;GET
             $TILT;ENABLE;TILT_THRESHOLD;CURRENT_TILT

Write: $1234;TILT;SET;ENABLE;TILT_THRESHOLD
       $TILT;OK

Zero calibration: $1234;TILT;ZERO
                  $TILT;OK
```

| Field | Description | Range |
|-------|-------------|-------|
| ENABLE | Tilt detection on/off | 0/1 |
| TILT_THRESHOLD | Tilt angle threshold | 1-180 degrees |
| CURRENT_TILT | Current tilt angle (read-only, GET only) | |

### TSENS - Temperature Sensor (Read/Write)

```
Read data: $1234;TSENS
           $TSENS;INT_TEMP

Read config: $1234;TSENS;GET
             $TSENS;ENABLE;THRESHOLD_LOW;THRESHOLD_HIGH

Write: $1234;TSENS;SET;ENABLE;THRESHOLD_LOW;THRESHOLD_HIGH
       $TSENS;OK
```

| Field | Range |
|-------|-------|
| THRESHOLD_LOW | -50...+80 |
| THRESHOLD_HIGH | -50...+80 |

### THERM - 1-Wire Thermometers (Read/Write)

```
Read total:  $1234;THERM
             $THERM;THERM_NUMBER_SUPPORTED

Add:    $1234;THERM;SET;IDX;THERM_ID
Delete: $1234;THERM;DEL;IDX
Get:    $1234;THERM;GET;IDX
        $THERM;THERM_ID;TEMPERATURE
Search: $1234;THERM;SEARCH
        $THERM;ID1;ID2;...;IDn
```

| Field | Description |
|-------|-------------|
| IDX | Thermometer index (1-8) |
| THERM_ID | Thermometer ID (12 symbols) |
| TEMPERATURE | -40...+80 |

---

## 10. Inputs / Outputs

### IN - Input Status (Read Only)

```
$1234;IN
$IN;INPUTS_NUMBER;IN0_MODE,IN0_VALUE;IN1_MODE,IN1_VALUE;...
```

Input modes: `0`=Digital (Level), `1`=Analog (Voltage), `2`=Frequency, `3`=Pulse (Counter).

### INn - Individual Input Config (Read/Write)

```
Read:  $1234;IN1
       $IN1;MODE;FILTER_ANALOG;HIGH_TOP;HIGH_DOWN;LOW_TOP;LOW_DOWN;PULSE_RESET;NVM_SAVE;FILTER_PULSE;REPORT_STATUS;RESERVED1;RESERVED2

Write: $1234;IN1;MODE;FILTER_ANALOG;HIGH_TOP;HIGH_DOWN;LOW_TOP;LOW_DOWN;PULSE_RESET;NVM_SAVE;FILTER_PULSE;REPORT_STATUS
       $IN1;OK
```

> **Note:** Read response returns 12 fields. The last 2 fields (RESERVED1, RESERVED2) are read-only and not sent during write.

| Field | Description | Range |
|-------|-------------|-------|
| MODE | Input mode | 0=Level, 1=Voltage, 2=Frequency, 3=Pulse |
| FILTER_ANALOG | Analog filter | 1-16 |
| HIGH_TOP | High logic upper threshold | 0-33000 mV |
| HIGH_DOWN | High logic lower threshold | 0-33000 mV |
| LOW_TOP | Low logic upper threshold | 0-33000 mV |
| LOW_DOWN | Low logic lower threshold | 0-33000 mV |
| PULSE_RESET | Reset counter on report | 0=no, 1=yes |
| NVM_SAVE | Save counter to NVM | 0=no, 1=yes |
| FILTER_PULSE | Pulse filter | 1-250 |
| REPORT_STATUS | Report on change | 0=no, 1=yes |
| RESERVED1 | Reserved (read-only) | |
| RESERVED2 | Reserved (read-only) | |

**Example:**
```
$1234;IN3;1;1;33000;3000;2000;0;0;0;100;0
$IN3;OK
```

### COUNTERn - Input Counter (Read/Write)

```
Read:  $1234;COUNTER1
       $COUNTER1;8380

Reset: $1234;COUNTER3;RESET
       $COUNTER3;OK
```

### CALIBRn - Input Calibration (Write Only)

```
$1234;CALIBR3;14400
$CALIBR3;OK
```
VOLTAGE_MV: Calibration voltage in mV.

### OUT - Output Status (Read Only)

```
$1234;OUT
$OUT;OUTPUTS_NUMBER;OUT0_MODE,OUT0_VALUE;OUT1_MODE,OUT1_VALUE;...
```

### OUTn - Individual Output Config (Read/Write)

```
Read:  $1234;OUT2
       $OUT2;MODE;LEVEL;REPORT_STATUS;DUTY_CYCLE

Write: $1234;OUT2;MODE;LEVEL;NVM_SAVE;REPORT_STATUS;DUTY_CYCLE
       $OUT2;OK
```

| Field | Description | Values |
|-------|-------------|--------|
| MODE | Output mode | 0=Level, 1=Frequency, 2=PWM |
| LEVEL | Output value | 0=closed, 1=opened |
| NVM_SAVE | Save to NVM | 0/1 |
| DUTY_CYCLE | PWM duty cycle | 0-100 |

Quick set (from configurator):
```
$1234;OUT1;;1    (turn ON)
$1234;OUT1;;0    (turn OFF)
```

### ENCODERn - Encoder Configuration (Read/Write)

```
Read config: $1234;ENCODER1;GET
             $ENCODER1;CONTROL;PIN_A;PIN_B;COUNTER_VALUE

Write: $1234;ENCODER1;SET;CONTROL;PIN_A;PIN_B;COUNTER_VALUE
       $ENCODER1;OK

Read data: $1234;ENCODER1
           $ENCODER1;CONTROL;PIN_A;PIN_B;COUNTER_VALUE
```

CONTROL bits:
| Bit | Description |
|-----|-------------|
| 0 | Encoder enabled/disabled |
| 1 | Pulse polarity (not supported) |
| 2 | Pulse counter direction |
| 3 | Pulse reset at report |
| 4 | Store in NVM |

Use `0F` for default (enabled, all features), `1F` to reset between packets.

To assign encoder as pump input: use `e1`...`e4` instead of input number in PUMP command.

**Example:**
```
$1234;ENCODER1;SET;17;1;2;0
$ENCODER1;OK

$1234;PUMP1;1;e1
$PUMP1;OK
```

Protocol report fields for encoders:
```
$1234;PROTOCOL;SET;1;28    (Encoder 1)
$1234;PROTOCOL;SET;1;29    (Encoder 2)
$1234;PROTOCOL;SET;1;2a    (Encoder 3)
$1234;PROTOCOL;SET;1;2b    (Encoder 4)
```

---

## 11. Serial Interfaces

### RS232 / RS232A / RS232B (Read/Write)

Same syntax for RS485 / RS485A / RS485B.

```
Read:  $1234;RS485A
       $RS485A;DEVICE_TYPE;BAUD_RATE;DATA_BITS;STOP_BITS;PARITY

Write: $1234;RS485A;DEVICE_TYPE;BAUD_RATE;DATA_BITS;STOP_BITS;PARITY
       $RS485A;OK
```

| Field | Values |
|-------|--------|
| DEVICE_TYPE | See complete list below |
| BAUD_RATE | 1200-115200 |
| DATA_BITS | 0=5bit, 1=6bit, 2=7bit, 3=8bit, 4=9bit |
| STOP_BITS | 0=1bit, 1=0.5bit, 2=2bit, 3=1.5bit |
| PARITY | 0=None, 1=Even, 2=Odd |

### Serial Device Type Codes (Complete List)

#### All device type codes for DEVICE_TYPE field:

| Code | Device | Code | Device |
|------|--------|------|--------|
| 0 | NO (disabled) | 24 | SANKI |
| 1 | LLS Omnicom | 25 | DISPLAY |
| 2 | LLS Sensor | 26 | HID |
| 4 | RFID | 27 | LLS Modbus |
| 5 | Keypad (UIM) | 28 | KUP |
| 6 | CANLOG | 29 | LLS XMT |
| 8 | CAMERA | 30 | ML (Mass Liquid) |
| 9 | ISKRA | 31 | BUI |
| 10 | THP | 32 | EMIS |
| 11 | LCR | 33 | UHF Reader |
| 12 | PLOT3 | 34 | GT2 BLE |
| 13 | TC002 | 36 | FLS Display |
| 14 | STRUNA | 37 | TEX |
| 15 | AVKO | 38 | VDM Display |
| 16 | xRF (MT124) | 39 | MCR |
| 19 | ASN | 40 | EAGLE |
| 20 | DUO11 | 41 | UNIPUMP |
| 21 | TOPAZ | 107 | LCR Emulator |
| 22 | DART | 108 | PLOT3 Emulator |
| 23 | PRINTER | 109 | TC002 Emulator |

> **Note:** Codes 3, 7, 17, 18, 35 are not used / reserved.

#### Master/Slave port assignments:

| Device | Master Code | Slave Code | Default Baud |
|--------|-------------|------------|--------------|
| ML (Mass Liquid) | 30 (RS485) | 125 (RS485A) | 9600 |
| MT124 | 16 | 112 | 19200 |
| HID | 26 | 121 | 19200 |
| LCR | 11 | 107 | 19200 |
| ISKRA | 9 | 105 | 19200 |
| ASN | 19 | 114 | 19200 |
| TOPAZ | 21 | 116 | 19200 |
| BUI | 31 | 126 | 19200 |
| PLT (Density) | 12 | 108 | 19200 |
| TC002 | 13 | 109 | 19200 |
| Gamma | 27 | 122 | 19200 |
| XMT | 29 | 124 | 19200 |
| EIND | 25 | 120 | 19200 |
| STRUNA | 14 | 110 | 19200 |
| Camera | 8 | - | 9600 |
| EMIS | 32 | 127 | 9600 |

Master port is typically RS485 or RS232A. Slave port is RS485A or RS232B.

**Example (ISKRA on RS485):**
```
$1234;RS485;9;19200       (master)
$1234;RS485A;105;19200    (slave)
```

---

## 12. LLS (Level Sensors)

### LLS;SET - Quick Enable/Disable Sensor by Address

Used to enable or disable sensors 2-6 by RS485 address:

```
$1234;LLS;SET;ADDRESS;ENABLE
$LLS;OK
```

| Field | Description | Values |
|-------|-------------|--------|
| ADDRESS | RS485 network address | 2-6 |
| ENABLE | Enable/Disable | 0=off, 1=on |

**Example:**
```
$1234;LLS;SET;3;1    // enable sensor at address 3
$1234;LLS;SET;3;0    // disable sensor at address 3
```

### LLSn;GET / LLSn;SET - Individual LLS Configuration

**Read config:**
```
$1234;LLS1;GET
$LLS1;ENABLE;ADDRESS;0;CAPACITY;LOW;HIGH;SNIFF;FILTER_MODE
```

Response (config, 8 fields):
| Rdata index | Field | Description |
|-------------|-------|-------------|
| [1] | ENABLE | Sensor enabled (0/1) |
| [2] | ADDRESS | RS485 network address |
| [3] | - | Reserved (0) |
| [4] | CAPACITY | Tank capacity |
| [5] | LOW | Low level threshold |
| [6] | HIGH | High level threshold |
| [7] | SNIFF | Sniff/anti-siphon (0/1) |
| [8] | FILTER_MODE | Filter mode (read-only) |

**Write config:**
```
$1234;LLS1;SET;ENABLE;ADDRESS;0;CAPACITY;LOW;HIGH;SNIFF
$LLS1;OK
```

> **Note:** FILTER_MODE (field [8]) is returned in GET response but not sent during SET.

**Example:**
```
// Set sensor 1: enabled, network address 5, capacity 100000, low=100, high=10000, sniff off
$1234;LLS1;SET;1;5;0;100000;100;10000;0
$LLS1;OK

// Set sensor 2: enabled, network address 6, capacity 100000, low=100, high=10000, sniff on
$1234;LLS2;SET;1;6;0;100000;100;10000;1
$LLS2;OK
```

### LLSn - Live Sensor Data (Read Only)

When reading live data (response has more than 8 fields):

```
$1234;LLS1
$LLS1;?;?;LENGTH;CAPACITY;TEMPERATURE;DENSITY;...
```

| Rdata index | Field | Description |
|-------------|-------|-------------|
| [3] | LENGTH | Fuel level (raw code, 0-4096) |
| [4] | CAPACITY | Current volume |
| [5] | TEMPERATURE | Fuel temperature (-40...+80) |
| [6] | DENSITY | Fuel density (0-65535) |

> **Note:** The response format differs based on field count. Config responses have exactly 8 fields, live data responses have more than 8 fields.

### LLSCALn - LLS Calibration Tables (Read/Write)

Calibration uses up to 40 points per sensor (indices 0-39). Points are sent in batches of 10 per command (4 commands to send full table).

**Read single point:**
```
$1234;LLSCAL1;GET;INDEX
$LLSCAL1;INDEX,RAW,VOLUME
```

**Write batch of 10 points:**
```
$1234;LLSCAL1;SET;IDX0,RAW0,VOL0;IDX1,RAW1,VOL1;...;IDX9,RAW9,VOL9
$LLSCAL1;OK
```

Each point is a triplet: `INDEX,RAW_CODE,VOLUME` separated by `;`.

| Field | Description | Range |
|-------|-------------|-------|
| INDEX | Calibration point index | 0-39 |
| RAW (CODE) | Raw sensor code | 0-4095 |
| VOLUME | Volume in litres | 0-99999 |

**Reset all calibration points (all sensors):**
```
$1234;LLSCALX;RESET
```

**Check calibration value:**
```
$1234;LLSCAL1;CHECK;2000
```

**Full calibration example (40 points for sensor 1):**
```
// Points 0-9
$1234;LLSCAL1;SET;0,0,0;1,100,1000;2,200,2000;3,300,3000;4,400,4000;5,500,5000;6,600,6000;7,700,7000;8,800,8000;9,900,9000
$LLSCAL1;OK

// Points 10-19
$1234;LLSCAL1;SET;10,1000,10000;11,1100,11000;12,1200,12000;13,1300,13000;14,1400,14000;15,1500,15000;16,1600,16000;17,1700,17000;18,1800,18000;19,1900,19000
$LLSCAL1;OK

// Points 20-29
$1234;LLSCAL1;SET;20,2000,20000;21,2100,21000;22,2200,22000;23,2300,23000;24,2400,24000;25,2500,25000;26,2600,26000;27,2700,27000;28,2800,28000;29,2900,29000
$LLSCAL1;OK

// Points 30-39
$1234;LLSCAL1;SET;30,3000,30000;31,3100,31000;32,3200,32000;33,3300,33000;34,3400,34000;35,3500,35000;36,3600,36000;37,3700,37000;38,3800,38000;39,3900,39000
$LLSCAL1;OK
```

**Reading all calibration points:**
```
$1234;LLSCAL1;GET;0
$LLSCAL1;0,0,0

$1234;LLSCAL1;GET;1
$LLSCAL1;1,100,10000

$1234;LLSCAL1;GET;2
$LLSCAL1;2,200,20000
...
// Read all 40 points (0-39) sequentially
```

### PLTn - Density Sensors (Read/Write)

```
Read live: $1234;PLT1
           $PLT1;?;?;DENSITY;TEMPERATURE;?

Enable:  $1234;PLT1;SET;1;;;0    (enable, polling off)
         $1234;PLT1;SET;1;;;1    (enable, polling on)
Disable: $1234;PLT1;SET;;;;0
```

---

## 13. RFID

### RFID (Read/Write)

```
Read live: $1234;RFID
           $RFID;ENABLED;CONNECTED;READER_ID;TAG_ID;STATUS

Read config: $1234;RFID;GET
             $RFID;ENABLE;ADDRESS

Write: $1234;RFID;SET;ENABLE;ADDRESS
       $RFID;OK
```

| STATUS | Meaning |
|--------|---------|
| 0 | Start fuelling state |
| 1 | Stop fuelling state |

---

## 14. Tags / Keys (RFID, iButton)

### TAGS - Tag Memory Management

```
Read info: $1234;TAGS
           $TAGS;MEMORY;LIMIT;ADDED

Set limit: $1234;TAGS;SET;EEPROM_LIMIT;SD_LIMIT
           $TAGS;OK

Get limit: $1234;TAGS;GET
           $TAGS;EEPROM_LIMIT;SD_LIMIT

Add (up to 10 per line):
           $1234;TAGS;ADD;TAG1;TAG2;TAG3;...
           $TAGS;OK

Delete:    $1234;TAGS;DEL;TAG1;TAG2;...
           $1234;TAGS;DEL;ALL
           $TAGS;OK

Check:     $1234;TAGS;CHECK
Create:    $1234;TAGS;CRTLST;100    (create 100 random tags)

Download to file:  $1234;TAGS;DNLD;tagdata.csv
Upload from file:  $1234;TAGS;UPLD;tags5000i.txt
```

### TAG - Individual Tag Operations

```
Add:    $1234;TAG;ADD;TAG_ID;PARAM1;PARAM2;PARAM3
        $TAG;OK

Edit:   $1234;TAG;EDIT;TAG_ID;PARAM1;PARAM2;PARAM3
        $TAG;OK

Get:    $1234;TAG;GET;TAG_ID
        $TAG;TAG_ID;LIMIT;PARAM;PIN;INDEX

Get by index: $1234;TAG;GETI;INDEX
              $TAG;TAG_ID;LIMIT;PARAM;PIN

Set params:   $1234;TAG;SET;TAG_ID;PARAM1;PARAM2;PARAM3
              $TAG;OK

Delete: $1234;TAG;DEL;TAG_ID
        $TAG;OK

Add by index: $1234;TAG;ADDI;INDEX;TAG_ID;0;0;0
Delete by index: $1234;TAG;DELI;INDEX
Edit by index: $1234;TAG;EDITI;INDEX;...
```

| Parameter | Description | Range |
|-----------|-------------|-------|
| TAG_ID | Tag identifier | 12 hex symbols |
| PARAM1 (Limit) | Fuel limit | 0-9999 |
| PARAM2 | Bitfield for fuel type & tag type | 0x00-0xFF |
| PARAM3 (PIN) | PIN code | 0-9999 |

**PARAM2 bit definitions:**
| Bit | Description |
|-----|-------------|
| 0 | Product type 1 (0=enable, 1=disable) |
| 1 | Product type 2 (0=enable, 1=disable) |
| 2 | Product type 3 (0=enable, 1=disable) |
| 3 | Product type 4 (0=enable, 1=disable) |
| 4 | Tag type = Operator (0=no, 1=yes) |
| 5 | Tag type = Driver (0=no, 1=yes) |
| 6-7 | Reserved |

Example: `20` hex = bit 5 set = Driver tag.

**Examples:**
```
$1234;TAGS;ADD;A0023233001D;A0023233001C;A00232330013
$TAG;OK

$1234;TAG;SET;A0023233001D;10;0;1234
$TAG;OK

$1234;TAG;GET;123456
$TAG;0000018F2EA4;0;00;0000;165

$1234;TAG;GETI;165
$TAG;000000000123;0;00;00
```

### Upload File Format

Commands inside upload files:
```
// Add by index
$ADDI;1;AB00001;1000;0;1234;0;0;1000;AB00100;10;B0D063100;MAN 3558

// Add by ID
$ADD;000000000001;1000;01;1234;2;;00016;ABCDEF123456;00000064;00B0D063C226;White Mercedes, AVH523

// Edit by ID
$EDIT;000000000001;1000;01;1234;...

// Delete by ID
$DEL;000000000001
```

### TAGCFG - Tag Configuration Mode (Read/Write)

```
Read:  $1234;TAGCFG
       $TAGCFG;MODE;MASK;SAVE_SD

Write: $1234;TAGCFG;MODE;MASK;SAVE_SD
       $TAGCFG;OK
```

| Field | Values |
|-------|--------|
| MODE | 0=Memory, 1=Memory+Filter, 2=AnyTag |
| MASK | Tag mask |
| SAVE_SD | 0=EEPROM, 1=SD card |

---

## 15. Pumps / Fuel Dispensing

### PUMPn - Pump Configuration (Read/Write)

```
Read:  $1234;PUMP1
       $PUMP1;TYPE;INPUT;PRODUCT;OUTPUT;RFID_ID;PULSE;START_TOUT;STOP_TOUT;RFID_TOUT;TOTAL;2ND_OUT;2ND_START;2ND_STOP;RFID_MODE;ROUND;PRICE

Write: $1234;PUMP1;TYPE;INPUT;PRODUCT;OUTPUT;RFID_ID;PULSE;START_TOUT;STOP_TOUT;RFID_TOUT;TOTAL;2ND_OUT;2ND_START;2ND_STOP;RFID_MODE;ROUND;PRICE
       $PUMP1;OK
```

| Field | Description | Range |
|-------|-------------|-------|
| TYPE | Pump type | 0=disabled, 1=Pulse, 2=ISKRA, 3=LCR, 4=AVKO, 6=TOPAZ, 10=ML, 11=BUI |
| INPUT | Input number or encoder (e1-e4) | 1-8 or E1-E4 |
| PRODUCT | Product type | 1-4 |
| OUTPUT | Output number (relay 1) | 1-4 |
| RFID_ID | RFID reader ID | 12 hex symbols |
| PULSE | Pulse rate (float) | 0-2000 (e.g. 028.000) |
| START_TOUT | Start timeout | 0-120 sec |
| STOP_TOUT | Stop timeout | 0-120 sec |
| RFID_TOUT | RFID timeout | 0-120 sec |
| TOTAL | Totalizer (float) | up to 11 chars (e.g. 00000000.00) |
| 2ND_OUT | Secondary output (relay 2) | 0-4 (0=disabled) |
| 2ND_START | Secondary start threshold (liters) | float (e.g. 0.000000) |
| 2ND_STOP | Secondary stop threshold (liters) | float (e.g. 1.000000) |
| RFID_MODE | Passive RFID mode | 0=off, 1=on |
| ROUND | Dose rounding (liters) | float (e.g. 0.200000) |
| PRICE | Price per liter | float (e.g. 0.0000) |

**Example (full 17 fields):**
```
$1234;PUMP1;1;E1;1;1;C5F5CED08C35;028.000;30;10;0;00000000.00;3;0.000000;1.000000;0;0.200000;0.0000
$PUMP1;OK
```

> **Note:** Up to 8 pumps supported (PUMP1-PUMP8).

### FUEL - Fuel Status / Remote Control

```
Read status: $1234;FUEL
             $FUEL;STATUS1;FUEL1;TOTAL1;STATUS2;FUEL2;TOTAL2;STATUS3;FUEL3;TOTAL3;STATUS4;FUEL4;TOTAL4

Remote start: $1234;FUEL;1;PUMP;TAG_ID;LIMIT;PIN;VEHICLE_ID;ODOMETER
Remote stop:  $1234;FUEL;0;PUMP
              $FUEL;OK

Read (FUELCRL): $1234;FUELCRL;PUMP;ENABLE;TAG_ID;LIMIT;PIN;VID;ODO
Pump Enable:    $1234;FUELCRL;PUMPEN;1
Pump Disable:   $1234;FUELCRL;PUMPEN;0
```

### PUMPSEC - Pump Security (Read/Write)

```
Read:  $1234;PUMPSEC
       $PUMPSEC;LOW_LVL_EN;MAX_DOZE_EN;LOW_LVL_THRESH;MAX_DOZE_THRESH;ALARM_EN;?;ALARM_TIMER;AUTH_TYPE;AUTH_METHOD;RESERVED

Write: $1234;PUMPSEC;LOW_LVL_EN;MAX_DOZE_EN;LOW_LVL_THRESH;MAX_DOZE_THRESH;ALARM_EN;4;ALARM_TIMER;AUTH_TYPE;AUTH_METHOD
       $PUMPSEC;OK
```

> **Note:** Read response returns 10 fields. The last field (RESERVED) is read-only and not sent during write.

| Field | Description |
|-------|-------------|
| LOW_LVL_EN | Low level check enable (0/1) |
| MAX_DOZE_EN | Max dose check enable (0/1) |
| LOW_LVL_THRESH | Low level threshold |
| MAX_DOZE_THRESH | Max dose threshold |
| ALARM_EN | Alarm output enable (0/1) |
| ALARM_TIMER | Alarm timer (seconds) |
| AUTH_TYPE | Authorization type bitmask (hex) |
| AUTH_METHOD | 0=Offline, 1=Online, 2=Online/Offline |
| RESERVED | Reserved (read-only) |

**AUTH_TYPE bitmask:**
| Bit | Type |
|-----|------|
| 0 | All |
| 1 | Code (UI keypad) |
| 2 | iButton |
| 3 | RFID |
| 4 | Remote |

| AUTH_TYPE | Description |
|-----------|-------------|
| `02` | UI keypad only |
| `04` | iButton only |
| `06` | iButton + UI |
| `08` | RFID only |
| `0a` | RFID + UI |
| `1a` | RFID + UI + Remote |
| `1c` | RFID + iButton + Remote |
| `1f` | All types |

**Example:**
```
$1234;PUMPSEC;1;1;3000;12000
$PUMPSEC;OK
```

### PUMPFRMT - Pump Display Format

```
$1234;PUMPFRMT1;VALUE_FMT;TOTAL_FMT;LIMIT_FMT;LIMIT_LEN
```

### Pump Driver Commands

```
// MT124 RFID reader
$1234;MT124;SET;PUMP_IDX;1;READER_ID    (enable)
$1234;MT124;SET;PUMP_IDX;0               (disable)

// ISKRA pump
$1234;ISKRA;SET;PUMP_IDX;ENABLE;PUMP_NUMBER

// TOPAZ pump
$1234;TOPAZ;SET;PUMP_IDX;ENABLE

// DART pump
$1234;DART;SET;PUMP_IDX;ENABLE

// ASN pump
$1234;ASN;SET;PUMP_IDX;ENABLE

// KUP pump
$1234;KUP;SET;PUMP_IDX;ENABLE

// HID mode
$1234;HID;SET;1
```

### BYPASS - Bypass Mode (Read/Write)

```
Read:  $1234;BYPASS
       $BYPASS;ENABLE;MOTION_EN;MIN_THRESHOLD

Write: $1234;BYPASS;ENABLE;MOTION_EN;MIN_THRESHOLD
       $BYPASS;OK
```

| Field | Description |
|-------|-------------|
| ENABLE | Bypass on/off (0/1) |
| MOTION_EN | Bypass during motion (0/1) |
| MIN_THRESHOLD | Minimum level threshold (float) |

**Example:**
```
$1234;BYPASS;1;1;1.5
$BYPASS;OK
```

### EMSTOP - Emergency Stop (Read/Write)

```
Read:  $1234;EMSTOP
       $EMSTOP;ENABLE;INPUT;LEVEL;OPERATOR_CHECK

Write: $1234;EMSTOP;ENABLE;INPUT;LEVEL;OPERATOR_CHECK
       $EMSTOP;OK
```

---

## 16. User Interface Module (Keypad/Display)

### UIM (Read/Write)

```
Read:  $1234;UIM
       $UIM;ENABLE;KEYPAD;REQ_PUMP;REQ_LIMIT;REQ_VEHID;REQ_ODO;REQ_PIN;KEY_SOUND;TERM_SOUND;GREETING;GOODBYE;TAG_SEARCH;CHECK_VID;PROJECT_ID;COMPARE_ODO;ENGINE

Write: $1234;UIM;ENABLE;KEYPAD;REQ_PUMP;REQ_LIMIT;REQ_VEHID;REQ_ODO;REQ_PIN;KEY_SOUND;TERM_SOUND;GREETING;GOODBYE;TAG_SEARCH;CHECK_VID;PROJECT_ID;COMPARE_ODO;ENGINE
       $UIM;OK
```

| Field | Description | Values |
|-------|-------------|--------|
| ENABLE | UIM on/off | 0/1 |
| KEYPAD | Use keypad | 0/1 |
| REQ_PUMP | Request pump number | 0=request, 1=no |
| REQ_LIMIT | Request limit | 0=request, 1=no |
| REQ_VEHID | Request vehicle ID | 0=request, 1=no |
| REQ_ODO | Request odometer | 0=request, 1=no |
| REQ_PIN | Request PIN | 0=request, 1=no |
| KEY_SOUND | Keypad sound | 0=off, 1=on |
| TERM_SOUND | Terminal sound | 0=off, 1=on |
| GREETING | Power-up message | 16 ASCII chars |
| GOODBYE | Power-down message | 16 ASCII chars |
| TAG_SEARCH | Tag searching message | 16 ASCII chars |

**Example:**
```
$1234;UIM;1;1;1;1;1;1;0;0;1;  Launching...  ; Shutting Down  ;  Searching...
$UIM;OK
```

### UIMX - Extended UIM Settings

```
Read:  $1234;UIMX
       $UIMX;DRIVER_TAG_TYPE;ALLOW_DRIVER_CODE

Write: $1234;UIMX;DRIVER_TAG_TYPE;ALLOW_DRIVER_CODE
       $UIMX;OK
```

### PROMPTn - Custom Display Prompts

```
Read:  $1234;PROMPT1
Write: $1234;PROMPT1;"      PIN ?     "
```
- 10 prompts available (PROMPT1 through PROMPT10)
- Must be in quotes, 16 characters max

---

## 17. Printer

### PRINTER (Read/Write)

```
Read:  $1234;PRINTER;GET
       $PRINTER;ENABLE;LANGUAGE;TIMEZONE;RESERVED

Write: $1234;PRINTER;SET;ENABLE;LANGUAGE;TIMEZONE
       $PRINTER;OK
```

> **Note:** Read response returns 4 fields. RESERVED is read-only and not sent during write.

| Field | Values |
|-------|--------|
| ENABLE | 00=OFF, 01=ON, 03=AUTO Receipt |
| LANGUAGE | 0=English, 1=Russian |
| TIMEZONE | Hour offset (e.g. +3) |
| RESERVED | Reserved (read-only) |

### PRNTN / PRNTP / PRNTW - Printer Text (Unicode)

```
Read:  $1234;PRNTN
       $PRNTN;UNICODE_HEX

Write: $1234;PRNTN;UNICODE_HEX
       $PRNTN;OK
```

| Command | Field |
|---------|-------|
| PRNTN | Station name |
| PRNTP | Phone number |
| PRNTW | Website |

Values are stored as **UTF-16LE hex strings**. Each character is encoded as 4 hex digits (2 bytes, little-endian).

**Encoding example:** "АЗС 1" → `1004100417042100200031`
- А = 0410 → stored as `1004`
- З = 0417 → stored as `1704`  
- С = 0421 → stored as `2104`
- (space) = 0020 → stored as `2000`
- 1 = 0031 → stored as `3100`

**Decoding:** Read hex string, split into 4-char groups, swap byte pairs, convert to Unicode codepoints.

---

## 18. Protocol / Report Configuration

### PROTOCOL - Protocol Field Control (Read/Write)

```
Get field: $1234;PROTOCOL;GET;DATA_PROTO_TYPE;FIELD_ID
           $PROTOCOL;1   (enabled)
           $PROTOCOL;0   (disabled)

Set field: $1234;PROTOCOL;SET;DATA_PROTO_TYPE;ID1;ID2;...;IDn
           $PROTOCOL;OK

Reset:     $1234;PROTOCOL;RESET;DATA_PROTO_TYPE;ID1;ID2;...
           $PROTOCOL;OK
```

| DATA_PROTO_TYPE | Protocol |
|-----------------|----------|
| 0 | IPS |
| 1 | CTR |

FIELD_ID: 2-digit hex value.

### PRSETn - Protocol Preset Bitmask (Read/Write)

The first digit indicates protocol type, the second digit indicates the register:

| Command | Protocol | Register | Byte range |
|---------|----------|----------|------------|
| PRSET10 | IPS (0) | 0 | Bytes 0-7 |
| PRSET11 | IPS (0) | 1 | Bytes 8-15 |
| PRSET20 | CTR (1) | 0 | Bytes 0-7 |
| PRSET21 | CTR (1) | 1 | Bytes 8-15 |

```
Read:  $1234;PRSET20;GET
       $PRSET20;XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX   (32-char hex = 128 bits)

Write: $1234;PRSET20;SET;XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
       $PRSET20;OK
```

Each hex char represents 4 bits. The 32-char string = 128 bits = 16 bytes = 8 fields × 2 bytes each.

PRSET20 controls main protocol fields (CTR): device status, sample number, HDOP, internal temp, accelerometer, Vext, GSM LBS, GSM RSSI, inputs 1-8, outputs 1-4, LLS 1-6.

PRSET21 controls sensor fields (CTR): sensor 1-6.

> **Note:** GT-9 Configurator v2 uses only CTR protocol (PRSET20/PRSET21).

---

## 19. Struna Sensor System

### STRUNA (Read/Write)

```
Read config: $1234;STRUNA;GET
             $STRUNA;ENABLE;NETWORK_ADDR;CHANNELS;ACQ_INTERVAL;MEM_INTERVAL

Write: $1234;STRUNA;SET;ENABLE;NETWORK_ADDR;CHANNELS;ACQ_INTERVAL;MEM_INTERVAL
       $STRUNA;OK

Read channel: $1234;STRUNA1
              $STRUNA1;...   (channel data)
```

---

## 20. CAN Bus

### ECU (Read/Write)

```
Read live: $1234;ECU
           $ECU;ENABLED;DETECTED;CONNECTED;VIN

Read config: $1234;ECU;GET
             $ECU;ENABLE;MODE;SPEED

Write: $1234;ECU;SET;ENABLE;MODE;SPEED
       $ECU;OK
```

| CAN MODE | Description |
|----------|-------------|
| 0 | OFF |
| 1 | OBD2 11-bit |
| 2 | OBD2 29-bit |
| 3 | FMS 11-bit |
| 4 | FMS 29-bit |
| 5 | USER1 |
| 6 | USER2 |
| 7 | OBD2 11-bit SLAVE |

CAN SPEED: 125000 - 1000000.

### CANLOG (Read/Write)

```
Read live: $1234;CANLOG
           $CANLOG;ENABLED;CONNECTED;PARAM1;...;PARAM15

Read config: $1234;CANLOG;GET
             $CANLOG;ENABLE

Write: $1234;CANLOG;SET;ENABLE
       $CANLOG;OK
```

### IMMO - Immobilizer (Read/Write)

```
Read:  $1234;IMMO
       $IMMO;MODE;IGN_IN;IMMO_OUT;BUZ_OUT;LOCK_TOUT;ALARM_TOUT;BUZZER_TOUT

Write: $1234;IMMO;MODE;IGN_IN;IMMO_OUT;BUZ_OUT;LOCK_TOUT;ALARM_TOUT;BUZZER_TOUT
       $IMMO;OK
```

| MODE | Description |
|------|-------------|
| 0 | OFF |
| 1 | Secure Key Mode |
| 2 | Any Key Mode |

---

## 21. Geofence

### GEOFENCE (Read/Write)

```
Read:    $1234;GEOFENCE
         $GEOFENCE;TOTAL;NUMBER

Polygon: $1234;GEOFENCE;ADD;IDX;ENABLE;1;UL_LAT;SN;UL_LNG;WE;LR_LAT;SN;LR_LNG;WE
Circle:  $1234;GEOFENCE;ADD;IDX;ENABLE;2;CENTER_LAT;SN;CENTER_LNG;WE;RADIUS
Edit:    $1234;GEOFENCE;EDIT;IDX;...
Delete:  $1234;GEOFENCE;DEL;IDX
         $1234;GEOFENCE;DEL;ALL
```

| GEOFENCE_TYPE | Shape |
|---------------|-------|
| 0 | Not valid |
| 1 | Polygon (rectangle) |
| 2 | Circle |

Max 8 geofences. Radius in meters.

### GEOFENCEn - Read Individual Geofence

```
$1234;GEOFENCE1
$GEOFENCE1;ENABLE;ACTIVE;TYPE;...coordinates...
```

---

## 22. Memory / Data

### MEM - Total Memory Info (Read Only)

```
$1234;MEM
$MEM;TOTAL;EMPTY;IN_PROGRESS;SENT;VALID;ERRORED;UNKNOWN;WRITE_IDX;READ_IDX
```

### MEMR - Report Samples Memory (Read Only)

```
$1234;MEMR
$MEMR;TOTAL;EMPTY;IN_PROGRESS;SENT;VALID;ERRORED;UNKNOWN;WRITE_IDX;READ_IDX
```

### MEMT - Transaction Samples Memory (Read Only)

```
$1234;MEMT
$MEMT;TOTAL;EMPTY;IN_PROGRESS;SENT;VALID;ERRORED;UNKNOWN;WRITE_IDX;READ_IDX
```

### SAMPLER - Read Report Sample (Read Only)

```
$1234;SAMPLER;IDX
$SAMPLER;IDX;DATE;TIME;LAT;LONG;ALT;HEADING;HDOP;SATS;SPEED;GSM_STAT;GSM_RSSI;MCC;MNC;LAC;CID;WIFI_STAT;WIFI_RSSI;V_EXT;V_INT;TEMP;IN_T1-T4;IN_A1-A2;IN_D1-D2;EKEY;LLS0;LLS1;OUT1-OUT4
```

### SAMPLET - Read Transaction Sample (Read Only)

```
$1234;SAMPLET;IDX
$SAMPLET;IDX;LAT;LONG;ALT;SPEED;START_TIME;STOP_TIME;TAG_ID;AUTH;TAG_VOLT;PUMP;FUEL_L;FUEL_P;TOTAL;LLS0_LITR;LLS0_LVL;LLS0_TEMP;LLS0_DENS;LLS1_LITR;LLS1_LVL;LLS1_TEMP;LLS1_DENS;VID;ODO
```

Returns `$SAMPLET;DE` when no more data.

**Example:**
```
$1234;SAMPLET;0
$SAMPLET;1f;0;4730.7183;N;12212.1482;W;+9;0;31/10/14;02:42:32;31/10/14;02:42:58;000000123456;2;000;1;00007.51;000000272;00000078.27;0;0;+0;0;0;0;+0;0;0958;00065247
```

### SFLASH - Flash Memory Operations

```
$1234;SFLASH;REFRESH     (check memory and restore pointers)
```

### SAMPLET;CREATE - Create Test Transactions

```
$1234;SAMPLET;CREATE       (create 1 transaction)
$1234;SAMPLET;CREATE;100   (create 100 transactions)
```

---

## 23. SD Card

### SDCARD - Enable/Disable

```
$1234;SDCARD;SET;1    (enable, requires RESET after)
$1234;SDCARD;SET;0    (disable)
```

### FILE - SD Card Tag File Operations

```
$1234;FILE;T    (truncate tag.bin)
$1234;FILE;I    (initialize tag.bin)
$1234;FILE;D    (remove tag.bin)
$1234;FILE;R    (reset)
$1234;FILE;S    (size)
$1234;FILE;C    (check)
```

SD logging: `$1234;LOG;39`

---

## 24. Debug Logging

### LOG (Read/Write)

```
Read:  $1234;LOG
       $LOG;LOG_MODE;DBG_ENABLE

Disable all: $1234;LOG;0

Enable channel:  $1234;LOG;CHANNEL
Disable channel: $1234;LOG;-CHANNEL

Enable debug:  $1234;LOG;;DBG_CHANNEL
Disable debug: $1234;LOG;;-DBG_CHANNEL

Timestamp on:  $1234;LOG;TS;1
Timestamp off: $1234;LOG;TS;0

Reset: $1234;LOG;RESET
```

| Channel | Description |
|---------|-------------|
| 2 | GSM |
| 3 | GPS |
| 4 | WiFi |
| 5 | OneWire |
| 6/14 | RS232 / RS232A |
| 7/16 | RS485 / RS485A |
| 12 | SFLASH |
| 13 | SD |
| 15 | RS232B |
| 17 | RS485B |
| 22 | Pump user log |
| 23 | Encoder log |
| 39 | SD logging |

| Debug Channel | Description |
|---------------|-------------|
| 27 | Fuel/Pump debug |
| 28 | RS debug |
| 29 | Camera debug |
| 30 | HUB debug |

---

## 25. Power Management

### PWROFF - Power Off (Read/Write)

```
Get timeout: $1234;PWROFF;GET
             $PWROFF;300

Set timeout: $1234;PWROFF;SET;10
             $PWROFF;OK

Power off now:          $1234;PWROFF
Power off with timeout: $1234;PWROFF;300
                        $PWROFF;OK
```

### OFF - Device Off

```
$1234;OFF
$OFF;OK
```

---

## 26. System Commands

### RESET - Device Reset

```
$1234;RESET
$RESET;OK
```

### DEFAULT - Restore Default Settings

```
$1234;DEFAULT
$DEFAULT;OK
```

### FACTORY - Full Factory Reset

```
$1234;FACTORY
$FACTORY;OK
```

### ERASURE - Erase Sample Memory

```
$1234;ERASURE
$ERASURE;OK
```

### UPDATE - Trigger Firmware Update

```
$1234;UPDATE
$UPDATE;OK
```

### FOTA - FOTA Firmware Update (Debug)

```
$1234;FOTA
$FOTA;OK
```

### GT2;UPDATE - Update GT2 Module

```
$1234;GT2;UPDATE
```

### CLEART / CLEARR - Clear Transaction/Report Memory

```
$1234;CLEART
$1234;CLEARR
```

---

## 27. EMIS (Electromagnetic Flow Meter)

```
Read status:   $1234;EMIS
Read channel:  $1234;EMIS1
Start (debug): $1234;EMIS;START
Stop (debug):  $1234;EMIS;STOP
Reset:         $1234;EMIS;RESET
Zero:          $1234;EMIS;ZERO
```

Serial config:
```
$1234;RS485;32;9600      (EMIS master)
$1234;RS485A;127;9600    (EMIS emulator)
```

### ML (Mass Liquid Meter)

```
Read:          $1234;MLS
Read channel:  $1234;MLS1
Start:         $1234;MLS;START
Stop:          $1234;MLS;STOP
```

Serial config:
```
$1234;RS485;30;9600      (ML master)
$1234;RS485A;125;9600    (ML slave)
```

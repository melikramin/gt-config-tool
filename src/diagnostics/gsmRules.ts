import type { Hint, GsmContext, GpsBlock } from './gsmAnalyzer.types';

export interface Rule {
  id: string;
  test: RegExp;
  // match — результат regex; ctx — текущий контекст (уже с учётом этой строки)
  build?: (match: RegExpMatchArray, ctx: GsmContext) => Hint | null;
  updateContext?: (match: RegExpMatchArray, ctx: GsmContext) => void;
}

// Хелпер для «строка → фиксированный текст» без подстановок.
function plain(id: string, test: RegExp, severity: Hint['severity'], en: string, ru: string): Rule {
  return { id, test, build: () => ({ severity, en, ru }) };
}

// --- §3.6 Пороги сигнала ---------------------------------------------------

function buildQcsqLte(rsrp: number, rsrq: number): Hint {
  let wEn: string, wRu: string;
  if (rsrp >= -90) { wEn = 'excellent'; wRu = 'отличный'; }
  else if (rsrp >= -105) { wEn = 'good'; wRu = 'хороший'; }
  else if (rsrp >= -110) { wEn = 'weak'; wRu = 'слабый'; }
  else { wEn = 'very weak'; wRu = 'очень слабый'; }

  let qEn = '', qRu = '';
  if (rsrq < -15) { qEn = `, poor channel quality (RSRQ ${rsrq})`; qRu = `, плохое качество канала (RSRQ ${rsrq})`; }
  else if (rsrq < -12) { qEn = `, marginal quality (RSRQ ${rsrq})`; qRu = `, качество на грани (RSRQ ${rsrq})`; }

  // §3.6: warn, если RSRP < -110 ИЛИ RSRQ < -15; иначе ok.
  const severity: Hint['severity'] = rsrp < -110 || rsrq < -15 ? 'warn' : 'ok';
  return {
    severity,
    en: `LTE signal ${wEn} (RSRP ${rsrp} dBm)${qEn}`,
    ru: `Сигнал LTE ${wRu} (RSRP ${rsrp} dBm)${qRu}`,
  };
}

function buildQcsqGsm(dbm: number): Hint {
  let wEn: string, wRu: string;
  if (dbm >= -75) { wEn = 'excellent'; wRu = 'отличный'; }
  else if (dbm >= -90) { wEn = 'good'; wRu = 'хороший'; }
  else if (dbm >= -100) { wEn = 'weak'; wRu = 'слабый'; }
  else { wEn = 'very weak'; wRu = 'очень слабый'; }
  const severity: Hint['severity'] = dbm < -90 ? 'warn' : 'ok';
  return {
    severity,
    en: `GSM signal ${wEn} (${dbm} dBm)`,
    ru: `Сигнал GSM ${wRu} (${dbm} dBm)`,
  };
}

function buildQcsqWcdma(rscp: number, ecno: number): Hint {
  // §пороги: RSCP < -95 → слабо/очень слабо; Ec/No < -13 → плохое качество.
  const severity: Hint['severity'] = rscp < -95 || ecno < -13 ? 'warn' : 'info';
  return {
    severity,
    en: `3G (WCDMA) signal RSCP ${rscp} dBm, Ec/No ${ecno} dB`,
    ru: `Сигнал 3G (WCDMA) RSCP ${rscp} dBm, Ec/No ${ecno} dB`,
  };
}

// --- Обновление контекста для регистрации ----------------------------------

function regUp(ctx: GsmContext): void {
  ctx.registered = true;
  ctx.noService = false;
  ctx.regSearchStreak = 0;
}
function regDown(ctx: GsmContext): void {
  ctx.registered = false;
  ctx.regSearchStreak = 0;
}

// ===========================================================================
// §3. Основная таблица правил (строка → подсказка). Порядок важен: первое
// правило с ненулевым build даёт подсказку. updateContext выполняют все
// подходящие правила.
// ===========================================================================

export const GSM_RULES: Rule[] = [
  // --- §3.1 SIM / питание ---
  plain('cpin-ready', /\+CPIN:\s*READY/, 'ok', 'SIM ready', 'SIM-карта готова'),
  plain('cpin-not-ready', /\+CPIN:\s*NOT READY/, 'warn', 'SIM not ready (initializing)', 'SIM-карта не готова (инициализация)'),
  plain('cme-10', /\+CME ERROR:\s*10\b/, 'error', 'SIM not inserted', 'SIM-карта не вставлена'),
  plain('cme-13', /\+CME ERROR:\s*13\b/, 'error', 'SIM failure', 'Ошибка SIM-карты'),
  plain('cme-14', /\+CME ERROR:\s*14\b/, 'warn', 'SIM busy, retrying', 'SIM занята, повтор'),
  {
    id: 'ccid',
    test: /\+(?:Q?CCID):\s*(\S+)/,
    build: (m) => ({ severity: 'info', en: `SIM detected (ICCID ${m[1]})`, ru: `SIM определена (ICCID ${m[1]})` }),
  },
  {
    id: 'cbc',
    test: /\+CBC:\s*0,\s*(\d+),\s*(\d+)/,
    build: (m) => ({ severity: 'info', en: `Battery ${m[1]}% (${m[2]} mV)`, ru: `Батарея ${m[1]}% (${m[2]} мВ)` }),
  },

  // --- §3.2 Оператор / регистрация ---
  {
    id: 'cops-name',
    test: /\+COPS:\s*\d+,\s*\d+,"([^"]+)"/,
    build: (m) => ({ severity: 'ok', en: `Operator: ${m[1]}`, ru: `Оператор: ${m[1]}` }),
  },
  {
    id: 'cops-none',
    test: /\+COPS:\s*0(?![,\d])/,
    build: () => ({ severity: 'warn', en: 'No operator selected yet', ru: 'Оператор ещё не выбран' }),
    updateContext: (_m, ctx) => { ctx.noService = true; },
  },
  {
    id: 'creg-1',
    test: /\+CREG:\s*\d+,\s*1\b/,
    build: () => ({ severity: 'ok', en: 'Registered (home network)', ru: 'Зарегистрирован (домашняя сеть)' }),
    updateContext: (_m, ctx) => regUp(ctx),
  },
  {
    id: 'creg-5',
    test: /\+CREG:\s*\d+,\s*5\b/,
    build: () => ({ severity: 'ok', en: 'Registered (roaming)', ru: 'Зарегистрирован (роуминг)' }),
    updateContext: (_m, ctx) => regUp(ctx),
  },
  {
    id: 'creg-2',
    test: /\+CREG:\s*\d+,\s*2\b/,
    build: () => ({ severity: 'warn', en: 'Searching for network...', ru: 'Идёт поиск сети...' }),
    updateContext: (_m, ctx) => { ctx.registered = false; ctx.regSearchStreak = (ctx.regSearchStreak ?? 0) + 1; },
  },
  {
    id: 'creg-0',
    test: /\+CREG:\s*\d+,\s*0\b/,
    build: () => ({ severity: 'error', en: 'Not registered, not searching', ru: 'Нет регистрации, поиск не идёт' }),
    updateContext: (_m, ctx) => regDown(ctx),
  },
  {
    id: 'creg-3',
    test: /\+CREG:\s*\d+,\s*3\b/,
    build: () => ({ severity: 'error', en: 'Registration denied', ru: 'В регистрации отказано' }),
    updateContext: (_m, ctx) => regDown(ctx),
  },
  {
    id: 'cgreg-1',
    test: /\+CGREG:\s*\d+,\s*1\b/,
    build: () => ({ severity: 'ok', en: 'Packet network attached (home)', ru: 'Пакетная сеть подключена (домашняя)' }),
    updateContext: (_m, ctx) => regUp(ctx),
  },
  {
    id: 'cgreg-5',
    test: /\+CGREG:\s*\d+,\s*5\b/,
    build: () => ({ severity: 'ok', en: 'Packet network attached (roaming)', ru: 'Пакетная сеть подключена (роуминг)' }),
    updateContext: (_m, ctx) => regUp(ctx),
  },
  {
    id: 'cgreg-2',
    test: /\+CGREG:\s*\d+,\s*2\b/,
    build: () => ({ severity: 'warn', en: 'Searching for packet network...', ru: 'Поиск пакетной сети...' }),
    updateContext: (_m, ctx) => { ctx.registered = false; },
  },
  {
    id: 'cgreg-0',
    test: /\+CGREG:\s*\d+,\s*0\b/,
    build: () => ({ severity: 'warn', en: 'Packet network not attached', ru: 'Пакетная сеть не подключена' }),
    updateContext: (_m, ctx) => { ctx.registered = false; },
  },
  {
    id: 'cgreg-3',
    test: /\+CGREG:\s*\d+,\s*3\b/,
    build: () => ({ severity: 'error', en: 'Packet network registration denied', ru: 'В регистрации пакетной сети отказано' }),
    updateContext: (_m, ctx) => { ctx.registered = false; },
  },
  {
    id: 'cereg-1',
    test: /\+CEREG:\s*\d+,\s*1\b/,
    build: () => ({ severity: 'info', en: 'LTE registered (not internet yet)', ru: 'LTE зарегистрирован (это ещё не интернет)' }),
    updateContext: (_m, ctx) => regUp(ctx),
  },
  {
    id: 'cereg-0',
    test: /\+CEREG:\s*\d+,\s*0\b/,
    build: () => ({ severity: 'info', en: 'LTE not registered', ru: 'LTE не зарегистрирован' }),
    updateContext: (_m, ctx) => { ctx.registered = false; },
  },
  {
    id: 'cereg-3',
    test: /\+CEREG:\s*\d+,\s*3\b/,
    build: () => ({ severity: 'error', en: 'LTE registration denied', ru: 'В регистрации LTE отказано' }),
    updateContext: (_m, ctx) => { ctx.registered = false; },
  },
  {
    id: 'qspn',
    test: /\+QSPN:\s*"([^"]+)"/,
    build: (m) => ({ severity: 'info', en: `Network: ${m[1]}`, ru: `Сеть: ${m[1]}` }),
  },

  // --- §3.3 Тип сети / сигнал ---
  {
    id: 'qnwinfo-noservice',
    test: /\+QNWINFO:\s*No Service/i,
    build: () => ({ severity: 'error', en: 'No network service', ru: 'Нет сети' }),
    updateContext: (_m, ctx) => { ctx.noService = true; },
  },
  {
    id: 'qnwinfo',
    test: /\+QNWINFO:\s*"([^"]+)","([^"]*)","([^"]*)"/,
    build: (m) => ({ severity: 'info', en: `Network: ${m[1]}, ${m[3]}`, ru: `Сеть: ${m[1]}, ${m[3]}` }),
    updateContext: (m, ctx) => {
      ctx.noService = false;
      const rat = m[1].toUpperCase();
      if (rat === 'LTE' || rat === 'GSM' || rat === 'WCDMA') ctx.lastRat = rat;
    },
  },
  {
    // Единое правило QCSQ с ветвлением по типу сети (RAT). Поля:
    //   LTE:   rssi, rsrp, sinr, rsrq  → берём rsrp/rsrq
    //   GSM:   rxlev(dBm)              → берём dBm
    //   WCDMA: rssi, rscp, ecno        → берём rscp/ecno
    id: 'qcsq',
    test: /\+QCSQ:\s*"([^"]+)"((?:,\s*-?\d+)*)/,
    build: (m) => {
      const rat = m[1].toUpperCase();
      const nums = (m[2].match(/-?\d+/g) ?? []).map(Number);
      if (rat === 'LTE' && nums.length >= 4) return buildQcsqLte(nums[1], nums[3]);
      if (rat === 'GSM' && nums.length >= 1) return buildQcsqGsm(nums[0]);
      if (rat === 'WCDMA' && nums.length >= 3) return buildQcsqWcdma(nums[1], nums[2]);
      return null; // прочее (напр. "NOSERVICE") — отдаём следующему правилу
    },
    updateContext: (m, ctx) => {
      const rat = m[1].toUpperCase();
      if (rat === 'LTE' || rat === 'GSM' || rat === 'WCDMA') ctx.lastRat = rat;
    },
  },
  {
    id: 'qcsq-noservice',
    test: /\+QCSQ:\s*"NOSERVICE"/,
    build: () => ({ severity: 'error', en: 'No signal', ru: 'Нет сигнала' }),
    updateContext: (_m, ctx) => { ctx.noService = true; },
  },
  plain('csq-9999', /\+CSQ:\s*99,\s*99\b/, 'warn', 'Signal unknown / no network', 'Сигнал неизвестен / нет сети'),
  {
    id: 'csq',
    test: /\+CSQ:\s*(\d+),\s*(\d+)/,
    build: (m) => (m[1] === '99' ? null : { severity: 'info', en: `Signal level ${m[1]}/31`, ru: `Уровень сигнала ${m[1]}/31` }),
  },

  // --- §3.4 Данные / интернет ---
  plain('cgatt-1', /\+CGATT:\s*1\b/, 'ok', 'Packet service attached (GPRS/data)', 'Пакетная передача подключена (GPRS/данные)'),
  plain('cgatt-0', /\+CGATT:\s*0\b/, 'error', 'No packet service (no GPRS)', 'Нет пакетной передачи (нет GPRS)'),
  {
    id: 'cgact-1-1',
    test: /\+CGACT:\s*1,\s*1\b/,
    build: () => ({ severity: 'ok', en: 'PDP context active', ru: 'PDP-контекст активен' }),
    updateContext: (_m, ctx) => { ctx.pdpActive = true; },
  },
  {
    id: 'cgact-1-0',
    test: /\+CGACT:\s*1,\s*0\b/,
    build: () => ({ severity: 'warn', en: 'PDP context not active', ru: 'PDP-контекст не активен' }),
    updateContext: (_m, ctx) => { ctx.pdpActive = false; },
  },
  {
    id: 'qiact',
    test: /\+QIACT:\s*1,\s*1,\s*1,"([^"]+)"/,
    build: (m) => (m[1] === '0.0.0.0'
      ? null
      : { severity: 'ok', en: `Internet ready (IP ${m[1]})`, ru: `Интернет есть (IP ${m[1]})` }),
    updateContext: (m, ctx) => { ctx.hasIp = m[1] !== '0.0.0.0'; },
  },
  {
    id: 'cgdcont-noip',
    test: /\+CGDCONT:\s*1,"IP","([^"]*)","0\.0\.0\.0"/,
    build: (m) => ({ severity: 'info', en: `APN ${m[1]}, IP not assigned yet`, ru: `APN ${m[1]}, IP ещё не выдан` }),
  },
  {
    id: 'cgdcont-ip',
    test: /\+CGDCONT:\s*1,"IP","([^"]*)","([^"]+)"/,
    build: (m) => (m[2] === '0.0.0.0'
      ? null
      : { severity: 'ok', en: `APN ${m[1]}, IP ${m[2]}`, ru: `APN ${m[1]}, IP ${m[2]}` }),
    updateContext: (m, ctx) => { if (m[2] !== '0.0.0.0') ctx.hasIp = true; },
  },

  // --- §3.5 Сокет / сервер / протокол ---
  {
    id: 'qiopen-cmd',
    test: /AT\+QIOPEN=[^"]*"[A-Z]+","([^"]+)",\s*(\d+)/,
    build: (m) => ({ severity: 'info', en: `Connecting to server ${m[1]}:${m[2]}...`, ru: `Подключение к серверу ${m[1]}:${m[2]}...` }),
  },
  plain('qiopen-ok', /\+QIOPEN:\s*\d+,\s*0\b/, 'ok', 'Connected to server', 'Подключился к серверу'),
  plain('qiopen-563', /\+QIOPEN:\s*\d+,\s*563\b/, 'error', 'Socket busy (not released) — needs QICLOSE', 'Сокет занят (не освобождён) — нужен QICLOSE'),
  plain('qiopen-565', /\+QIOPEN:\s*\d+,\s*565\b/, 'error', 'Socket open failed (network)', 'Не удалось открыть сокет (сеть)'),
  plain('qiopen-567', /\+QIOPEN:\s*\d+,\s*567\b/, 'error', 'Socket open aborted/timeout', 'Открытие сокета прервано/таймаут'),
  {
    id: 'qistate-query',
    test: /AT\+QISTATE\??/,
    build: () => null,
    updateContext: (_m, ctx) => { ctx.awaitingQistate = true; },
  },
  {
    id: 'qistate',
    test: /\+QISTATE:\s*\d+,"[^"]*","([^"]+)",\s*(\d+),\s*\d+,\s*(\d+)/,
    build: (m) => {
      const state = parseInt(m[3], 10);
      if (state === 2) return { severity: 'ok', en: `Socket connected to ${m[1]}:${m[2]}`, ru: `Сокет подключён к ${m[1]}:${m[2]}` };
      if (state === 4) return { severity: 'warn', en: 'Socket closing', ru: 'Сокет закрывается' };
      return null;
    },
    updateContext: (m, ctx) => {
      ctx.awaitingQistate = false;
      ctx.socketConnected = parseInt(m[3], 10) === 2;
    },
  },
  {
    id: 'qistate-empty-ok',
    test: /^\s*OK\s*$/,
    build: (_m, ctx) => (ctx.awaitingQistate ? { severity: 'info', en: 'No socket open', ru: 'Сокет не открыт' } : null),
    updateContext: (_m, ctx) => { ctx.awaitingQistate = false; },
  },
  {
    id: 'qiurc-closed',
    test: /\+QIURC:\s*"closed"/,
    build: () => ({ severity: 'warn', en: 'Server closed the connection', ru: 'Сервер закрыл соединение' }),
    updateContext: (_m, ctx) => { ctx.socketConnected = false; },
  },
  plain('qiurc-recv', /\+QIURC:\s*"recv"/, 'info', 'Data received from server', 'Получены данные от сервера'),
  {
    id: 'qiurc-pdpdeact',
    test: /\+QIURC:\s*"pdpdeact"/,
    build: () => ({ severity: 'error', en: 'PDP context deactivated (data lost)', ru: 'PDP-контекст деактивирован (данные потеряны)' }),
    updateContext: (_m, ctx) => { ctx.pdpActive = false; ctx.hasIp = false; },
  },
  // #AL#1 / #AD#1 должны идти раньше #L# / #D# (регэкспы не пересекаются, но так нагляднее).
  {
    id: 'login-ack',
    test: /#AL#1/,
    build: () => ({ severity: 'ok', en: 'Login accepted by server', ru: 'Логин принят сервером' }),
    updateContext: (_m, ctx) => { ctx.loginSentPending = 0; },
  },
  plain('data-ack', /#AD#1/, 'ok', 'Data record accepted', 'Запись данных принята'),
  {
    id: 'login-send',
    test: /#L#/,
    build: () => ({ severity: 'info', en: 'Sending login...', ru: 'Отправка логина...' }),
    updateContext: (_m, ctx) => { ctx.loginSentPending = (ctx.loginSentPending ?? 0) + 1; },
  },
  plain('data-send', /#D#/, 'info', 'Sending data record...', 'Отправка записи данных...'),
  plain('send-ok', /\bSEND OK\b/, 'info', 'Data handed to modem buffer (not yet server ack)', 'Данные переданы в буфер модема (ещё не подтв. сервером)'),
  plain('powerdown', /AT\+QPOWD=1|POWERED DOWN/, 'warn', 'Modem reboot', 'Перезагрузка модема'),
];

// ===========================================================================
// §4. Контекстные правила-предупреждения. Смотрят на накопленный GsmContext и
// добавляют подсказку СВЕРХ основной. Выполняются после §3-правил той же
// строки (контекст уже обновлён).
// ===========================================================================

export const CONTEXT_RULES: Rule[] = [
  // §4.1 Зомби-сокет: socket connected, но сеть потеряна.
  {
    id: 'zombie-socket',
    test: /\+QISTATE:\s*\d+,"[^"]*","[^"]+",\s*\d+,\s*\d+,\s*2\b/,
    build: (_m, ctx) => (ctx.noService === true || ctx.registered === false
      ? {
          severity: 'error',
          en: 'Zombie socket: shows connected but network is lost — must close & reconnect',
          ru: 'Зомби-сокет: показывает «подключён», но сеть потеряна — нужно закрыть и переподключиться',
        }
      : null),
  },
  // §4.2 Логин-спам: #L# повторяется без #AL#1.
  {
    id: 'login-spam',
    test: /#L#/,
    build: (_m, ctx) => ((ctx.loginSentPending ?? 0) >= 3
      ? {
          severity: 'warn',
          en: 'Login sent repeatedly without server acknowledgement (#AL#1)',
          ru: 'Логин отправляется повторно без подтверждения сервера (#AL#1)',
        }
      : null),
  },
  // §4.3 Регистрация есть, интернета нет.
  {
    id: 'registered-no-internet',
    test: /\+CGDCONT:\s*1,"IP","[^"]*","0\.0\.0\.0"/,
    build: (_m, ctx) => (ctx.registered === true && ctx.hasIp !== true
      ? {
          severity: 'info',
          en: 'Registered but data channel not verified (no real IP yet)',
          ru: 'Зарегистрирован, но канал данных не подтверждён (реального IP ещё нет)',
        }
      : null),
  },
  // §4.4 Поиск сети затянулся.
  {
    id: 'network-search-long',
    test: /\+CREG:\s*\d+,\s*2\b/,
    build: (_m, ctx) => ((ctx.regSearchStreak ?? 0) >= 3
      ? {
          severity: 'warn',
          en: 'Network search ongoing — check SIM roaming/APN if it persists',
          ru: 'Идёт поиск сети — если долго, проверьте роуминг/APN на SIM',
        }
      : null),
  },
];

// ===========================================================================
// GPS / GNSS (NMEA). Анализируем только $__GGA и $__RMC и даём ОДНУ подсказку
// на блок (тик), а не на каждую строку. GGA идёт в начале блока — копим его
// поля в ctx.gpsBlock; $__RMC завершает блок — на нём и рождается подсказка,
// после чего блок сбрасываем. Прочие NMEA (GSV/GSA/VTG) игнорируем.
// ===========================================================================

// ddmm.mmmm (+ полушарие) → десятичные градусы. Округление до 4 знаков — на выводе.
function nmeaToDecimal(value?: string, hemi?: string): number | null {
  if (!value) return null;
  const v = parseFloat(value);
  if (Number.isNaN(v)) return null;
  const deg = Math.floor(v / 100);
  const dec = deg + (v - deg * 100) / 60;
  return hemi === 'S' || hemi === 'W' ? -dec : dec;
}

function toInt(s?: string): number {
  const n = parseInt((s ?? '').trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

// Разбор строки $__GGA в поля блока (индексы полей от токена $__GGA).
function parseGga(line: string): GpsBlock {
  const p = line.split(',');
  return {
    fixQuality: toInt(p[6]),
    numSats: toInt(p[7]),
    hdop: (p[8] ?? '').trim(),
    lat: nmeaToDecimal(p[2], p[3]),
    lon: nmeaToDecimal(p[4], p[5]),
  };
}

// Одна подсказка на блок: накопленная GGA + статус RMC (A/V).
function buildGpsHint(gga: GpsBlock | undefined, rmcStatus: string): Hint {
  const numSats = gga?.numSats ?? 0;
  const fixQuality = gga?.fixQuality ?? 0;
  const hasFix = fixQuality >= 1 && rmcStatus === 'A';

  if (!hasFix) {
    return {
      severity: 'warn',
      en: `No GPS fix (satellites used: ${numSats})`,
      ru: `Нет GPS-фикса (спутников в решении: ${numSats})`,
    };
  }

  // Точность по HDOP: <2 отлично, 2..5 хорошо, >5 плохо.
  const hd = parseFloat(gga?.hdop ?? '');
  let qEn: string, qRu: string;
  if (Number.isNaN(hd)) { qEn = 'unknown'; qRu = 'неизвестная'; }
  else if (hd < 2) { qEn = 'excellent'; qRu = 'отличная'; }
  else if (hd <= 5) { qEn = 'good'; qRu = 'хорошая'; }
  else { qEn = 'poor'; qRu = 'плохая'; }

  const lat = gga?.lat != null ? gga.lat.toFixed(4) : '—';
  const lon = gga?.lon != null ? gga.lon.toFixed(4) : '—';
  const hdop = gga?.hdop ?? '';
  return {
    severity: 'ok',
    en: `GPS fix: ${lat}, ${lon} · ${numSats} sats · accuracy ${qEn} (HDOP ${hdop})`,
    ru: `GPS-фикс есть: ${lat}, ${lon} · спутников: ${numSats} · точность: ${qRu} (HDOP ${hdop})`,
  };
}

// Хвост строки от токена NMEA (отрезаем возможный префикс лога — напр. таймстамп).
function nmeaTail(m: RegExpMatchArray): string {
  return (m.input ?? '').slice(m.index ?? 0);
}

export const GPS_RULES: Rule[] = [
  {
    // $GNGGA / $GPGGA / $GLGGA — начало блока: копим поля, подсказку НЕ даём.
    id: 'nmea-gga',
    test: /\$[A-Z]{2}GGA,/,
    updateContext: (m, ctx) => { ctx.gpsBlock = parseGga(nmeaTail(m)); },
  },
  {
    // $GNRMC / $GPRMC — конец блока: одна подсказка, затем сброс блока.
    // Сброс делаем в build (он выполняется после updateContext-прохода), чтобы
    // подсказка успела прочитать накопленную GGA.
    id: 'nmea-rmc',
    test: /\$[A-Z]{2}RMC,/,
    build: (m, ctx) => {
      const status = (nmeaTail(m).split(',')[2] ?? '').trim().toUpperCase();
      const hint = buildGpsHint(ctx.gpsBlock, status);
      ctx.gpsBlock = undefined;
      return hint;
    },
  },
];

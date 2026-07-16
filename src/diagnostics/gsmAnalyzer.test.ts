import { describe, it, expect } from 'vitest';
import { analyzeGsmLog, hintText, withGsm, withGps } from './gsmAnalyzer';
import type { Hint } from './gsmAnalyzer.types';

// Хелпер: подсказки для единственной строки в режиме gsm.
function hintsOf(line: string): Hint[] {
  return analyzeGsmLog(line, 'gsm')[0].hints;
}
// Первая подсказка строки.
function firstHint(line: string): Hint {
  const hints = hintsOf(line);
  expect(hints.length).toBeGreaterThan(0);
  return hints[0];
}

describe('gsmAnalyzer — §3 строка → подсказка', () => {
  it('+CREG: 0,1 → ok, зарегистрирован в домашней сети', () => {
    const h = firstHint('+CREG: 0,1');
    expect(h.severity).toBe('ok');
    expect(h.ru).toBe('Зарегистрирован (домашняя сеть)');
    expect(h.en).toBe('Registered (home network)');
  });

  it('+CREG: 0,2 → warn, идёт поиск сети', () => {
    const h = firstHint('+CREG: 0,2');
    expect(h.severity).toBe('warn');
    expect(h.ru).toBe('Идёт поиск сети...');
  });

  it('+QCSQ: "LTE",83,-113,121,-17 → warn, слабый RSRP и RSRQ на грани/плохой', () => {
    const h = firstHint('+QCSQ: "LTE",83,-113,121,-17');
    expect(h.severity).toBe('warn');
    // Значения RSRP/RSRQ должны попадать в текст обоих языков.
    expect(h.ru).toContain('-113');
    expect(h.ru).toContain('-17');
    expect(h.ru).toContain('RSRP');
    expect(h.en).toContain('RSRP');
    expect(h.en).toContain('-113');
  });

  it('+QIOPEN: 0,0 → ok, подключился к серверу', () => {
    const h = firstHint('+QIOPEN: 0,0');
    expect(h.severity).toBe('ok');
    expect(h.ru).toBe('Подключился к серверу');
  });

  it('+QIOPEN: 0,563 → error, сокет занят', () => {
    const h = firstHint('+QIOPEN: 0,563');
    expect(h.severity).toBe('error');
    expect(h.ru).toContain('занят');
  });

  it('+CME ERROR: 10 → error, SIM не вставлена', () => {
    const h = firstHint('+CME ERROR: 10');
    expect(h.severity).toBe('error');
    expect(h.ru).toBe('SIM-карта не вставлена');
    expect(h.en).toBe('SIM not inserted');
  });

  it('+QNWINFO: No Service → error, нет сети', () => {
    const h = firstHint('+QNWINFO: No Service');
    expect(h.severity).toBe('error');
    expect(h.ru).toBe('Нет сети');
  });
});

describe('gsmAnalyzer — новые правила (WCDMA / CPIN NOT READY / denied)', () => {
  it('+QCSQ: "WCDMA",92,-91,-9 → info (RSCP «хорошо», Ec/No норм), с RSCP/Ec/No в тексте', () => {
    const h = firstHint('+QCSQ: "WCDMA",92,-91,-9');
    expect(h.severity).toBe('info');
    expect(h.ru).toContain('RSCP -91');
    expect(h.ru).toContain('Ec/No -9');
    expect(h.en).toContain('RSCP -91');
    expect(h.en).toContain('Ec/No -9');
  });

  it('+QCSQ: "WCDMA",92,-102,-15 → warn (RSCP < -100 и Ec/No < -13)', () => {
    const h = firstHint('+QCSQ: "WCDMA",92,-102,-15');
    expect(h.severity).toBe('warn');
    expect(h.ru).toContain('RSCP -102');
    expect(h.ru).toContain('Ec/No -15');
  });

  it('+CPIN: NOT READY → warn, SIM не готова', () => {
    const h = firstHint('+CPIN: NOT READY');
    expect(h.severity).toBe('warn');
    expect(h.ru).toBe('SIM-карта не готова (инициализация)');
    expect(h.en).toBe('SIM not ready (initializing)');
  });

  it('+CGREG: 0,3 → error, в регистрации пакетной сети отказано', () => {
    const h = firstHint('+CGREG: 0,3');
    expect(h.severity).toBe('error');
    expect(h.ru).toBe('В регистрации пакетной сети отказано');
    expect(h.en).toBe('Packet network registration denied');
  });

  it('+CEREG: 0,3 → error, в регистрации LTE отказано', () => {
    const h = firstHint('+CEREG: 0,3');
    expect(h.severity).toBe('error');
    expect(h.ru).toBe('В регистрации LTE отказано');
    expect(h.en).toBe('LTE registration denied');
  });

  it('регресс: +QCSQ: "LTE",83,-100,121,-19 по-прежнему даёт warn c RSRP/RSRQ', () => {
    const h = firstHint('+QCSQ: "LTE",83,-100,121,-19');
    expect(h.severity).toBe('warn');
    expect(h.ru).toContain('RSRP -100');
    expect(h.ru).toContain('RSRQ -19');
  });

  it('регресс: +QCSQ: "GSM",-66 по-прежнему даёт ok', () => {
    const h = firstHint('+QCSQ: "GSM",-66');
    expect(h.severity).toBe('ok');
    expect(h.ru).toContain('-66');
    expect(h.ru).toContain('GSM');
  });

  it('регресс: +QCSQ: "NOSERVICE" по-прежнему error «Нет сигнала»', () => {
    const h = firstHint('+QCSQ: "NOSERVICE"');
    expect(h.severity).toBe('error');
    expect(h.ru).toBe('Нет сигнала');
  });
});

describe('gsmAnalyzer — правила по реальному логу (CEREG / QIOPEN / RDY / CCLK)', () => {
  it('+CEREG: 0,2 → warn, идёт поиск сети LTE', () => {
    const h = firstHint('+CEREG: 0,2');
    expect(h.severity).toBe('warn');
    expect(h.ru).toBe('Идёт поиск сети LTE...');
    expect(h.en).toBe('Searching for LTE network...');
  });

  it('+CEREG: 0,4 → warn, состояние регистрации неизвестно', () => {
    const h = firstHint('+CEREG: 0,4');
    expect(h.severity).toBe('warn');
    expect(h.ru).toBe('Состояние регистрации LTE неизвестно');
  });

  it('+CEREG: 0,5 → ok, LTE в роуминге', () => {
    const h = firstHint('+CEREG: 0,5');
    expect(h.severity).toBe('ok');
    expect(h.ru).toBe('LTE зарегистрирован (роуминг)');
    expect(h.en).toBe('LTE registered (roaming)');
  });

  it('+QIOPEN: 0,566 → error, сервер недоступен', () => {
    const h = firstHint('+QIOPEN: 0,566');
    expect(h.severity).toBe('error');
    expect(h.ru).toBe('Не удалось подключиться к серверу');
    expect(h.en).toBe('Socket connect failed (server unreachable)');
  });

  it('+QIOPEN: 0,567 → warn, сокет закрыт после нашего же QICLOSE (не таймаут)', () => {
    const h = firstHint('+QIOPEN: 0,567');
    expect(h.severity).toBe('warn');
    expect(h.ru).toBe('Сокет закрыт (обычно после нашего же QICLOSE)');
    expect(h.en).toBe('Socket has been closed (usually after our own QICLOSE)');
  });

  it('+QIOPEN: 0,570 → error, PDP-контекст разрушен', () => {
    const h = firstHint('+QIOPEN: 0,570');
    expect(h.severity).toBe('error');
    expect(h.ru).toBe('PDP-контекст разрушен');
    expect(h.en).toBe('PDP context broken down');
  });

  it('RDY → info, модем загрузился', () => {
    const h = firstHint('RDY');
    expect(h.severity).toBe('info');
    expect(h.ru).toBe('Модем загрузился и готов');
    expect(h.en).toBe('Modem booted and ready');
  });

  it('+CFUN: 1 → info, радиомодуль включён', () => {
    const h = firstHint('+CFUN: 1');
    expect(h.severity).toBe('info');
    expect(h.ru).toBe('Радиомодуль включён (полный режим)');
  });

  it('+CCLK с годом 04 → warn, время не синхронизировано', () => {
    const h = firstHint('+CCLK: "04/01/01,00:02:46+00"');
    expect(h.severity).toBe('warn');
    expect(h.ru).toContain('не синхронизировано');
    expect(h.ru).toContain('04/01/01,00:02:46+00');
    expect(h.en).toContain('not synced');
  });

  it('+CCLK с нормальным годом → info, просто время модема', () => {
    const h = firstHint('+CCLK: "26/07/16,16:18:51+00"');
    expect(h.severity).toBe('info');
    expect(h.ru).toBe('Время модема 26/07/16,16:18:51+00');
    expect(h.en).toBe('Modem time 26/07/16,16:18:51+00');
  });

  it('регресс: +QIOPEN: 0,563 по-прежнему error «сокет занят»', () => {
    const h = firstHint('+QIOPEN: 0,563');
    expect(h.severity).toBe('error');
    expect(h.ru).toContain('занят');
  });

  it('регресс: +CEREG: 0,1 не перехвачен новыми правилами', () => {
    const h = firstHint('+CEREG: 0,1');
    expect(h.severity).toBe('info');
    expect(h.ru).toBe('LTE зарегистрирован (это ещё не интернет)');
  });

  it('регресс: +CREG: 0,2 остаётся про поиск сети (не LTE-правило)', () => {
    const h = firstHint('+CREG: 0,2');
    expect(h.severity).toBe('warn');
    expect(h.ru).toBe('Идёт поиск сети...');
  });
});

describe('gsmAnalyzer — §4 контекстные правила', () => {
  it('Зомби-сокет: после +CREG: 0,0 сокет в state 2 → error про зомби', () => {
    const log = ['+CREG: 0,0', '+QISTATE: 0,"TCP","10.0.0.5",5601,1234,2,1,0,0'].join('\n');
    const lines = analyzeGsmLog(log, 'gsm');
    const socketLine = lines[1];
    const zombie = socketLine.hints.find((h) => h.severity === 'error' && h.ru.includes('Зомби-сокет'));
    expect(zombie).toBeDefined();
    expect(zombie?.en).toContain('Zombie socket');
  });

  it('Здоровый сокет (после регистрации) НЕ считается зомби', () => {
    const log = ['+CREG: 0,1', '+QISTATE: 0,"TCP","10.0.0.5",5601,1234,2,1,0,0'].join('\n');
    const lines = analyzeGsmLog(log, 'gsm');
    const zombie = lines[1].hints.find((h) => h.ru.includes('Зомби-сокет'));
    expect(zombie).toBeUndefined();
  });

  it('Логин-спам: #L# ×3 без #AL#1 → warn на третьей строке', () => {
    const log = ['#L#GT9', '#L#GT9', '#L#GT9'].join('\n');
    const lines = analyzeGsmLog(log, 'gsm');
    const spam = lines[2].hints.find((h) => h.severity === 'warn');
    expect(spam).toBeDefined();
    expect(spam?.ru).toContain('подтверждения сервера');
  });

  it('#AL#1 сбрасывает счётчик логинов', () => {
    const log = ['#L#GT9', '#L#GT9', '#AL#1', '#L#GT9'].join('\n');
    const lines = analyzeGsmLog(log, 'gsm');
    const spam = lines[3].hints.find((h) => h.severity === 'warn');
    expect(spam).toBeUndefined();
  });
});

describe('gsmAnalyzer — GPS / NMEA (одна подсказка на блок)', () => {
  const NO_FIX = [
    '$GNGGA,174257.000,,,,,0,0,,,M,,M,,*54',
    '$GNRMC,174257.000,V,,,,,9.72,196.26,201106,,,N*53',
  ].join('\n');
  const FIX = [
    '$GNGGA,174951.000,5539.9466,N,03734.5008,E,1,5,1.31,137.7,M,14.5,M,,*40',
    '$GNRMC,174951.000,A,5539.9466,N,03734.5008,E,0.00,186.69,201106,,,A*72',
  ].join('\n');

  // Подсказка привязана к строке RMC (замыкает блок) — на GGA её нет.
  function blockHint(log: string) {
    const lines = analyzeGsmLog(log, 'gps');
    expect(lines[0].hints).toEqual([]);          // GGA — без подсказки
    expect(lines[1].hints).toHaveLength(1);       // ровно ОДНА на блок, на RMC
    return lines[1].hints[0];
  }

  it('нет фикса (fixQuality=0 / RMC=V) → warn', () => {
    const h = blockHint(NO_FIX);
    expect(h.severity).toBe('warn');
    expect(h.ru).toBe('Нет GPS-фикса (спутников в решении: 0)');
    expect(h.en).toBe('No GPS fix (satellites used: 0)');
  });

  it('есть фикс → ok, координаты/спутники/точность', () => {
    const h = blockHint(FIX);
    expect(h.severity).toBe('ok');
    expect(h.ru).toContain('55.6658, 37.5750');
    expect(h.ru).toContain('спутников: 5');
    expect(h.ru).toContain('HDOP 1.31');
    // HDOP 1.31 < 2 → по порогам «отличная/excellent» (не «хорошая»).
    expect(h.ru).toContain('отличная');
    expect(h.en).toContain('55.6658, 37.5750');
    expect(h.en).toContain('5 sats');
    expect(h.en).toContain('excellent');
  });

  it('перевод координат S/W даёт минус', () => {
    const log = [
      '$GNGGA,120000.000,5539.9466,S,03734.5008,W,1,5,1.31,100,M,,M,,*00',
      '$GNRMC,120000.000,A,5539.9466,S,03734.5008,W,0,0,201106,,,A*00',
    ].join('\n');
    const h = analyzeGsmLog(log, 'gps')[1].hints[0];
    expect(h.ru).toContain('-55.6658, -37.5750');
  });

  it("GPS-подсказки НЕ появляются в режимах 'gsm' и 'off'", () => {
    for (const mode of ['gsm', 'off'] as const) {
      const lines = analyzeGsmLog(FIX, mode);
      expect(lines.every((l) => l.hints.length === 0)).toBe(true);
    }
  });

  it("GPS-подсказки появляются в режимах 'gps' и 'all'", () => {
    for (const mode of ['gps', 'all'] as const) {
      const lines = analyzeGsmLog(FIX, mode);
      const withHint = lines.filter((l) => l.hints.length > 0);
      expect(withHint).toHaveLength(1);
      expect(withHint[0].hints[0].severity).toBe('ok');
    }
  });
});

describe('gsmAnalyzer — аддитивное включение режима по каналам', () => {
  it('withGsm добавляет GSM, не выключая GPS', () => {
    expect(withGsm('off')).toBe('gsm');
    expect(withGsm('gsm')).toBe('gsm');
    expect(withGsm('gps')).toBe('all');
    expect(withGsm('all')).toBe('all');
  });

  it('withGps добавляет GPS, не выключая GSM', () => {
    expect(withGps('off')).toBe('gps');
    expect(withGps('gps')).toBe('gps');
    expect(withGps('gsm')).toBe('all');
    expect(withGps('all')).toBe('all');
  });
});

describe('gsmAnalyzer — режимы и языки', () => {
  it("mode==='off' не даёт подсказок", () => {
    const lines = analyzeGsmLog('+CREG: 0,1', 'off');
    expect(lines[0].hints).toEqual([]);
  });

  it("mode==='gps' — заглушка, подсказок нет, не падает", () => {
    const lines = analyzeGsmLog('$GNGGA,123519,4807.038,N', 'gps');
    expect(lines[0].hints).toEqual([]);
  });

  it('hintText отдаёт корректный язык', () => {
    const h = firstHint('+CREG: 0,1');
    expect(hintText(h, 'en')).toBe('Registered (home network)');
    expect(hintText(h, 'ru')).toBe('Зарегистрирован (домашняя сеть)');
  });

  it('устойчив к мусору/пустым строкам', () => {
    const log = ['', 'random garbage %%%', '+CREG', '+QISTATE:'].join('\n');
    expect(() => analyzeGsmLog(log, 'all')).not.toThrow();
    const lines = analyzeGsmLog(log, 'all');
    expect(lines).toHaveLength(4);
  });
});

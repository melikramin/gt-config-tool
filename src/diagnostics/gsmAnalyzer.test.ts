import { describe, it, expect } from 'vitest';
import { analyzeGsmLog, hintText } from './gsmAnalyzer';
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

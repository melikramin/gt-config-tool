import type { AnalyzedLine, AnalyzeMode, GsmContext, Hint, Lang } from './gsmAnalyzer.types';
import { GSM_RULES, CONTEXT_RULES, GPS_RULES, type Rule } from './gsmRules';

export type { AnalyzedLine, AnalyzeMode, GsmContext, Hint, Lang } from './gsmAnalyzer.types';

// Прогоняет одну строку через набор §3-правил + §4-контекстные правила.
// Сначала обновляет контекст (build видит ctx «уже с учётом этой строки»),
// затем берёт первую подсказку из основных правил и добавляет контекстные.
function analyzeLine(raw: string, rules: Rule[], contextRules: Rule[], ctx: GsmContext): Hint[] {
  const hints: Hint[] = [];

  // 1) Обновляем контекст по всем подходящим основным правилам.
  for (const rule of rules) {
    if (!rule.updateContext) continue;
    const m = raw.match(rule.test);
    if (m) rule.updateContext(m, ctx);
  }

  // 2) Первое основное правило с ненулевым build даёт подсказку.
  for (const rule of rules) {
    if (!rule.build) continue;
    const m = raw.match(rule.test);
    if (!m) continue;
    const hint = rule.build(m, ctx);
    if (hint) { hints.push(hint); break; }
  }

  // 3) Контекстные правила §4 добавляют подсказки сверх основной.
  for (const rule of contextRules) {
    const m = raw.match(rule.test);
    if (!m) continue;
    if (rule.updateContext) rule.updateContext(m, ctx);
    const hint = rule.build?.(m, ctx);
    if (hint) hints.push(hint);
  }

  return hints;
}

/**
 * Разбирает весь текст лога построчно, ведёт GsmContext, возвращает AnalyzedLine[].
 * - mode==='off'  → строки без подсказок
 * - mode==='gsm'  → только GSM-правила
 * - mode==='gps'  → только GPS-правила (заглушка → пусто)
 * - mode==='all'  → GSM + GPS
 * Устойчив к мусору/обрезанным строкам — правила просто не срабатывают.
 */
export function analyzeGsmLog(rawLog: string, mode: AnalyzeMode): AnalyzedLine[] {
  const lines = rawLog.split(/\r?\n/);

  if (mode === 'off') {
    return lines.map((raw) => ({ raw, hints: [] }));
  }

  const useGsm = mode === 'gsm' || mode === 'all';
  const useGps = mode === 'gps' || mode === 'all';

  const mainRules: Rule[] = [
    ...(useGsm ? GSM_RULES : []),
    ...(useGps ? GPS_RULES : []),
  ];
  const contextRules = useGsm ? CONTEXT_RULES : [];

  const ctx: GsmContext = {};
  return lines.map((raw) => ({ raw, hints: analyzeLine(raw, mainRules, contextRules, ctx) }));
}

/** Текст подсказки для текущего языка UI. */
export function hintText(hint: Hint, lang: Lang): string {
  return lang === 'ru' ? hint.ru : hint.en;
}

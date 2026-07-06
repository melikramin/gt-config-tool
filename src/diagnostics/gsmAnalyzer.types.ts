export type Severity = 'ok' | 'info' | 'warn' | 'error';
export type Lang = 'en' | 'ru';
export type AnalyzeMode = 'off' | 'gsm' | 'gps' | 'all';

export interface Hint {
  severity: Severity;
  en: string;
  ru: string;
}

// Контекст накапливается по мере разбора лога сверху вниз.
// Нужен для правил, которые зависят от нескольких строк (напр. зомби-сокет).
export interface GsmContext {
  registered?: boolean;      // CREG/CGREG/CEREG = 1 или 5
  noService?: boolean;       // QNWINFO: No Service / COPS: 0 без имени
  pdpActive?: boolean;       // CGACT: 1,1
  hasIp?: boolean;           // QIACT: ...,"x.x.x.x" (не 0.0.0.0)
  socketConnected?: boolean; // QISTATE state 2
  lastRat?: 'LTE' | 'GSM' | 'WCDMA' | null;
  // Служебные счётчики для контекстных правил §4.
  loginSentPending?: number; // сколько #L# отправлено без ответного #AL#1
  regSearchStreak?: number;  // подряд идущих CREG: 0,2
  awaitingQistate?: boolean; // был запрос AT+QISTATE, ждём +QISTATE или пустой OK

  // Накопленные поля текущего NMEA-блока (из $__GGA), пока не пришёл $__RMC.
  gpsBlock?: GpsBlock;
}

// Поля одного NMEA-блока (тика), нужные для подсказки. Копятся из $__GGA.
export interface GpsBlock {
  fixQuality: number;      // GGA поле 6: 0 нет фикса, 1 GPS, 2 DGPS
  numSats: number;         // GGA поле 7: спутников в решении
  hdop: string;            // GGA поле 8: точность (сырой текст для показа)
  lat: number | null;      // десятичные градусы (S → минус)
  lon: number | null;      // десятичные градусы (W → минус)
}

export interface AnalyzedLine {
  raw: string;               // исходная строка лога
  hints: Hint[];             // 0..n подсказок под этой строкой
}

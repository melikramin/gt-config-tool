import { create } from 'zustand';

interface DiagnosticsState {
  log: string;
  commandInput: string;
  enabledChannels: Set<string>;
  atLineStart: boolean;

  appendLog: (text: string, withTimestamp: boolean) => void;
  clearLog: () => void;
  setCommandInput: (value: string) => void;
  setEnabledChannels: (updater: (prev: Set<string>) => Set<string>) => void;
  clearEnabledChannels: () => void;
}

const MAX_LOG_LENGTH = 200_000;

function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `[${hh}:${mm}:${ss}.${ms}]`;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  log: '',
  commandInput: '',
  enabledChannels: new Set<string>(),
  atLineStart: true,

  appendLog: (text, withTimestamp) =>
    set((state) => {
      let toAppend: string;
      let atStart = state.atLineStart;
      if (!withTimestamp) {
        toAppend = text;
        const last = text.charAt(text.length - 1);
        if (last === '\n' || last === '\r') atStart = true;
        else if (text.length > 0) atStart = false;
      } else {
        let out = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (atStart && ch !== '\r' && ch !== '\n') {
            out += `${timestamp()} `;
            atStart = false;
          }
          out += ch;
          if (ch === '\n') atStart = true;
        }
        toAppend = out;
      }
      const next = state.log + toAppend;
      const trimmed = next.length > MAX_LOG_LENGTH ? next.slice(next.length - MAX_LOG_LENGTH) : next;
      return { log: trimmed, atLineStart: atStart };
    }),

  clearLog: () => set({ log: '', atLineStart: true }),

  setCommandInput: (commandInput) => set({ commandInput }),

  setEnabledChannels: (updater) =>
    set((state) => ({ enabledChannels: updater(state.enabledChannels) })),

  clearEnabledChannels: () => set({ enabledChannels: new Set<string>() }),
}));

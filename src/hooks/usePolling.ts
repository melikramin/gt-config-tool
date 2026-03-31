import { useEffect, useRef } from 'react';

/**
 * Cyclic polling hook.
 *
 * Sends `commands` one-by-one via `window.serial.sendCommand`, calls `onResponse`
 * for each successful response, then pauses `delayMs` before starting the next cycle.
 * Automatically stops when `active` becomes false or on unmount.
 */
export function usePolling(
  commands: string[],
  active: boolean,
  onResponse: (command: string, response: string) => void,
  delayMs = 200,
  commandDelayMs = 50,
): void {
  const onResponseRef = useRef(onResponse);
  onResponseRef.current = onResponse;

  useEffect(() => {
    if (!active || commands.length === 0) return;

    let cancelled = false;

    const cycle = async () => {
      while (!cancelled) {
        for (const cmd of commands) {
          if (cancelled) return;
          try {
            const response = await window.serial.sendCommand(cmd);
            if (!cancelled) {
              onResponseRef.current(cmd, response);
            }
          } catch {
            // Polling errors are non-fatal — skip to next command
          }
          // Small pause between commands to avoid flooding the device
          if (!cancelled && commandDelayMs > 0) {
            await new Promise<void>((r) => setTimeout(r, commandDelayMs));
          }
        }
        // Pause between cycles
        if (!cancelled) {
          await new Promise<void>((r) => setTimeout(r, delayMs));
        }
      }
    };

    cycle();

    return () => {
      cancelled = true;
    };
  }, [active, commands, delayMs, commandDelayMs]);
}

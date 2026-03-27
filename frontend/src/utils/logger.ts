/**
 * Dev-only console wrapper. Pair with `.ai/debug/log.config` + backend `debug` payloads.
 */
const enabled =
  import.meta.env.VITE_DEV_LOG === 'true' || import.meta.env.VITE_DEV_LOG === '1';

export const devLog = {
  group(label: string) {
    if (enabled) console.group(label);
  },
  groupEnd() {
    if (enabled) console.groupEnd();
  },
  log(...args: unknown[]) {
    if (enabled) console.log(...args);
  },
  warn(...args: unknown[]) {
    if (enabled) console.warn(...args);
  },
  error(...args: unknown[]) {
    if (enabled) console.error(...args);
  },
};

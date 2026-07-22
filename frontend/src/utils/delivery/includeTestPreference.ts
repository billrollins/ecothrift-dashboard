const LS_KEY = 'delivery.includeTest';
const EVENT = 'delivery-include-test';

export function readIncludeTestPreference(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeIncludeTestPreference(value: boolean): void {
  try {
    if (value) localStorage.setItem(LS_KEY, '1');
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT));
  }
}

export function includeTestPreferenceEventName(): string {
  return EVENT;
}

/** API query value when preference is on. */
export function includeTestApiParam(includeTest: boolean): '1' | undefined {
  return includeTest ? '1' : undefined;
}

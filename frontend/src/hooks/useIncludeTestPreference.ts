import { useCallback, useEffect, useState } from 'react';
import {
  includeTestPreferenceEventName,
  readIncludeTestPreference,
  writeIncludeTestPreference,
} from '../utils/delivery/includeTestPreference';

/** Shared Desk/Field preference for showing [TEST] delivery rows. */
export function useIncludeTestPreference() {
  const [includeTest, setIncludeTestState] = useState(readIncludeTestPreference);

  useEffect(() => {
    const sync = () => setIncludeTestState(readIncludeTestPreference());
    const eventName = includeTestPreferenceEventName();
    window.addEventListener(eventName, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(eventName, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setIncludeTest = useCallback((value: boolean) => {
    writeIncludeTestPreference(value);
    setIncludeTestState(value);
  }, []);

  return [includeTest, setIncludeTest] as const;
}

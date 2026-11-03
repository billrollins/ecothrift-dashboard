import { useCallback, useMemo, useState } from 'react';
import { prefsLabelSize, readPrintPrefs, writePrintPrefs, type PrintPrefs } from './printPrefs';

/** This computer's printing choices for a screen, and the label size they give. */
export function usePrintPrefs() {
  const [prefs, setPrefs] = useState<PrintPrefs>(() => readPrintPrefs());
  const save = useCallback((change: Partial<PrintPrefs>) => setPrefs(writePrintPrefs(change)), []);
  const size = useMemo(() => prefsLabelSize(prefs), [prefs.size]); // eslint-disable-line react-hooks/exhaustive-deps
  return { prefs, size, save };
}

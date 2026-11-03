/**
 * How this computer prints tags (Bill, Dash Updates #9, 2026-11-03): every printing choice belongs to the computer,
 * kept in this browser. The defaults are the store standard, set here in code (Bill tells the coder to change them):
 * 1.5 x 1 labels, the Thrift+ Perks price tag, and the Restoration tag for items going to Restoration.
 * The dpi is 203, what the store's thermal label printers are.
 */
import { DEFAULT_LABEL_SIZE, LABEL_PRESETS, type LabelSize } from './labelSize';

/** Old: the side-stripe tag the store has always printed. Thrift+: the Thrift+ Perks tag. */
export type PriceTagStyle = 'old' | 'perks';
/** What an item going to Restoration gets: the Restoration tag, or a price tag like any other item. */
export type RestorationTagStyle = 'restoration' | 'price';

export interface PrintPrefs {
  /** A LABEL_PRESETS key. */
  size: string;
  priceTag: PriceTagStyle;
  restorationTag: RestorationTagStyle;
}

export const DEFAULT_PRINT_PREFS: PrintPrefs = { size: '1.5x1', priceTag: 'perks', restorationTag: 'restoration' };

export const PRINT_PREFS_KEY = 'print_prefs';

export function readPrintPrefs(): PrintPrefs {
  let saved: Partial<PrintPrefs> = {};
  try {
    saved = JSON.parse(localStorage.getItem(PRINT_PREFS_KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  return {
    size: LABEL_PRESETS.some((p) => p.key === saved.size) ? saved.size! : DEFAULT_PRINT_PREFS.size,
    priceTag: saved.priceTag === 'old' ? 'old' : 'perks',
    restorationTag: saved.restorationTag === 'price' ? 'price' : 'restoration',
  };
}

export function writePrintPrefs(change: Partial<PrintPrefs>): PrintPrefs {
  const next = { ...readPrintPrefs(), ...change };
  try {
    localStorage.setItem(PRINT_PREFS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: this computer prints the standard.
  }
  return next;
}

/** The label size this computer prints at. */
export function prefsLabelSize(prefs: PrintPrefs = readPrintPrefs()): LabelSize {
  const p = LABEL_PRESETS.find((x) => x.key === prefs.size);
  return p ? { w_in: p.w_in, h_in: p.h_in, dpi: DEFAULT_LABEL_SIZE.dpi } : DEFAULT_LABEL_SIZE;
}

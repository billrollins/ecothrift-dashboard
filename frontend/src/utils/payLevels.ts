/**
 * Pay levels (owner 2026-10-20): Entry, Senior, Manager, each with an hourly range. The ranges come from the
 * ``hr.pay_levels`` setting (GET /accounts/pay-levels/); these defaults hold until they load. Pay between two
 * ranges (17.50) belongs to the lower level. A pay outside its level's range is a warning, never a block.
 */
export type PayLevelKey = 'entry' | 'senior' | 'manager';

export interface PayLevel {
  key: PayLevelKey;
  label: string;
  min: number;
  /** Null = no top. */
  max: number | null;
  /** "$15 to $17" or "$20+". */
  text: string;
}

export const DEFAULT_PAY_LEVELS: PayLevel[] = [
  { key: 'entry', label: 'Entry', min: 15, max: 17, text: '$15 to $17' },
  { key: 'senior', label: 'Senior', min: 18, max: 19, text: '$18 to $19' },
  { key: 'manager', label: 'Manager', min: 20, max: null, text: '$20+' },
];

const rateOf = (value: string | number | null | undefined): number => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace('$', ''));
  return Number.isFinite(n) ? n : 0;
};

/** The highest level whose minimum the pay reaches (17.50 is Entry, 19.50 is Senior); nothing set is Entry. */
export function levelForPay(
  pay: string | number | null | undefined,
  levels: PayLevel[] = DEFAULT_PAY_LEVELS,
): PayLevelKey {
  const rate = rateOf(pay);
  let found: PayLevelKey = levels[0]?.key ?? 'entry';
  for (const level of levels) if (rate >= level.min) found = level.key;
  return found;
}

export function levelLabel(key: string | null | undefined, levels: PayLevel[] = DEFAULT_PAY_LEVELS): string {
  return levels.find((l) => l.key === key)?.label ?? '';
}

/** Words for a pay outside its level's range, or '' (also '' while no pay is set). */
export function payWarning(
  pay: string | number | null | undefined,
  level: string | null | undefined,
  levels: PayLevel[] = DEFAULT_PAY_LEVELS,
): string {
  const span = levels.find((l) => l.key === level);
  const rate = rateOf(pay);
  if (!span || rate <= 0) return '';
  if (rate >= span.min && (span.max === null || rate <= span.max)) return '';
  return `$${rate.toFixed(2)} an hour is outside the ${span.label} range (${span.text}). You can still save it.`;
}

/**
 * One place that says what each AppSetting key is, where it lives, and how
 * to edit it. Keys not listed here fall through to System as raw JSON so
 * nothing becomes invisible. Receipt storefront keys are hidden - the print
 * server hardcodes them.
 */

export type SettingsTab =
  | 'assumptions'
  | 'store'
  | 'printing'
  | 'retail-qa'
  | 'permissions'
  | 'system';

export type SettingKind =
  | 'fraction'
  | 'days'
  | 'minutes'
  | 'percent'
  // A share of something, stored 0-1 and edited as a percent.
  | 'weight'
  // A point on the 0-100 grade scale.
  | 'score'
  // A whole number of things, zero allowed.
  | 'count'
  | 'hours'
  | 'hidden'
  | 'raw';

export interface SettingMeta {
  label: string;
  help: string;
  tab: SettingsTab;
  kind: SettingKind;
}

export const SETTINGS_REGISTRY: Record<string, SettingMeta> = {
  po_default_est_shrink: {
    label: 'Default PO est. shrink',
    help:
      'Inventory: fraction 0-1 for new purchase orders (cost allocation). Does not retrofit existing POs.',
    tab: 'assumptions',
    kind: 'fraction',
  },
  pricing_shrinkage_factor: {
    label: 'Buying revenue shrink',
    help:
      'Buying: fraction 0-1 applied to estimated auction revenue before profit. Distinct from PO shrink but same default target (0.15).',
    tab: 'assumptions',
    kind: 'fraction',
  },
  pricing_need_window_days: {
    label: 'Category need - sold lookback (days)',
    help: 'Buying: window for sold-items stats used in category need / SQL aggregates (e.g. 90).',
    tab: 'assumptions',
    kind: 'days',
  },
  delivery_service_minutes_per_stop: {
    label: 'Delivery unload time (minutes / stop)',
    help: 'Delivery Field: assumed on-site unload/service minutes per stop for ETA totals (5-120). Default 20.',
    tab: 'assumptions',
    kind: 'minutes',
  },
  tax_rate: {
    label: 'Sales tax rate',
    help: 'Applied to new POS carts. Stored as a fraction (0.07 = 7%). Omaha default is 7%.',
    tab: 'store',
    kind: 'percent',
  },
  'online_sales.hours': {
    label: 'Store hours',
    help: 'Open days and times. Online Sales hold expiry uses the same clock.',
    tab: 'store',
    kind: 'hours',
  },
  'retail_qa.owner_weight': {
    label: "Owner spot check weight",
    help: "Share of the day's grade the spot check carries when one happens. The checklists carry the rest, and the whole day when there is no spot check.",
    tab: 'retail-qa',
    kind: 'weight',
  },
  'retail_qa.weekly_daily_weight': {
    label: 'Daily average weight in the week',
    help: 'Share of the weekly grade that comes from the daily grades. The remainder comes from the Tuesday cross-checks.',
    tab: 'retail-qa',
    kind: 'weight',
  },
  'retail_qa.late_credit': {
    label: 'Credit for a late checklist',
    help: 'What Open, Day, or Close still earns when it was done, but after its deadline. Done on time is always full credit.',
    tab: 'retail-qa',
    kind: 'weight',
  },
  'retail_qa.grade_a': {
    label: 'A at or above',
    help: 'Lowest score that still earns an A.',
    tab: 'retail-qa',
    kind: 'score',
  },
  'retail_qa.grade_b': {
    label: 'B at or above',
    help: 'Lowest score that still earns a B.',
    tab: 'retail-qa',
    kind: 'score',
  },
  'retail_qa.grade_c': {
    label: 'C at or above',
    help: 'Lowest score that still earns a C.',
    tab: 'retail-qa',
    kind: 'score',
  },
  'retail_qa.grade_d': {
    label: 'D at or above',
    help: 'Lowest score that still earns a D. Anything below this is an F.',
    tab: 'retail-qa',
    kind: 'score',
  },
  'retail_qa.audit_minor_max': {
    label: 'Issues that still score 75',
    help: 'Up to this many issues in one graded cross-check category scores 75 for that category.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.audit_needs_work_max': {
    label: 'Issues that still score 50',
    help: 'Up to this many issues in one graded category scores 50. Beyond it, the category scores 0.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.audit_min_items': {
    label: 'Items an audit must inspect',
    help: 'A cross-check cannot be submitted under this count. Zero issues on four items is a glance, not an audit.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.spot_check_count': {
    label: 'Checks drawn into a spot check',
    help: 'How many random checks from Open, Day, and Close land in the daily owner spot check, alongside one full section cross-check.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.idle_prompt_minutes': {
    label: 'Idle prompt after (minutes)',
    help: 'Minutes with no cart on the register before it asks for a work cycle. Default 5.',
    tab: 'retail-qa',
    kind: 'count',
  },
  store_name: {
    label: 'Store name',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'system',
    kind: 'hidden',
  },
  store_address: {
    label: 'Store address',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'system',
    kind: 'hidden',
  },
  store_phone: {
    label: 'Store phone',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'system',
    kind: 'hidden',
  },
  receipt_header: {
    label: 'Receipt header',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'system',
    kind: 'hidden',
  },
  receipt_footer: {
    label: 'Receipt footer',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'system',
    kind: 'hidden',
  },
};

const FALLBACK: SettingMeta = {
  label: '',
  help: 'Not in the curated registry. Edit carefully.',
  tab: 'system',
  kind: 'raw',
};

export function metaForKey(key: string): SettingMeta {
  const listed = SETTINGS_REGISTRY[key];
  if (listed) return listed;
  return { ...FALLBACK, label: key };
}

export function isHiddenKey(key: string): boolean {
  return SETTINGS_REGISTRY[key]?.kind === 'hidden';
}

export function keysForTab(tab: SettingsTab, keys: string[]): string[] {
  return keys.filter((key) => !isHiddenKey(key) && metaForKey(key).tab === tab);
}

export const SETTINGS_TABS: SettingsTab[] = [
  'system',
  'printing',
  'store',
  'assumptions',
  'retail-qa',
  'permissions',
];

const OPEN_TABS: SettingsTab[] = ['assumptions', 'store', 'printing', 'retail-qa', 'system'];

export function parseSettingsTab(raw: string | null, isAdmin: boolean): SettingsTab {
  if (raw === 'permissions' && isAdmin) return 'permissions';
  const open = OPEN_TABS.find((tab) => tab === raw);
  return open ?? 'system';
}

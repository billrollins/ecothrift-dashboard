/**
 * One place that says what each AppSetting key is, where it lives, and how
 * to edit it. Keys not listed here fall through to System as raw JSON so
 * nothing becomes invisible. Receipt storefront keys are hidden — the print
 * server hardcodes them.
 */

export type SettingsTab = 'assumptions' | 'store' | 'printing' | 'permissions' | 'system';

export type SettingKind =
  | 'fraction'
  | 'days'
  | 'minutes'
  | 'percent'
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
  'permissions',
];

export function parseSettingsTab(raw: string | null, isAdmin: boolean): SettingsTab {
  if (raw === 'permissions' && isAdmin) return 'permissions';
  if (raw === 'assumptions' || raw === 'store' || raw === 'printing' || raw === 'system') {
    return raw;
  }
  return 'system';
}

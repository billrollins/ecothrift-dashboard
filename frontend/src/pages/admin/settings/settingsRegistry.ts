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
  | 'system'
  | 'ai';

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
  | 'surcharge'
  | 'hidden'
  | 'raw'
  // Probability in (0, 1) for tails.
  | 'tail'
  // 0=Mon … 6=Sun.
  | 'weekday'
  | 'weekdays'
  | 'seconds'
  | 'ratio'
  | 'ladder'
  | 'severity_groups';

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
  buying_manifest_pull_window_hours: {
    label: 'Manifest pull - ending within (hours)',
    help: 'Buying: the daily B-Stock pull fetches manifests for auctions ending within this many hours (default 36; 1 to 168 is used).',
    tab: 'assumptions',
    kind: 'count',
  },
  buying_manifest_pull_max_per_run: {
    label: 'Manifest pull - most per run',
    help: 'Buying: the most manifests one Pull fetches (default 40; at least 1). Watchlisted, then highest priority, go first.',
    tab: 'assumptions',
    kind: 'count',
  },
  buying_manifest_pull_retry_hours: {
    label: 'Manifest pull - retry a failure after (hours)',
    help: 'Buying: wait this long before trying a failed manifest again (default 12; at least 1).',
    tab: 'assumptions',
    kind: 'count',
  },
  buying_manifest_pull_page_delay_ms: {
    label: 'Manifest pull - pause between pages (ms)',
    help: 'Buying: pause between B-Stock manifest requests and between auctions, to stay polite (default 500).',
    tab: 'assumptions',
    kind: 'count',
  },
  buying_shipping_per_pallet: {
    label: 'Shipping estimate ($ per pallet)',
    help: 'Buying: shipping estimate per pallet for a lot when B-Stock has no quote for it and we do not know how far its city is yet (default 100). Otherwise the shipping formula is used.',
    tab: 'assumptions',
    kind: 'count',
  },
  buying_target_cover_weeks: {
    label: 'Need: target weeks of stock',
    help: "Buying: weeks of stock (shelf + pipeline) to hold per category. 0 (default) = the store's own average, so Need compares each category with the store. Need is 50 on target.",
    tab: 'assumptions',
    kind: 'count',
  },
  buying_priority_profit_weight: {
    label: 'Priority: profit weight',
    help: "Buying: profit's share of auction Priority (0-1, default 0.5); the rest is Need. Auctions with no category mix use Need only.",
    tab: 'assumptions',
    kind: 'fraction',
  },
  buying_pipeline_max_age_days: {
    label: 'Need: open PO age limit (days)',
    help: 'Buying: open POs older than this are not counted as on order; they are usually done but never closed (default 120).',
    tab: 'assumptions',
    kind: 'days',
  },
  // Edited from the Inventory need panel's Goal buttons (JSON).
  buying_category_goals: {
    label: 'Need: category goals',
    help: 'Buying: more / less / stop per category.',
    tab: 'assumptions',
    kind: 'hidden',
  },
  // Set by: python manage.py fit_shipping_formula --save (JSON, not hand-edited).
  buying_shipping_formula: {
    label: 'Shipping formula',
    help: 'Buying: truckload and LTL shipping formula fitted on past orders.',
    tab: 'assumptions',
    kind: 'hidden',
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
  'pos.card_surcharge': {
    label: 'Credit card surcharge',
    help:
      'Record-only CardX surcharge on credit (not debit, prepaid, or cash). Percent must match the CardX program rate. Not added to sale revenue or tax.',
    tab: 'store',
    kind: 'surcharge',
  },
  'retail_qa.baseline_window': {
    label: 'Baseline window',
    help: 'How many recent tallies (and unflagged cross-checks) build a section baseline.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.baseline_shrink': {
    label: 'Baseline shrink',
    help: 'Blend a thin section toward the store: n / (n + this).',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.warmup_section': {
    label: 'Section warm-up',
    help: 'A section below this many tallies is still warming up.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.warmup_store': {
    label: 'Store warm-up',
    help: 'The store below this many tallies is still warming up.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.cross_full_tail': {
    label: 'Cross-check full tail',
    help: 'Tail at or above this scores 100 on a cross-check.',
    tab: 'retail-qa',
    kind: 'tail',
  },
  'retail_qa.cross_zero_tail': {
    label: 'Cross-check zero tail',
    help: 'Tail at or below this scores 0 on a cross-check.',
    tab: 'retail-qa',
    kind: 'tail',
  },
  'retail_qa.verify_ladder': {
    label: 'Verify ladder',
    help: 'Score for how many verify items were found not done.',
    tab: 'retail-qa',
    kind: 'ladder',
  },
  'retail_qa.cross_check_weekday': {
    label: 'Cross-check weekday',
    help: '0=Mon … 6=Sun. Moves to the next open day if the store is closed.',
    tab: 'retail-qa',
    kind: 'weekday',
  },
  'retail_qa.owner_ladder': {
    label: 'Owner leftover ladder',
    help: 'Residual R (leftover as a fraction of a normal day) to score.',
    tab: 'retail-qa',
    kind: 'ladder',
  },
  'retail_qa.owner_grace': {
    label: 'Owner grace items',
    help: 'Items ignored before leftover starts counting.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.owner_divisor_floor': {
    label: 'Owner divisor floor',
    help: 'R never divides by less than this, so a quiet aisle is not punished for one extra item.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.spot_check_count': {
    label: 'Checks drawn into a spot check',
    help: 'How many random checks from Open, Day, and Close land in the daily owner spot check, alongside one full section walk.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.severity_groups': {
    label: 'Severity groups',
    help: 'Name, check weight, and how much leftover each group adds to R.',
    tab: 'retail-qa',
    kind: 'severity_groups',
  },
  'retail_qa.safety_cap': {
    label: 'Safety cap',
    help: 'A safety flag cannot score above this.',
    tab: 'retail-qa',
    kind: 'score',
  },
  'retail_qa.flag_window': {
    label: 'Flag window',
    help: 'Trailing audits (or weeks) a checker flag looks at.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.flag_z': {
    label: 'Low-findings z',
    help: 'Low-findings flag when trailing z is below this.',
    tab: 'retail-qa',
    kind: 'ratio',
  },
  'retail_qa.flag_min_expected': {
    label: 'Low-findings minimum expected',
    help: 'Low-findings flag only when expected findings reach this.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.flag_followup_r': {
    label: 'Owner follow-up R',
    help: 'Owner leftover above this counts against the checker who just walked the aisle.',
    tab: 'retail-qa',
    kind: 'ratio',
  },
  'retail_qa.flag_min_seconds': {
    label: 'Minimum seconds per section',
    help: 'A cross-check faster than this many seconds per section is flagged.',
    tab: 'retail-qa',
    kind: 'seconds',
  },
  'retail_qa.flag_batch_minutes': {
    label: 'Batch window (minutes)',
    help: 'Own tally and cross-check submitted within this many minutes is flagged.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.flag_rubber_stamp_window': {
    label: 'Rubber-stamp window',
    help: 'All-confirmed verifications before a rubber-stamp flag can fire.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.idle_prompt_minutes': {
    label: 'Idle prompt after (minutes)',
    help: 'Minutes with no cart on the register before it asks for a work cycle. Default 5.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.idle_stretch_minutes': {
    label: 'Idle stretch (minutes)',
    help: 'Idle stretches longer than this are listed next to cashier names. They do not change the grade.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.weight_spot': {
    label: 'Spot weight',
    help: 'Share of the week grade that comes from owner spot walks. Default 60.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.weight_do': {
    label: 'Do weight',
    help: 'Share of the week grade that comes from routines done over expected. Default 25.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.weight_cross': {
    label: 'Cross weight',
    help: 'Share of the week grade that comes from cross-checks after the due date. Default 15.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.walk_floor': {
    label: 'Walks to keep the week uncapped',
    help: 'Fewer than this many spot walks caps the week at B. Zero walks caps at C.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.section_due_after_punch_minutes': {
    label: 'Section check due after punch (minutes)',
    help: 'Minutes after an owner punches in before their section check is due.',
    tab: 'retail-qa',
    kind: 'count',
  },
  'retail_qa.section_check_weekdays': {
    label: 'Section checks required',
    help: 'Every section gets an owner check on these days, open or closed.',
    tab: 'retail-qa',
    kind: 'hidden',
  },
  'retail_qa.grade_scale': {
    label: 'Grade scale',
    help: 'Ordered letter floors. F is anything below the last min.',
    tab: 'retail-qa',
    kind: 'hidden',
  },
  'retail_qa.grade_a': {
    label: 'A at or above',
    help: 'Replaced by retail_qa.grade_scale.',
    tab: 'retail-qa',
    kind: 'hidden',
  },
  'retail_qa.grade_b': {
    label: 'B at or above',
    help: 'Replaced by retail_qa.grade_scale.',
    tab: 'retail-qa',
    kind: 'hidden',
  },
  'retail_qa.grade_c': {
    label: 'C at or above',
    help: 'Replaced by retail_qa.grade_scale.',
    tab: 'retail-qa',
    kind: 'hidden',
  },
  'retail_qa.grade_d': {
    label: 'D at or above',
    help: 'Replaced by retail_qa.grade_scale.',
    tab: 'retail-qa',
    kind: 'hidden',
  },
  'retail_qa.program_department': {
    label: 'Retail QA program department',
    help: 'Slug of the department the Retail QA program belongs to. Changed when that department slug is edited.',
    tab: 'retail-qa',
    kind: 'hidden',
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
  'ai',
];

const OPEN_TABS: SettingsTab[] = ['assumptions', 'store', 'printing', 'retail-qa', 'system'];

export function parseSettingsTab(raw: string | null, isAdmin: boolean, isSuperuser = false): SettingsTab {
  if (raw === 'ai' && isSuperuser) return 'ai';
  if (raw === 'permissions' && isAdmin) return 'permissions';
  const open = OPEN_TABS.find((tab) => tab === raw);
  return open ?? 'system';
}

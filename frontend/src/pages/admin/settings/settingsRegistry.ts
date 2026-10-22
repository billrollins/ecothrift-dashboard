/**
 * One place that says what each AppSetting key is, where it lives, and how
 * to edit it. Keys not listed here fall through to System as raw JSON so
 * nothing becomes invisible. Receipt storefront keys are hidden - the print
 * server hardcodes them.
 */

export type SettingsTab =
  | 'store'
  | 'thrift-plus'
  | 'buying'
  | 'inventory'
  | 'retail-qa'
  | 'printing'
  | 'ai'
  | 'people'
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
  | 'severity_groups'
  // On or off (stored true / false).
  | 'switch'
  // Plain text.
  | 'text'
  // Dollars.
  | 'money'
  // A date (YYYY-MM-DD), or blank.
  | 'date'
  // A list of words or codes, edited as chips.
  | 'list'
  // HTML, edited as text with a live preview.
  | 'html'
  // Shown, not editable here (set elsewhere, e.g. the print server).
  | 'readonly'
  // Background-job state kept in the settings table: never a setting row (System → Background jobs).
  | 'state';

export interface SettingMeta {
  label: string;
  help: string;
  tab: SettingsTab;
  kind: SettingKind;
  /** What the app uses while no row exists yet (shown in the field; the row is created on the first save). */
  defaultValue?: unknown;
  /** A link made from the value, shown under it (e.g. the staff preview link with the code in it). */
  linkFor?: (value: string) => string | null;
}

export const SETTINGS_REGISTRY: Record<string, SettingMeta> = {
  // Thrift+ (owner, 2026-10-07: everything Thrift+ is behind one switch). Super User only; Store tab, Thrift+ card.
  thrift_plus_enabled: {
    label: 'Thrift+ is on',
    help: 'Off: customers see "Thrift+ coming soon" at /scan, the portal is closed, and registers charge the tag (only test registers try member prices). On: Thrift+ is live for everyone.',
    tab: 'thrift-plus',
    kind: 'switch',
  },
  thrift_plus_preview_code: {
    label: 'Thrift+ staff preview code',
    help: 'While Thrift+ is off, a staff phone opens the scanner at /scan?preview=<this code>. Change it to shut old phones out.',
    tab: 'thrift-plus',
    kind: 'text',
    // Owner, 2026-10-09: the link itself, ready to tap or send to a staff phone.
    linkFor: (code) => (code.trim() ? `https://ecothrift.us/scan?preview=${encodeURIComponent(code.trim())}` : null),
  },
  thrift_plus_price_first: {
    label: 'Thrift+ scanner: price first',
    help: 'On: the price is the big number on the scanner (item card and cart total) and ThriftBucks sit smaller below it. Off: ThriftBucks are the big number. Staff can flip it on their own phone from the test bar.',
    tab: 'thrift-plus',
    kind: 'switch',
  },
  thrift_plus_test_registers: {
    label: 'Thrift+ test registers',
    help: 'Register codes that try Thrift+ while it is off (e.g. R3).',
    tab: 'thrift-plus',
    kind: 'list',
  },
  thrift_plus_rewards_start: {
    label: 'Thrift+ ThriftBucks start',
    help: 'No item counts as on the floor before this date. Blank = each item counts from its own floor date. Try it first in Thrift+ → Calculator.',
    tab: 'thrift-plus',
    kind: 'date',
  },
  thrift_plus_floor_share: {
    label: 'Thrift+ lowest a member pays',
    help: 'Share of the tag a member always pays (10% = never more than 90% off).',
    tab: 'thrift-plus',
    kind: 'weight',
  },
  thrift_plus_instant_share: {
    label: 'Instant redemption share',
    help: "A member who redeems a trip's ThriftBucks instantly gets this share of them off today's price (50% = 35.00 ThriftBucks take $17.50 off), rounded up to the cent. Kept ThriftBucks keep their full value.",
    tab: 'thrift-plus',
    kind: 'weight',
  },
  thrift_plus_return_credit_share: {
    label: '3-day returns: share back',
    help: 'A 3-day return gives this share of what was paid, tax included, as Thrift+ credit; the same share of any ThriftBucks used on the item comes back as ThriftBucks, and the same share of the ThriftBucks it collected is taken back.',
    tab: 'thrift-plus',
    kind: 'weight',
  },
  thrift_plus_return_min_price: {
    label: '3-day returns: lowest qualifying price',
    help: 'An item at or under this price after ThriftBucks does not qualify for 3-day returns.',
    tab: 'thrift-plus',
    kind: 'money',
  },
  thrift_plus_nonreturnable_categories: {
    label: '3-day returns: categories that never qualify',
    help: 'Product categories or subcategories that are sold AS IS (no 3-day returns), e.g. clothing and soft goods.',
    tab: 'thrift-plus',
    kind: 'list',
  },
  thrift_plus_nonreturnable_words: {
    label: '3-day returns: AS IS words',
    help: 'Words in a title, note or flag that make an item AS IS (no 3-day returns).',
    tab: 'thrift-plus',
    kind: 'list',
  },
  // W14 (owner 2026-10-21): the member card warns at this many return trips in this many days. Never a block, never printed.
  thrift_plus_return_warn_count: {
    label: 'Returns warning: trips',
    help: 'The member card warns staff when a member has made this many return trips (days with returns) in the window. A warning only.',
    tab: 'thrift-plus',
    kind: 'count',
    defaultValue: 3,
  },
  thrift_plus_return_warn_days: {
    label: 'Returns warning: window',
    help: 'How many days back the member card counts return trips.',
    tab: 'thrift-plus',
    kind: 'days',
    defaultValue: 30,
  },
  category_from_profile: {
    label: 'Count items under their product standard category',
    help: 'Buying numbers (Need, recovery, category stats) use the product standard category when it is a real one.',
    tab: 'buying',
    kind: 'switch',
  },
  product_standard_at_intake: {
    label: 'Write the product standard at intake',
    help: 'Intake writes the product standard (title, tag name, brand, category, specs, vector) as items are processed.',
    tab: 'inventory',
    kind: 'switch',
  },
  // Social Studio (Lane F Phase 2, apps/marketing/settings.py). Starting guesses; the owner tunes them.
  'marketing.post_weekdays': {
    label: 'Post days',
    help: 'One post on each of these days when the store is open. Closed days get one scheduled post.',
    tab: 'store',
    kind: 'weekdays',
    defaultValue: [false, true, true, true, true, true, false],
  },
  'marketing.min_photos': {
    label: 'Real photos a post needs',
    help: 'A post cannot be marked Ready with fewer library photos than this.',
    tab: 'store',
    kind: 'count',
    defaultValue: 3,
  },
  'marketing.hook_max_chars': {
    label: 'Hook line, longest (characters)',
    help: 'Longer than this does not fit the frame, so the post cannot be Ready.',
    tab: 'store',
    kind: 'count',
    defaultValue: 80,
  },
  'marketing.repeat_days': {
    label: 'Days before a category repeats',
    help: 'The rotation skips a category that had a post in this many days, unless it is in season.',
    tab: 'store',
    kind: 'days',
    defaultValue: 14,
  },
  'marketing.in_season': {
    label: 'Categories in season now',
    help: 'Blank uses the calendar: party and seasonal in October; toys and party Nov-Dec. In season can repeat sooner and counts extra.',
    tab: 'store',
    kind: 'list',
    defaultValue: [],
  },
  'marketing.season_weight': {
    label: 'In-season weight',
    help: "How many times an in-season category's floor stock counts in the rotation.",
    tab: 'store',
    kind: 'ratio',
    defaultValue: 2,
  },
  'marketing.thrift_plus_line': {
    label: 'Thrift+ line in every post',
    help: 'Added to the end of every post text. No web addresses: Facebook counts them as links.',
    tab: 'store',
    kind: 'text',
    defaultValue: 'Thrift+ is free to join, nothing owed. Members collect ThriftBucks on most items. Join at any register in a minute, or start on your phone from our website. ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value. Members 18+. Full terms on our website and at every register.',
  },
  'mailbox.email_signature': {
    label: 'Email signature',
    help: 'Added to replies sent from the mailbox. HTML; {{staff_name}} becomes the sender.',
    tab: 'people',
    kind: 'html',
  },
  // Edited by its own page or panel; never a row here.
  'hiring.careers': { label: 'Careers page', help: 'Edited in People → Jobs.', tab: 'people', kind: 'hidden' },
  ai_price_check: { label: 'Last AI price check', help: 'Settings → AI: Estimate API costs.', tab: 'system', kind: 'state' },
  buying_seller_revenue_factors: {
    label: 'Seller revenue factors',
    help: "Finished trucks' actual ÷ predicted revenue, by seller (fit_seller_factors).",
    tab: 'buying',
    kind: 'state',
  },
  po_default_est_shrink: {
    label: 'Default PO est. shrink',
    help:
      'Inventory: fraction 0-1 for new purchase orders (cost allocation). Does not retrofit existing POs.',
    tab: 'buying',
    kind: 'fraction',
  },
  pricing_shrinkage_factor: {
    label: 'Buying revenue shrink',
    help:
      'Buying: fraction 0-1 applied to estimated auction revenue before profit. Distinct from PO shrink but same default target (0.15).',
    tab: 'buying',
    kind: 'fraction',
  },
  pricing_need_window_days: {
    label: 'Category need - sold lookback (days)',
    help: 'Buying: window for sold-items stats used in category need / SQL aggregates (e.g. 90).',
    tab: 'buying',
    kind: 'days',
  },
  buying_manifest_pull_window_hours: {
    label: 'Manifest pull - ending within (hours)',
    help: 'Buying: the daily B-Stock pull fetches manifests for auctions ending within this many hours (default 36; 1 to 168 is used).',
    tab: 'buying',
    kind: 'count',
  },
  buying_manifest_pull_max_per_run: {
    label: 'Manifest pull - most per run',
    help: 'Buying: the most manifests one Pull fetches (default 40; at least 1). Watchlisted, then highest priority, go first.',
    tab: 'buying',
    kind: 'count',
  },
  buying_manifest_pull_retry_hours: {
    label: 'Manifest pull - retry a failure after (hours)',
    help: 'Buying: wait this long before trying a failed manifest again (default 12; at least 1).',
    tab: 'buying',
    kind: 'count',
  },
  buying_manifest_pull_page_delay_ms: {
    label: 'Manifest pull - pause between pages (ms)',
    help: 'Buying: pause between B-Stock manifest requests and between auctions, to stay polite (default 500).',
    tab: 'buying',
    kind: 'count',
  },
  buying_shipping_per_pallet: {
    label: 'Shipping estimate ($ per pallet)',
    help: 'Buying: shipping estimate per pallet for a lot when B-Stock has no quote for it and we do not know how far its city is yet (default 100). Otherwise the shipping formula is used.',
    tab: 'buying',
    kind: 'count',
  },
  buying_shipping_typical_miles: {
    label: 'Shipping estimate: typical distance (mi)',
    help: 'Buying: when a lot has no B-Stock quote and its city is unknown, the shipping formula uses this distance instead of $ per pallet. 0 (default) = off. Recent listings: median 1,176 mi.',
    tab: 'buying',
    kind: 'count',
  },
  buying_target_cover_weeks: {
    label: 'Need: target weeks of stock',
    help: "Buying: weeks of stock (shelf + pipeline) to hold per category. 0 (default) = the store's own average, so Need compares each category with the store. Need is 50 on target.",
    tab: 'buying',
    kind: 'count',
  },
  buying_priority_profit_weight: {
    label: 'Priority: profit weight',
    help: "Buying: profit's share of auction Priority (0-1, default 0.5); the rest is Need. Auctions with no category mix use Need only.",
    tab: 'buying',
    kind: 'fraction',
  },
  buying_priority_speed_weight: {
    label: 'Priority: speed weight',
    help: "Buying: sell speed's share of auction Priority (0-1, default 0 = off). Speed is the category mix x the share of items that sell within 30 days of shelving.",
    tab: 'buying',
    kind: 'fraction',
  },
  buying_pipeline_max_age_days: {
    label: 'Need: open PO age limit (days)',
    help: 'Buying: open POs older than this are not counted as on order; they are usually done but never closed (default 120).',
    tab: 'buying',
    kind: 'days',
  },
  buying_profit_factor: {
    label: 'Price target: profit factor',
    help: "Buying: revenue / all-in cost the price target must make (default 2.0 = double the money). The max bid on every auction follows it; an auction's own profit target overrides it.",
    tab: 'buying',
    kind: 'ratio',
  },
  buying_labor_per_item: {
    label: 'Labor per item ($)',
    help: 'Buying: dollars of labor to process one unit (for example 0.75). Counts in the landed cost and the price target. 0 (default) = not counted.',
    tab: 'buying',
    kind: 'ratio',
  },
  buying_disposal_per_pallet: {
    label: 'Disposal per pallet ($)',
    help: 'Buying: dollars to throw away what does not sell, per pallet. Counts in the landed cost and the price target. 0 (default) = not counted.',
    tab: 'buying',
    kind: 'count',
  },
  buying_shrink_new: {
    label: 'Shrink: New listings',
    help: 'Buying: revenue shrink (0-1) for auctions B-Stock lists as New / Brand New. 0 = use Buying revenue shrink.',
    tab: 'buying',
    kind: 'fraction',
  },
  buying_shrink_like_new: {
    label: 'Shrink: Like new listings',
    help: 'Buying: revenue shrink (0-1) for auctions B-Stock lists as Like New. 0 = use Buying revenue shrink.',
    tab: 'buying',
    kind: 'fraction',
  },
  buying_shrink_used_good: {
    label: 'Shrink: Used good listings',
    help: 'Buying: revenue shrink (0-1) for auctions B-Stock lists as Used Good. 0 = use Buying revenue shrink.',
    tab: 'buying',
    kind: 'fraction',
  },
  buying_shrink_used_fair: {
    label: 'Shrink: Used fair listings',
    help: 'Buying: revenue shrink (0-1) for auctions B-Stock lists as Used Fair. 0 = use Buying revenue shrink.',
    tab: 'buying',
    kind: 'fraction',
  },
  buying_shrink_damaged: {
    label: 'Shrink: Damaged listings',
    help: 'Buying: revenue shrink (0-1) for auctions B-Stock lists as Salvage or Scratch & Dent. 0 = use Buying revenue shrink.',
    tab: 'buying',
    kind: 'fraction',
  },
  // Edited from the Inventory need panel's Goal buttons (JSON).
  buying_category_goals: {
    label: 'Need: category goals',
    help: 'Buying: more / less / stop per category.',
    tab: 'buying',
    kind: 'hidden',
  },
  // Set by: python manage.py fit_shipping_formula --save (JSON, not hand-edited).
  buying_shipping_formula: {
    label: 'Shipping formula',
    help: 'Buying: truckload and LTL shipping formula fitted on past orders.',
    tab: 'buying',
    kind: 'hidden',
  },
  truck_refund_rate: {
    label: 'Refund: share of the sale price',
    help: 'Truck finalize: the share of the sale price (no fees, no shipping) a seller refunds for missing and broken goods. B-Stock: 95%.',
    tab: 'inventory',
    kind: 'weight',
  },
  truck_refund_deductible: {
    label: 'Refund: first share never refunded',
    help: 'Truck finalize: the share of the manifest retail missing that is never refunded. B-Stock: the first 5%.',
    tab: 'inventory',
    kind: 'weight',
  },
  shrink_age_start_days: {
    label: 'Shrink: maybe gone after (days unseen)',
    help: 'An item on the shelf nobody has scanned, sold, moved or repriced for this many days starts to count as maybe gone (default 90).',
    tab: 'inventory',
    kind: 'days',
  },
  shrink_age_lost_days: {
    label: 'Shrink: lost after (days unseen)',
    help: 'Unseen this many days, an item counts as lost (default 180).',
    tab: 'inventory',
    kind: 'days',
  },
  shrink_age_start_pct: {
    label: 'Shrink: chance gone at the start',
    help: 'The chance an item is gone when it reaches the first limit; it rises in a straight line to 100% at the lost limit (default 10%).',
    tab: 'inventory',
    kind: 'weight',
  },
  shrink_count_not_found_lost: {
    label: 'Shrink: not found in the last count = lost',
    help: 'Items the last full count expected and did not find, with no mark and not seen since, count as lost. Off: they follow the days rule.',
    tab: 'inventory',
    kind: 'switch',
  },
  // Retail on price tags (retail_tags_and_social Phase 1, owner call F1). apps/inventory/services/tag_retail.py.
  'tags.retail_on_tag': {
    label: 'Retail on price tags',
    help: 'checked (default): a tag shows "Retail $x" only when the retail passed the check at check-in, or a person confirmed or fixed it. always: every tag with a retail above its price. never: no tag shows retail. Tags already printed are not changed.',
    tab: 'inventory',
    kind: 'text',
    defaultValue: 'checked',
  },
  'tags.retail_check_price_multiple': {
    label: 'Retail check: times the tag price',
    help: 'Check-in stops to ask about a retail more than this many times the tag price. Default 6 (99% of tags sit under 5.1x).',
    tab: 'inventory',
    kind: 'ratio',
    defaultValue: 6,
  },
  'tags.retail_check_median_multiple': {
    label: 'Retail check: times the usual retail',
    help: "Check-in stops to ask about a retail more than this many times what the product usually carries (the median of its other items). Default 2.",
    tab: 'inventory',
    kind: 'ratio',
    defaultValue: 2,
  },
  'tags.retail_check_min_items': {
    label: 'Retail check: items before "usual" counts',
    help: 'A product needs this many items with a retail before its usual retail is used. Default 3.',
    tab: 'inventory',
    kind: 'count',
    defaultValue: 3,
  },
  delivery_service_minutes_per_stop: {
    label: 'Delivery unload time (minutes / stop)',
    help: 'Delivery Field: assumed on-site unload/service minutes per stop for ETA totals (5-120). Default 20.',
    tab: 'inventory',
    kind: 'minutes',
  },
  tax_rate: {
    label: 'Sales tax rate',
    help: 'Applied to new POS carts. Stored as a fraction (0.07 = 7%). Omaha default is 7%.',
    tab: 'store',
    kind: 'percent',
  },
  // The register's sales (critic review REG-21): the owner's alone.
  'pos.store_sale_name': {
    label: 'Store sale name',
    help: 'The sale on every eligible line while it is on (its calendar week, or the owner turns it on at the register). Shown on the register and receipts.',
    tab: 'store',
    kind: 'text',
    defaultValue: 'Labor Day',
  },
  'pos.store_sale_percent': {
    label: 'Store sale percent off',
    help: 'How much the store sale takes off each eligible line.',
    tab: 'store',
    kind: 'percent',
    defaultValue: 0.1,
  },
  'pos.line_sale_on': {
    label: 'Line sale tile on the register',
    help: 'On: cashiers see a tile to mark lines for the line sale. Off (default): no tile.',
    tab: 'store',
    kind: 'switch',
    defaultValue: false,
  },
  'pos.line_sale_name': {
    label: 'Line sale name',
    help: 'The line sale as cashiers and receipts see it.',
    tab: 'store',
    kind: 'text',
    defaultValue: 'Summer',
  },
  'pos.line_sale_percent': {
    label: 'Line sale percent off',
    help: 'How much the line sale takes off a marked line.',
    tab: 'store',
    kind: 'percent',
    defaultValue: 0.5,
  },
  // Register money (critic review point 3, 2026-10-21): the owner's alone.
  'pos.discount_cap_percent': {
    label: 'Discount cap without a manager',
    help: 'A discount bigger than this percent of the sale needs a manager\'s PIN and a reason. Default 20.',
    tab: 'store',
    kind: 'count',
    defaultValue: 20,
  },
  'pos.close_note_over': {
    label: 'Drawer close: note needed when off by more than',
    help: 'A drawer count more than this many dollars over or short needs a note saying why. Default $5.',
    tab: 'store',
    kind: 'money',
    defaultValue: '5.00',
  },
  // Store sale calendar and the register's on/off: changed at the register, not here.
  'pos.labor_day_sale': {
    label: 'Store sale calendar',
    help: 'Start, end and on/off of the store sale. The owner turns it on or off at the register.',
    tab: 'store',
    kind: 'hidden',
  },
  debit_card_fee_rate: {
    label: 'Debit card fee we pay',
    help: 'What the card processor takes on a debit card charge (default 1%). Shown under Fees we pay on Transactions. Not charged to the customer.',
    tab: 'store',
    kind: 'percent',
    defaultValue: 0.01,
  },
  'online_sales.hours': {
    label: 'Store hours',
    help: 'Open days and times. Online Sales hold expiry uses the same clock.',
    tab: 'store',
    kind: 'hours',
  },
  // Owner page Scorecard (2026-10-21). Owner only.
  'owner.scorecard_targets': {
    label: 'Owner Scorecard targets',
    help: 'Buying as % of what was processed (a low-high band) and processed as % of Net item sales. Green on the Owner page when on target.',
    tab: 'store',
    kind: 'raw',
    defaultValue: { buying_pct_of_processing: [40, 50], processing_pct_of_sales: 120 },
  },
  // Staff Dashboard (2026-10-21): one focus number per department. Owner only.
  'dashboard.focus_numbers': {
    label: 'Dashboard focus numbers',
    help:
      'Which number each department sees on the Dashboard. Retail: items_sold_today or sales_today. Processing: items_processed_today or processed_value_today. Restoration: jobs_done_today. Buying: buying_pct_of_processing_week or buying_week.',
    tab: 'store',
    kind: 'raw',
    defaultValue: {
      retail: 'items_sold_today',
      processing: 'items_processed_today',
      restoration: 'jobs_done_today',
      buying: 'buying_pct_of_processing_week',
    },
  },
  // Edited by its own card on Store (owner only); hidden from the raw lists.
  'pos.staff_purchases': {
    label: 'Staff purchases',
    help: 'Payroll deduction at the register for staff. Starts off.',
    tab: 'store',
    kind: 'hidden',
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
  'retail_qa.fresh_tag_count': {
    label: 'Items in the fresh-tag check',
    help: 'How many items the daily fresh-tag check draws from the last day anything was checked in. Default 10.',
    tab: 'retail-qa',
    kind: 'count',
    defaultValue: 10,
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
    label: 'Spot walks goal per week',
    help: 'Spot walks the owner aims for each week. Walks never cap the grade; a week with none shows the owner a warning.',
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
    tab: 'store',
    kind: 'readonly',
  },
  store_address: {
    label: 'Store address',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'store',
    kind: 'readonly',
  },
  store_phone: {
    label: 'Store phone',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'store',
    kind: 'readonly',
  },
  receipt_header: {
    label: 'Receipt header',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'store',
    kind: 'readonly',
  },
  receipt_footer: {
    label: 'Receipt footer',
    help: 'Hardcoded on the print server. Not editable here.',
    tab: 'store',
    kind: 'readonly',
  },
};

const FALLBACK: SettingMeta = {
  label: '',
  help: 'Not in the curated registry. Edit carefully.',
  tab: 'system',
  kind: 'raw',
};

const STATE_PREFIXES: Array<[string, string]> = [['ai_cleanup_job:', 'AI cleanup job, order']];

export function metaForKey(key: string): SettingMeta {
  const listed = SETTINGS_REGISTRY[key];
  if (listed) return listed;
  const state = STATE_PREFIXES.find(([prefix]) => key.startsWith(prefix));
  if (state) return { label: `${state[1]} ${key.slice(state[0].length)}`, help: 'Background job state.', tab: 'system', kind: 'state' };
  return { ...FALLBACK, label: key };
}

export function isHiddenKey(key: string): boolean {
  return SETTINGS_REGISTRY[key]?.kind === 'hidden';
}

/** Only the owner changes these (the server refuses anyone else): Thrift+, staff purchases, the register's sales, the Owner page. */
export function isOwnerOnlyKey(key: string): boolean {
  return key.startsWith('thrift_plus_') || key.startsWith('owner.') || key === 'pos.staff_purchases' || OWNER_SALE_KEYS.has(key)
    || key === 'dashboard.focus_numbers';
}

const OWNER_SALE_KEYS = new Set([
  'pos.store_sale_name', 'pos.store_sale_percent', 'pos.line_sale_on', 'pos.line_sale_name', 'pos.line_sale_percent',
  'pos.discount_cap_percent', 'pos.close_note_over',
]);

/** Known to the registry, or job state: anything else is Unsorted. */
export function isKnownKey(key: string): boolean {
  return Boolean(SETTINGS_REGISTRY[key]) || STATE_PREFIXES.some(([prefix]) => key.startsWith(prefix));
}

export function isStateKey(key: string): boolean {
  return metaForKey(key).kind === 'state';
}

export function keysForTab(tab: SettingsTab, keys: string[]): string[] {
  return keys.filter((key) => !isHiddenKey(key) && !isStateKey(key) && metaForKey(key).tab === tab);
}

export const SETTINGS_TABS: SettingsTab[] = [
  'store', 'thrift-plus', 'buying', 'inventory', 'retail-qa', 'printing', 'ai', 'people', 'system',
];

// Old links (before 2026-10-07) land on the tab that took their settings.
const OLD_TABS: Record<string, SettingsTab> = { assumptions: 'buying', permissions: 'people' };
const SUPERUSER_TABS: SettingsTab[] = ['thrift-plus', 'ai'];

export function parseSettingsTab(raw: string | null, isAdmin: boolean, isSuperuser = false): SettingsTab {
  void isAdmin;  // every tab opens to managers; Permissions inside People checks Admin itself
  const asked = (raw && OLD_TABS[raw]) || raw;
  const tab = SETTINGS_TABS.find((t) => t === asked);
  if (!tab) return 'store';
  if (SUPERUSER_TABS.includes(tab) && !isSuperuser) return 'store';
  return tab;
}

/**
 * Where every setting lives (owner, 2026-10-07): tabs are areas, sections are expandable subsections.
 *
 * - One place decides placement and order. A setting's label, help and editor come from `settingsRegistry.ts`.
 * - **Stages:** a `pre-launch` section is tagged so it is easy to drop after launch; a `legacy` section is hidden
 *   behind "Show legacy" and can be removed with this file.
 * - **Custom** pieces are editors that are not one setting per row (store hours, printers, AI models...).
 * - A setting no section names lands in System → Unsorted, which should stay empty (a test checks the registry).
 */
import type { SettingsTab } from './settingsRegistry';

export type Access = 'all' | 'admin' | 'superuser';
export type Stage = 'pre-launch' | 'legacy';
export type CustomPiece =
  | 'store-hours'
  | 'holiday-hours'
  | 'card-surcharge'
  | 'staff-purchases'
  | 'calculator-link'
  | 'shipping-formula'
  | 'seller-factors'
  | 'retail-qa-tables'
  | 'retail-qa-log'
  | 'printing'
  | 'ai-models'
  | 'permissions'
  | 'careers-link'
  | 'app-version'
  | 'background-jobs'
  | 'unsorted';

export interface SettingsSectionDef {
  id: string;
  title: string;
  help?: string;
  stage?: Stage;
  access?: Access;
  keys?: string[];
  custom?: CustomPiece[];
}

export interface SettingsTabDef {
  id: SettingsTab;
  label: string;
  access: Access;
  sections: SettingsSectionDef[];
}

export const SETTINGS_LAYOUT: SettingsTabDef[] = [
  {
    id: 'store',
    label: 'Store',
    access: 'all',
    sections: [
      { id: 'hours', title: 'Hours', help: 'Open days and times, and holidays. Online Sales holds use the same clock.', custom: ['store-hours', 'holiday-hours'] },
      { id: 'register', title: 'Register and payments', keys: ['tax_rate', 'debit_card_fee_rate'], custom: ['card-surcharge'] },
      {
        id: 'sales',
        title: 'Sales',
        help: 'The owner only. The store sale takes a percent off every eligible line; the line sale only lines a cashier marks.',
        keys: ['pos.store_sale_name', 'pos.store_sale_percent', 'pos.line_sale_on', 'pos.line_sale_name', 'pos.line_sale_percent'],
      },
      {
        id: 'register-money',
        title: 'Register money',
        help: 'The owner only. When a discount needs a manager, and when a drawer count needs a note.',
        keys: ['pos.discount_cap_percent', 'pos.close_note_over'],
      },
      { id: 'staff-purchases', title: 'Staff purchases', help: 'Payroll deduction at the register.', custom: ['staff-purchases'] },
      { id: 'owner-page', title: 'Owner page', help: 'Targets on the Owner page Scorecard.', keys: ['owner.scorecard_targets'] },
      {
        id: 'supplies',
        title: 'Supplies',
        help: 'When the weekly supply count is due. After it the order is built within the hour, from the counts.',
        keys: ['supplies.count_weekday', 'supplies.count_due_time', 'supplies.check_links'],
      },
      {
        id: 'social',
        title: 'Social Studio',
        help: 'Which days get a post, the category rotation, what a post must include before it is Ready, and the AI post ideas.',
        keys: [
          'marketing.post_weekdays', 'marketing.min_photos', 'marketing.hook_max_chars', 'marketing.repeat_days',
          'marketing.in_season', 'marketing.season_weight', 'marketing.thrift_plus_line',
          'marketing.ai_morning_ideas', 'marketing.ai_new_in_days', 'marketing.channels',
        ],
      },
      {
        id: 'business',
        title: 'Business info',
        help: 'Printed on receipts. Set on the print server, so read-only here.',
        keys: ['store_name', 'store_address', 'store_phone', 'receipt_header', 'receipt_footer'],
      },
    ],
  },
  {
    id: 'thrift-plus',
    label: 'Thrift+',
    access: 'superuser',
    sections: [
      {
        id: 'launch',
        title: 'Launch',
        stage: 'pre-launch',
        help: 'Everything customers see of Thrift+ waits for this switch.',
        keys: ['thrift_plus_enabled', 'thrift_plus_preview_code', 'thrift_plus_test_registers'],
      },
      {
        id: 'rewards',
        title: 'ThriftBucks',
        keys: ['thrift_plus_price_first', 'thrift_plus_rewards_start', 'thrift_plus_floor_share', 'thrift_plus_instant_share'],
        custom: ['calculator-link'],
      },
      {
        id: 'returns',
        title: '3-day returns',
        keys: [
          'thrift_plus_return_credit_share', 'thrift_plus_return_min_price', 'thrift_plus_nonreturnable_categories',
          'thrift_plus_nonreturnable_words', 'thrift_plus_return_warn_count', 'thrift_plus_return_warn_days',
        ],
      },
    ],
  },
  {
    id: 'buying',
    label: 'Buying',
    access: 'all',
    sections: [
      {
        id: 'valuation',
        title: 'Valuation',
        help: 'What an auction is worth: the money it must make, and how much of its revenue to expect.',
        keys: [
          'buying_profit_factor', 'pricing_shrinkage_factor', 'buying_shrink_new', 'buying_shrink_like_new',
          'buying_shrink_used_good', 'buying_shrink_used_fair', 'buying_shrink_damaged',
        ],
      },
      {
        id: 'costs',
        title: 'Costs',
        help: 'Counted in the landed cost. PO shrink drives item cost allocation on new orders.',
        keys: ['buying_labor_per_item', 'buying_disposal_per_pallet', 'po_default_est_shrink'],
      },
      {
        id: 'shipping',
        title: 'Shipping',
        keys: ['buying_shipping_per_pallet', 'buying_shipping_typical_miles'],
        custom: ['shipping-formula'],
      },
      {
        id: 'need',
        title: 'Need and priority',
        keys: [
          'category_from_profile', 'pricing_need_window_days', 'buying_target_cover_weeks', 'buying_priority_profit_weight',
          'buying_priority_speed_weight', 'buying_pipeline_max_age_days',
        ],
      },
      {
        id: 'manifest-pull',
        title: 'Manifest pull',
        help: 'The daily B-Stock manifest download.',
        keys: [
          'buying_manifest_pull_window_hours', 'buying_manifest_pull_max_per_run', 'buying_manifest_pull_retry_hours',
          'buying_manifest_pull_page_delay_ms',
        ],
      },
      {
        id: 'learned',
        title: 'Learned numbers',
        help: 'Fitted from finished trucks. Read-only: the fit job writes them.',
        custom: ['seller-factors'],
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    access: 'all',
    sections: [
      { id: 'intake', title: 'Intake and product standard', keys: ['product_standard_at_intake'] },
      { id: 'deliveries', title: 'Deliveries', keys: ['delivery_service_minutes_per_stop'] },
      {
        id: 'tags',
        title: 'Price tags and the retail check',
        help: 'When a tag shows retail, and when check-in stops to ask about a retail that looks wrong.',
        keys: [
          'tags.retail_on_tag',
          'tags.retail_check_price_multiple',
          'tags.retail_check_median_multiple',
          'tags.retail_check_min_items',
        ],
      },
      {
        id: 'trucks',
        title: 'Truck finalize',
        help: "How 'what we can expect back' is worked out for missing and broken goods (B-Stock's rule).",
        keys: ['truck_refund_rate', 'truck_refund_deductible'],
      },
      {
        id: 'shrink-age',
        title: 'Shrink by age',
        help: 'Estimated stock on hand: how likely an item on the shelf is gone, from how long since anyone saw it.',
        keys: ['shrink_age_start_days', 'shrink_age_lost_days', 'shrink_age_start_pct', 'shrink_count_not_found_lost'],
      },
      {
        id: 'review',
        title: 'Inventory review',
        help: 'Stale, and the limits behind the flags on Inventory → Review.',
        keys: [
          'inventory_review_stale_days', 'inventory_review_overstock_weeks', 'inventory_review_short_weeks',
          'inventory_review_stale_heavy_share', 'inventory_review_slowing_share', 'inventory_review_missing_share',
          'inventory_review_price_gap_share', 'inventory_review_price_min_n',
        ],
      },
      {
        id: 'recovery',
        title: 'Recovery estimate',
        help: 'What similar items keep of retail, at Preprocessing and check-in. The owner turns it on.',
        keys: ['inventory_recovery_estimate', 'inventory_recovery_prior_n', 'inventory_recovery_band_share'],
      },
    ],
  },
  {
    id: 'retail-qa',
    label: 'Retail QA',
    access: 'all',
    sections: [
      {
        id: 'baseline',
        title: 'Baseline',
        help: 'How many walks make a normal aisle, and when a section is still warming up.',
        keys: ['retail_qa.baseline_window', 'retail_qa.baseline_shrink', 'retail_qa.warmup_section', 'retail_qa.warmup_store'],
      },
      {
        id: 'cross',
        title: 'Cross-checks',
        help: 'Tails, and which weekday the walk happens.',
        keys: ['retail_qa.cross_full_tail', 'retail_qa.cross_zero_tail', 'retail_qa.cross_check_weekday'],
      },
      {
        id: 'owner',
        title: 'Owner checks',
        help: 'Leftover R, grace, how many drawn checks land in a spot, and how many items the fresh-tag check draws.',
        keys: [
          'retail_qa.owner_grace',
          'retail_qa.owner_divisor_floor',
          'retail_qa.spot_check_count',
          'retail_qa.safety_cap',
          'retail_qa.fresh_tag_count',
        ],
      },
      {
        id: 'flags',
        title: 'Checker flags',
        help: 'When a checker is pulled out of the baseline.',
        keys: [
          'retail_qa.flag_window', 'retail_qa.flag_z', 'retail_qa.flag_min_expected', 'retail_qa.flag_followup_r',
          'retail_qa.flag_min_seconds', 'retail_qa.flag_batch_minutes', 'retail_qa.flag_rubber_stamp_window',
        ],
      },
      {
        id: 'scoring',
        title: 'Grades and weights',
        help: 'Spot, Do and Cross shares. Missing parts renormalize to 100. Call-ins do not shrink expected.',
        keys: [
          'retail_qa.weight_spot', 'retail_qa.weight_do', 'retail_qa.weight_cross', 'retail_qa.walk_floor',
          'retail_qa.section_due_after_punch_minutes',
        ],
      },
      {
        id: 'register-idle',
        title: 'Register idle',
        help: 'When an idle register asks for a work cycle. Dismissals are logged; they do not change the grade.',
        keys: ['retail_qa.idle_prompt_minutes', 'retail_qa.idle_stretch_minutes'],
      },
      { id: 'ladders', title: 'Ladders, severity and preview', help: 'Tables, and a preview of this week with them.', custom: ['retail-qa-tables'] },
      { id: 'qa-log', title: 'Change log', custom: ['retail-qa-log'] },
    ],
  },
  {
    id: 'printing',
    label: 'Printing',
    access: 'all',
    sections: [{ id: 'printers', title: 'Printers and print server', custom: ['printing'] }],
  },
  {
    id: 'ai',
    label: 'AI',
    access: 'superuser',
    sections: [{ id: 'models', title: 'Models, assignments and costs', custom: ['ai-models'] }],
  },
  {
    id: 'people',
    label: 'People',
    access: 'all',
    sections: [
      { id: 'permissions', title: 'Permissions', access: 'admin', help: 'What each role can do.', custom: ['permissions'] },
      { id: 'email', title: 'Email', keys: ['mailbox.email_signature'] },
      { id: 'careers', title: 'Careers page', help: 'Jobs, the application form and its emails are edited in People → Jobs.', custom: ['careers-link'] },
    ],
  },
  {
    id: 'system',
    label: 'System',
    access: 'all',
    sections: [
      { id: 'app', title: 'Application', custom: ['app-version'] },
      { id: 'jobs', title: 'Background jobs', help: 'What background work last did. Read-only.', custom: ['background-jobs'] },
      { id: 'unsorted', title: 'Unsorted', help: 'Settings with no home yet. This should stay empty: tell Claude to place them.', custom: ['unsorted'] },
    ],
  },
];

/** Settings named by a section (where each one lives). */
export function placedKeys(): Map<string, { tab: SettingsTab; section: string }> {
  const out = new Map<string, { tab: SettingsTab; section: string }>();
  for (const tab of SETTINGS_LAYOUT) {
    for (const section of tab.sections) {
      for (const key of section.keys ?? []) out.set(key, { tab: tab.id, section: section.id });
    }
  }
  return out;
}

export function canSee(access: Access | undefined, isAdmin: boolean, isSuperuser: boolean): boolean {
  if (!access || access === 'all') return true;
  if (access === 'superuser') return isSuperuser;
  return isAdmin || isSuperuser;
}

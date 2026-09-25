/**
 * Types for B-Stock buying / auction intelligence API (`apps/buying/`).
 */

export interface BuyingMarketplace {
  id: number;
  name: string;
  slug: string;
  external_id: string | null;
  /** B-Stock shows this seller only to a signed-in buyer (Costco): loaded with the handed-over login. */
  requires_login?: boolean;
}

/** Phase 5: mix source label from backend. */
export type BuyingValuationSource = 'manifest' | 'ai' | 'none';

/** Row from GET /api/buying/auctions/ */
export interface BuyingAuctionListItem {
  id: number;
  marketplace: BuyingMarketplace;
  title: string;
  current_price: string | null;
  bid_count: number | null;
  end_time: string | null;
  time_remaining_seconds: number | null;
  lot_size: number | null;
  /** Extended retail from B-Stock search (e.g. retailPrice), dollars */
  total_retail_value: string | null;
  /** Row count from manifest lines (list endpoint only). */
  manifest_row_count?: number;
  /** Where the current rows came from: B-Stock auto pull or a CSV upload; '' when none. */
  manifest_source?: '' | 'auto' | 'manual';
  /** Why the last auto pull failed; '' after a success. */
  manifest_pull_error?: string;
  /** Hybrid sort key: manifest sum or listing total (list endpoint only). */
  retail_sort?: string | null;
  /** Dollars to display in list (manifest sum when rows exist, else sweep listing). */
  total_retail_display?: string | null;
  /** Where `total_retail_display` comes from. */
  retail_source?: 'manifest' | 'listing';
  /** new | like_new | used_good | used_fair | damaged | unspecified (from condition_summary). */
  condition_group?: string;
  /** One line: why this auction ranks where it does (Need, profit, speed, condition, shipping, mix source). */
  why?: string;
  condition_summary: string;
  status: string;
  has_manifest: boolean;
  last_updated_at: string | null;
  /** Phase 5 valuation - see AuctionListSerializer */
  ai_category_estimates?: Record<string, number> | null;
  manifest_category_distribution?: Record<string, number> | null;
  estimated_revenue?: string | null;
  revenue_override?: string | null;
  fees_override?: string | null;
  shipping_override?: string | null;
  estimated_fees?: string | null;
  estimated_shipping?: string | null;
  estimated_total_cost?: string | null;
  profitability_ratio?: string | null;
  /** Expected profit after shrink minus total cost (Phase 5+). */
  est_profit?: string | null;
  /** Phase 5: buy at or under this; null without a revenue estimate. */
  price_target?: string | null;
  /** Phase 5: likely hammer price. */
  expected_close?: string | null;
  /** The buyer's own max bid; null means the price target is the max. */
  max_bid?: string | null;
  /** 1-99 taxonomy need mix; absent when not computed. */
  need_score?: number | null;
  shrinkage_override?: string | null;
  profit_target_override?: string | null;
  priority?: number | null;
  priority_override?: boolean;
  /** When set, auction is archived (hidden from default lists). */
  archived_at?: string | null;
  /** Annotated for ordering when API supports it; UI may derive from watchlist tint. */
  watchlist_sort?: boolean;
  /** True when the logged-in staff user has a thumbs-up vote on this auction. */
  my_thumbs_up?: boolean;
  /** Aggregate staff thumbs-up votes (Phase 3B). */
  thumbs_up_count?: number;
  /** Top 3 category mix for list (manifest preferred, else AI). */
  top_categories?: { name: string; pct: number }[];
  valuation_source?: BuyingValuationSource;
  has_revenue_override?: boolean;
  effective_revenue_after_shrink?: string | null;
}

/** Watchlist entry (OneToOne per auction). */
export interface BuyingWatchlistEntry {
  id: number;
  priority: string;
  status: string;
  notes: string;
  /** Seconds between automatic polls (server command); default 300. */
  poll_interval_seconds: number;
  /** ISO datetime of last successful watch poll, or null. */
  last_polled_at: string | null;
  added_at: string;
}

/** Row from GET /api/buying/watchlist/ */
export type BuyingWatchlistAuctionItem = BuyingAuctionListItem & {
  watchlist_entry: BuyingWatchlistEntry;
  /** Duplicates watchlist_entry.added_at; set when API annotates for ordering. */
  added_at?: string | null;
};

export interface BuyingWatchlistParams {
  page?: number;
  page_size?: number;
  ordering?: string;
  priority?: string;
  watchlist_status?: string;
  marketplace?: string;
  status?: string;
  has_manifest?: boolean;
  thumbs_up?: boolean;
  /** Title / marketplace name search (split on spaces, AND). */
  q?: string;
  /** Recently ended auctions (last 7 days); omit for live-only (default). */
  completed?: boolean;
  archived?: boolean;
  /** ``end_time`` on today's calendar date in America/Chicago. */
  today?: boolean;
  /** Ending inside the manifest-pull window, not contracts: the morning Pull's list. */
  focus?: boolean;
}

/** Canonical category mix for manifest rows (auction detail). */
export interface BuyingCategoryDistributionTop {
  canonical_category: string;
  count: number;
  pct: number;
}

export interface BuyingCategoryDistribution {
  total_rows: number;
  /** All categories (sorted by count desc); no rolled-up "Other" bucket. */
  top: BuyingCategoryDistributionTop[];
  /** Deprecated: always null; kept for API compatibility. */
  other?: { count: number; pct: number } | null;
  not_yet_categorized: { count: number; pct: number };
}

/** GET /api/buying/auctions/:id/ */
export interface BuyingAuctionDetail extends BuyingAuctionListItem {
  external_id: string;
  description: string;
  url: string;
  /** Phase 4: manifest lines matched, flagged and valued (null without manifest lines). */
  manifest_analysis?: ManifestAnalysis | null;
  /** Truck value v2 (before shrink); replaces the category-mix revenue when set. */
  analysis_revenue?: string | null;
  /** The buyer's own max bid (else the price target is the max) and notes. */
  max_bid?: string | null;
  buyer_notes?: string;
  /** Phase 6: the PO a win became. */
  purchase_order?: number | null;
  purchase_order_number?: string | null;
  outcome?: { win: boolean; hammer_price: string | null; total_cost: string | null; captured_at: string | null } | null;
  report_card?: ReportCard | null;
  /** Labor + disposal (Assumptions), fixed at any bid. */
  handling_cost?: string;
  /** Only on the POST .../won/ response: why the manifest did not carry over, if it didn't. */
  won_note?: string;
  category: string;
  /** B-Stock lotId (manifest API path segment). */
  lot_id: string | null;
  /** B-Stock listingType (e.g. SPOT, CONTRACT) */
  listing_type: string;
  starting_price: string | null;
  buy_now_price: string | null;
  manifest_row_count: number;
  /** Sum of Coalesce(qty,1)×retail_value over manifest rows (for list % column). */
  manifest_extended_retail_total?: string | null;
  /** Display name of manifest template used for current rows (from first row), if any. */
  manifest_template_name?: string | null;
  manifest_pulled_at?: string | null;
  manifest_pull_attempted_at?: string | null;
  /** Would the daily pull ever pick this auction (ignoring when it ends)? */
  manifest_pull_eligible?: boolean;
  /** B-Stock will never give this manifest (too large, or none); the pull stops trying. */
  manifest_pull_blocked?: boolean;
  /** Aggregated manifest canonical categories (top 5, Other, not yet categorized). */
  category_distribution?: BuyingCategoryDistribution;
  watchlist_entry: BuyingWatchlistEntry | null;
  first_seen_at: string | null;
  /** B-Stock's freight quote to the buyer's address (dollars), when B-Stock has one. */
  shipping_quote?: string | null;
  shipping_quote_at?: string | null;
  shipping_quote_info?: BuyingShippingQuoteInfo | null;
  /** Fee rate that scales with the bid; null when fees are a fixed override. */
  fee_rate_applied?: string | null;
  /** Shipping rate that scales with the bid; null when shipping is an override or a quote. */
  shipping_rate_applied?: string | null;
  shipping_source?: 'override' | 'quote' | 'estimate';
  /** How Priority was set: blended, Need only (no category mix), or a manual override. */
  priority_basis?: 'need_profit' | 'need_only' | 'override';
  /** 1-99 from profit / all-in cost at the current price (99 = doubles the money). */
  profit_score?: number | null;
  /** Profit's share of Priority (Admin > Assumptions). */
  priority_profit_weight?: string;
  /** 1-99: category mix x 30-day sell-through; null with no mix. */
  speed_score?: number | null;
  /** Speed's share of Priority (Admin > Assumptions; 0 = ignored). */
  priority_speed_weight?: string;
  /** How an estimate was worked out (estimate only). */
  shipping_estimate?: BuyingShippingEstimate | null;
  /** From the listing: B-Stock palletCount, else the pallets in the title. */
  pallet_count?: number | null;
  /** Where the lot ships from, e.g. "Franklin, IN". */
  origin_city?: string;
  origin_zip?: string;
  /** Truckload, LTL, or PARCEL. */
  shipment_type?: string;
}

/**
 * formula: distance formula (truckload or LTL) fitted on our past orders;
 * pallets: pallets x the Assumptions $ per pallet (no distance for the city yet);
 * rate: marketplace shipping rate x price (no pallet count).
 */
export interface BuyingShippingEstimate {
  basis: 'formula' | 'pallets' | 'rate';
  amount: string;
  mode?: 'truckload' | 'ltl';
  pallets?: number;
  miles?: number;
  city?: string;
  per_pallet?: string;
  /** Share the formula typically misses by; low / high are amount -/+ that share. */
  typical_error?: string;
  low?: string | null;
  high?: string | null;
  rate?: string;
}

export interface BuyingShippingQuoteInfo {
  carrier?: string;
  /** TL (truckload) or LTL. */
  mode?: string;
  trucks?: number | null;
  destination_zip?: string;
  quote_id?: string;
  quoted_at?: string;
}

/** Row from GET /api/buying/auctions/:id/manifest_rows/ */
export interface BuyingManifestRow {
  id: number;
  row_number: number;
  title: string;
  brand: string;
  model: string;
  /** Vendor manifest fast-cat key (slugified category columns). */
  fast_cat_key: string;
  /** taxonomy_v1 value from CategoryMapping lookup at upload; not final canonical. */
  fast_cat_value: string | null;
  /** Set by downstream processing / categorize_manifests; may stay null after CSV upload. */
  canonical_category: string | null;
  /** direct | ai_mapped | fallback | fast_cat */
  category_confidence: string | null;
  sku: string;
  upc: string;
  quantity: number | null;
  retail_value: string | null;
  condition: string;
  notes: string;
  /** Phase 4 (manifest analysis): the product this line matched, and how. */
  matched_product?: number | null;
  /** upc | title | near | '' */
  match_method?: string;
  match_score?: string | null;
  /** Hazard codes (see `components/buying/manifestHazards.ts`). */
  hazards?: string[] | null;
  /** Expected revenue per unit, after hazard discounts. */
  unit_value?: string | null;
  /** product (this product's own sales) | category (the category rate) */
  value_basis?: string;
  /** The line's category need (High / Med / Low); null when the category has no stats. */
  need_level?: 'High' | 'Med' | 'Low' | null;
  /** What the matched product did for us; null when unmatched. */
  product_sales?: {
    title: string;
    sold: number;
    avg_days: number | null;
    on_hand: number;
    ratio: string | null;
  } | null;
}

/** Summary of the manifest analysis on an auction (Phase 4). */
export interface ManifestAnalysis {
  key: string;
  analyzed_at: string;
  lines: number;
  units: number;
  retail: string;
  revenue: string;
  revenue_by_category: string;
  matched_lines: number;
  /** Lines with any hazard; missing on analyses made before it was added. */
  flagged_lines?: number;
  /** Manifest retail far over the listing's: values were scaled back to the listing. */
  retail_mismatch?: { manifest_retail: string; listing_retail: string; scale: number } | null;
  /** Share of the value in the 10 best lines; missing on older analyses. */
  top_lines_value_pct?: number | null;
  match_methods: Record<string, number>;
  matched_retail_pct: number;
  product_basis_retail_pct: number;
  hazards: Record<string, { lines: number; retail_pct: number }>;
  top_lines: Array<{ row_id: number; title: string; qty: number; value: string; basis: string; hazards: string[] }>;
  high_volume: Array<{ product_id: number; title: string; units: number; sold: number; avg_days: number | null; on_hand: number }>;
}

export interface BuyingManifestRowsParams {
  page?: number;
  search?: string;
  /** Canonical or fast_cat value, or `__uncategorized__`. */
  category?: string;
  /** One hazard code (Phase 4). */
  hazard?: string;
  /** '1' matched lines only, '0' unmatched only. */
  matched?: string;
  /** Comma-separated whitelist (first wins), e.g. `-retail_value` or `row_number`. */
  ordering?: string;
}

/** POST /api/buying/auctions/:id/upload_manifest/ (multipart field `file`) */
export interface BuyingUploadManifestResponse {
  rows_saved: number;
  rows_with_fast_cat: number;
  template_source: 'existing' | 'ai_created';
  ai_mappings_created: number;
  unmapped_key_count: number;
  total_batches: number;
  manifest_template_id: number;
  template_display_name: string;
  header_signature: string;
  warnings: string[];
}

/** POST /api/buying/auctions/:id/map_fast_cat_batch/ (body `{}`) */
export interface BuyingMapFastCatBatchResponse {
  error?: 'ai_not_configured' | string;
  keys_mapped?: number;
  keys_remaining?: number;
  has_more?: boolean;
  mappings?: Array<{
    fast_cat_key: string;
    canonical_category: string;
    confidence: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
  };
  estimated_cost_usd?: number;
}

export interface BuyingWatchlistPostBody {
  priority?: string;
}

export interface BuyingAuctionListParams {
  page?: number;
  page_size?: number;
  ordering?: string;
  marketplace?: string;
  status?: string;
  has_manifest?: boolean;
  thumbs_up?: boolean;
  /** Title / marketplace name search (split on spaces, AND). */
  q?: string;
  /** Recently ended auctions (last 7 days); omit for live-only (default). */
  completed?: boolean;
  archived?: boolean;
  /** ``end_time`` on today's calendar date in America/Chicago. */
  today?: boolean;
  /** Ending inside the manifest-pull window, not contracts: the morning Pull's list. */
  focus?: boolean;
}

/** GET /api/buying/category-need/ */
export interface BuyingCategoryNeedRow {
  category: string;
  shelf_count: number;
  sold_count: number;
  /** Shelf retail $ (on_shelf), same cohort as SQL `have_retail`. */
  have_retail: string;
  /** Sold retail $ in need window, same cohort as SQL `want_retail`. */
  want_retail: string;
  /** Raw unit leg for need score: `unit_raw_leg(want_units, have_units)` - see `category_stats_sql`. */
  need_raw_unit_leg: string;
  /** Raw retail leg: `retail_raw_leg(want_retail, have_retail)`. */
  need_raw_retail_leg: string;
  /** Average of the two legs before min-max scale to 1-99. */
  need_raw_combined: string;
  shelf_pct: string;
  sold_pct: string;
  /** Mean sold_for per good-data sold row (all-time; sale/retail/cost each 0.01-9999). */
  avg_sale: string | null;
  /** Mean retail_value per good-data sold row. */
  avg_retail: string | null;
  /** Mean cost per good-data sold row. */
  avg_cost: string | null;
  /** Mean (sale − cost) per good-data sold row. */
  avg_profit: string | null;
  /** Dollar-weighted (sum sale − sum cost) / sum sale on good-data cohort. */
  profit_margin: string | null;
  /** Count of inventory rows in the good-data cohort. */
  good_data_sample_size: number;
  recovery_pct: string;
  need_gap: string;
  bar_scale_max: string;
  /** From CategoryStats - SUM(sold_for)/SUM(retail_value), 0-1 */
  recovery_rate: string;
  /** Need v2 (1-99): weeks of cover vs target; 50 = on target, higher = short. */
  need_score_1to99: number;
  /** Items in intake or processing. */
  in_building_units?: number;
  /** Units on open POs (recent) with no item yet. */
  on_order_units?: number;
  pipeline_units?: number;
  weekly_sales_units?: string;
  /** (shelf + pipeline) / weekly sales; null when nothing sold. */
  cover_weeks?: string | null;
  /** Target weeks after the goal multiplier. */
  target_weeks?: string | null;
  goal?: BuyingCategoryGoal;
  median_days_to_sell?: number | null;
  sold_within_90_pct?: string | null;
}

/** Manager goal per category: moves its target weeks of cover (more x1.5, less x0.5, stop = Need 1). */
export type BuyingCategoryGoal = 'more' | 'normal' | 'less' | 'stop';

export interface BuyingPipelineSummary {
  shelf_units: number;
  in_building_units: number;
  on_order_units: number;
  open_pos_by_status: Record<string, number>;
  open_pos_without_lines: number;
  open_pos_without_lines_retail: string;
  checked_in_per_week: number;
  /** Check-ins per week averaged over 26 weeks. */
  checked_in_per_week_26?: number;
  /** (in building + on order) / weekly check-ins: weeks of processing already waiting. */
  backlog_weeks?: number | null;
}

export interface BuyingCategoryNeedResponse {
  need_window_days: number;
  /** Min of `need_raw_combined` across taxonomy rows (same day’s daily SQL). */
  need_score_raw_global_min: string | null;
  /** Max of `need_raw_combined` across taxonomy rows. */
  need_score_raw_global_max: string | null;
  categories: BuyingCategoryNeedRow[];
  need_method?: 'cover_v2';
  /** Assumptions setting; 0 = auto (the store's average cover). */
  target_cover_weeks?: number;
  pipeline_max_age_days?: number;
  pipeline?: BuyingPipelineSummary;
  coverage?: BuyingNeedCoverage;
}

/** How much data backs the Need numbers (data-quality register IDs in `register`). */
export interface BuyingNeedCoverage {
  sold_units: number;
  named_category_pct: number | null;
  shelf_date_pct: number | null;
  on_order_mixed_units: number;
  register: string[];
}

/** PATCH /api/buying/auctions/:id/valuation-inputs/ */
export interface BuyingValuationInputsPatch {
  fees_override?: string | null;
  shipping_override?: string | null;
  shrinkage_override?: string | null;
  profit_target_override?: string | null;
  revenue_override?: string | null;
  priority?: number | null;
}

/** Same filters as the auction list, without pagination (for GET …/summary/). */
export interface BuyingAuctionSummaryParams {
  marketplace?: string;
  status?: string;
  has_manifest?: boolean;
  /** Recently ended auctions (last 7 days); omit for live-only (default). */
  completed?: boolean;
  archived?: boolean;
  today?: boolean;
  /** Ending inside the manifest-pull window, not contracts: the morning Pull's list. */
  focus?: boolean;
}

export interface BuyingAuctionSummaryMarketplaceRow {
  marketplace_id: number;
  name: string;
  slug: string;
  count: number;
}

/** GET /api/buying/auctions/summary/ */
export interface BuyingAuctionSummaryResponse {
  last_refreshed_at: string | null;
  by_marketplace: BuyingAuctionSummaryMarketplaceRow[];
}

/** Row from GET /api/buying/auctions/:id/snapshots/ */
export interface BuyingAuctionSnapshot {
  id: number;
  auction: number;
  price: string | null;
  bid_count: number | null;
  time_remaining_seconds: number | null;
  captured_at: string;
}

/** POST /api/buying/auctions/:id/poll/ (pipeline.run_watch_poll summary). */
export interface BuyingPollResponse {
  polled: number;
  snapshots: number;
  skipped: number;
  errors: string[];
  refreshed_at?: string;
}

/** One marketplace row in POST /api/buying/sweep/ when `by_marketplace` is present. */
export interface BuyingSweepMarketplaceRow {
  slug: string;
  name: string;
  listings_found: number;
  http_ms?: number;
  http_error?: string | null;
  inserted?: number;
  updated?: number;
  skipped?: number;
  db_errors?: number;
}

/** Response from POST /api/buying/sweep/ (pipeline.run_discovery summary). */
export interface BuyingSweepResponse {
  marketplaces: number;
  rows: number;
  upserted: number;
  dry_run: boolean;
  page_limit: number;
  max_pages: number | null;
  /** ISO timestamp when the sweep finished (pipeline clock). */
  refreshed_at?: string;
  /** Wall-clock seconds for HTTP + DB (parallel sweep path). */
  total_seconds?: number;
  total_listings?: number;
  inserted?: number;
  updated?: number;
  by_marketplace?: BuyingSweepMarketplaceRow[];
  ai_estimate?: { considered?: number; estimated?: number };
  /** Count of auctions updated via lightweight recompute after sweep. */
  lightweight_recomputed?: number;
  valuation_error?: string;
  /** True when `defer_valuation=1` skipped post-discovery work (lightweight + AI). */
  valuation_deferred?: boolean;
  /** Present when server included timing breakdown (ms). */
  sweep_timing_ms?: Record<string, number>;
  /** Whether `run_ai=1` was honored for this request. */
  run_ai?: boolean;
}

/** GET /api/buying/bstock_token_status/ */
export interface BuyingBstockTokenStatus {
  bstock_token_available: boolean;
}

/** The B-Stock login handed over from bstock.com. The token itself never comes back. */
export interface BstockLoginStatus {
  connected: boolean;
  expires_at: string | null;
  seconds_left: number;
  saved_at: string | null;
}

export type ManifestPullStatus = 'queued' | 'running' | 'done' | 'failed' | 'stopped';

export interface ManifestPullJob {
  id: number;
  status: ManifestPullStatus;
  total: number;
  done: number;
  ok: number;
  error: string;
  created_at: string;
  finished_at: string | null;
  /** Live but silent: its runner died; Pull resumes it. */
  stalled: boolean;
  results: Array<{
    auction_id: number;
    title: string;
    ok: boolean;
    /** Nothing attempted: the auction no longer needed a pull when its turn came. */
    skipped?: boolean;
    /** B-Stock will never give this manifest (too large, or none); not retried. */
    blocked?: boolean;
    rows: number;
    unmapped_keys?: number;
    error: string;
  }>;
}

export interface ManifestPullState {
  job: ManifestPullJob | null;
  login: BstockLoginStatus;
  /** Auctions that would be pulled if you started now. */
  shortlist_count: number;
  /** Auctions in the window with no manifest that are waiting out a failed attempt. */
  waiting_retry_count: number;
}


/** GET /api/buying/wishlist/ (Phase 5): one auction worth bidding on. */
export interface WishlistAuction {
  id: number;
  title: string;
  marketplace: string;
  url: string;
  /** The lot's main category (the biggest share of its mix). */
  top_category?: string | null;
  origin_city?: string;
  total_retail_value?: string | null;
  lot_size?: number | null;
  /** The buyer's max, else the price target. */
  max_bid?: string | null;
  max_is_buyer?: boolean;
  /** max_bid minus the current price (negative when over). */
  room?: string | null;
  need_level?: 'High' | 'Med' | 'Low' | null;
  profit_low?: string | null;
  profit_high?: string | null;
  /** Hazards covering 5% of retail or more. */
  hazard_count?: number;
  end_time: string | null;
  current_price: string | null;
  bid_count: number | null;
  price_target: string | null;
  expected_close: string | null;
  /** in_range | likely_over | over */
  state: 'in_range' | 'likely_over' | 'over' | null;
  priority: number;
  need_score: number | null;
  est_profit: string | null;
  profitability_ratio: string | null;
  estimated_revenue: string | null;
  estimated_total_cost: string | null;
  pallet_count: number | null;
  condition_summary: string;
  days_to_sell: number | null;
  has_analysis: boolean;
  matched_retail_pct: number | null;
  hazards: Array<{ code: string; lines: number; retail_pct: number }>;
  why: string;
  why_not: string[];
  watched: boolean;
}

/** Phase 6: predicted (at the win) vs actual (the PO's items so far). */
export interface ReportCard {
  purchase_order_id: number;
  order_number: string;
  po_status: string;
  predicted: { revenue: string | null; profit: string | null; days_to_sell: number | null; units: number | null };
  actual: {
    items: number;
    sold: number;
    on_shelf: number;
    revenue: string;
    shelf_value: string;
    profit_so_far: string;
    avg_days_to_sell: number | null;
    sell_through_pct: number | null;
  };
  revenue_vs_predicted_pct: number | null;
  cost: string;
}

/** One won truck on the Report cards page. */
export interface ReportCardRow {
  auction_id: number;
  title: string;
  marketplace: string;
  ordered_date: string | null;
  age_days: number | null;
  hammer_price: string | null;
  /** judged: old enough and sold enough to count in the valuation check. */
  stage: 'judged' | 'selling' | 'not_selling_yet';
  card: ReportCard;
}

/** GET /api/buying/report-cards/ */
export interface ReportCardsResponse {
  results: ReportCardRow[];
  calibration: {
    trucks: number;
    median_ratio: number | null;
    /** The multiplier valuation uses now (null: 1.0, not enough trucks yet). */
    applied: string | null;
    min_trucks: number;
    min_age_days: number;
    min_sold_pct: number;
  };
  last_90_days: { won: number; lost: number };
}

/** GET /api/buying/wishlist/ */
export interface WishlistResponse {
  results: WishlistAuction[];
  /** Rows that pass (before the 60-row cap) and all live auctions. */
  eligible?: number;
  live_total?: number;
  /** Numbers we really have: won not paid, on order, in the building. */
  strip?: {
    /** Lots marked won today: the goal is 1 or 2 a day. */
    won_today?: number;
    won_unpaid: { lots: number; total: string | null };
    on_order: { units: number; retail: string | null };
    in_building: { units: number; retail: string | null; oldest_days: number | null };
  };
  /** Finished won trucks: actual / predicted revenue (Phase 6). */
  report_cards: { trucks: number; median_ratio: number | null };
}

/** A watched lot in the buyer's nags. */
export interface BuyingNagLot {
  id: number;
  title: string;
  marketplace: string;
  end_time: string | null;
  current_price: string | null;
}

/** GET /api/buying/nags/ (superusers; empty for everyone else). */
export interface BuyingNags {
  /** Watched, ending within the hour, still at or under the max. Red in the last 15 minutes. */
  ending: Array<
    BuyingNagLot & { minutes_left: number; max_bid: string | null; max_is_buyer: boolean; room: string | null; tone: 'red' | 'amber' }
  >;
  /** Watched, ended in the last 7 days, no result recorded yet. */
  unrecorded: BuyingNagLot[];
  count: number;
  tone: 'red' | 'amber' | 'none';
}

/** GET /api/buying/auctions/:id/decision/ (the auction page's decision panel). */
export interface AuctionDecision {
  score: number;
  verdict: string;
  bids: {
    max_bid: string | null;
    max_is_buyer: boolean;
    comfortable: string | null;
    model: string | null;
    stretch: string | null;
    room: string | null;
  };
  need: {
    level: 'High' | 'Med' | 'Low' | null;
    score: number | null;
    category?: string;
    share_pct?: number;
    cover_weeks?: string | null;
    cover_after_weeks?: string | null;
    target_weeks?: string | null;
    note?: string;
  };
  hazards: {
    count: number;
    named: Array<{ code: string; label: string; lines: number; retail_pct: number }>;
    clean: string[];
    known: boolean;
  };
  profit: {
    at_current: string | null;
    roi_pct: number | null;
    at_max: string | null;
    low: string | null;
    high: string | null;
    break_even_bid: string | null;
    per_pallet: string | null;
  };
  time_to_sell: { days: number | null; sell_through_30_pct: number | null };
  landed: {
    bid: string | null;
    fee: string | null;
    freight: string | null;
    labor: string | null;
    /** Categories with no sales of their own, valued at the store-wide rate (``store_rate``). */
    filled_categories?: string[];
    store_rate?: string;
    /** Share of predicted revenue this seller's finished trucks really made (null: not fitted). */
    seller_factor?: string | null;
    seller_factor_trucks?: number | null;
    /** Freight per $ of bid when freight is a rate estimate; null when it is a fixed amount. */
    ship_rate?: string | null;
    /** Units the labor is on, and where they came from (estimate = pallets x typical units). */
    labor_units?: number;
    labor_units_basis?: 'manifest' | 'listing' | 'estimate' | 'none';
    disposal_pallets?: number;
    disposal_pallets_basis?: 'listing' | 'estimate' | 'none';
    disposal: string | null;
    total: string | null;
    recovery: string | null;
    profit: string | null;
    fee_rate: string | null;
    recovery_pct_of_retail: number | null;
    value_basis_pct: number | null;
  };
  similar: {
    lots: Array<{ id: number; title: string; category: string | null; origin_city: string; pallets: number | null; close: string | null; retail: string | null }>;
    likely_low: string | null;
    likely_high: string | null;
    days: number;
  };
  seller: {
    name: string;
    won_90_days: number;
    lost_90_days: number;
    trucks_judged: number;
    actual_vs_predicted_pct: number | null;
  };
  units: number;
  retail: string | null;
}

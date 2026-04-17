/**
 * Types for B-Stock buying / auction intelligence API (`apps/buying/`).
 */

export interface BuyingMarketplace {
  id: number;
  name: string;
  slug: string;
  external_id: string | null;
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
  /** Hybrid sort key: manifest sum or listing total (list endpoint only). */
  retail_sort?: string | null;
  /** Dollars to display in list (manifest sum when rows exist, else sweep listing). */
  total_retail_display?: string | null;
  /** Where `total_retail_display` comes from. */
  retail_source?: 'manifest' | 'listing';
  condition_summary: string;
  status: string;
  has_manifest: boolean;
  last_updated_at: string | null;
  /** Phase 5 valuation — see AuctionListSerializer */
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
  /** 1–99 taxonomy need mix; absent when not computed. */
  need_score?: number | null;
  shrinkage_override?: string | null;
  profit_target_override?: string | null;
  priority?: number | null;
  priority_override?: boolean;
  /** When set, auction is archived (hidden from default lists). */
  archived_at?: string | null;
  /** Annotated for ordering when API supports it; UI may derive from watchlist tint. */
  watchlist_sort?: boolean;
  thumbs_up?: boolean;
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
  /** Server: profitability_ratio >= 1.5 */
  profitable?: boolean;
  /** Server: need_score > 0 */
  needed?: boolean;
  /** Title / marketplace name search (split on spaces, AND). */
  q?: string;
  /** Recently ended auctions (last 7 days); omit for live-only (default). */
  completed?: boolean;
  archived?: boolean;
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
  /** Aggregated manifest canonical categories (top 5, Other, not yet categorized). */
  category_distribution?: BuyingCategoryDistribution;
  watchlist_entry: BuyingWatchlistEntry | null;
  first_seen_at: string | null;
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
}

export interface BuyingManifestRowsParams {
  page?: number;
  search?: string;
  /** Canonical or fast_cat value, or `__uncategorized__`. */
  category?: string;
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
  /** Server: profitability_ratio >= 1.5 */
  profitable?: boolean;
  /** Server: need_score > 0 */
  needed?: boolean;
  /** Title / marketplace name search (split on spaces, AND). */
  q?: string;
  /** Recently ended auctions (last 7 days); omit for live-only (default). */
  completed?: boolean;
  archived?: boolean;
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
  /** Raw unit leg for need score: `unit_raw_leg(want_units, have_units)` — see `category_stats_sql`. */
  need_raw_unit_leg: string;
  /** Raw retail leg: `retail_raw_leg(want_retail, have_retail)`. */
  need_raw_retail_leg: string;
  /** Average of the two legs before min–max scale to 1–99. */
  need_raw_combined: string;
  shelf_pct: string;
  sold_pct: string;
  /** Mean sold_for per good-data sold row (all-time; sale/retail/cost each 0.01–9999). */
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
  /** From CategoryStats — SUM(sold_for)/SUM(retail_value), 0–1 */
  recovery_rate: string;
  /** Min–max scaled vs other categories (1–99), daily SQL. */
  need_score_1to99: number;
}

export interface BuyingCategoryNeedResponse {
  need_window_days: number;
  /** Min of `need_raw_combined` across taxonomy rows (same day’s daily SQL). */
  need_score_raw_global_min: string | null;
  /** Max of `need_raw_combined` across taxonomy rows. */
  need_score_raw_global_max: string | null;
  categories: BuyingCategoryNeedRow[];
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


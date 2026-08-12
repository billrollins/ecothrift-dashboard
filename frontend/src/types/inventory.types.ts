/**
 * Vendor type choices
 */
export type VendorType = 'liquidation' | 'retail' | 'direct' | 'other';

/**
 * Purchase order status choices
 */
export type PurchaseOrderStatus =
  | 'ordered'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'processing'
  | 'complete'
  | 'cancelled';

export type PurchaseOrderCondition =
  | 'new'
  | 'like_new'
  | 'good'
  | 'fair'
  | 'salvage'
  | 'mixed'
  | '';

/**
 * Item source choices
 */
export type ItemSource = 'purchased' | 'consignment' | 'misc';

/**
 * Item status choices
 */
export type ItemStatus =
  | 'intake'
  | 'processing'
  | 'on_shelf'
  | 'sold'
  | 'returned'
  | 'scrapped'
  | 'lost';

export type ItemCondition =
  | 'new'
  | 'like_new'
  | 'very_good'
  | 'good'
  | 'fair'
  | 'salvage'
  | 'unknown';

export type ProcessingTestedStatus = 'untested' | 'partially_tested' | 'tested';

export type ProcessingQuickTestResult =
  | 'pass'
  | 'fail'
  | 'unknown'
  | 'not_applicable'
  | 'skipped';

export interface ProcessingQuickTestRow {
  test_id?: string;
  name?: string;
  result: ProcessingQuickTestResult;
  notes?: string;
}

export interface ProcessingHandoff {
  schema_version?: 1;
  tested_status: ProcessingTestedStatus;
  condition_evidence?: string;
  unknowns?: string | string[];
  quick_tests?: ProcessingQuickTestRow[];
  readonly recorded_at?: string;
  readonly recorded_by_id?: number | null;
}

/**
 * Processing batch status choices
 */
export type ProcessingBatchStatus = 'pending' | 'in_progress' | 'complete';

export type BatchGroupStatus = 'pending' | 'in_progress' | 'complete';
export type ManifestPricingStage = 'unpriced' | 'draft' | 'final';

/**
 * Item scan source choices
 */
export type ItemScanSource = 'public_lookup' | 'pos_terminal' | 'audit_scan';

export interface ColumnMapping {
  source: string;
  target: string;
  transform?: string;
  transforms?: Array<{
    type: string;
    from?: string;
    to?: string;
  }>;
}

export interface Vendor {
  id: number;
  name: string;
  code: string;
  vendor_type: VendorType;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  notes: string;
  is_active: boolean;
  created_at: string;
}

export interface ManifestRow {
  id: number;
  purchase_order: number;
  row_number: number;
  quantity: number;
  title: string;
  brand: string;
  model: string;
  category: string;
  condition: ItemCondition | '';
  /** Per-unit vendor / manifest MSRP (`ManifestRow.unit_retail`); authoritative for pricing math on manual-review rows. */
  unit_retail?: string | null;
  retail_value: string | null;
  proposed_price: string | null;
  final_price: string | null;
  pricing_stage: ManifestPricingStage;
  pricing_notes: string;
  upc: string;
  vendor_item_number: string;
  batch_flag: boolean;
  search_tags: string;
  specifications: Record<string, unknown>;
  ai_reasoning: string;
  notes: string;
  item_ids?: number[];
  first_item_id?: number | null;
  first_item_sku?: string | null;
  item_count?: number;
  base_cost?: string | null;
  ideal_price?: string | null;
  set_price?: string | null;
  ideal_delta_pct?: number | null;
}

/** GET /api/inventory/orders/ list rows (`PurchaseOrderListSerializer`). */
export interface PurchaseOrderListRow {
  id: number;
  vendor: number;
  vendor_name: string;
  vendor_code: string;
  order_number: string;
  status: PurchaseOrderStatus;
  ordered_date: string;
  paid_date?: string | null;
  shipped_date?: string | null;
  expected_delivery: string | null;
  delivered_date: string | null;
  condition: PurchaseOrderCondition;
  description: string;
  item_count: number;
  pallet_count: number | null;
  total_cost: string | null;
  retail_value: string | null;
  has_manifest: boolean;
  receiving_status?: string;
  processing_status?: string;
  created_at: string;
  updated_at: string;
}

/** GET /api/inventory/orders/preprocessing-queue/ (`PreprocessingQueueOrderSerializer`). */
export interface PreprocessingQueueOrder {
  id: number;
  order_number: string;
  vendor_name: string;
  preprocessing_row_count: number;
}

/** GET /api/inventory/orders/preprocessing-queue/ */
export interface PreprocessingQueueResponse {
  results: PreprocessingQueueOrder[];
}

/** Per-order financial metrics (`page-metrics` / summary profitability). */
export interface PurchaseOrderFinancialMetrics {
  cost: string;
  retail: string;
  priced: string;
  /** Sum of Item.retail on shelf-eligible (priced) items - manifest + extras. */
  priced_retail?: string;
  sold: string;
  /** Net sold revenue in the last 7 days (same rules as `sold`). */
  sold_last_week?: string;
  profit: string;
}

/** GET /api/inventory/orders/summary/ KPI aggregates (matches current list filters or selected ids). */
export interface PurchaseOrderSummary {
  total_orders: number;
  total_cost: string;
  retail_value: string;
  /** Alias of total_cost for profitability strip. */
  cost?: string;
  /** Alias of retail_value for profitability strip. */
  retail?: string;
  priced: string;
  /** Listing retail on shelf-eligible (priced) items - for MFT. */
  priced_retail?: string;
  sold: string;
  /** Net sold in the last 7 days across the filtered/selected set. */
  sold_last_week?: string;
  profit: string;
  items_received: number;
  /** Sum of expected pallet_count on matching orders. */
  pallet_count?: number;
  delivered_count: number;
  /** Orders with status=shipped (Trucks in Transit). */
  in_transit_count?: number;
  /** Sum of total_cost for shipped orders. */
  in_transit_cost?: string;
  margin_percent: number | null;
}

/** GET /api/inventory/orders/page-metrics/?ids=1,2,3 */
export interface PurchaseOrderPageMetricsResponse {
  orders: Record<string, PurchaseOrderFinancialMetrics>;
}

export interface PurchaseOrder {
  id: number;
  vendor: number;
  vendor_name: string;
  vendor_code: string;
  order_number: string;
  status: PurchaseOrderStatus;
  ordered_date: string;
  paid_date: string | null;
  shipped_date: string | null;
  expected_delivery: string | null;
  delivered_date: string | null;
  purchase_cost: string | null;
  shipping_cost: string | null;
  fees: string | null;
  total_cost: string | null;
  retail_value: string | null;
  /** Estimated shrink 0-1; item cost uses listing retail × (1 − est_shrink). Admin-editable. */
  est_shrink: string;
  condition: PurchaseOrderCondition;
  description: string;
  item_count: number;
  /** Expected pallet count when ordering; null if unknown (distinct from receiving pallet count). */
  pallet_count: number | null;
  notes: string;
  manifest: number | null;
  manifest_file: {
    id: number;
    key: string;
    filename: string;
    size: number;
    content_type: string;
    uploaded_at: string;
    url: string | null;
  } | null;
  manifest_preview: {
    headers: string[];
    delimiter?: string;
    rows: { row_number: number; raw: Record<string, string> }[];
  } | null;
  /** Denormalized at manifest upload; cleared on remove. Omitted on list rows. */
  manifest_filename?: string;
  manifest_uploaded_at?: string | null;
  /** Line count from last raw file upload (`len(rows_data)`). */
  manifest_row_count?: number | null;
  manifest_category_count?: number | null;
  manifest_signature?: string;
  manifest_headers?: string[] | null;
  template?: number | null;
  template_name_cache?: string;
  template_header_signature_cache?: string;
  template_column_mappings_cache?: ColumnMapping[];
  standardization_formulas?: Record<string, unknown>;
  preprocess_status?: string;
  receiving_status?: string;
  receiving_started_at?: string | null;
  receiving_done_at?: string | null;
  processing_status?: string;
  processing_started_at?: string | null;
  processing_done_at?: string | null;
  uses_legacy_processing?: boolean;
  closeout_status?: string;
  intake_dispute_status?: string;
  processing_dispute_status?: string;
  standardized_at?: string | null;
  ai_cleaned_at?: string | null;
  review_saved_at?: string | null;
  finalized_at?: string | null;
  closed_at?: string | null;
  processing_stats?: {
    item_status_counts: {
      intake: number;
      processing: number;
      on_shelf: number;
      sold: number;
      returned: number;
      scrapped: number;
      lost: number;
    };
    pending_items: number;
    batch_groups_pending: number;
    batch_groups_total: number;
  };
  /** Canonical `ManifestRow` count on `GET /orders/{id}/` (retrieve); not on detail-surface. */
  inventory_manifest_row_count?: number;
  manifest_rows?: ManifestRow[];
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/inventory/orders/{id}/detail-surface/ - Order Detail page only (no manifest_preview, no processing_stats). */
export interface PurchaseOrderDetailSurface {
  id: number;
  vendor: number;
  vendor_name: string;
  vendor_code: string;
  order_number: string;
  status: PurchaseOrderStatus;
  ordered_date: string;
  paid_date: string | null;
  shipped_date: string | null;
  expected_delivery: string | null;
  delivered_date: string | null;
  purchase_cost: string | null;
  shipping_cost: string | null;
  fees: string | null;
  total_cost: string | null;
  retail_value: string | null;
  est_shrink: string;
  condition: PurchaseOrderCondition;
  description: string;
  item_count: number;
  pallet_count: number | null;
  notes: string;
  manifest_filename: string | null;
  manifest_uploaded_at: string | null;
  manifest_row_count: number | null;
  manifest_category_count: number | null;
  manifest_signature?: string | null;
  manifest_headers?: string[] | null;
  template?: number | null;
  template_name_cache?: string;
  template_header_signature_cache?: string;
  template_column_mappings_cache?: ColumnMapping[];
  standardization_formulas?: Record<string, unknown>;
  preprocess_status?: string;
  receiving_status?: string;
  receiving_started_at?: string | null;
  receiving_done_at?: string | null;
  processing_status?: string;
  processing_started_at?: string | null;
  processing_done_at?: string | null;
  uses_legacy_processing?: boolean;
  closeout_status?: string;
  intake_dispute_status?: string;
  processing_dispute_status?: string;
  standardized_at?: string | null;
  ai_cleaned_at?: string | null;
  review_saved_at?: string | null;
  finalized_at?: string | null;
  closed_at?: string | null;
  has_manifest: boolean;
  created_at: string;
  updated_at: string;
}

export interface CSVTemplate {
  id: number;
  vendor: number;
  vendor_name: string;
  name: string;
  header_signature: string;
  column_mappings: ColumnMapping[];
  is_default: boolean;
  created_at: string;
}

export interface Product {
  id: number;
  product_number: string | null;
  title: string;
  brand: string;
  model: string;
  category: number;
  category_name: string | null;
  specifications: Record<string, unknown>;
  identifiers: Record<string, string>;
  tags: string[];
  upc?: string;
  catalog_display_label?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** One scope block from GET /inventory/items/stats/ */
export interface ItemStatsBlock {
  label: string;
  on_shelf: number;
  sold: number;
  lost: number;
  scrapped: number;
  total: number;
  avg_retail: string;
  avg_sold: string;
  loss_rate: string;
}

export interface ItemStatsResponse {
  product: ItemStatsBlock | null;
  category: ItemStatsBlock | null;
  global: ItemStatsBlock;
}

export interface Item {
  id: number;
  sku: string;
  product: number;
  product_title: string | null;
  product_brand?: string;
  product_number: string | null;
  product_model?: string;
  product_upc?: string;
  purchase_order: number | null;
  purchase_order_number?: string | null;
  manifest_row: number | null;
  title: string;
  brand: string;
  category?: string;
  price: string;
  /** Staff API alias for Item.retail (MSRP). */
  retail_value?: string | null;
  retail?: string | null;
  cost: string | null;
  source: ItemSource;
  status: ItemStatus;
  condition: ItemCondition;
  specifications: Record<string, unknown>;
  location: string;
  listed_at: string | null;
  checked_in_at: string | null;
  checked_in_by: number | null;
  label_printed_at: string | null;
  label_printed: boolean;
  sold_at: string | null;
  sold_for: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  dispute_type?: '' | 'broken' | 'undelivered';
  dispute_pct_loss?: number | null;
  dispute_description?: string;
  /** ItemCheckIn that created this item, when known. */
  item_check_in_id?: number | null;
}

/** Item Processor workspace (`GET …/processing-workspace/`). */
export interface ProcessingWorkspaceProductDTO {
  id: number;
  product_number: string;
  title: string;
  brand: string;
  model: string;
  specs: Record<string, unknown>;
  identifiers: Record<string, string>;
  tags: string[];
  taxonomy: string;
  category: string;
  upc: string;
}

/** Row detail: catalog product linked for check-in on this processing row. */
export interface ProcessingAttachedProductDTO extends ProcessingWorkspaceProductDTO {
  checkedInQty: number;
}

export type ProcessingItemDisputeType =
  | 'broken'
  | 'missing_pieces'
  | 'cosmetic_damage'
  | 'missing_critical_piece'
  | 'bad_condition'
  | 'other'
  | 'undelivered';

export interface ProcessingWorkspaceItemDTO {
  id: number;
  sku: string;
  condition: string;
  condition_label: string;
  price: string;
  retail: string | null;
  dispatch: string;
  disposition: string;
  notes: string;
  status: ItemStatus;
  location?: string;
  product: number | null;
  product_number?: string | null;
  product_title?: string | null;
  product_brand?: string;
  product_model?: string;
  manifest_row: number | null;
  created_at?: string | null;
  checked_in_at: string | null;
  label_printed_at?: string | null;
  label_printed?: boolean;
  dispute_type: ProcessingItemDisputeType | null;
  dispute_pct_loss: number | null;
  dispute_description: string;
}

export interface ItemCheckInDefaultsDTO extends Record<string, unknown> {
  condition?: string;
  dispatch?: string;
  retail?: string;
  price?: string;
  notes?: string;
  specifications?: Record<string, string>;
  restoration_scale?: string;
  restoration_grade_values?: Record<string, number>;
  processing_handoff?: ProcessingHandoff;
}

export interface ItemCheckInDTO {
  id: number;
  quantity: number;
  items: ProcessingWorkspaceItemDTO[];
  product: ProcessingWorkspaceProductDTO | null;
  created_at: string | null;
  created_by: number | null;
  defaults: ItemCheckInDefaultsDTO;
  dispute_count: number;
}

/** Catalog ItemCheckIn from GET /inventory/item-check-ins/ */
export interface ItemCheckInCatalogItem {
  id: number;
  sku: string;
  status: ItemStatus;
  condition: ItemCondition;
  price: string;
  location: string;
  checked_in_at: string | null;
  label_printed_at?: string | null;
  label_printed?: boolean;
}

export interface ItemCheckInCatalog {
  id: number;
  purchase_order: number;
  purchase_order_number: string | null;
  purchase_order_ordered_date: string | null;
  purchase_order_vendor_name: string | null;
  purchase_order_description?: string | null;
  processing_row: number | null;
  manifest_row: number | null;
  product: number | null;
  product_number: string | null;
  product_title: string;
  product_brand: string;
  origin: 'processing' | 'product_ad_hoc' | 'manual';
  quantity: number;
  defaults: Record<string, unknown>;
  specifications: Record<string, unknown>;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  dispute_count: number;
  item_count: number;
  items: ItemCheckInCatalogItem[];
}

export interface ProcessingManifestEvidenceDTO {
  title: string;
  brand: string;
  quantity: number;
  unit_retail: string | null;
}

export interface ProcessingRowLayerFieldDTO {
  manifest?: string;
  ai?: string;
  final?: string;
}

export type ProcessingRowLayerSourcesDTO = Partial<
  Record<'title' | 'brand' | 'model' | 'category' | 'unitRetail' | 'price', ProcessingRowLayerFieldDTO>
>;

export type ProcessingProductLinkRole = 'set' | 'part' | null;

export interface ProcessingProductLinkDTO {
  role: ProcessingProductLinkRole;
  checkIns: number;
  manifestUnits: number;
}

/** Bookmark row fields from finalize - unchanged when a catalog product overrides display. */
export interface ProcessingStandardizedIdentityDTO {
  title: string;
  brand: string;
  model: string;
  category?: string;
  identifiers?: Record<string, unknown>;
}

/** Subset returned from GET processing-workspace (no nested items/products). */
export type ProcessingRowKind = 'manifest' | 'added';

/** P7 collapse: combined rollup carried by the group MASTER row. */
export interface ProcessingCollapsedGroupDTO {
  memberRowNumbers: number[];
  memberRowIds: number[];
  totalQty: number;
  totalDispositioned: number;
}

/** P9 transforms: one Break apart / Make set audit entry on the family ROOT row. */
export interface ProcessingTransformMemoDTO {
  op: 'break_apart' | 'make_set';
  units: number;
  factor?: number;
  set_size?: number;
  num_sets?: number;
  in_place: boolean;
  sub_row_id: number | null;
  sub_row_number: number | null;
  created_product_id: number | null;
  by: number | null;
  at: string;
}

/** P9 transforms: family map present on detail payloads of split roots and sub rows. */
export interface ProcessingSplitFamilyDTO {
  rootProcessingRowId: number;
  rootRowNumber: number;
  children: Array<{
    processing_row_id: number;
    rowNumber: number;
    splitSeq: number | null;
    qty: number;
    qtyDispositioned: number;
  }>;
  canRestart: boolean;
}

export interface ProcessingWorkspaceRowDTO {
  processing_row_id: number;
  rowKind?: ProcessingRowKind;
  manifest_row_id: number | null;
  rowNum: number;
  /** Non-null on FOLLOWER rows of a collapse group (points at the master row id). */
  collapseMasterId?: number | null;
  /** Present on group MASTER rows only. */
  collapsedGroup?: ProcessingCollapsedGroupDTO;
  /** P9 split families: non-null on SUB rows created by Break apart / Make set. */
  splitParentId?: number | null;
  splitSeq?: number | null;
  /** Resolved parent row number so sub rows can label as `#12.1`. */
  splitParentRowNumber?: number;
  /** Detail-only: transform audit trail (always the family ROOT's list). */
  transforms?: ProcessingTransformMemoDTO[];
  /** Detail-only: split family map when this row is a transform root or sub row. */
  splitFamily?: ProcessingSplitFamilyDTO;
  productId: number | null;
  product: ProcessingWorkspaceProductDTO | null;
  title: string;
  brand: string;
  model?: string;
  specs?: Record<string, unknown>;
  tags?: string;
  taxonomy?: string;
  category: string;
  qty: number;
  qtyDispositioned: number;
  /** Denormalized distinct product count (dispositioned items); list + detail. */
  distinctProductCount?: number;
  /** Other row numbers sharing matched_product_id (list peer hint). */
  sameProductRowNumbers?: number[];
  /** Pending unit count when list-only; detail query may hydrate items[]. */
  pendingItemCount?: number;
  hasOnShelfUnit?: boolean;
  unitRetail: string | null;
  manifestNotes?: string;
  identifiers: Record<string, unknown>;
  tracking?: Record<string, unknown>;
  /** Empty on list payloads; hydrated from processing-row-detail. */
  items?: ProcessingWorkspaceItemDTO[];
  /** Temporary processing-stage groups for items checked in together. */
  itemCheckIns?: ItemCheckInDTO[];
  status: string;
  likelyDuplicateOf: number[];
  condition: string;
  price: string | null;
  dispatch: string;
  sku: string | null;
  /** Lowercased denormalized substring search blob; detail payloads only (list search is server-side). */
  searchString?: string;
  /** Expected minus checked-in (detail payloads). */
  qtyRemaining?: number;
  /** Checked-in minus expected when over manifest qty (detail payloads). */
  qtyOverage?: number;
  /** Detail-only vendor claim when a product is matched. */
  manifestEvidence?: ProcessingManifestEvidenceDTO;
  /** Detail-only manifest vs AI source values for row-detail hovers. */
  rowLayerSources?: ProcessingRowLayerSourcesDTO;
  /** Per attached product: X check-ins account for Y manifest row units (display only). */
  productLinks?: Record<string, ProcessingProductLinkDTO>;
  /** Detail-only hydrated attached catalog products (includes zero-qty links). */
  attachedProducts?: ProcessingAttachedProductDTO[];
  /** Bookmark-only identity from preprocessing finalize (list + detail). */
  standardizedIdentity?: ProcessingStandardizedIdentityDTO;
}

export interface ProcessingWorkspaceRollupsDTO {
  expected_qty: number;
  dispositioned_qty: number;
  remaining_qty: number;
  overage_qty: number;
  expected_retail: string | null;
  on_shelf_qty: number;
  sold_qty: number;
  scrapped_qty: number;
  lost_qty: number;
  pending_qty: number;
  total_items: number;
  unmanifested_qty: number;
  sold_value: string | null;
  on_shelf_value: string | null;
}

export interface ProcessingIntakeMigrationDTO {
  has_linked_manifest_rows: boolean;
  unlinked_row_count: number;
  requires_legacy_build: boolean;
  has_terminal_item_history: boolean;
  incomplete_legacy_build?: boolean;
}

export interface ProcessingWorkspaceOrderDTO {
  id: number;
  number: string;
  vendor: string;
  vendor_code: string;
  load_type: string;
  expected_delivery: string | null;
  /** ISO date from purchase order. */
  ordered_date: string | null;
  paid_date: string | null;
  delivered_date: string | null;
  status: PurchaseOrderStatus;
  total_manifest_qty: number;
  total_retail: string | null;
  has_manifest?: boolean;
  manifest_filename?: string | null;
}

export interface ProcessingWorkspaceDTO {
  order: ProcessingWorkspaceOrderDTO;
  rows: ProcessingWorkspaceRowDTO[];
  /** After server-side filtering; pagination applies on top */
  row_count_filtered?: number;
  /** ProcessingRow count for this PO (ignores filters) */
  row_count_total_po?: number;
  manifest_qty_dispositioned_total?: number;
  workspace_limit?: number;
  workspace_offset?: number;
  session: {
    items_per_hour: number;
    elapsed_seconds: number;
    session_log: unknown[];
  };
  progress: {
    total_units: number;
    dispositioned_units: number;
    pending_units: number;
  };
  /** True when rows come from processing bookmarks (finalize) only; run build-processing-data for items. */
  processingBookmarkOnly?: boolean;
  /** ISO timestamp when preprocessing was finalized on this PO, if any (empty workspace UX). */
  preprocessing_finalized_at?: string | null;
  rollups?: ProcessingWorkspaceRollupsDTO;
  intake_migration?: ProcessingIntakeMigrationDTO;
}

/** PATCH payload returned by processor mutations (`workspace_patch`). */
export interface ProcessingWorkspacePatchDTO {
  progress: ProcessingWorkspaceDTO['progress'];
  /** Live header rollups recomputed after each mutation. */
  rollups?: ProcessingWorkspaceRollupsDTO;
  manifest_qty_dispositioned_total?: number;
  rows: ProcessingWorkspaceRowDTO[];
}

export interface ProcessingBatch {
  id: number;
  purchase_order: number;
  status: ProcessingBatchStatus;
  total_rows: number;
  processed_count: number;
  items_created: number;
  started_at: string | null;
  completed_at: string | null;
  created_by: number | null;
  notes: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  spec_template: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

export interface VendorProductRef {
  id: number;
  vendor: number;
  vendor_name: string;
  vendor_code: string;
  product: number;
  product_title: string;
  product_number: string | null;
  vendor_item_number: string;
  vendor_description: string;
  last_unit_cost: string | null;
  times_seen: number;
  last_seen_date: string;
  created_at: string;
  updated_at: string;
}

export interface BatchGroup {
  id: number;
  batch_number: string;
  product: number | null;
  product_title: string | null;
  product_number: string | null;
  purchase_order: number | null;
  purchase_order_number: string | null;
  manifest_row: number | null;
  manifest_row_number: number | null;
  total_qty: number;
  status: BatchGroupStatus;
  unit_price: string | null;
  unit_cost: string | null;
  condition: ItemCondition;
  location: string;
  processed_by: number | null;
  processed_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  items_count?: number;
  intake_items_count?: number;
}

export interface ItemHistory {
  id: number;
  item: number;
  event_type: string;
  old_value: string;
  new_value: string;
  note: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
}

export type ItemScanOutcome =
  | 'added_to_cart'
  | 'pos_blocked_sold'
  | 'public_lookup'
  | 'audit_scan';

export interface ItemScanHistory {
  id: number;
  item: number;
  scanned_at: string;
  ip_address: string | null;
  source: ItemScanSource;
  outcome?: ItemScanOutcome;
  cart?: number | null;
  created_by?: number | null;
}

/** Load condition for receiving (not the same as PO cosmetic condition). */
export type ReceivingLoadCondition = '' | 'good' | 'mixed' | 'damaged';

/** GET /inventory/orders/for-receiving/ extends list row. */
export interface OrderForReceivingRow extends PurchaseOrderListRow {
  receiving_status?: string;
  receiving_started_at?: string | null;
  receiving_done_at?: string | null;
  has_receiving_draft: boolean;
  has_receiving_complete: boolean;
}

export interface S3FileBrief {
  id: number;
  key: string;
  filename: string;
  size: number;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export type ReceivingAttachmentKind = 'bol' | 'truck' | 'pallet_side';
export type PalletSideId = 'front' | 'right' | 'back' | 'left';

export interface ReceivingAttachmentDTO {
  id: number;
  kind: ReceivingAttachmentKind;
  pallet_number: number | null;
  side: PalletSideId | '';
  client_photo_id: string | null;
  /** 2048px high-res */
  s3_file: S3FileBrief;
  /** 480px thumbnail; null until backfill / new upload */
  thumbnail_file?: S3FileBrief | null;
  created_at: string;
}

export interface ReceivingMissingPhotoSlot {
  kind: ReceivingAttachmentKind;
  pallet_number: number | null;
  side: PalletSideId | '';
  key: string;
  label: string;
}

export interface ReceivingPhotoOverrideDTO {
  id: number;
  kind: ReceivingAttachmentKind;
  pallet_number: number | null;
  side: PalletSideId | '';
  key: string;
  label: string;
  reason: string;
  overridden_by: number | null;
  overridden_by_name: string | null;
  created_at: string;
}

export interface ReceivingPhotoOverridePayload {
  kind: ReceivingAttachmentKind;
  pallet_number?: number | null;
  side?: PalletSideId | '';
  reason: string;
}

export interface ReceivingPalletDTO {
  id: number;
  pallet_number: number;
  damaged: boolean;
}

export interface ReceivingDetailDTO {
  id: number;
  purchase_order_id: number;
  received_date: string | null;
  start_time: string | null;
  end_time: string | null;
  condition: ReceivingLoadCondition;
  issues: string;
  received_pallet_count: number;
  completed_at: string | null;
  draft_version: number;
  is_draft: boolean;
  pallets: ReceivingPalletDTO[];
  attachments: ReceivingAttachmentDTO[];
  photo_overrides?: ReceivingPhotoOverrideDTO[];
  missing_required_photos?: ReceivingMissingPhotoSlot[];
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/inventory/orders/{id}/manifest-preview/ */
export interface OrderManifestPreviewDTO {
  order_id: number;
  order_number: string;
  filename: string | null;
  size: number | null;
  content_type: string;
  delimiter: string;
  headers: string[];
  rows: Array<{ row_number: number; raw: Record<string, string> }>;
  preview_row_count: number;
  total_row_count: number | null;
  uploaded_at: string | null;
}

/** POST receiving/complete/ response includes updated order snapshot. */
export interface ReceivingCompleteResponse extends ReceivingDetailDTO {
  order: PurchaseOrder;
  items_created?: number;
  batch_groups_created?: number;
}

export interface ReceivingPatchPayload {
  received_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  condition?: ReceivingLoadCondition;
  issues?: string;
  received_pallet_count?: number;
  pallets?: Array<{ pallet_number: number; damaged?: boolean }> | null;
}

export type RestorationJobStage = 'queued' | 'sent' | 'bench' | 'pending' | 'done' | 'returned';

export type RestorationBenchDisposition = 'processing' | 'storage' | 'salvage' | 'online_sales';

export type RestorationPendingReason =
  | 'parts_needed'
  | 'need_more_time'
  | 'pending_test'
  | 'repair_time_needed'
  | 'tools_needed'
  | 'needs_approval'
  | 'research_sop'
  | 'safety_hold'
  | 'between_steps'
  | 'other';

export type RestorationReturnDispositionType = 'tars_completed' | 'untouched';

export type RestorationUntouchedReason = 'recalled' | 'not_worth_it' | 'other';

export type TarsSource = 'Target' | 'Amazon' | 'Walmart' | null;

export interface RestorationJobItemDTO {
  id: number;
  sku: string;
  status: string;
  condition: string;
  location: string;
}

export interface RestorationJobDTO {
  id: number;
  stage: RestorationJobStage;
  quantity: number;
  scale: string;
  grade_values: Record<string, number>;
  readonly processing_handoff: ProcessingHandoff | null;
  needs_setup: boolean;
  valuation_pending?: boolean;
  valuation_requested_at?: string | null;
  valuation_requested_by_id?: number | null;
  valuation_request_notes?: string;
  valuation_requested_grades?: string[];
  valuation_fulfilled_at?: string | null;
  direction?: 'to' | 'from' | 'other' | null;
  from_family?: 'worked' | 'untouched' | null;
  work_verbs?: string[];
  unit_kind?: 'whole' | 'part' | 'added' | string;
  sale_state?: string | null;
  decision_reason?: string;
  work_session?: Record<string, unknown>;
  product_id: number | null;
  purchase_order_id: number | null;
  sku: string | null;
  name: string;
  brand: string;
  model: string;
  category: string;
  product_number: string;
  upc: string;
  source: TarsSource;
  condition: string;
  retail: string | null;
  price: string | null;
  purchase_order_number: string | null;
  return_disposition_type: RestorationReturnDispositionType | '';
  return_reason: RestorationUntouchedReason | '';
  return_scale: string;
  return_grade: string;
  return_notes: string;
  item_check_in_id: number;
  items: RestorationJobItemDTO[];
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  returned_at: string | null;
  bench_started_at: string | null;
  bench_owner_id?: number | null;
  bench_ownership_ambiguous?: boolean;
  timer_started_at: string | null;
  active_seconds: number;
  timer_is_running: boolean;
  timer_started_by_id?: number | null;
  /** What the clock is currently for. Looking is charged to the item, working to a grade. */
  timer_mode: TarsTimerMode;
  timer_grade: string;
  look_seconds: number;
  work_seconds: number;
  last_meaningful_action_at?: string | null;
  last_meaningful_active_seconds?: number;
  last_meaningful_action_label?: string;
  elapsed_seconds: number;
  elapsed_hours: string;
  pending_reason: RestorationPendingReason | '';
  pending_notes: string;
  pending_storage_location: string;
  pending_started_at: string | null;
  /** Set in the queue, before any work — distinct from where it actually went. */
  intended_destination: RestorationIntendedDestination | '';
  /** Anything the person picking this up should know. Any staff member may write it. */
  queue_note: string;
  bench_disposition: RestorationBenchDisposition | '';
  /** The grade the item arrived at — the datum every estimate is measured against. */
  starting_grade: string;
  final_grade: string;
  disposition_notes: string;
  spent_hours: string | null;
  spent_parts_cost: string | null;
  /** Frozen at completion. Null means it could not be computed honestly. */
  value_added: string | null;
  dispositioned_at: string | null;
  processing_handled_at: string | null;
}

export type TarsTimerMode = 'look' | 'work';

/** Where the item is meant to end up, decided in the queue before any work. */
export type RestorationIntendedDestination =
  | 'shelf'
  | 'online_sales'
  | 'storage'
  | 'staff_pick';

export interface RestorationJobQueueDetailsPayload {
  scale?: string;
  grade_values?: Record<string, number>;
  intended_destination?: string;
  queue_note?: string;
}

/** One span of finished work: what it added, over how many hours. */
export interface RestorationScoreboardWindowDTO {
  start: string;
  end: string;
  value_added: string | null;
  items: number;
  items_measured: number;
  /** Finished without a computable value — counted, never priced. */
  items_unmeasured: number;
  hours: string;
  /** Null when there are no recorded hours to divide by. */
  per_hour: string | null;
}

export interface RestorationScoreboardDayDTO {
  date: string;
  items: number;
  value_added: string;
}

export interface RestorationScoreboardDTO {
  as_of: string;
  today: RestorationScoreboardWindowDTO;
  week: RestorationScoreboardWindowDTO;
  four_week: RestorationScoreboardWindowDTO & {
    weekly_average_value: string | null;
    weekly_average_items: string;
  };
  per_hour_while_working: string | null;
  /** What an hour costs. A policy number, not a measurement. */
  floor_rate: string;
  /** The trailing rate to beat — withheld until it rests on enough jobs. */
  benchmark_rate: string | null;
  benchmark_ready: boolean;
  benchmark_minimum_jobs: number;
  days: RestorationScoreboardDayDTO[];
}

export type RestorationTimelineEventStatus = 'active' | 'revised' | 'voided';

export type RestorationTimelineEventType =
  | 'legacy.snapshot'
  | 'job.sent'
  | 'job.checked_in'
  | 'job.moved_to_queue'
  | 'valuation.requested'
  | 'valuation.values_changed'
  | 'valuation.fulfilled'
  | 'condition.current_grade.set'
  | 'test.added'
  | 'test.result_set'
  | 'test.removed'
  | 'plan.estimated'
  | 'plan.committed'
  | 'plan.cleared'
  | 'parts.draft_changed'
  | 'parts.request_submitted'
  | 'parts.ordered'
  | 'parts.received'
  | 'work.performed'
  | 'timer.started'
  | 'timer.paused'
  | 'timer.adjusted'
  | 'hold.placed'
  | 'hold.resumed'
  | 'disposition.completed'
  | 'return.to_processing';

export interface RestorationTimelineEventDTO {
  id: number;
  job_id: number;
  event_type: RestorationTimelineEventType;
  entity_id: string;
  occurred_at: string;
  actor_id: number | null;
  actor_name: string;
  status: RestorationTimelineEventStatus;
  supersedes_id: number | null;
  voided_at: string | null;
  voided_by_id: number | null;
  voided_by_name: string;
  void_reason: string;
  correlation_id: string;
  schema_version: number;
  payload: Record<string, unknown>;
}

export type RestorationQueueAddStatus =
  | 'created'
  | 'already_queued'
  | 'requeued'
  | 'on_bench'
  | 'on_pending';

export interface RestorationJobCreateResultDTO extends RestorationJobDTO {
  queue_add_status?: RestorationQueueAddStatus;
  scanned_item_id?: number;
  scanned_item_sku?: string;
}

export interface RestorationJobHoldPayload {
  reason: RestorationPendingReason;
  notes?: string;
  storage_location?: string;
}

export interface RestorationJobDonePayload {
  destination: RestorationBenchDisposition;
  final_grade: string;
  notes?: string;
  spent_hours?: string | number;
  spent_parts_cost?: string | number;
}

export interface RestorationPartsRequestLineDTO {
  id: number;
  part_number: string;
  description: string;
  url: string;
  qty: number;
  unit_price_estimate: string;
  unit_price_actual: string;
  status: string;
  linked_grade: string;
}

export interface RestorationPartsRequestSiteDTO {
  id: number;
  supplier_name: string;
  sort_order: number;
  lines: RestorationPartsRequestLineDTO[];
}

export interface RestorationPartsOrderLineDTO {
  id: number;
  request_line_id: number;
  qty: number;
  unit_cost: string;
  line_total: string;
}

export interface RestorationPartsOrderDTO {
  id: number;
  po_number: string;
  supplier_name: string;
  supplier_url: string;
  subtotal: string;
  shipping: string;
  tax: string;
  fees: string;
  total: string;
  ship_to_address: string;
  expected_delivery: string | null;
  ordered_at: string | null;
  notes: string;
  status: string;
  site: number | null;
  lines: RestorationPartsOrderLineDTO[];
  created_at: string;
  updated_at: string;
}

export interface RestorationPartsRequestDTO {
  id: number;
  job: number;
  job_sku: string | null;
  job_name: string;
  status: string;
  selected_grade: string;
  eval_snapshot: Record<string, unknown> | null;
  notes: string;
  requested_by: number | null;
  sites: RestorationPartsRequestSiteDTO[];
  orders: RestorationPartsOrderDTO[];
  created_at: string;
  updated_at: string;
}

export interface RestorationPartsOrderCreatePayload {
  site_id?: number | null;
  po_number: string;
  supplier_name?: string;
  supplier_url?: string;
  subtotal: string | number;
  shipping?: string | number;
  tax?: string | number;
  fees?: string | number;
  ship_to_address?: string;
  expected_delivery?: string | null;
  line_ids?: number[];
  notes?: string;
  lines?: Array<{ id: number; unit_cost: string | number }>;
}

export interface RestorationJobPatchPayload {
  scale?: string;
  grade_values?: Record<string, number>;
  processing_handoff?: ProcessingHandoff | null;
}

export interface RestorationJobReturnPayload {
  disposition_type: RestorationReturnDispositionType;
  reason?: RestorationUntouchedReason | '';
  scale?: string;
  grade?: string;
  notes?: string;
  item_ids?: number[];
}

export interface RestorationJobSplitGroupPayload {
  item_ids: number[];
}

export interface RestorationJobSplitPayload {
  groups: RestorationJobSplitGroupPayload[];
}

export interface RestorationJobSplitResultDTO {
  source_job: RestorationJobDTO | null;
  created_jobs: RestorationJobDTO[];
}

export interface RestorationJobCombinePayload {
  job_ids: number[];
  replace_values?: boolean;
}

export interface RestorationGradeScaleDTO {
  id: number;
  name: string;
  grades: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface RestorationGradeScaleCreatePayload {
  name: string;
  grades: string[];
}

export interface RestorationGradeScaleSuggestParams {
  source?: string;
  brand?: string;
  category?: string;
  filter_vendor?: boolean;
  filter_brand?: boolean;
  filter_category?: boolean;
}

export interface RestorationGradeScaleSuggestDTO {
  scale: string | null;
  count: number;
  counts: Array<{ scale: string; count: number }>;
}

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

export type ProcessingTier = 'individual' | 'batch';

/**
 * Processing batch status choices
 */
export type ProcessingBatchStatus = 'pending' | 'in_progress' | 'complete';

export type MatchStatus = 'pending' | 'matched' | 'new';
export type AIMatchDecision = 'pending_review' | 'confirmed' | 'rejected' | 'uncertain' | 'new_product' | '';
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

export interface MatchCandidate {
  product_id: number;
  product_title: string;
  score: number;
  match_type: string;
}

export interface ManifestRow {
  id: number;
  purchase_order: number;
  row_number: number;
  quantity: number;
  description: string;
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
  matched_product: number | null;
  matched_product_title: string | null;
  matched_product_number: string | null;
  match_status: MatchStatus;
  match_candidates: MatchCandidate[];
  ai_match_decision: AIMatchDecision;
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
  expected_delivery: string | null;
  delivered_date: string | null;
  condition: PurchaseOrderCondition;
  description: string;
  item_count: number;
  pallet_count: number | null;
  total_cost: string | null;
  retail_value: string | null;
  has_manifest: boolean;
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

/** GET /api/inventory/orders/summary/ KPI aggregates (matches current list filters). */
export interface PurchaseOrderSummary {
  total_orders: number;
  total_cost: string;
  retail_value: string;
  items_received: number;
  delivered_count: number;
  margin_percent: number | null;
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
  /** Estimated shrink 0–1; item cost uses listing retail × (1 − est_shrink). Admin-editable. */
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

/** GET /api/inventory/orders/{id}/detail-surface/ — Order Detail page only (no manifest_preview, no processing_stats). */
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
  category: string;
  category_ref: number | null;
  category_name: string | null;
  description: string;
  specifications: Record<string, unknown>;
  default_price: string | null;
  upc: string;
  times_ordered: number;
  total_units_received: number;
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
  product: number | null;
  product_title: string | null;
  product_number: string | null;
  purchase_order: number | null;
  manifest_row: number | null;
  batch_group: number | null;
  batch_group_number: string | null;
  batch_group_status: BatchGroupStatus | null;
  processing_tier: ProcessingTier;
  title: string;
  brand: string;
  category: string;
  price: string;
  retail_value: string | null;
  cost: string | null;
  source: ItemSource;
  status: ItemStatus;
  condition: ItemCondition;
  specifications: Record<string, unknown>;
  location: string;
  listed_at: string | null;
  checked_in_at: string | null;
  checked_in_by: number | null;
  sold_at: string | null;
  sold_for: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  dispute_type?: '' | 'broken' | 'undelivered';
  dispute_pct_loss?: number | null;
  dispute_description?: string;
}

/** Item Processor workspace (`GET …/processing-workspace/`). */
export interface ProcessingWorkspaceProductDTO {
  id: number;
  product_number: string;
  title: string;
  brand: string;
  model: string;
  description: string;
  specs: Record<string, unknown>;
  tags: string;
  taxonomy: string;
  category: string;
  upc: string;
}

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
  product: number | null;
  manifest_row: number | null;
  checked_in_at: string | null;
  dispute_type: string | null;
  dispute_pct_loss: number | null;
  dispute_description: string;
}

/** Subset returned from GET processing-workspace (no nested items/products). */
export interface ProcessingWorkspaceRowDTO {
  processing_row_id: number;
  manifest_row_id: number | null;
  rowNum: number;
  productId: number | null;
  product: ProcessingWorkspaceProductDTO | null;
  title: string;
  brand: string;
  model: string;
  description: string;
  specs: Record<string, unknown>;
  tags: string;
  taxonomy: string;
  category: string;
  qty: number;
  qtyDispositioned: number;
  /** Pending unit count when list-only; detail query may hydrate items[]. */
  pendingItemCount?: number;
  hasOnShelfUnit?: boolean;
  unitRetail: string | null;
  manifestNotes: string;
  identifiers: Record<string, unknown>;
  tracking: Record<string, unknown>;
  /** Empty on list payloads; hydrated from processing-row-detail. */
  items: ProcessingWorkspaceItemDTO[];
  status: string;
  likelyDuplicateOf: number[];
  condition: string;
  price: string | null;
  dispatch: string;
  sku: string | null;
  /** Lowercased denormalized substring search blob from backend; source of truth over client-side blobs. */
  searchString: string;
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
}

/** PATCH payload returned by processor mutations (`workspace_patch`). */
export interface ProcessingWorkspacePatchDTO {
  progress: ProcessingWorkspaceDTO['progress'];
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
  parent: number | null;
  parent_name: string | null;
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
  s3_file: S3FileBrief;
  created_at: string;
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
  created_by: number | null;
  created_at: string;
  updated_at: string;
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

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
export type ItemSource = 'purchased' | 'consignment' | 'house';

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
export type ItemScanSource = 'public_lookup' | 'pos_terminal';

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
  ai_suggested_title: string;
  ai_suggested_brand: string;
  ai_suggested_model: string;
  notes: string;
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
  condition: PurchaseOrderCondition;
  description: string;
  item_count: number;
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
    signature: string;
    template_id: number | null;
    template_name: string | null;
    template_mappings?: ColumnMapping[] | null;
    row_count: number;
    rows: { row_number: number; raw: Record<string, string> }[];
  } | null;
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
  created_by: number | null;
  created_by_name: string | null;
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

export interface ItemScanHistory {
  id: number;
  item: number;
  scanned_at: string;
  ip_address: string | null;
  source: ItemScanSource;
}

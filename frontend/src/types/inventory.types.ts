/**
 * Vendor type choices
 */
export type VendorType = 'liquidation' | 'retail' | 'direct' | 'other';

/**
 * Purchase order status choices
 */
export type PurchaseOrderStatus =
  | 'ordered'
  | 'in_transit'
  | 'delivered'
  | 'processing'
  | 'complete'
  | 'cancelled';

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
  | 'scrapped';

/**
 * Processing batch status choices
 */
export type ProcessingBatchStatus = 'pending' | 'in_progress' | 'complete';

/**
 * Item scan source choices
 */
export type ItemScanSource = 'public_lookup' | 'pos_terminal';

export interface ColumnMapping {
  source: string;
  target: string;
  transform?: string;
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
  description: string;
  brand: string;
  model: string;
  category: string;
  retail_value: string | null;
  upc: string;
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
  expected_delivery: string | null;
  delivered_date: string | null;
  total_cost: string | null;
  item_count: number;
  notes: string;
  manifest: number | null;
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
  title: string;
  brand: string;
  model: string;
  category: string;
  description: string;
  default_price: string | null;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: number;
  sku: string;
  product: number | null;
  product_title: string | null;
  purchase_order: number | null;
  title: string;
  brand: string;
  category: string;
  price: string;
  cost: string | null;
  source: ItemSource;
  status: ItemStatus;
  location: string;
  listed_at: string | null;
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

export interface ItemScanHistory {
  id: number;
  item: number;
  scanned_at: string;
  ip_address: string | null;
  source: ItemScanSource;
}

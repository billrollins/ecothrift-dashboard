import type { PaginatedResponse } from '../types/index';
import type {
  Vendor,
  PurchaseOrder,
  Product,
  Item,
  CSVTemplate,
  Category,
  VendorProductRef,
  BatchGroup,
  ItemHistory,
} from '../types/inventory.types';
import api, { apiPublic } from './client';

export type {
  Vendor,
  PurchaseOrder,
  Product,
  Item,
  CSVTemplate,
  Category,
  VendorProductRef,
  BatchGroup,
  ItemHistory,
};

type Order = PurchaseOrder;
type Template = CSVTemplate;
type Batch = BatchGroup;

export interface MatchProductsPayload {
  use_ai?: boolean;
  model?: string;
}

export interface MatchProductsResponse {
  total_rows: number;
  matched: number;
  pending_review: number;
  confirmed: number;
  uncertain: number;
  new_products: number;
}

export interface MatchResultsSummary {
  total: number;
  matched: number;
  pending_review: number;
  confirmed: number;
  uncertain: number;
  new_product: number;
}

export interface MatchResultsResponse {
  rows: import('../types/inventory.types').ManifestRow[];
  summary: MatchResultsSummary;
}

export interface ReviewMatchDecision {
  row_id: number;
  decision: 'accept' | 'reject' | 'modify';
  product_id?: number;
  update_product?: boolean;
  modifications?: { title?: string; brand?: string; model?: string; category?: string };
}

export interface ReviewMatchesPayload {
  decisions: ReviewMatchDecision[];
}

export interface ReviewMatchesResponse {
  accepted: number;
  rejected: number;
  new_products: number;
}

export interface CreateItemsResponse {
  batch_id: number;
  items_created: number;
  batch_groups_created: number;
}

export interface ManifestColumnTransform {
  type: 'none' | 'trim' | 'title_case' | 'upper' | 'lower' | 'remove_special_chars' | 'replace';
  from?: string;
  to?: string;
}

export interface ManifestColumnMapping {
  target: string;
  source: string;
  transforms?: ManifestColumnTransform[];
}

export interface StandardManifestFunction {
  id?: string;
  type?: string;
  from?: string;
  to?: string;
}

export interface StandardManifestMapping {
  standard_column: string;
  source_header: string;
  functions?: StandardManifestFunction[];
}

export interface FormulaMapping {
  target: string;
  formula: string;
}

export interface StandardColumnDefinition {
  key: string;
  label: string;
  required: boolean;
}

export interface ManifestFunctionDefinition {
  id: string;
  label: string;
}

export interface ProcessManifestPayload {
  rows?: Record<string, unknown>[];
  selected_row_numbers?: number[];
  column_mappings?: (ManifestColumnMapping | FormulaMapping)[];
  standard_mappings?: StandardManifestMapping[];
  template_id?: number | null;
  save_template?: boolean;
  template_name?: string;
}

export interface ProcessManifestResponse {
  rows_created: number;
  order_status: string;
  row_count_in_file?: number;
  rows_selected?: number;
  header_signature?: string;
  template_id?: number;
  template_name?: string;
  standard_columns?: StandardColumnDefinition[];
  mappings_used?: ManifestColumnMapping[];
}

export interface PreviewStandardizePayload {
  rows?: Record<string, unknown>[];
  selected_row_numbers?: number[];
  template_id?: number | null;
  standard_mappings?: StandardManifestMapping[];
  column_mappings?: (ManifestColumnMapping | FormulaMapping)[];
  preview_limit?: number;
  search_term?: string;
}

export interface PreviewStandardizeResponse {
  row_count_in_file: number;
  rows_selected: number;
  preview_count: number;
  normalized_preview: Record<string, unknown>[];
  standard_columns: StandardColumnDefinition[];
  available_functions: ManifestFunctionDefinition[];
  mappings_used: ManifestColumnMapping[];
  search_term?: string;
  header_signature?: string;
  template_id?: number;
  template_name?: string;
}

export interface ManifestRawRow {
  row_number: number;
  raw: Record<string, string>;
}

export interface ManifestRowsResponse {
  headers: string[];
  signature: string;
  row_count: number;
  row_count_filtered?: number;
  search_term?: string;
  rows: ManifestRawRow[];
  template_id?: number | null;
  template_name?: string | null;
  template_mappings?: ManifestColumnMapping[];
  standard_columns?: StandardColumnDefinition[];
  available_functions?: ManifestFunctionDefinition[];
}

export interface ManifestPricingRowUpdate {
  id: number;
  proposed_price?: number | string | null;
  final_price?: number | string | null;
  pricing_stage?: 'unpriced' | 'draft' | 'final';
  pricing_notes?: string;
}

export interface UpdateManifestPricingPayload {
  rows?: ManifestPricingRowUpdate[];
  row_ids?: number[];
  proposed_price?: number | string | null;
  final_price?: number | string | null;
  pricing_stage?: 'unpriced' | 'draft' | 'final';
  pricing_notes?: string;
}

export interface UpdateManifestPricingResponse {
  rows_updated: number;
  order_id: number;
}

export interface DetachBatchItemResponse {
  detached_item_id: number;
  detached_item_sku: string;
  remaining_in_batch: number;
}

export interface CheckInItemPayload {
  title?: string;
  brand?: string;
  category?: string;
  condition?: string;
  location?: string;
  price?: number | string;
  cost?: number | string;
  notes?: string;
  specifications?: Record<string, unknown>;
}

export interface CheckInOrderItemsPayload extends CheckInItemPayload {
  item_ids?: number[];
  processing_tier?: 'individual' | 'batch';
  batch_group_id?: number;
  statuses?: string[];
}

export interface CheckInOrderItemsResponse {
  checked_in: number;
  order_status: string;
}

export interface OrderDeletePreviewItem {
  id: number;
  sku: string;
  title: string;
  status: string;
  processing_tier: 'individual' | 'batch';
  batch_number?: string;
}

export interface OrderDeletePreviewStep {
  key: string;
  label: string;
  description: string;
  count: number;
}

export interface OrderDeletePreviewResponse {
  order_id: number;
  order_number: string;
  steps: OrderDeletePreviewStep[];
  items: OrderDeletePreviewItem[];
  warnings: string[];
}

export interface PurgeDeleteOrderPayload {
  confirm_order_number: string;
}

export interface PurgeDeleteOrderResponse {
  order_id: number;
  order_number: string;
  deleted: Record<string, number>;
  steps: OrderDeletePreviewStep[];
  manifest_file_shared: boolean;
}

// Vendors CRUD
export function getVendors(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Vendor> }> {
  return api.get<PaginatedResponse<Vendor>>('/inventory/vendors/', { params });
}

export function getVendor(id: number): Promise<{ data: Vendor }> {
  return api.get<Vendor>(`/inventory/vendors/${id}/`);
}

export function createVendor(data: Record<string, unknown>): Promise<{ data: Vendor }> {
  return api.post<Vendor>('/inventory/vendors/', data);
}

export function updateVendor(id: number, data: Record<string, unknown>): Promise<{ data: Vendor }> {
  return api.patch<Vendor>(`/inventory/vendors/${id}/`, data);
}

export function deleteVendor(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/vendors/${id}/`);
}

// Orders CRUD
export function getOrders(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Order> }> {
  return api.get<PaginatedResponse<Order>>('/inventory/orders/', { params });
}

export function getOrder(id: number): Promise<{ data: Order }> {
  return api.get<Order>(`/inventory/orders/${id}/`);
}

export function createOrder(data: Record<string, unknown>): Promise<{ data: Order }> {
  return api.post<Order>('/inventory/orders/', data);
}

export function updateOrder(id: number, data: Record<string, unknown>): Promise<{ data: Order }> {
  return api.patch<Order>(`/inventory/orders/${id}/`, data);
}

export function deleteOrder(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/orders/${id}/`);
}

export function getOrderDeletePreview(orderId: number): Promise<{ data: OrderDeletePreviewResponse }> {
  return api.get<OrderDeletePreviewResponse>(`/inventory/orders/${orderId}/delete-preview/`);
}

export function purgeDeleteOrder(
  orderId: number,
  data: PurgeDeleteOrderPayload,
): Promise<{ data: PurgeDeleteOrderResponse }> {
  return api.post<PurgeDeleteOrderResponse>(`/inventory/orders/${orderId}/purge-delete/`, data);
}

export function markOrderPaid(id: number, date?: string): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/mark-paid/`, date ? { paid_date: date } : undefined);
}

export function revertOrderPaid(id: number): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/revert-paid/`);
}

export function markOrderShipped(
  id: number,
  data: { shipped_date?: string; expected_delivery?: string },
): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/mark-shipped/`, data);
}

export function revertOrderShipped(id: number): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/revert-shipped/`);
}

export function deliverOrder(id: number, date?: string): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/deliver/`, date ? { delivered_date: date } : undefined);
}

export function revertOrderDelivered(id: number): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/revert-delivered/`);
}

export function uploadManifest(orderId: number, file: File): Promise<{ data: unknown }> {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/inventory/orders/${orderId}/upload-manifest/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function processManifest(
  orderId: number,
  data: ProcessManifestPayload
): Promise<{ data: ProcessManifestResponse }> {
  return api.post<ProcessManifestResponse>(`/inventory/orders/${orderId}/process-manifest/`, data);
}

export function previewStandardize(
  orderId: number,
  data: PreviewStandardizePayload,
): Promise<{ data: PreviewStandardizeResponse }> {
  return api.post<PreviewStandardizeResponse>(`/inventory/orders/${orderId}/preview-standardize/`, data);
}

export function getManifestRows(
  orderId: number,
  params?: Record<string, unknown>,
): Promise<{ data: ManifestRowsResponse }> {
  return api.get<ManifestRowsResponse>(`/inventory/orders/${orderId}/manifest-rows/`, { params });
}

export function updateManifestPricing(
  orderId: number,
  data: UpdateManifestPricingPayload,
): Promise<{ data: UpdateManifestPricingResponse }> {
  return api.post<UpdateManifestPricingResponse>(`/inventory/orders/${orderId}/update-manifest-pricing/`, data);
}

export interface SuggestFormulasPayload {
  model?: string;
  template_id?: number;
}

export interface FormulaSuggestion {
  target: string;
  formula: string;
  reasoning: string;
}

export interface SuggestFormulasResponse {
  suggestions: FormulaSuggestion[];
  model_used: string;
}

export function suggestFormulas(
  orderId: number,
  data?: SuggestFormulasPayload,
): Promise<{ data: SuggestFormulasResponse }> {
  return api.post<SuggestFormulasResponse>(`/inventory/orders/${orderId}/suggest-formulas/`, data ?? {});
}

export interface AICleanupRowsPayload {
  model?: string;
  batch_size?: number;
  offset?: number;
}

export interface AICleanupSuggestion {
  row_id: number;
  title: string;
  brand: string;
  model: string;
  search_tags: string;
  specifications: Record<string, unknown>;
  reasoning: string;
}

export interface AICleanupTiming {
  db_fetch_ms: number;
  prompt_build_ms: number;
  api_call_ms: number;
  response_parse_ms: number;
  db_save_ms: number;
  total_ms: number;
  retries: number;
}

export interface AICleanupRowsResponse {
  rows_processed: number;
  rows_saved?: number;
  total_rows: number;
  offset: number;
  suggestions: AICleanupSuggestion[];
  model_used: string;
  has_more: boolean;
  timing?: AICleanupTiming;
  stop_reason?: string;
}

export interface AICleanupStatusResponse {
  total_rows: number;
  cleaned_rows: number;
  remaining_rows: number;
}

export interface CancelAICleanupResponse {
  rows_cleared: number;
}

export function aiCleanupRows(
  orderId: number,
  data?: AICleanupRowsPayload,
): Promise<{ data: AICleanupRowsResponse }> {
  return api.post<AICleanupRowsResponse>(`/inventory/orders/${orderId}/ai-cleanup-rows/`, data ?? {});
}

export function getAICleanupStatus(orderId: number): Promise<{ data: AICleanupStatusResponse }> {
  return api.get<AICleanupStatusResponse>(`/inventory/orders/${orderId}/ai-cleanup-status/`);
}

export function cancelAICleanup(orderId: number): Promise<{ data: CancelAICleanupResponse }> {
  return api.post<CancelAICleanupResponse>(`/inventory/orders/${orderId}/cancel-ai-cleanup/`);
}

export interface ClearManifestRowsResponse {
  rows_deleted: number;
}

export function clearManifestRows(orderId: number): Promise<{ data: ClearManifestRowsResponse }> {
  return api.post<ClearManifestRowsResponse>(`/inventory/orders/${orderId}/clear-manifest-rows/`);
}

export interface UndoProductMatchingResponse {
  rows_cleared: number;
}

export function undoProductMatching(orderId: number): Promise<{ data: UndoProductMatchingResponse }> {
  return api.post<UndoProductMatchingResponse>(`/inventory/orders/${orderId}/undo-product-matching/`);
}

export interface ClearPricingResponse {
  rows_cleared: number;
}

export function clearPricing(orderId: number): Promise<{ data: ClearPricingResponse }> {
  return api.post<ClearPricingResponse>(`/inventory/orders/${orderId}/clear-pricing/`);
}

export interface SuggestFinalizationPayload {
  model?: string;
}

export interface FinalizationSuggestion {
  row_id: number;
  title: string;
  brand: string;
  model: string;
  search_tags: string;
  specifications: Record<string, unknown>;
  batch_flag: boolean;
  reasoning: string;
}

export interface SuggestFinalizationResponse {
  suggestions: FinalizationSuggestion[];
  model_used: string;
}

export interface FinalizeRowData {
  id: number;
  title?: string;
  brand?: string;
  model?: string;
  category?: string;
  condition?: string;
  search_tags?: string;
  specifications?: Record<string, unknown>;
  batch_flag?: boolean;
  final_price?: number | string | null;
  proposed_price?: number | string | null;
  notes?: string;
}

export interface FinalizeRowsPayload {
  rows: FinalizeRowData[];
}

export interface FinalizeRowsResponse {
  rows_updated: number;
  order_id: number;
}

export function suggestFinalization(
  orderId: number,
  data?: SuggestFinalizationPayload,
): Promise<{ data: SuggestFinalizationResponse }> {
  return api.post<SuggestFinalizationResponse>(`/inventory/orders/${orderId}/suggest-finalization/`, data ?? {});
}

export function finalizeRows(
  orderId: number,
  data: FinalizeRowsPayload,
): Promise<{ data: FinalizeRowsResponse }> {
  return api.post<FinalizeRowsResponse>(`/inventory/orders/${orderId}/finalize-rows/`, data);
}

export function createItems(orderId: number): Promise<{ data: CreateItemsResponse }> {
  return api.post<CreateItemsResponse>(`/inventory/orders/${orderId}/create-items/`);
}

export function matchProducts(
  orderId: number,
  data?: MatchProductsPayload,
): Promise<{ data: MatchProductsResponse }> {
  return api.post<MatchProductsResponse>(`/inventory/orders/${orderId}/match-products/`, data ?? {});
}

export function getMatchResults(orderId: number): Promise<{ data: MatchResultsResponse }> {
  return api.get<MatchResultsResponse>(`/inventory/orders/${orderId}/match-results/`);
}

export function reviewMatches(
  orderId: number,
  data: ReviewMatchesPayload,
): Promise<{ data: ReviewMatchesResponse }> {
  return api.post<ReviewMatchesResponse>(`/inventory/orders/${orderId}/review-matches/`, data);
}

export function markOrderComplete(orderId: number): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${orderId}/mark-complete/`);
}

export function checkInOrderItems(
  orderId: number,
  data: CheckInOrderItemsPayload,
): Promise<{ data: CheckInOrderItemsResponse }> {
  return api.post<CheckInOrderItemsResponse>(`/inventory/orders/${orderId}/check-in-items/`, data);
}

// Templates CRUD
export function getTemplates(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Template> }> {
  return api.get<PaginatedResponse<Template>>('/inventory/templates/', { params });
}

export function getTemplate(id: number): Promise<{ data: Template }> {
  return api.get<Template>(`/inventory/templates/${id}/`);
}

export function createTemplate(data: Record<string, unknown>): Promise<{ data: Template }> {
  return api.post<Template>('/inventory/templates/', data);
}

export function updateTemplate(id: number, data: Record<string, unknown>): Promise<{ data: Template }> {
  return api.patch<Template>(`/inventory/templates/${id}/`, data);
}

export function deleteTemplate(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/templates/${id}/`);
}

// Categories CRUD
export function getCategories(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Category> }> {
  return api.get<PaginatedResponse<Category>>('/inventory/categories/', { params });
}

export function getCategory(id: number): Promise<{ data: Category }> {
  return api.get<Category>(`/inventory/categories/${id}/`);
}

export function createCategory(data: Record<string, unknown>): Promise<{ data: Category }> {
  return api.post<Category>('/inventory/categories/', data);
}

export function updateCategory(id: number, data: Record<string, unknown>): Promise<{ data: Category }> {
  return api.patch<Category>(`/inventory/categories/${id}/`, data);
}

export function deleteCategory(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/categories/${id}/`);
}

// Products CRUD
export function getProducts(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Product> }> {
  return api.get<PaginatedResponse<Product>>('/inventory/products/', { params });
}

export function getProduct(id: number): Promise<{ data: Product }> {
  return api.get<Product>(`/inventory/products/${id}/`);
}

export function createProduct(data: Record<string, unknown>): Promise<{ data: Product }> {
  return api.post<Product>('/inventory/products/', data);
}

export function updateProduct(id: number, data: Record<string, unknown>): Promise<{ data: Product }> {
  return api.patch<Product>(`/inventory/products/${id}/`, data);
}

export function deleteProduct(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/products/${id}/`);
}

// Vendor product refs
export function getVendorProductRefs(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<VendorProductRef> }> {
  return api.get<PaginatedResponse<VendorProductRef>>('/inventory/product-refs/', { params });
}

// Items CRUD
export function getItems(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Item> }> {
  return api.get<PaginatedResponse<Item>>('/inventory/items/', { params });
}

export function getItem(id: number): Promise<{ data: Item }> {
  return api.get<Item>(`/inventory/items/${id}/`);
}

export function createItem(data: Record<string, unknown>): Promise<{ data: Item }> {
  return api.post<Item>('/inventory/items/', data);
}

export function updateItem(id: number, data: Record<string, unknown>): Promise<{ data: Item }> {
  return api.patch<Item>(`/inventory/items/${id}/`, data);
}

export function deleteItem(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/items/${id}/`);
}

export function markItemReady(id: number): Promise<{ data: Item }> {
  return api.post<Item>(`/inventory/items/${id}/ready/`);
}

export function checkInItem(id: number, data: CheckInItemPayload): Promise<{ data: Item & { checked_in: boolean } }> {
  return api.post<Item & { checked_in: boolean }>(`/inventory/items/${id}/check-in/`, data);
}

// Batch groups
export function getBatchGroups(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Batch> }> {
  return api.get<PaginatedResponse<Batch>>('/inventory/batch-groups/', { params });
}

export function getBatchGroup(id: number): Promise<{ data: Batch }> {
  return api.get<Batch>(`/inventory/batch-groups/${id}/`);
}

export function updateBatchGroup(
  id: number,
  data: { unit_price?: number | string; unit_cost?: number | string; condition?: string; location?: string; notes?: string },
): Promise<{ data: Batch }> {
  return api.patch<Batch>(`/inventory/batch-groups/${id}/`, data);
}

export function processBatchGroup(
  id: number,
  data: { unit_price?: number | string; unit_cost?: number | string; condition?: string; location?: string },
): Promise<{ data: Batch & { updated_items: number } }> {
  return api.post<Batch & { updated_items: number }>(`/inventory/batch-groups/${id}/process/`, data);
}

export function checkInBatchGroup(
  id: number,
  data: { unit_price?: number | string; unit_cost?: number | string; condition?: string; location?: string },
): Promise<{ data: Batch & { checked_in: number } }> {
  return api.post<Batch & { checked_in: number }>(`/inventory/batch-groups/${id}/check-in/`, data);
}

export function detachBatchItem(
  id: number,
  data?: { item_id?: number },
): Promise<{ data: DetachBatchItemResponse }> {
  return api.post<DetachBatchItemResponse>(`/inventory/batch-groups/${id}/detach/`, data ?? {});
}

// Item history
export function getItemHistory(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<ItemHistory> }> {
  return api.get<PaginatedResponse<ItemHistory>>('/inventory/item-history/', { params });
}

/** Item lookup by SKU - no auth required */
export function itemLookup(sku: string) {
  return apiPublic.get<Item>(`/inventory/items/lookup/${encodeURIComponent(sku)}/`);
}

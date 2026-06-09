import type { PaginatedResponse } from '../types/index';
import type {
  Vendor,
  PurchaseOrder,
  PurchaseOrderDetailSurface,
  PurchaseOrderListRow,
  PurchaseOrderSummary,
  PreprocessingQueueOrder,
  PreprocessingQueueResponse,
  OrderForReceivingRow,
  Product,
  Item,
  ItemStatsResponse,
  CSVTemplate,
  Category,
  VendorProductRef,
  BatchGroup,
  ItemHistory,
  ReceivingDetailDTO,
  ReceivingPatchPayload,
  ReceivingCompleteResponse,
  ProcessingWorkspaceDTO,
  ProcessingWorkspacePatchDTO,
} from '../types/inventory.types';
import api from './client';

export type {
  Vendor,
  PurchaseOrder,
  PurchaseOrderDetailSurface,
  PurchaseOrderListRow,
  PurchaseOrderSummary,
  PreprocessingQueueOrder,
  OrderForReceivingRow,
  Product,
  Item,
  CSVTemplate,
  Category,
  VendorProductRef,
  BatchGroup,
  ItemHistory,
  ReceivingDetailDTO,
};

type Order = PurchaseOrder;
type OrderListRow = PurchaseOrderListRow;
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
  items_updated?: number;
  item_count?: number;
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
  ai_locked?: boolean;
}

export interface ManifestFieldBucketMetadata {
  label: string;
  suggested_keys: string[];
  open: boolean;
}

export interface ManifestFieldMetadataResponse {
  flat: Array<{
    key: string;
    label: string;
    required: boolean;
    ai_locked: boolean;
  }>;
  buckets: Record<string, ManifestFieldBucketMetadata>;
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
  /** When true, always create a new CSVTemplate row (do not update resolved template). */
  save_template_as_new?: boolean;
}

export interface ProcessManifestResponse {
  rows_created: number;
  order_status: string;
  products_created?: number;
  items_created?: number;
  items_updated?: number;
  item_count?: number;
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

export interface ManifestMatchingTemplate {
  id: number;
  name: string;
  created_at: string | null;
  is_default: boolean;
  use_count: number;
  last_used_at: string | null;
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
  retail_value?: number | string;
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

/** Static formula-builder field taxonomy (backend source of truth). */
export function getManifestFieldMetadata(): Promise<{ data: ManifestFieldMetadataResponse }> {
  return api.get<ManifestFieldMetadataResponse>('/inventory/manifest-fields/');
}

// Orders CRUD
export function getOrders(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<OrderListRow> }> {
  return api.get<PaginatedResponse<OrderListRow>>('/inventory/orders/', { params });
}

export function getOrderSummary(
  params?: Record<string, unknown>,
): Promise<{ data: PurchaseOrderSummary }> {
  return api.get<PurchaseOrderSummary>('/inventory/orders/summary/', { params });
}

export function getPreprocessingQueue(
  params?: Record<string, unknown>,
): Promise<{ data: PreprocessingQueueResponse }> {
  return api.get<PreprocessingQueueResponse>('/inventory/orders/preprocessing-queue/', { params });
}

export function getOrder(id: number): Promise<{ data: Order }> {
  return api.get<Order>(`/inventory/orders/${id}/`);
}

export function getOrderDetailSurface(id: number): Promise<{ data: PurchaseOrderDetailSurface }> {
  return api.get<PurchaseOrderDetailSurface>(`/inventory/orders/${id}/detail-surface/`);
}

export function getOrderProcessingStats(
  id: number,
): Promise<{ data: NonNullable<PurchaseOrder['processing_stats']> }> {
  return api.get<NonNullable<PurchaseOrder['processing_stats']>>(
    `/inventory/orders/${id}/processing-stats/`,
  );
}

export function createOrder(data: Record<string, unknown>): Promise<{ data: Order }> {
  return api.post<Order>('/inventory/orders/', data);
}

export function updateOrder(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: PurchaseOrderDetailSurface }> {
  return api.patch<PurchaseOrderDetailSurface>(`/inventory/orders/${id}/`, data);
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

export function uploadManifest(orderId: number, file: File): Promise<{ data: PurchaseOrderDetailSurface }> {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<PurchaseOrderDetailSurface>(`/inventory/orders/${orderId}/upload-manifest/`, formData, {
    // Let the browser set multipart boundary (same pattern as Buying `postBuyingUploadManifest`).
    transformRequest: [
      (body, headers) => {
        if (body instanceof FormData) {
          delete headers['Content-Type'];
        }
        return body;
      },
    ],
  });
}

export function removeManifest(orderId: number): Promise<{ data: PurchaseOrderDetailSurface }> {
  return api.post<PurchaseOrderDetailSurface>(`/inventory/orders/${orderId}/remove-manifest/`, {});
}

export type IntakeUndoStage = 'manifest_upload' | 'standardize' | 'ai_cleanup' | 'finalize';

export interface IntakeUndoPreview {
  target_stage: string;
  fields_to_null: string[];
  status_resets: Record<string, string>;
  rows_to_delete: Record<string, number>;
  rows_to_update: Record<string, number>;
  files_to_delete: string[];
  cascade_warnings: string[];
  safe: boolean;
  blocked_reason: string | null;
}

export function getUndoPreview(
  orderId: number,
  toStage: IntakeUndoStage,
): Promise<{ data: IntakeUndoPreview }> {
  return api.get<IntakeUndoPreview>(`/inventory/orders/${orderId}/undo-preview/`, {
    params: { to_stage: toStage },
  });
}

export function postIntakeUndo(
  orderId: number,
  body: { to_stage: IntakeUndoStage },
): Promise<{ data: PurchaseOrderDetailSurface }> {
  return api.post<PurchaseOrderDetailSurface>(`/inventory/orders/${orderId}/undo/`, body);
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

export interface PreviewManifestFormulasPayload {
  raw_row: Record<string, unknown>;
  formulas: Record<string, string>;
}

export interface PreviewManifestFormulasResponse {
  results: Record<string, string>;
  errors: Record<string, string>;
}

export function previewManifestFormulas(
  orderId: number,
  data: PreviewManifestFormulasPayload,
): Promise<{ data: PreviewManifestFormulasResponse }> {
  return api.post<PreviewManifestFormulasResponse>(
    `/inventory/orders/${orderId}/preview-manifest-formulas/`,
    data,
  );
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
  debug_payload?: boolean;
  mode?: 'fast' | 'rich';
}

export interface AICleanupSuggestion {
  row_id: number;
  row_number?: number;
  item_id?: number | null;
  title: string;
  brand: string;
  model: string;
  category?: string;
  condition?: string;
  price?: string;
  search_tags: string;
  specifications: Record<string, unknown>;
  notes?: string;
  reasoning: string;
  low_confidence?: boolean;
  low_confidence_reason?: string;
}

export interface AICleanupSubmittedRow {
  row_id: number;
  row_number: number;
  item_id: number | null;
  sku: string;
  description: string;
  title: string;
  brand: string;
  model: string;
  category: string;
  condition: string;
  upc: string;
  retail_value: string;
  base_cost: string;
  ideal_price: string;
}

export interface AICleanupDiscardedRow {
  row_id: number;
  row_number: number;
  item_id: number | null;
  reason: 'missing' | 'row_number_mismatch' | 'item_id_mismatch' | 'parse_failed' | string;
  detail?: string;
  received_row_number?: number | string;
  received_item_id?: number | string | null;
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
  batch_size?: number;
  row_start?: number | null;
  row_end?: number | null;
  submitted_row_ids?: number[];
  submitted_row_numbers?: number[];
  submitted_rows?: AICleanupSubmittedRow[];
  suggestions: AICleanupSuggestion[];
  model_used: string;
  has_more: boolean;
  timing?: AICleanupTiming;
  stop_reason?: string;
  mode?: 'fast' | 'rich' | string;
  /** True when cancel ran during the API call; this batch was not saved. */
  cancelled?: boolean;
  rows_discarded?: number;
  rows_low_confidence?: number;
  received_response?: boolean;
  response_text_length?: number;
  parsed_count?: number;
  validated_row_ids?: number[];
  discarded_rows?: AICleanupDiscardedRow[];
  item_count?: number;
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
  items_deleted?: number;
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

export interface CleanupModelOption {
  id: string;
  name: string;
}

export interface CleanupModelsResponse {
  models: CleanupModelOption[];
  default: string;
}

export interface VerifyCleanupModelResponse {
  ok: boolean;
  model?: string;
  detail?: string;
}

export interface UploadCleanupCsvRejectedRow {
  line?: number;
  row_id?: number;
  row_number?: number;
  item_id?: number;
  row_ids?: number[];
  reason: string;
  detail?: string;
  rule?: string;
  column?: string;
}

export interface CleanupCsvSoftWarning {
  line?: number;
  row_id?: number;
  rule?: string;
  column?: string;
  reason?: string;
  detail?: string;
}

export interface UploadCleanupCsvResponse {
  rows_seen: number;
  rows_updated: number;
  rows_rejected: number;
  rejected_rows: UploadCleanupCsvRejectedRow[];
  items_updated: number;
  products_updated: number;
  soft_warnings?: CleanupCsvSoftWarning[];
}

export interface ManualReviewSummary {
  total_paid: string;
  total_ideal_price: string;
  total_set_prices: string;
  ideal_delta_pct: number | null;
  total_rows: number;
  total_units: number;
  missing_price: number;
  low_confidence: number;
}

export interface PreprocessingSessionInfo {
  finalized_at: string | null;
  row_count: number;
}

/** Snippet-only manifest data for preprocessing UI (headers + delimiter + sample rows). */
export interface ManifestSamplePayload {
  headers: string[];
  delimiter?: string;
  rows: { row_number: number; raw: Record<string, string> }[];
}

export interface PreprocessingStatusResponse {
  order: {
    id: number;
    order_number: string;
    vendor_name: string;
    status: string;
    item_count: number;
    has_manifest_file: boolean;
    manifest_sample: ManifestSamplePayload | null;
    manifest_row_count: number | null;
    manifest_signature: string;
    manifest_category_count?: number | null;
    template_id: number | null;
    template_name_cache: string;
    template_header_signature_cache: string;
    template_column_mappings_cache: ManifestColumnMapping[];
    standardization_formulas: Record<string, unknown>;
    preprocess_status: string;
    standardized_at: string | null;
    ai_cleaned_at: string | null;
    review_saved_at: string | null;
    finalized_at: string | null;
  };
  matching_templates: ManifestMatchingTemplate[];
  standard_columns: StandardColumnDefinition[];
  counts: {
    standardized_rows: number;
    cleaned_rows: number;
    final_rows: number;
    missing_price: number;
    total_units: number;
  };
  summary: Pick<ManualReviewSummary, 'total_paid' | 'total_ideal_price' | 'total_set_prices' | 'ideal_delta_pct'>;
  completed_step: number;
  preprocessing?: PreprocessingSessionInfo | null;
}

export interface ManualReviewParams {
  page?: number;
  page_size?: number;
  search?: string;
  missing_price?: boolean;
}

export type PreprocessingReviewParams = ManualReviewParams & {
  /** When true, return all staged rows (max 10k) for client-side filter/pagination. */
  full?: boolean;
  /** `minimal` (default) omits triple-layer columns; `full` matches legacy export shape. */
  fields?: 'minimal' | 'full';
};

export interface ManualReviewResponse {
  rows: import('../types/inventory.types').ManifestRow[];
  summary: ManualReviewSummary;
  count: number;
  page: number;
  page_size: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface ManualReviewRowUpdate extends FinalizeRowData {
  pricing_notes?: string;
}

export interface ManualReviewUpdateResponse {
  rows_updated: number;
  items_updated: number;
  products_updated: number;
}

export interface PreprocessingReviewRow {
  id: number;
  row_number: number;
  quantity: number;
  unit_retail: string | null;
  /** Effective (coalesced) display fields */
  description: string;
  title: string;
  brand: string;
  model: string;
  identifiers: Record<string, unknown>;
  taxonomy: Record<string, unknown>;
  specifications: Record<string, unknown>;
  tracking: Record<string, unknown>;
  search_tags: string[];
  category: string;
  condition: import('../types/inventory.types').ItemCondition | '';
  proposed_price: string | null;
  final_price: string | null;
  pricing_stage: import('../types/inventory.types').ManifestPricingStage;
  pricing_notes: string;
  ai_reasoning: string;
  /** From Grok cleaned CSV: validation / recovery state for Final Review */
  ai_status?: {
    state?: 'clean' | 'soft_flagged' | 'hard_flagged' | 'recovered';
    issues?: unknown[];
  };
  batch_flag: boolean;
  notes: string;
  final_layer_visible: boolean;
  standard_description?: string;
  ai_description?: string;
  final_description?: string | null;
  ai_title?: string;
  final_title?: string | null;
  ai_category?: string;
  final_category?: string | null;
  standard_brand?: string;
  ai_brand?: string;
  final_brand?: string | null;
  standard_model?: string;
  ai_model?: string;
  final_model?: string | null;
  standard_condition?: string;
  ai_condition?: string;
  final_condition?: string | null;
  standard_notes?: string;
  ai_notes?: string;
  final_notes?: string | null;
  standard_identifiers?: Record<string, unknown>;
  ai_identifiers?: Record<string, unknown>;
  final_identifiers?: Record<string, unknown> | null;
  standard_taxonomy?: Record<string, unknown>;
  ai_taxonomy?: Record<string, unknown>;
  final_taxonomy?: Record<string, unknown> | null;
  standard_specifications?: Record<string, unknown>;
  ai_specifications?: Record<string, unknown>;
  final_specifications?: Record<string, unknown> | null;
  standard_tracking?: Record<string, unknown>;
  ai_tracking?: Record<string, unknown>;
  final_tracking?: Record<string, unknown> | null;
  standard_search_tags?: string[];
  ai_search_tags?: string[];
  final_search_tags?: string[] | null;
  base_cost: string | null;
  ideal_price: string | null;
  set_price: string | null;
  ideal_delta_pct: number | null;
}

export type PreprocessingReviewSummary = ManualReviewSummary;

export type PreprocessingReviewRowPatch = Partial<Pick<
  PreprocessingReviewRow,
  | 'title'
  | 'brand'
  | 'model'
  | 'category'
  | 'condition'
  | 'description'
  | 'final_price'
  | 'proposed_price'
  | 'pricing_notes'
  | 'notes'
  | 'batch_flag'
  | 'search_tags'
  | 'specifications'
>>;

export interface PreprocessingReviewRowUpdate extends PreprocessingReviewRowPatch {
  id: number;
  patch?: PreprocessingReviewRowPatch;
}

export interface PreprocessingReviewResponse {
  rows: PreprocessingReviewRow[];
  summary: PreprocessingReviewSummary;
  count: number;
  page?: number;
  page_size?: number;
  has_next?: boolean;
  has_previous?: boolean;
  full?: boolean;
  fields?: 'minimal' | 'full';
}

export interface PreprocessingReviewUpdateResponse {
  rows_updated: number;
  changed_row_ids: number[];
  items_updated: 0;
  products_updated: 0;
  summary: PreprocessingReviewSummary;
}

export interface PreprocessingReviewResetFinalPayload {
  row_ids: number[];
}

export interface PreprocessingReviewResetFinalResponse {
  rows_reset: number;
  summary: PreprocessingReviewSummary;
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

/** Finalize writes processing bookmarks; use buildProcessingData for ManifestRow/Item. */
export interface FinalizePreprocessingResponse {
  finalized_at: string | null;
  processing_row_count: number;
}

export function finalizePreprocessing(orderId: number): Promise<{ data: FinalizePreprocessingResponse }> {
  return api.post<FinalizePreprocessingResponse>(`/inventory/orders/${orderId}/finalize-preprocessing/`, {});
}

export interface BuildProcessingDataResponse {
  status?: string;
  done?: boolean;
  blocked?: boolean;
  processed_rows?: number;
  total_rows?: number;
  created_items?: number;
  total_items?: number;
  percent?: number;
  warnings?: Array<{ row_number: number; rule: string; message: string }>;
  error_count?: number;
  last_error?: string;
  generation?: number;
  chunk_size?: number;
  manifest_rows: number;
  processing_row_bookmarks: number;
  batch_groups_created: number;
  processing_batch_id: number | null;
  rows?: number;
  rows_linked?: number;
  products_created?: number;
  items_created?: number;
  items_updated?: number;
  items_deleted?: number;
  item_count?: number;
}

export function buildProcessingData(
  orderId: number,
  body: { reset?: boolean } = {},
): Promise<{ data: BuildProcessingDataResponse }> {
  return api.post<BuildProcessingDataResponse>(`/inventory/orders/${orderId}/build-processing-data/`, body);
}

export function getProcessingDataBuild(orderId: number): Promise<{ data: BuildProcessingDataResponse }> {
  return api.get<BuildProcessingDataResponse>(`/inventory/orders/${orderId}/processing-data-build/`);
}

export function runProcessingDataBuildChunk(orderId: number): Promise<{ data: BuildProcessingDataResponse }> {
  return api.post<BuildProcessingDataResponse>(
    `/inventory/orders/${orderId}/processing-data-build/chunk/`,
    {},
  );
}

export type ClearProcessingDataResponse = BuildProcessingDataResponse & {
  detail: string;
  code?: string;
};

export function clearProcessingData(orderId: number): Promise<{ data: ClearProcessingDataResponse }> {
  return api.post<ClearProcessingDataResponse>(
    `/inventory/orders/${orderId}/clear-processing-data/`,
    {},
  );
}

export function getCleanupModels(orderId: number): Promise<{ data: CleanupModelsResponse }> {
  return api.get<CleanupModelsResponse>(`/inventory/orders/${orderId}/ai-cleanup-models/`);
}

export function addCleanupModel(
  orderId: number,
  model: CleanupModelOption,
): Promise<{ data: CleanupModelsResponse }> {
  return api.post<CleanupModelsResponse>(`/inventory/orders/${orderId}/ai-cleanup-models/`, {
    action: 'add',
    ...model,
  });
}

export function setDefaultCleanupModel(
  orderId: number,
  modelId: string,
): Promise<{ data: CleanupModelsResponse }> {
  return api.post<CleanupModelsResponse>(`/inventory/orders/${orderId}/ai-cleanup-models/`, {
    action: 'set_default',
    id: modelId,
  });
}

export function verifyCleanupModel(
  orderId: number,
  modelId: string,
): Promise<{ data: VerifyCleanupModelResponse }> {
  return api.post<VerifyCleanupModelResponse>(`/inventory/orders/${orderId}/ai-cleanup-models/`, {
    action: 'verify',
    id: modelId,
  });
}

export function downloadCleanupCsv(orderId: number): Promise<{ data: Blob }> {
  return api.get(`/inventory/orders/${orderId}/download-cleanup-csv/`, {
    responseType: 'blob',
  });
}

export function uploadCleanupCsv(
  orderId: number,
  file: File,
): Promise<{ data: UploadCleanupCsvResponse }> {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<UploadCleanupCsvResponse>(`/inventory/orders/${orderId}/upload-cleanup-csv/`, formData, {
    transformRequest: [
      (body, headers) => {
        if (body instanceof FormData) {
          delete headers['Content-Type'];
        }
        return body;
      },
    ],
  });
}

export interface CleanupCsvApplyRowPayload {
  row_id: number;
  row_number?: number;
  ai_title: string;
  ai_brand: string;
  ai_model: string;
  category: string;
  condition: string;
  proposed_price: string;
  description?: string;
  notes?: string;
  specifications_json?: string;
  search_tags_json?: string;
  /** JSON string Grok validation cell; backend normalizes malformed/empty to clean-equivalent. */
  ai_status?: string;
}

export function uploadCleanupCsvRows(
  orderId: number,
  rows: CleanupCsvApplyRowPayload[],
): Promise<{ data: UploadCleanupCsvResponse }> {
  return api.post<UploadCleanupCsvResponse>(`/inventory/orders/${orderId}/apply-cleanup-csv/`, { rows });
}

export function getPreprocessingStatus(orderId: number): Promise<{ data: PreprocessingStatusResponse }> {
  return api.get<PreprocessingStatusResponse>(`/inventory/orders/${orderId}/preprocessing-status/`);
}

export function getManualReview(
  orderId: number,
  params?: ManualReviewParams,
): Promise<{ data: ManualReviewResponse }> {
  return api.get<ManualReviewResponse>(`/inventory/orders/${orderId}/manual-review/`, { params });
}

export function updateManualReview(
  orderId: number,
  rows: ManualReviewRowUpdate[],
): Promise<{ data: ManualReviewUpdateResponse }> {
  return api.post<ManualReviewUpdateResponse>(`/inventory/orders/${orderId}/manual-review/`, { rows });
}

export function getPreprocessingReview(
  orderId: number,
  params?: PreprocessingReviewParams,
): Promise<{ data: PreprocessingReviewResponse }> {
  return api.get<PreprocessingReviewResponse>(`/inventory/orders/${orderId}/preprocessing-review/`, { params });
}

export function updatePreprocessingReview(
  orderId: number,
  rows: PreprocessingReviewRowUpdate[],
): Promise<{ data: PreprocessingReviewUpdateResponse }> {
  return api.patch<PreprocessingReviewUpdateResponse>(`/inventory/orders/${orderId}/preprocessing-review/`, { rows });
}

export function resetPreprocessingReviewFinal(
  orderId: number,
  payload: PreprocessingReviewResetFinalPayload,
): Promise<{ data: PreprocessingReviewResetFinalResponse }> {
  return api.post<PreprocessingReviewResetFinalResponse>(
    `/inventory/orders/${orderId}/preprocessing-review-reset-final/`,
    payload,
  );
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

export function getProcessingWorkspace(
  orderId: number,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<{ data: ProcessingWorkspaceDTO }> {
  return api.get<ProcessingWorkspaceDTO>(`/inventory/orders/${orderId}/processing-workspace/`, {
    params: params
      ?
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
        )
      : undefined,
  });
}

export function getProcessingRowDetail(
  orderId: number,
  processingRowId: number,
): Promise<{ data: { row: ProcessingWorkspaceDTO['rows'][number] } }> {
  return api.get<{ row: ProcessingWorkspaceDTO['rows'][number] }>(
    `/inventory/orders/${orderId}/processing-row-detail/`,
    { params: { processing_row_id: processingRowId } },
  );
}

export interface PrintedItemPreview {
  id: number;
  sku: string;
  title: string;
  price: string;
  brand: string;
  product_number: string | null;
}

export interface ProcessingPrintAndCheckInResponse {
  item: Item;
  workspace_patch: ProcessingWorkspacePatchDTO;
  printed_items_preview?: PrintedItemPreview[];
  label_print_job_id: string;
}

export function processingPrintAndCheckIn(
  itemId: number,
  payload: Record<string, unknown>,
): Promise<{ data: ProcessingPrintAndCheckInResponse }> {
  return api.post<ProcessingPrintAndCheckInResponse>(
    `/inventory/items/${itemId}/processing-print-and-check-in/`,
    payload,
  );
}

export interface ProcessingPrintMultiplePayload {
  /** Preferred row identity for Item Processor (Phase 3). */
  processing_row_id?: number;
  /** Legacy when not using ``processing_row_id``. */
  manifest_row_id?: number;
  qty: number;
  condition?: string;
  dispatch?: string;
  retail?: string;
  price?: string;
  unit_retail?: string;
  notes?: string;
}

export interface ProcessingPrintMultipleResponse {
  checked_in_item_ids: number[];
  workspace_patch: ProcessingWorkspacePatchDTO;
  printed_items_preview: PrintedItemPreview[];
  label_print_job_id: string;
}

export function processingPrintMultiple(
  orderId: number,
  payload: ProcessingPrintMultiplePayload | Record<string, unknown>,
): Promise<{ data: ProcessingPrintMultipleResponse }> {
  return api.post<ProcessingPrintMultipleResponse>(
    `/inventory/orders/${orderId}/processing-print-multiple/`,
    payload,
  );
}

export interface ProcessingRowCheckInPayload {
  processing_row_id: number;
  quantity: number;
  condition?: string;
  dispatch?: string;
  retail?: string;
  price?: string;
  title?: string;
  brand?: string;
  model?: string;
  category?: string;
  upc?: string;
  specifications?: Record<string, unknown>;
  notes?: string;
}

export interface ProcessingRowCheckInResponse {
  items: Item[];
  created_count: number;
  check_in_batch_id?: number;
  workspace_patch: ProcessingWorkspacePatchDTO;
  printed_items_preview: PrintedItemPreview[];
}

export function processingRowCheckIn(
  orderId: number,
  payload: ProcessingRowCheckInPayload | Record<string, unknown>,
): Promise<{ data: ProcessingRowCheckInResponse }> {
  return api.post<ProcessingRowCheckInResponse>(
    `/inventory/orders/${orderId}/processing-row-check-in/`,
    payload,
  );
}

export interface ProcessingRowPatchResponse {
  row: ProcessingWorkspaceDTO['rows'][number];
  workspace_patch: ProcessingWorkspacePatchDTO;
}

export function processingRowPatch(
  orderId: number,
  payload: Record<string, unknown>,
): Promise<{ data: ProcessingRowPatchResponse }> {
  return api.patch<ProcessingRowPatchResponse>(
    `/inventory/orders/${orderId}/processing-row-patch/`,
    payload,
  );
}

export interface ProcessingAddItemResponse {
  row: ProcessingWorkspaceDTO['rows'][number];
  items: Item[];
  created_count: number;
  workspace_patch: ProcessingWorkspacePatchDTO;
  printed_items_preview?: PrintedItemPreview[];
}

export function processingAddItem(
  orderId: number,
  payload: Record<string, unknown>,
): Promise<{ data: ProcessingAddItemResponse }> {
  return api.post<ProcessingAddItemResponse>(
    `/inventory/orders/${orderId}/processing-add-item/`,
    payload,
  );
}

export interface ProcessingDisputePayload {
  scope: 'items' | 'manifest_row' | 'manifest_rows' | 'processing_rows';
  ids?: number[];
  /** Alias for bulk processing-row disputes (optional if ``ids`` set). */
  processing_row_ids?: number[];
  type: 'broken' | 'undelivered';
  pct_loss?: number;
  description?: string;
}

export function processingDispute(
  orderId: number,
  payload: ProcessingDisputePayload | Record<string, unknown>,
): Promise<{ data: { workspace_patch: ProcessingWorkspacePatchDTO } }> {
  return api.post<{ workspace_patch: ProcessingWorkspacePatchDTO }>(
    `/inventory/orders/${orderId}/processing-dispute/`,
    payload,
  );
}

export interface ProcessingMergeRowsPayload {
  processing_row_ids?: number[];
  manifest_row_ids?: number[];
  field_values: Record<string, unknown>;
}

export function processingMergeRows(
  orderId: number,
  payload: ProcessingMergeRowsPayload | Record<string, unknown>,
): Promise<{ data: { workspace_patch: ProcessingWorkspacePatchDTO } }> {
  return api.post<{ workspace_patch: ProcessingWorkspacePatchDTO }>(
    `/inventory/orders/${orderId}/processing-merge-rows/`,
    payload,
  );
}

export interface ProcessingBulkDispositionPayload {
  processing_row_ids?: number[];
  manifest_row_ids?: number[];
  retail?: string;
  groups: Record<string, unknown>[];
}

export function processingBulkDisposition(
  orderId: number,
  payload: ProcessingBulkDispositionPayload | Record<string, unknown>,
): Promise<{ data: { workspace_patch: ProcessingWorkspacePatchDTO } }> {
  return api.post<{ workspace_patch: ProcessingWorkspacePatchDTO }>(
    `/inventory/orders/${orderId}/processing-bulk-disposition/`,
    payload,
  );
}

export function processingPatchItem(
  itemId: number,
  payload: Record<string, unknown>,
): Promise<{ data: { item: Item; workspace_patch: ProcessingWorkspacePatchDTO } }> {
  return api.patch<{ item: Item; workspace_patch: ProcessingWorkspacePatchDTO }>(
    `/inventory/items/${itemId}/processing-patch/`,
    payload,
  );
}

export function checkInOrderItems(
  orderId: number,
  data: CheckInOrderItemsPayload,
): Promise<{ data: CheckInOrderItemsResponse }> {
  return api.post<CheckInOrderItemsResponse>(`/inventory/orders/${orderId}/check-in-items/`, data);
}

export function bulkMarkBroken(orderId: number, itemIds: number[]): Promise<{ data: { marked_broken: number } }> {
  return api.post<{ marked_broken: number }>(`/inventory/orders/${orderId}/mark-items-broken/`, { item_ids: itemIds });
}

export function bulkUncheckIn(orderId: number, itemIds: number[]): Promise<{ data: { unchecked_in: number } }> {
  return api.post<{ unchecked_in: number }>(`/inventory/orders/${orderId}/uncheck-in-items/`, { item_ids: itemIds });
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

export interface SuggestItemRequest {
  fields: string[];
  context: Record<string, string>;
  model?: string;
}

export interface SuggestItemResponse {
  suggestions: Record<string, unknown>;
  low_confidence: boolean;
  low_confidence_reason: string;
  usage: { input_tokens: number; output_tokens: number };
  examples_used: number;
  timing: { db_ms: number; api_ms: number; total_ms: number };
  /** Present when suggest area resolves to `browser` in `.ai/debug/log.config` (console via devLog + VITE_DEV_LOG). */
  debug?: {
    model: string;
    system_prompt: string;
    user_message: string;
  };
}

export function suggestItem(data: SuggestItemRequest): Promise<{ data: SuggestItemResponse }> {
  return api.post<SuggestItemResponse>('/inventory/items/suggest/', data);
}

export function getItemStats(params?: {
  product_id?: number | null;
  category?: string | null;
}): Promise<{ data: ItemStatsResponse }> {
  const q: Record<string, string> = {};
  if (params?.product_id != null) q.product_id = String(params.product_id);
  if (params?.category?.trim()) q.category = params.category.trim();
  return api.get<ItemStatsResponse>('/inventory/items/stats/', { params: q });
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

export function markItemBroken(id: number): Promise<{ data: Item }> {
  return api.post<Item>(`/inventory/items/${id}/mark-broken/`);
}

export function uncheckInItem(id: number): Promise<{ data: Item }> {
  return api.post<Item>(`/inventory/items/${id}/uncheck-in/`);
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
  data: {
    unit_price?: number | string;
    unit_cost?: number | string;
    condition?: string;
    location?: string;
    check_in_count?: number;
    scrap_count?: number;
  },
): Promise<{ data: Batch & { checked_in: number; marked_broken?: number } }> {
  return api.post<Batch & { checked_in: number; marked_broken?: number }>(`/inventory/batch-groups/${id}/check-in/`, data);
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

// ── Pricing / Estimation ──────────────────────────────────────────────────────

export interface PriceEstimateRequest {
  title: string;
  brand?: string;
  model?: string;
  condition?: string;
  source?: string;
  retail_value?: string | number;
  category?: string;
}

export interface PriceEstimateResponse {
  estimated_price: string;
  low_estimate: string;
  high_estimate: string;
  confidence: number;
  method: string;
  comparables: Array<{ sku: string; title: string; brand: string; condition: string; sold_for: string; sold_at: string }>;
  notes: string;
}

export function estimatePrice(data: PriceEstimateRequest): Promise<{ data: PriceEstimateResponse }> {
  return api.post<PriceEstimateResponse>('/inventory/estimate-price/', data);
}

export function estimateManifestPrices(orderId: number, overwrite = false): Promise<{ data: {
  total_rows: number; rows_estimated: number; rows_skipped: number;
  estimated_revenue: string; po_cost: string | null; margin_pct: number | null;
} }> {
  return api.post(`/inventory/orders/${orderId}/estimate-prices/`, { overwrite });
}

export interface QuickRepriceRequest {
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_price?: number;
}

export interface QuickRepriceResponse {
  sku: string;
  title: string;
  status?: string;
  old_price: string;
  new_price: string;
  discount_amount: string;
  discount_type: string;
  discount_value: string;
  brand?: string;
  product_number?: string;
}

export function quickReprice(itemId: number, data: QuickRepriceRequest): Promise<{ data: QuickRepriceResponse }> {
  return api.post<QuickRepriceResponse>(`/inventory/items/${itemId}/quick-reprice/`, data);
}

export function duplicateItemForResale(itemId: number): Promise<{ data: Item }> {
  return api.post<Item>(`/inventory/items/${itemId}/duplicate-for-resale/`);
}

export function markSoldItemOnShelf(itemId: number): Promise<{ data: Item }> {
  return api.post<Item>(`/inventory/items/${itemId}/mark-on-shelf/`);
}

export function verifyItemPresent(itemId: number): Promise<{ data: { sku: string; title: string; status: string; location: string; verified: boolean } }> {
  return api.post(`/inventory/items/${itemId}/verify-present/`, {});
}

export function getStoreReport(params?: { stale_days?: number; location?: string }): Promise<{ data: {
  summary: {
    total_items_on_shelf: number;
    total_retail_value: string;
    avg_price: string;
    stale_threshold_days: number;
    stale_item_count: number;
    unpriced_item_count: number;
    lost_item_count: number;
  };
  stale_items: Item[];
  unpriced_items: Item[];
  lost_items: Item[];
  category_breakdown: Array<{ category: string; count: number; total_value: string }>;
  source_breakdown: Array<{ source: string; count: number; total_value: string }>;
  price_histogram: Array<{ range: string; count: number }>;
} }> {
  return api.get('/inventory/store-report/', { params });
}

// ── Receiving v1 ───────────────────────────────────────────────────────────

export function fetchOrdersForReceiving(
  params?: Record<string, unknown>,
): Promise<{ data: PaginatedResponse<OrderForReceivingRow> }> {
  return api.get<PaginatedResponse<OrderForReceivingRow>>('/inventory/orders/for-receiving/', { params });
}

export function fetchReceiving(orderId: number): Promise<{ data: ReceivingDetailDTO }> {
  return api.get<ReceivingDetailDTO>(`/inventory/orders/${orderId}/receiving/`);
}

export function patchReceiving(
  orderId: number,
  data: ReceivingPatchPayload,
): Promise<{ data: ReceivingDetailDTO }> {
  return api.patch<ReceivingDetailDTO>(`/inventory/orders/${orderId}/receiving/`, data);
}

export function uploadReceivingPhoto(
  orderId: number,
  file: Blob,
  fields: {
    kind: 'bol' | 'truck' | 'pallet_side';
    client_photo_id?: string | null;
    pallet_number?: number;
    side?: string;
    filename?: string;
  },
): Promise<{ data: import('../types/inventory.types').ReceivingAttachmentDTO }> {
  const formData = new FormData();
  formData.append('file', file, fields.filename ?? 'photo.jpg');
  formData.append('kind', fields.kind);
  if (fields.client_photo_id != null && fields.client_photo_id !== '') {
    formData.append('client_photo_id', fields.client_photo_id);
  }
  if (fields.pallet_number != null) formData.append('pallet_number', String(fields.pallet_number));
  if (fields.side != null && fields.side !== '') formData.append('side', fields.side);

  type Att = import('../types/inventory.types').ReceivingAttachmentDTO;
  return api.post<Att>(`/inventory/orders/${orderId}/receiving/photos/`, formData, {
    transformRequest: [
      (body, headers) => {
        if (body instanceof FormData) {
          delete headers['Content-Type'];
        }
        return body;
      },
    ],
  });
}

export function deleteReceivingPhoto(orderId: number, attachmentId: number): Promise<void> {
  return api.delete(`/inventory/orders/${orderId}/receiving/photos/${attachmentId}/`);
}

export function completeReceiving(orderId: number): Promise<{ data: ReceivingCompleteResponse }> {
  return api.post<ReceivingCompleteResponse>(`/inventory/orders/${orderId}/receiving/complete/`, {});
}

export interface OrderDisputeDTO {
  id: number;
  purchase_order: number;
  kind: string;
  status: string;
  title: string;
  description: string;
  opened_by: number | null;
  opened_at: string;
  resolved_by: number | null;
  resolved_at: string | null;
  subject_receiving: number | null;
  subject_pallet: number | null;
  subject_manifest_row: number | null;
  subject_processing_row: number | null;
  subject_item: number | null;
  payload: Record<string, unknown>;
}

export function createOrderDispute(
  orderId: number,
  body: {
    kind: 'intake' | 'processing';
    title: string;
    description?: string;
    subject_receiving?: number | null;
    subject_pallet?: number | null;
    subject_manifest_row?: number | null;
    subject_processing_row?: number | null;
    subject_item?: number | null;
    payload?: Record<string, unknown>;
  },
): Promise<{ data: OrderDisputeDTO }> {
  return api.post<OrderDisputeDTO>(`/inventory/orders/${orderId}/disputes/`, body);
}

export function fetchOrderDisputes(
  orderId: number,
  params?: { kind?: string; status?: string },
): Promise<{ data: OrderDisputeDTO[] }> {
  return api.get<OrderDisputeDTO[]>(`/inventory/orders/${orderId}/disputes/`, { params });
}

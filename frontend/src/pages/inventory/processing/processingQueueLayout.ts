/** Layout metrics for ProcessingQueueTable — keep in sync with sx on table cells. */
export const PROCESSING_QUEUE_TABLE_HEAD_HEIGHT = 28;
export const PROCESSING_QUEUE_TABLE_ROW_HEIGHT = 26;

/** Column layout must use clientWidth — offsetWidth includes the vertical scrollbar gutter. */
export function readProcessingQueueTableClientWidth(el: HTMLElement): number {
  return el.clientWidth;
}

/** Total scroll height for a virtualized queue body (fixed row height). */
export function processingQueueVirtualTotalHeight(rowCount: number): number {
  return Math.max(0, rowCount) * PROCESSING_QUEUE_TABLE_ROW_HEIGHT;
}

/** Column width bounds (px) for content-aware layout — see processingQueueColumnLayout.ts */
export const PROCESSING_QUEUE_COL_MIN = {
  rowNum: 36,
  brand: 72,
  title: 120,
  category: 96,
  qty: 56,
  retail: 56,
  price: 56,
  condition: 80,
  dispatch: 72,
  status: 72,
} as const;

export const PROCESSING_QUEUE_COL_MAX = {
  rowNum: 52,
  brand: 140,
  title: 480,
  category: 200,
  qty: 88,
  retail: 88,
  price: 88,
  condition: 140,
  dispatch: 120,
  status: 120,
} as const;

/** Static defaults when rows or container width are unavailable (matches prior hardcoded layout). */
export const PROCESSING_QUEUE_COL_DEFAULTS = {
  rowNum: 42,
  brand: 108,
  title: 320,
  category: 148,
  qty: 76,
  retail: 78,
  price: 78,
  condition: 112,
  dispatch: 104,
  status: 86,
} as const;

export const PROCESSING_QUEUE_SORT_ICON_PX = 14;
export const PROCESSING_QUEUE_ADDED_CHIP_PX = 36;
export const PROCESSING_QUEUE_DUP_CHIP_PX = 28;
export const PROCESSING_QUEUE_CHIP_PAD_PX = 16;
export const PROCESSING_QUEUE_CELL_PAD_PX = 18;
export const PROCESSING_QUEUE_ROW_NUM_PAD_PX = 24;

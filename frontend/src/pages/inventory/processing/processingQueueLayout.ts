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

/** Minimum px to show a full currency cell ($999,999.99) without ellipsis. */
export const PROCESSING_QUEUE_MONEY_COL_MIN = 88;

/** Floor widths (px) when the viewport is too narrow for measured content. */
export const PROCESSING_QUEUE_COL_MIN = {
  rowNum: 36,
  brand: 72,
  title: 120,
  category: 96,
  qty: 72,
  retail: PROCESSING_QUEUE_MONEY_COL_MIN,
  extRetail: PROCESSING_QUEUE_MONEY_COL_MIN,
  price: PROCESSING_QUEUE_MONEY_COL_MIN,
  condition: 80,
  dispatch: 72,
  status: 72,
} as const;

/** Static defaults when rows or container width are unavailable (matches prior hardcoded layout). */
export const PROCESSING_QUEUE_COL_DEFAULTS = {
  rowNum: 42,
  brand: 80,
  title: 320,
  category: 148,
  qty: 96,
  retail: 92,
  extRetail: 96,
  price: 92,
  condition: 112,
  dispatch: 104,
  status: 86,
} as const;

export const PROCESSING_QUEUE_SORT_ICON_PX = 14;
export const PROCESSING_QUEUE_ADDED_CHIP_PX = 36;
export const PROCESSING_QUEUE_DUP_CHIP_PX = 28;
export const PROCESSING_QUEUE_PEER_CHIP_PX = 44;
export const PROCESSING_QUEUE_PRODUCTS_CHIP_PX = 52;
export const PROCESSING_QUEUE_CHECKBOX_COL_PX = 48;
export const PROCESSING_QUEUE_CHIP_PAD_PX = 16;
export const PROCESSING_QUEUE_CELL_PAD_PX = 18;
export const PROCESSING_QUEUE_ROW_NUM_PAD_PX = 24;

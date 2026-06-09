import type { ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { measureTextWidth as defaultMeasureTextWidth } from '../../../utils/measureTextWidth';
import {
  formatQueueMoney,
  queueBrandText,
  queueCategoryText,
  queueDispatchLabel,
  queueQtyText,
  queueStatusLabel,
  queueTitleText,
} from './processingQueueCellText';
import {
  PROCESSING_QUEUE_ADDED_CHIP_PX,
  PROCESSING_QUEUE_CELL_PAD_PX,
  PROCESSING_QUEUE_CHIP_PAD_PX,
  PROCESSING_QUEUE_COL_DEFAULTS,
  PROCESSING_QUEUE_COL_MAX,
  PROCESSING_QUEUE_COL_MIN,
  PROCESSING_QUEUE_DUP_CHIP_PX,
  PROCESSING_QUEUE_ROW_NUM_PAD_PX,
  PROCESSING_QUEUE_SORT_ICON_PX,
} from './processingQueueLayout';

export type ProcessingQueueColumnId =
  | 'rowNum'
  | 'brand'
  | 'title'
  | 'category'
  | 'qty'
  | 'retail'
  | 'price'
  | 'condition'
  | 'dispatch'
  | 'status';

export const PROCESSING_QUEUE_COLUMN_ORDER: ProcessingQueueColumnId[] = [
  'rowNum',
  'brand',
  'title',
  'category',
  'qty',
  'retail',
  'price',
  'condition',
  'dispatch',
  'status',
];

export type ProcessingQueueColumnWidths = {
  cols: Record<ProcessingQueueColumnId, number>;
  tableWidth: number;
};

export type ProcessingQueueMeasureFonts = {
  header: string;
  body: string;
  bodyBrand: string;
  bodyTitle: string;
  bodyBold: string;
  chip: string;
};

export type MeasureTextWidthFn = (text: string, font: string) => number;

export function createProcessingQueueMeasureFonts(fontFamily: string): ProcessingQueueMeasureFonts {
  const ff = fontFamily || 'sans-serif';
  return {
    header: `700 0.59375rem ${ff}`,
    body: `400 0.72rem ${ff}`,
    bodyBrand: `600 0.72rem ${ff}`,
    bodyTitle: `700 0.72rem ${ff}`,
    bodyBold: `700 0.72rem ${ff}`,
    chip: `400 9px ${ff}`,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sumColumnWidths(cols: Record<ProcessingQueueColumnId, number>): number {
  return PROCESSING_QUEUE_COLUMN_ORDER.reduce((sum, id) => sum + cols[id], 0);
}

/** Force column widths to sum exactly to containerWidth (never wider than viewport). */
function normalizeColumnsToContainerWidth(
  cols: Record<ProcessingQueueColumnId, number>,
  containerWidth: number,
): Record<ProcessingQueueColumnId, number> {
  if (containerWidth <= 0) return cols;

  const next = { ...cols };
  let sum = sumColumnWidths(next);

  if (sum < containerWidth) {
    next.title += containerWidth - sum;
    return next;
  }

  if (sum === containerWidth) return next;

  const scale = containerWidth / sum;
  for (const id of PROCESSING_QUEUE_COLUMN_ORDER) {
    next[id] = Math.max(1, Math.floor(next[id] * scale));
  }
  next.title += containerWidth - sumColumnWidths(next);
  next.title = Math.max(1, next.title);
  return next;
}

function scaleDefaultColumnsToContainer(containerWidth: number): Record<ProcessingQueueColumnId, number> {
  return normalizeColumnsToContainerWidth({ ...PROCESSING_QUEUE_COL_DEFAULTS }, containerWidth);
}

function ceilPad(w: number, pad: number): number {
  return Math.ceil(w + pad);
}

function shrinkFixedColumnsToFit(
  cols: Record<ProcessingQueueColumnId, number>,
  containerWidth: number,
  titleMin: number,
): Record<ProcessingQueueColumnId, number> {
  const fixedIds = PROCESSING_QUEUE_COLUMN_ORDER.filter((id) => id !== 'title');
  const fixedSum = fixedIds.reduce((sum, id) => sum + cols[id], 0);
  const availableForFixed = Math.max(0, containerWidth - titleMin);
  if (fixedSum <= availableForFixed) return cols;

  const next = { ...cols };
  let overflow = fixedSum - availableForFixed;
  const shrinkable = fixedIds
    .map((id) => ({ id, slack: next[id] - PROCESSING_QUEUE_COL_MIN[id] }))
    .filter((x) => x.slack > 0);

  while (overflow > 0 && shrinkable.some((x) => x.slack > 0)) {
    const totalSlack = shrinkable.reduce((s, x) => s + x.slack, 0);
    if (totalSlack <= 0) break;
    for (const entry of shrinkable) {
      if (entry.slack <= 0) continue;
      const share = (entry.slack / totalSlack) * overflow;
      const delta = Math.min(entry.slack, Math.max(1, Math.ceil(share)));
      next[entry.id] -= delta;
      entry.slack -= delta;
      overflow -= delta;
    }
  }

  for (const id of fixedIds) {
    next[id] = Math.max(PROCESSING_QUEUE_COL_MIN[id], next[id]);
  }
  return next;
}

export function computeProcessingQueueColumnWidths(
  rows: ProcessingWorkspaceRowDTO[],
  containerWidth: number,
  fonts: ProcessingQueueMeasureFonts,
  measureTextWidth: MeasureTextWidthFn = defaultMeasureTextWidth,
): ProcessingQueueColumnWidths {
  if (rows.length === 0 || containerWidth <= 0) {
    return {
      cols:
        containerWidth > 0 ?
          scaleDefaultColumnsToContainer(containerWidth)
        : { ...PROCESSING_QUEUE_COL_DEFAULTS },
      tableWidth: containerWidth > 0 ? containerWidth : 0,
    };
  }

  let rowNumW = measureTextWidth('#', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let brandW = measureTextWidth('Brand', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let titleW = measureTextWidth('Title', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let categoryW = measureTextWidth('Category', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let qtyW = measureTextWidth('Qty', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let retailW = measureTextWidth('Retail', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let priceW = measureTextWidth('Price', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let conditionW = measureTextWidth('Condition', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let dispatchW = measureTextWidth('Dispatch', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let statusW = measureTextWidth('Status', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;

  let hasAddedRow = false;
  let hasDupChip = false;

  for (const row of rows) {
    if (row.rowKind === 'added') hasAddedRow = true;
    if (row.likelyDuplicateOf?.length) hasDupChip = true;

    rowNumW = Math.max(rowNumW, measureTextWidth(String(row.rowNum), fonts.body));
    brandW = Math.max(brandW, measureTextWidth(queueBrandText(row), fonts.bodyBrand));
    titleW = Math.max(titleW, measureTextWidth(queueTitleText(row), fonts.bodyTitle));
    categoryW = Math.max(categoryW, measureTextWidth(queueCategoryText(row), fonts.body));
    qtyW = Math.max(qtyW, measureTextWidth(queueQtyText(row), fonts.bodyBold));
    retailW = Math.max(retailW, measureTextWidth(formatQueueMoney(row.unitRetail), fonts.body));
    priceW = Math.max(priceW, measureTextWidth(formatQueueMoney(row.price), fonts.bodyBold));
    conditionW = Math.max(conditionW, measureTextWidth(row.condition || '', fonts.body));
    dispatchW = Math.max(
      dispatchW,
      measureTextWidth(queueDispatchLabel(row.dispatch), fonts.chip) + PROCESSING_QUEUE_CHIP_PAD_PX,
    );
    statusW = Math.max(
      statusW,
      measureTextWidth(queueStatusLabel(row.status), fonts.chip) + PROCESSING_QUEUE_CHIP_PAD_PX,
    );
  }

  if (hasAddedRow) {
    rowNumW = Math.max(rowNumW, PROCESSING_QUEUE_ADDED_CHIP_PX);
  }
  if (hasDupChip) {
    titleW += PROCESSING_QUEUE_DUP_CHIP_PX;
  }

  let cols: Record<ProcessingQueueColumnId, number> = {
    rowNum: clamp(
      ceilPad(rowNumW, PROCESSING_QUEUE_ROW_NUM_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.rowNum,
      PROCESSING_QUEUE_COL_MAX.rowNum,
    ),
    brand: clamp(
      ceilPad(brandW, PROCESSING_QUEUE_CELL_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.brand,
      PROCESSING_QUEUE_COL_MAX.brand,
    ),
    title: 0,
    category: clamp(
      ceilPad(categoryW, PROCESSING_QUEUE_CELL_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.category,
      PROCESSING_QUEUE_COL_MAX.category,
    ),
    qty: clamp(
      ceilPad(qtyW, PROCESSING_QUEUE_CELL_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.qty,
      PROCESSING_QUEUE_COL_MAX.qty,
    ),
    retail: clamp(
      ceilPad(retailW, PROCESSING_QUEUE_CELL_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.retail,
      PROCESSING_QUEUE_COL_MAX.retail,
    ),
    price: clamp(
      ceilPad(priceW, PROCESSING_QUEUE_CELL_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.price,
      PROCESSING_QUEUE_COL_MAX.price,
    ),
    condition: clamp(
      ceilPad(conditionW, PROCESSING_QUEUE_CELL_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.condition,
      PROCESSING_QUEUE_COL_MAX.condition,
    ),
    dispatch: clamp(
      ceilPad(dispatchW, PROCESSING_QUEUE_CELL_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.dispatch,
      PROCESSING_QUEUE_COL_MAX.dispatch,
    ),
    status: clamp(
      ceilPad(statusW, PROCESSING_QUEUE_CELL_PAD_PX),
      PROCESSING_QUEUE_COL_MIN.status,
      PROCESSING_QUEUE_COL_MAX.status,
    ),
  };

  cols = shrinkFixedColumnsToFit(cols, containerWidth, PROCESSING_QUEUE_COL_MIN.title);

  const fixedSum = PROCESSING_QUEUE_COLUMN_ORDER.filter((id) => id !== 'title').reduce(
    (sum, id) => sum + cols[id],
    0,
  );
  cols.title = Math.max(1, containerWidth - fixedSum);
  cols = normalizeColumnsToContainerWidth(cols, containerWidth);

  return {
    cols,
    tableWidth: containerWidth,
  };
}

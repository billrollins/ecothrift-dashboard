import type { ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { measureTextWidth as defaultMeasureTextWidth } from '../../../utils/measureTextWidth';
import {
  formatQueueMoney,
  queueBrandText,
  queueCategoryText,
  queueDispatchLabel,
  queueExtRetailText,
  queueProductsChipLabel,
  queueQtyText,
  queueStatusLabel,
  queueTitleText,
} from './processingQueueCellText';
import {
  PROCESSING_QUEUE_ADDED_CHIP_PX,
  PROCESSING_QUEUE_CELL_PAD_PX,
  PROCESSING_QUEUE_CHIP_PAD_PX,
  PROCESSING_QUEUE_COL_DEFAULTS,
  PROCESSING_QUEUE_COL_MIN,
  PROCESSING_QUEUE_DUP_CHIP_PX,
  PROCESSING_QUEUE_MONEY_COL_MIN,
  PROCESSING_QUEUE_PEER_CHIP_PX,
  PROCESSING_QUEUE_PRODUCTS_CHIP_PX,
  PROCESSING_QUEUE_ROW_NUM_PAD_PX,
  PROCESSING_QUEUE_SORT_ICON_PX,
} from './processingQueueLayout';

export type ProcessingQueueColumnId =
  | 'qty'
  | 'brand'
  | 'title'
  | 'category'
  | 'retail'
  | 'extRetail'
  | 'price'
  | 'condition'
  | 'dispatch'
  | 'status';

export const PROCESSING_QUEUE_COLUMN_ORDER: ProcessingQueueColumnId[] = [
  'qty',
  'brand',
  'title',
  'category',
  'retail',
  'extRetail',
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

function sumColumnWidths(cols: Record<ProcessingQueueColumnId, number>): number {
  return PROCESSING_QUEUE_COLUMN_ORDER.reduce((sum, id) => sum + cols[id], 0);
}

function ceilPad(w: number, pad: number): number {
  return Math.ceil(w + pad);
}

function idealFloor(ideal: number, min: number): number {
  return Math.max(min, ideal);
}

/** Assign any px drift from rounding to the title column. */
function finalizeColumnWidths(
  cols: Record<ProcessingQueueColumnId, number>,
  containerWidth: number,
): Record<ProcessingQueueColumnId, number> {
  let next = { ...cols };
  let sum = sumColumnWidths(next);
  if (sum > containerWidth) {
    next = proportionallyScaleColumns(next, containerWidth);
    sum = sumColumnWidths(next);
  }
  const drift = containerWidth - sum;
  if (drift !== 0) {
    next.title += drift;
  }
  return next;
}

function proportionallyScaleColumns(
  cols: Record<ProcessingQueueColumnId, number>,
  containerWidth: number,
): Record<ProcessingQueueColumnId, number> {
  const sum = sumColumnWidths(cols);
  if (sum <= 0 || sum <= containerWidth) return cols;
  const scale = containerWidth / sum;
  const next = { ...cols };
  for (const id of PROCESSING_QUEUE_COLUMN_ORDER) {
    next[id] = Math.max(1, Math.floor(next[id] * scale));
  }
  return next;
}

function scaleDefaultColumnsToContainer(containerWidth: number): Record<ProcessingQueueColumnId, number> {
  const next: Record<ProcessingQueueColumnId, number> = { ...PROCESSING_QUEUE_COL_DEFAULTS };
  const fixedSum = PROCESSING_QUEUE_COLUMN_ORDER.filter((id) => id !== 'title').reduce(
    (sum, id) => sum + next[id],
    0,
  );
  next.title = Math.max(PROCESSING_QUEUE_COL_MIN.title, containerWidth - fixedSum);
  return finalizeColumnWidths(next, containerWidth);
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

/**
 * Fixed columns get their measured ideal width when space allows.
 * Title absorbs leftover viewport width; it shrinks first when space is tight.
 */
function distributeColumnWidths(
  ideals: Record<ProcessingQueueColumnId, number>,
  containerWidth: number,
): Record<ProcessingQueueColumnId, number> {
  const fixedIds = PROCESSING_QUEUE_COLUMN_ORDER.filter((id) => id !== 'title');
  const next = { ...ideals };

  const fixedSum = () => fixedIds.reduce((sum, id) => sum + next[id], 0);
  let titleSpace = containerWidth - fixedSum();

  if (titleSpace >= ideals.title) {
    next.title = titleSpace;
    return next;
  }

  if (titleSpace >= PROCESSING_QUEUE_COL_MIN.title) {
    next.title = titleSpace;
    return next;
  }

  const shrunk = shrinkFixedColumnsToFit(next, containerWidth, PROCESSING_QUEUE_COL_MIN.title);
  titleSpace = containerWidth - fixedIds.reduce((sum, id) => sum + shrunk[id], 0);
  shrunk.title = Math.max(PROCESSING_QUEUE_COL_MIN.title, titleSpace);
  return shrunk;
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

  let qtyW = measureTextWidth('Qty', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let brandW = measureTextWidth('Brand', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let titleW = measureTextWidth('Title', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let categoryW = measureTextWidth('Category', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  const moneyFloor = Math.max(
    PROCESSING_QUEUE_MONEY_COL_MIN,
    measureTextWidth('$999,999.99', fonts.bodyBold),
  );
  let retailW = Math.max(
    measureTextWidth('Retail', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX,
    moneyFloor,
  );
  let extRetailW = Math.max(
    measureTextWidth('Ext. Retail', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX,
    moneyFloor,
  );
  let priceW = Math.max(
    measureTextWidth('Price', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX,
    moneyFloor,
  );
  let conditionW = measureTextWidth('Condition', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let dispatchW = measureTextWidth('Dispatch', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;
  let statusW = measureTextWidth('Status', fonts.header) + PROCESSING_QUEUE_SORT_ICON_PX;

  let hasAddedRow = false;
  let hasDupChip = false;
  let hasPeerChip = false;
  let hasProductsChip = false;

  for (const row of rows) {
    if (row.rowKind === 'added') hasAddedRow = true;
    if (row.likelyDuplicateOf?.length) hasDupChip = true;
    if (row.sameProductRowNumbers?.length) hasPeerChip = true;
    if ((row.distinctProductCount ?? 0) >= 2) hasProductsChip = true;

    brandW = Math.max(brandW, measureTextWidth(queueBrandText(row), fonts.bodyBrand));
    titleW = Math.max(titleW, measureTextWidth(queueTitleText(row), fonts.bodyTitle));
    categoryW = Math.max(categoryW, measureTextWidth(queueCategoryText(row), fonts.body));
    qtyW = Math.max(qtyW, measureTextWidth(queueQtyText(row), fonts.bodyBold));
    retailW = Math.max(retailW, measureTextWidth(formatQueueMoney(row.unitRetail), fonts.body));
    extRetailW = Math.max(extRetailW, measureTextWidth(queueExtRetailText(row), fonts.bodyBold));
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
    const productsLabel = queueProductsChipLabel(row.distinctProductCount);
    if (productsLabel) {
      statusW = Math.max(
        statusW,
        measureTextWidth(productsLabel, fonts.chip) + PROCESSING_QUEUE_CHIP_PAD_PX,
      );
    }
  }

  if (hasAddedRow) {
    titleW = Math.max(titleW, PROCESSING_QUEUE_ADDED_CHIP_PX);
  }
  if (hasDupChip) {
    titleW += PROCESSING_QUEUE_DUP_CHIP_PX;
  }
  if (hasPeerChip) {
    titleW += PROCESSING_QUEUE_PEER_CHIP_PX;
  }
  if (hasProductsChip) {
    statusW += PROCESSING_QUEUE_PRODUCTS_CHIP_PX;
  }

  const ideals: Record<ProcessingQueueColumnId, number> = {
    qty: idealFloor(ceilPad(qtyW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.qty),
    brand: idealFloor(ceilPad(brandW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.brand),
    title: idealFloor(ceilPad(titleW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.title),
    category: idealFloor(ceilPad(categoryW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.category),
    retail: idealFloor(ceilPad(retailW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.retail),
    extRetail: idealFloor(ceilPad(extRetailW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.extRetail),
    price: idealFloor(ceilPad(priceW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.price),
    condition: idealFloor(ceilPad(conditionW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.condition),
    dispatch: idealFloor(ceilPad(dispatchW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.dispatch),
    status: idealFloor(ceilPad(statusW, PROCESSING_QUEUE_CELL_PAD_PX), PROCESSING_QUEUE_COL_MIN.status),
  };

  const cols = finalizeColumnWidths(distributeColumnWidths(ideals, containerWidth), containerWidth);

  return {
    cols,
    tableWidth: containerWidth,
  };
}

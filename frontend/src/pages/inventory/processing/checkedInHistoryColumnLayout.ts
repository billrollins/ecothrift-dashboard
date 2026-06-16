import type { ProcessingWorkspaceProductDTO } from '../../../types/inventory.types';
import { measureTextWidth as defaultMeasureTextWidth } from '../../../utils/measureTextWidth';
import type { CheckedInHistoryRow } from './checkedInHistory';
import {
  checkedInBrandText,
  checkedInCategoryText,
  checkedInModelText,
  checkedInProductIdText,
  checkedInTitleText,
  formatCheckedInShortDateTime,
} from './checkedInHistoryDisplay';
import { formatQueueMoney, queueDispatchLabel } from './processingQueueCellText';

export type CheckedInHistoryColumnId =
  | 'checkedIn'
  | 'qty'
  | 'productId'
  | 'brand'
  | 'title'
  | 'model'
  | 'category'
  | 'condition'
  | 'dispatch'
  | 'retail'
  | 'price';

export const CHECKED_IN_HISTORY_COLUMN_ORDER: CheckedInHistoryColumnId[] = [
  'checkedIn',
  'qty',
  'productId',
  'brand',
  'title',
  'model',
  'category',
  'condition',
  'dispatch',
  'retail',
  'price',
];

export const CHECKED_IN_HISTORY_AUTOSIZE_COLS = ['checkedIn', 'qty'] as const satisfies readonly CheckedInHistoryColumnId[];

export const CHECKED_IN_HISTORY_PRODUCT_ID_COL_PX = 140;

/** Brand + model share one width; category is wider. */
export const CHECKED_IN_HISTORY_BRAND_MODEL_COLS = ['brand', 'model'] as const satisfies readonly CheckedInHistoryColumnId[];
export const CHECKED_IN_HISTORY_CATEGORY_COL = 'category' as const satisfies CheckedInHistoryColumnId;

/** Legacy grouping for padding helpers. */
export const CHECKED_IN_HISTORY_PRODUCT_COLS = ['brand', 'model', 'category'] as const satisfies readonly CheckedInHistoryColumnId[];

/** Condition enum dropdown. */
export const CHECKED_IN_HISTORY_CONDITION_COLS = ['condition'] as const satisfies readonly CheckedInHistoryColumnId[];

/** Legacy alias for condition-only enum tier helpers. */
export const CHECKED_IN_HISTORY_ITEM_ENUM_COLS = CHECKED_IN_HISTORY_CONDITION_COLS;

/** Narrowest equal block: currency. */
export const CHECKED_IN_HISTORY_MONEY_COLS = ['retail', 'price'] as const satisfies readonly CheckedInHistoryColumnId[];

export const CHECKED_IN_HISTORY_FLEX_COL: CheckedInHistoryColumnId = 'title';

export const CHECKED_IN_HISTORY_ACTIONS_COL_PX = 52;
export const CHECKED_IN_HISTORY_ACTIONS_WITH_DELETE_COL_PX = 84;

export const CHECKED_IN_HISTORY_SORT_ICON_PX = 14;
export const CHECKED_IN_HISTORY_CELL_PAD_PX = 18;
export const CHECKED_IN_HISTORY_PRODUCT_CELL_PAD_PX = 12;
export const CHECKED_IN_HISTORY_ITEM_ENUM_CELL_PAD_PX = 10;
export const CHECKED_IN_HISTORY_MONEY_CELL_PAD_PX = 10;
export const CHECKED_IN_HISTORY_GROUP_DIVIDER_PAD_PX = 6;
export const CHECKED_IN_HISTORY_PRODUCT_DROPDOWN_EXTRA_PX = 18;
export const CHECKED_IN_HISTORY_ITEM_ENUM_DROPDOWN_EXTRA_PX = 18;
export const CHECKED_IN_HISTORY_QTY_HEADER_EXTRA_PX = 10;

export const CHECKED_IN_HISTORY_TITLE_MIN_PX = 80;
export const CHECKED_IN_HISTORY_QTY_MIN_PX = 52;
export const CHECKED_IN_HISTORY_BRAND_COL_PX = 120;
export const CHECKED_IN_HISTORY_MODEL_COL_PX = 120;
export const CHECKED_IN_HISTORY_CATEGORY_COL_PX = 180;
export const CHECKED_IN_HISTORY_BRAND_COL_MIN_PX = 100;
export const CHECKED_IN_HISTORY_MODEL_COL_MIN_PX = 100;
export const CHECKED_IN_HISTORY_CATEGORY_COL_MIN_PX = 140;
export const CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX = 160;
export const CHECKED_IN_HISTORY_CONDITION_COL_MIN_PX = 100;
export const CHECKED_IN_HISTORY_DISPATCH_COL_PX = 200;
export const CHECKED_IN_HISTORY_DISPATCH_COL_MIN_PX = 120;
/** @deprecated use CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX */
export const CHECKED_IN_HISTORY_ITEM_ENUM_COL_MAX_PX = CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX;
/** @deprecated use CHECKED_IN_HISTORY_CONDITION_COL_MIN_PX */
export const CHECKED_IN_HISTORY_ITEM_ENUM_COL_MIN_PX = CHECKED_IN_HISTORY_CONDITION_COL_MIN_PX;
export const CHECKED_IN_HISTORY_MONEY_COL_MAX_PX = 96;
export const CHECKED_IN_HISTORY_MONEY_COL_MIN_PX = 74;

export const CHECKED_IN_HISTORY_COL_DEFAULTS: Record<CheckedInHistoryColumnId, number> = {
  checkedIn: 104,
  qty: 60,
  productId: CHECKED_IN_HISTORY_PRODUCT_ID_COL_PX,
  brand: CHECKED_IN_HISTORY_BRAND_COL_PX,
  title: 280,
  model: CHECKED_IN_HISTORY_MODEL_COL_PX,
  category: CHECKED_IN_HISTORY_CATEGORY_COL_PX,
  condition: CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX,
  dispatch: CHECKED_IN_HISTORY_DISPATCH_COL_PX,
  retail: 96,
  price: 96,
};

export type CheckedInHistoryMeasureFonts = {
  header: string;
  body: string;
  bodyBold: string;
};

export type MeasureTextWidthFn = (text: string, font: string) => number;

export type CheckedInHistoryColumnWidths = {
  cols: Record<CheckedInHistoryColumnId, number>;
  productColPx: number;
  itemEnumColPx: number;
  moneyColPx: number;
  actionsColPx: number;
  tableWidth: number;
};

export function createCheckedInHistoryMeasureFonts(fontFamily: string): CheckedInHistoryMeasureFonts {
  const ff = fontFamily || 'sans-serif';
  return {
    header: `700 0.59375rem ${ff}`,
    body: `400 0.6875rem ${ff}`,
    bodyBold: `700 0.6875rem ${ff}`,
  };
}

function sumColumnWidths(cols: Record<CheckedInHistoryColumnId, number>): number {
  return CHECKED_IN_HISTORY_COLUMN_ORDER.reduce((sum, id) => sum + cols[id], 0);
}

function ceilPad(w: number, pad: number): number {
  return Math.ceil(w + pad);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function cellPad(columnId: CheckedInHistoryColumnId): number {
  if (columnId === 'retail' || columnId === 'price') {
    return CHECKED_IN_HISTORY_MONEY_CELL_PAD_PX;
  }
  if (CHECKED_IN_HISTORY_PRODUCT_COLS.includes(columnId as (typeof CHECKED_IN_HISTORY_PRODUCT_COLS)[number])) {
    return CHECKED_IN_HISTORY_PRODUCT_CELL_PAD_PX;
  }
  if (CHECKED_IN_HISTORY_ITEM_ENUM_COLS.includes(columnId as (typeof CHECKED_IN_HISTORY_ITEM_ENUM_COLS)[number])) {
    return CHECKED_IN_HISTORY_ITEM_ENUM_CELL_PAD_PX;
  }
  if (columnId === 'dispatch') {
    return CHECKED_IN_HISTORY_ITEM_ENUM_CELL_PAD_PX;
  }
  if (columnId === 'productId' || columnId === 'condition') {
    return CHECKED_IN_HISTORY_CELL_PAD_PX + CHECKED_IN_HISTORY_GROUP_DIVIDER_PAD_PX;
  }
  return CHECKED_IN_HISTORY_CELL_PAD_PX;
}

export function checkedInHistoryActionsColPx(showReprint: boolean, showDelete: boolean): number {
  if (!showReprint && !showDelete) return 8;
  if (showReprint && showDelete) return CHECKED_IN_HISTORY_ACTIONS_WITH_DELETE_COL_PX;
  return CHECKED_IN_HISTORY_ACTIONS_COL_PX;
}

function conditionColPxFromMeasured(measured: Record<CheckedInHistoryColumnId, number>): number {
  return clamp(measured.condition, CHECKED_IN_HISTORY_CONDITION_COL_MIN_PX, CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX);
}

function dispatchColPxFromMeasured(_measured: Record<CheckedInHistoryColumnId, number>): number {
  return CHECKED_IN_HISTORY_DISPATCH_COL_PX;
}

function moneyColPxFromMeasured(measured: Record<CheckedInHistoryColumnId, number>): number {
  const raw = Math.max(measured.retail, measured.price);
  return clamp(raw, CHECKED_IN_HISTORY_MONEY_COL_MIN_PX, CHECKED_IN_HISTORY_MONEY_COL_MAX_PX);
}

function normalizeConditionDispatchAndMoneyWidths(
  conditionColPx: number,
  dispatchColPx: number,
  moneyColPx: number,
): { conditionColPx: number; dispatchColPx: number; moneyColPx: number } {
  moneyColPx = clamp(moneyColPx, CHECKED_IN_HISTORY_MONEY_COL_MIN_PX, CHECKED_IN_HISTORY_MONEY_COL_MAX_PX);
  if (dispatchColPx <= moneyColPx) {
    dispatchColPx = Math.min(CHECKED_IN_HISTORY_DISPATCH_COL_PX, moneyColPx + 1);
  }
  dispatchColPx = clamp(dispatchColPx, CHECKED_IN_HISTORY_DISPATCH_COL_MIN_PX, CHECKED_IN_HISTORY_DISPATCH_COL_PX);
  conditionColPx = clamp(conditionColPx, CHECKED_IN_HISTORY_CONDITION_COL_MIN_PX, CHECKED_IN_HISTORY_CONDITION_COL_MAX_PX);
  return { conditionColPx, dispatchColPx, moneyColPx };
}

function productFieldsBlock(brandColPx: number, modelColPx: number, categoryColPx: number): number {
  return brandColPx + modelColPx + categoryColPx;
}

function shrinkProductFieldWidths(slack: number): {
  brandColPx: number;
  modelColPx: number;
  categoryColPx: number;
} {
  let brandColPx = CHECKED_IN_HISTORY_BRAND_COL_PX;
  let modelColPx = CHECKED_IN_HISTORY_MODEL_COL_PX;
  let categoryColPx = CHECKED_IN_HISTORY_CATEGORY_COL_PX;

  if (slack < productFieldsBlock(brandColPx, modelColPx, categoryColPx)) {
    categoryColPx = clamp(
      slack - CHECKED_IN_HISTORY_BRAND_COL_MIN_PX * 2,
      CHECKED_IN_HISTORY_CATEGORY_COL_MIN_PX,
      categoryColPx,
    );
    slack -= categoryColPx;
    const shared = clamp(Math.floor(slack / 2), CHECKED_IN_HISTORY_BRAND_COL_MIN_PX, brandColPx);
    brandColPx = shared;
    modelColPx = shared;
  }

  return { brandColPx, modelColPx, categoryColPx };
}

/** Autosize + fixed product fields + enum/money tiers + title flex. */
export function distributeCheckedInHistoryColumnWidths(
  measured: Record<CheckedInHistoryColumnId, number>,
  dataWidth: number,
): { cols: Record<CheckedInHistoryColumnId, number>; productColPx: number; itemEnumColPx: number; moneyColPx: number } {
  const autosizeSum = CHECKED_IN_HISTORY_AUTOSIZE_COLS.reduce((sum, id) => sum + measured[id], 0);
  const leadingFixedSum = autosizeSum + CHECKED_IN_HISTORY_PRODUCT_ID_COL_PX;
  let brandColPx = CHECKED_IN_HISTORY_BRAND_COL_PX;
  let modelColPx = CHECKED_IN_HISTORY_MODEL_COL_PX;
  let categoryColPx = CHECKED_IN_HISTORY_CATEGORY_COL_PX;
  let { conditionColPx, dispatchColPx, moneyColPx } = normalizeConditionDispatchAndMoneyWidths(
    conditionColPxFromMeasured(measured),
    dispatchColPxFromMeasured(measured),
    moneyColPxFromMeasured(measured),
  );

  const fixedBlock = () =>
    productFieldsBlock(brandColPx, modelColPx, categoryColPx)
    + conditionColPx
    + dispatchColPx
    + moneyColPx * CHECKED_IN_HISTORY_MONEY_COLS.length;

  let titlePx = dataWidth - leadingFixedSum - fixedBlock();

  if (titlePx < CHECKED_IN_HISTORY_TITLE_MIN_PX) {
    titlePx = CHECKED_IN_HISTORY_TITLE_MIN_PX;
    let slack = dataWidth - leadingFixedSum - titlePx;

    if (fixedBlock() > slack) {
      moneyColPx = CHECKED_IN_HISTORY_MONEY_COL_MIN_PX;
      slack -= moneyColPx * CHECKED_IN_HISTORY_MONEY_COLS.length;

      dispatchColPx = clamp(
        Math.floor(slack / 3),
        CHECKED_IN_HISTORY_DISPATCH_COL_MIN_PX,
        dispatchColPx,
      );
      slack -= dispatchColPx;

      conditionColPx = clamp(
        slack,
        CHECKED_IN_HISTORY_CONDITION_COL_MIN_PX,
        conditionColPx,
      );
      slack -= conditionColPx;

      ({ brandColPx, modelColPx, categoryColPx } = shrinkProductFieldWidths(slack));
    }

    titlePx = dataWidth - leadingFixedSum - fixedBlock();
  }

  const cols = {
    checkedIn: measured.checkedIn,
    qty: measured.qty,
    productId: CHECKED_IN_HISTORY_PRODUCT_ID_COL_PX,
    title: Math.max(CHECKED_IN_HISTORY_TITLE_MIN_PX, titlePx),
    brand: brandColPx,
    model: modelColPx,
    category: categoryColPx,
    condition: conditionColPx,
    dispatch: dispatchColPx,
    retail: moneyColPx,
    price: moneyColPx,
  } satisfies Record<CheckedInHistoryColumnId, number>;

  const drift = dataWidth - sumColumnWidths(cols);
  if (drift !== 0) {
    cols.title += drift;
  }

  return { cols, productColPx: brandColPx, itemEnumColPx: conditionColPx, moneyColPx };
}

function measureColumnIdeals(
  rows: CheckedInHistoryRow[],
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
  fonts: CheckedInHistoryMeasureFonts,
  options: { productDropdown?: boolean },
  measureTextWidth: MeasureTextWidthFn,
): Record<CheckedInHistoryColumnId, number> {
  let checkedInW = measureTextWidth('Date', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let qtyW =
    measureTextWidth('Qty', fonts.header)
    + CHECKED_IN_HISTORY_SORT_ICON_PX
    + CHECKED_IN_HISTORY_QTY_HEADER_EXTRA_PX;
  let productIdW = measureTextWidth('ID', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let brandW = measureTextWidth('Brand', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let modelW = measureTextWidth('Model', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let categoryW = measureTextWidth('Category', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let conditionW = measureTextWidth('Condition', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let dispatchW = measureTextWidth('Dispatch', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let retailW = measureTextWidth('Retail', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let priceW = measureTextWidth('Price', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;
  let titleW = measureTextWidth('Title', fonts.header) + CHECKED_IN_HISTORY_SORT_ICON_PX;

  for (const row of rows) {
    checkedInW = Math.max(checkedInW, measureTextWidth(formatCheckedInShortDateTime(row.checkedInAt), fonts.body));
    qtyW = Math.max(qtyW, measureTextWidth(String(row.qty), fonts.bodyBold));
    productIdW = Math.max(
      productIdW,
      measureTextWidth(checkedInProductIdText(row, fallbackProduct), fonts.bodyBold),
    );
    brandW = Math.max(brandW, measureTextWidth(checkedInBrandText(row, fallbackProduct), fonts.bodyBold));
    titleW = Math.max(titleW, measureTextWidth(checkedInTitleText(row, fallbackProduct), fonts.bodyBold));
    modelW = Math.max(modelW, measureTextWidth(checkedInModelText(row, fallbackProduct), fonts.body));
    categoryW = Math.max(categoryW, measureTextWidth(checkedInCategoryText(row, fallbackProduct), fonts.body));
    conditionW = Math.max(
      conditionW,
      measureTextWidth(row.item.condition_label || row.item.condition, fonts.body),
    );
    dispatchW = Math.max(
      dispatchW,
      measureTextWidth(queueDispatchLabel(row.item.dispatch), fonts.body),
    );
    retailW = Math.max(retailW, measureTextWidth(formatQueueMoney(row.item.retail), fonts.bodyBold));
    priceW = Math.max(priceW, measureTextWidth(formatQueueMoney(row.item.price), fonts.bodyBold));
  }

  conditionW += CHECKED_IN_HISTORY_ITEM_ENUM_DROPDOWN_EXTRA_PX;
  dispatchW += CHECKED_IN_HISTORY_ITEM_ENUM_DROPDOWN_EXTRA_PX;

  if (options.productDropdown) {
    productIdW += CHECKED_IN_HISTORY_PRODUCT_DROPDOWN_EXTRA_PX;
  }

  return {
    checkedIn: ceilPad(checkedInW, cellPad('checkedIn')),
    qty: Math.max(ceilPad(qtyW, cellPad('qty')), CHECKED_IN_HISTORY_QTY_MIN_PX),
    productId: CHECKED_IN_HISTORY_PRODUCT_ID_COL_PX,
    brand: ceilPad(brandW, cellPad('brand')),
    title: ceilPad(titleW, cellPad('title')),
    model: ceilPad(modelW, cellPad('model')),
    category: ceilPad(categoryW, cellPad('category')),
    condition: ceilPad(conditionW, cellPad('condition')),
    dispatch: ceilPad(dispatchW, cellPad('dispatch')),
    retail: ceilPad(retailW, cellPad('retail')),
    price: ceilPad(priceW, cellPad('price')),
  };
}

export function computeCheckedInHistoryColumnWidths(
  rows: CheckedInHistoryRow[],
  containerWidth: number,
  fallbackProduct: ProcessingWorkspaceProductDTO | null,
  fonts: CheckedInHistoryMeasureFonts,
  options: {
    productDropdown?: boolean;
    showReprint?: boolean;
    showDelete?: boolean;
  } = {},
  measureTextWidth: MeasureTextWidthFn = defaultMeasureTextWidth,
): CheckedInHistoryColumnWidths {
  const actionsColPx = checkedInHistoryActionsColPx(
    options.showReprint ?? false,
    options.showDelete ?? false,
  );
  const dataWidth = Math.max(0, containerWidth - actionsColPx);

  if (dataWidth <= 0) {
    return {
      cols: { ...CHECKED_IN_HISTORY_COL_DEFAULTS },
      productColPx: CHECKED_IN_HISTORY_COL_DEFAULTS.brand,
      itemEnumColPx: CHECKED_IN_HISTORY_COL_DEFAULTS.condition,
      moneyColPx: CHECKED_IN_HISTORY_COL_DEFAULTS.retail,
      actionsColPx,
      tableWidth: 0,
    };
  }

  const measured =
    rows.length === 0 ?
      { ...CHECKED_IN_HISTORY_COL_DEFAULTS }
    : measureColumnIdeals(rows, fallbackProduct, fonts, options, measureTextWidth);

  const { cols, productColPx, itemEnumColPx, moneyColPx } = distributeCheckedInHistoryColumnWidths(measured, dataWidth);

  return {
    cols,
    productColPx,
    itemEnumColPx,
    moneyColPx,
    actionsColPx,
    tableWidth: containerWidth,
  };
}

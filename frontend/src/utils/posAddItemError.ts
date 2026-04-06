import { isAxiosError } from 'axios';

/** Error body from POST /pos/carts/:id/add-item/ (DRF). */
export interface PosAddItemErrorBody {
  detail?: string | string[];
  code?: string;
  item_id?: number;
  sku?: string;
  title?: string;
}

export type PosAddItemErrorKind =
  | 'not_found'
  | 'already_sold'
  | 'sku_required'
  | 'network'
  | 'unknown';

export interface ParsedPosAddItemError {
  kind: PosAddItemErrorKind;
  message: string;
  itemId?: number;
  sku?: string;
  title?: string;
}

const FALLBACK = 'Unable to add this item. Try again or ask a lead.';

function pickDetail(data: unknown): string | undefined {
  const raw = (data as PosAddItemErrorBody | undefined)?.detail;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'string') return raw[0];
  return undefined;
}

const ALREADY_SOLD_COPY =
  'Inventory shows this item as already sold. Pull the tag and check with a lead if the item is still on the floor.';

/**
 * Map axios errors from POS add-item to stable kinds and user-facing copy.
 */
export function parsePosAddItemError(err: unknown): ParsedPosAddItemError {
  if (!isAxiosError(err)) {
    return { kind: 'network', message: FALLBACK };
  }
  const status = err.response?.status;
  const data = err.response?.data as PosAddItemErrorBody | undefined;
  const code = data?.code;
  const detail = pickDetail(data);
  const itemId = typeof data?.item_id === 'number' ? data.item_id : undefined;
  const sku = typeof data?.sku === 'string' ? data.sku : undefined;
  const title = typeof data?.title === 'string' ? data.title : undefined;

  if (code === 'ITEM_ALREADY_SOLD') {
    return {
      kind: 'already_sold',
      message: ALREADY_SOLD_COPY,
      itemId,
      sku,
      title,
    };
  }
  if (status === 404 || code === 'ITEM_NOT_FOUND') {
    return {
      kind: 'not_found',
      message: detail ?? 'No item with this SKU.',
    };
  }
  if (code === 'SKU_REQUIRED') {
    return { kind: 'sku_required', message: detail ?? 'SKU is required.' };
  }
  if (status === 400 && typeof detail === 'string' && /already sold/i.test(detail)) {
    return {
      kind: 'already_sold',
      message: ALREADY_SOLD_COPY,
      itemId,
      sku,
      title,
    };
  }
  return {
    kind: 'unknown',
    message: detail ?? FALLBACK,
  };
}

export function snackbarVariantForPosAddItemError(
  kind: PosAddItemErrorKind,
): 'warning' | 'error' | 'info' {
  if (kind === 'already_sold' || kind === 'sku_required') return 'warning';
  return 'error';
}

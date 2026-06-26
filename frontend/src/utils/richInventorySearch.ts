export type RichInventoryEntity = 'items' | 'products' | 'checkins' | 'vendors' | 'orders';

export interface RichSearchChip {
  key: string;
  value: string;
  label: string;
}

export interface ParsedRichSearch {
  text: string;
  filters: Record<string, string>;
  chips: RichSearchChip[];
}

const ITEM_KEY_ALIASES: Record<string, string> = {
  checkin: 'checkin',
  check_in: 'checkin',
  item_check_in: 'checkin',
  product: 'product',
  product_id: 'product',
  status: 'status',
  'item.status': 'status',
  printed: 'printed',
  label_printed: 'printed',
  unprinted: 'printed',
  condition: 'condition',
  source: 'source',
  purchase_order: 'purchase_order',
  order: 'purchase_order',
  po: 'purchase_order',
  ids: 'ids',
};

const CHECKIN_KEY_ALIASES: Record<string, string> = {
  checkin: 'checkin',
  check_in: 'checkin',
  item_check_in: 'checkin',
  product: 'product',
  product_id: 'product',
  order: 'order',
  purchase_order: 'order',
  po: 'order',
  origin: 'origin',
  id: 'checkin',
};

const PRODUCT_KEY_ALIASES: Record<string, string> = {
  product: 'product',
  id: 'product',
  product_id: 'product',
  category: 'category',
};

const VENDOR_KEY_ALIASES: Record<string, string> = {
  vendor: 'vendor',
  id: 'vendor',
  type: 'type',
  vendor_type: 'type',
  active: 'active',
  is_active: 'active',
};

const ORDER_KEY_ALIASES: Record<string, string> = {
  order: 'order',
  id: 'order',
  po: 'order',
  vendor: 'vendor',
  status: 'status',
};

const FILTER_BLOCK_RE = /\{([^{}]+)\}/g;

const ITEM_FILTER_ORDER = ['product', 'status', 'printed', 'checkin', 'condition', 'source', 'purchase_order', 'ids'];
const CHECKIN_FILTER_ORDER = ['checkin', 'product', 'order', 'origin'];
const PRODUCT_FILTER_ORDER = ['product', 'category'];
const VENDOR_FILTER_ORDER = ['vendor', 'type', 'active'];
const ORDER_FILTER_ORDER = ['order', 'vendor', 'status'];

function aliasMap(entity: RichInventoryEntity): Record<string, string> {
  switch (entity) {
    case 'products':
      return PRODUCT_KEY_ALIASES;
    case 'checkins':
      return CHECKIN_KEY_ALIASES;
    case 'vendors':
      return VENDOR_KEY_ALIASES;
    case 'orders':
      return ORDER_KEY_ALIASES;
    default:
      return ITEM_KEY_ALIASES;
  }
}

function filterOrder(entity: RichInventoryEntity): string[] {
  switch (entity) {
    case 'products':
      return PRODUCT_FILTER_ORDER;
    case 'checkins':
      return CHECKIN_FILTER_ORDER;
    case 'vendors':
      return VENDOR_FILTER_ORDER;
    case 'orders':
      return ORDER_FILTER_ORDER;
    default:
      return ITEM_FILTER_ORDER;
  }
}

function unquote(val: string): string {
  if (
    (val.startsWith('"') && val.endsWith('"'))
    || (val.startsWith("'") && val.endsWith("'"))
  ) {
    return val.slice(1, -1);
  }
  return val;
}

function normalizeKey(rawKey: string, entity: RichInventoryEntity): string | null {
  const key = rawKey.trim().toLowerCase();
  return aliasMap(entity)[key] ?? null;
}

function parseFilterBlock(
  block: string,
  out: Record<string, string>,
  entity: RichInventoryEntity,
): void {
  for (const part of block.split(/[;,]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const rawKey = trimmed.slice(0, eqIdx).trim();
    const rawVal = unquote(trimmed.slice(eqIdx + 1).trim());
    if (!rawVal) continue;
    const key = normalizeKey(rawKey, entity);
    if (key) out[key] = rawVal;
  }
}

function chipLabel(key: string, value: string, entity: RichInventoryEntity): string {
  switch (entity) {
    case 'items':
      if (key === 'product') return `Product #${value}`;
      if (key === 'status') return `Status: ${value.replace(/_/g, ' ')}`;
      if (key === 'printed') return value === 'false' ? 'Unprinted' : 'Printed';
      if (key === 'checkin') return `Check-in #${value}`;
      if (key === 'condition') return `Condition: ${value.replace(/_/g, ' ')}`;
      if (key === 'source') return `Source: ${value.replace(/_/g, ' ')}`;
      if (key === 'purchase_order') return `PO #${value}`;
      if (key === 'ids') return `Item IDs (${value.split(',').filter(Boolean).length})`;
      break;
    case 'products':
      if (key === 'product') return `Product #${value}`;
      if (key === 'category') return `Category: ${value}`;
      break;
    case 'checkins':
      if (key === 'checkin') return `Check-in #${value}`;
      if (key === 'product') return `Product #${value}`;
      if (key === 'order') return `PO #${value}`;
      if (key === 'origin') return `Origin: ${value.replace(/_/g, ' ')}`;
      break;
    case 'vendors':
      if (key === 'vendor') return `Vendor #${value}`;
      if (key === 'type') return `Type: ${value.replace(/_/g, ' ')}`;
      if (key === 'active') return `Active: ${value}`;
      break;
    case 'orders':
      if (key === 'order') return `Order #${value}`;
      if (key === 'vendor') return `Vendor #${value}`;
      if (key === 'status') return `Status: ${value.replace(/_/g, ' ')}`;
      break;
    default:
      break;
  }
  return `${key}=${value}`;
}

function buildChips(filters: Record<string, string>, entity: RichInventoryEntity): RichSearchChip[] {
  const order = filterOrder(entity);
  const keys = [...order.filter((k) => filters[k]), ...Object.keys(filters).filter((k) => !order.includes(k))];
  return keys.map((key) => ({
    key,
    value: filters[key],
    label: chipLabel(key, filters[key], entity),
  }));
}

/** Parse free text plus `{field=value; ...}` filter blocks from a search box value. */
export function parseRichSearch(raw: string, entity: RichInventoryEntity = 'items'): ParsedRichSearch {
  const filters: Record<string, string> = {};
  let text = raw;
  for (const match of raw.matchAll(FILTER_BLOCK_RE)) {
    text = text.replace(match[0], ' ');
    parseFilterBlock(match[1], filters, entity);
  }
  text = text.replace(/\s+/g, ' ').trim();
  return { text, filters, chips: buildChips(filters, entity) };
}

/** Format free text and structured filters back into a search-box / URL value. */
export function formatRichSearch(opts: {
  text?: string;
  filters?: Record<string, string | number | undefined | null>;
  entity?: RichInventoryEntity;
}): string {
  const entity = opts.entity ?? 'items';
  const parts: string[] = [];
  if (opts.text?.trim()) parts.push(opts.text.trim());
  const entries = Object.entries(opts.filters ?? {})
    .filter(([, v]) => v !== '' && v != null && String(v).trim())
    .map(([k, v]) => [k, String(v).trim()] as const);
  if (entries.length) {
    const order = filterOrder(entity);
    entries.sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    const inner = entries.map(([k, v]) => `${k}=${v}`).join('; ');
    parts.push(`{${inner}}`);
  }
  return parts.join(' ').trim();
}

/** Remove one structured filter key from a rich search string. */
export function removeRichSearchFilter(raw: string, filterKey: string, entity: RichInventoryEntity = 'items'): string {
  const parsed = parseRichSearch(raw, entity);
  if (!parsed.filters[filterKey]) return raw.trim();
  const nextFilters = { ...parsed.filters };
  delete nextFilters[filterKey];
  return formatRichSearch({ text: parsed.text, filters: nextFilters, entity });
}

export function itemFiltersToApiParams(parsed: ParsedRichSearch): Record<string, string | undefined> {
  const f = parsed.filters;
  const checkin = f.checkin;
  return {
    search: parsed.text || undefined,
    product: f.product,
    status: f.status,
    label_printed: f.printed,
    item_check_in: checkin,
    ids: !checkin && f.ids ? f.ids : undefined,
    condition: f.condition,
    source: f.source,
    purchase_order: f.purchase_order,
  };
}

export function checkInFiltersToApiParams(parsed: ParsedRichSearch): Record<string, string | undefined> {
  const f = parsed.filters;
  return {
    search: parsed.text || undefined,
    product: f.product,
    purchase_order: f.order,
    origin: f.origin,
    item_check_in: f.checkin,
  };
}

export function productFiltersToApiParams(parsed: ParsedRichSearch): Record<string, string | undefined> {
  const f = parsed.filters;
  return {
    search: parsed.text || undefined,
    product: f.product,
    category: f.category,
  };
}

export function vendorFiltersToApiParams(parsed: ParsedRichSearch): Record<string, string | undefined> {
  const f = parsed.filters;
  const active = f.active?.trim().toLowerCase();
  return {
    search: parsed.text || undefined,
    vendor: f.vendor,
    vendor_type: f.type,
    is_active: active === 'true' || active === '1' ? 'true'
      : active === 'false' || active === '0' ? 'false'
        : undefined,
  };
}

export function orderFiltersToApiParams(parsed: ParsedRichSearch): Record<string, string | undefined> {
  const f = parsed.filters;
  return {
    search: parsed.text || undefined,
    order: f.order,
    vendor: f.vendor,
    status: f.status,
  };
}

/** Build Inventory Workbench items tab URL with a rich `q` search param. */
export function inventoryWorkbenchItemsUrl(opts: {
  text?: string;
  filters?: Record<string, string | number>;
}): string {
  const q = formatRichSearch({ ...opts, entity: 'items' });
  return inventoryWorkbenchUrl({ tab: 'items', q: q || undefined });
}

/** Open a single catalog item on the workbench items tab. */
export function inventoryWorkbenchItemUrl(item: { id: number; sku: string }): string {
  return inventoryWorkbenchUrl({
    tab: 'items',
    q: item.sku,
    selected: { type: 'item', id: item.id, label: item.sku },
  });
}

/** Inventory Workbench URL focused on a catalog item (Items tab). */
export function itemCatalogWorkbenchUrl(catalogItemId: number, sku: string): string {
  return inventoryWorkbenchItemUrl({ id: catalogItemId, sku });
}

/** @deprecated Use inventoryWorkbenchItemsUrl — kept for call-site compatibility. */
export function manageItemsSearchUrl(opts: {
  text?: string;
  filters?: Record<string, string | number>;
}): string {
  return inventoryWorkbenchItemsUrl(opts);
}

export type WorkbenchTab = 'products' | 'checkins' | 'items';

export type WorkbenchSelection =
  | { type: 'product'; id: number; label?: string }
  | { type: 'checkin'; id: number; label?: string }
  | { type: 'item'; id: number; label?: string };

export function parseWorkbenchSelection(raw: string | null | undefined): WorkbenchSelection | null {
  if (!raw) return null;
  const m = raw.match(/^(product|checkin|item):(\d+)$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const id = Number.parseInt(m[2], 10);
  if (!Number.isFinite(id)) return null;
  if (kind === 'product') return { type: 'product', id };
  if (kind === 'checkin') return { type: 'checkin', id };
  return { type: 'item', id };
}

export function formatWorkbenchSelection(sel: WorkbenchSelection): string {
  return `${sel.type}:${sel.id}`;
}

/** Build Inventory Workbench URL with tab, search, and selection state. */
export function inventoryWorkbenchUrl(opts: {
  tab?: WorkbenchTab;
  q?: string;
  selected?: WorkbenchSelection | null;
  draft?: 'checkin' | null;
}): string {
  const params = new URLSearchParams();
  if (opts.tab && opts.tab !== 'products') params.set('tab', opts.tab);
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  if (opts.selected) params.set('selected', formatWorkbenchSelection(opts.selected));
  if (opts.draft === 'checkin') params.set('draft', 'checkin');
  const qs = params.toString();
  return qs ? `/inventory/workbench?${qs}` : '/inventory/workbench';
}

export function productRichSearch(productId: number): string {
  return formatRichSearch({ filters: { product: productId }, entity: 'products' });
}

/** Inventory Workbench URL focused on a catalog product (Products tab). */
export function productCatalogWorkbenchUrl(productId: number, label?: string): string {
  return inventoryWorkbenchUrl({
    q: productRichSearch(productId),
    selected: {
      type: 'product',
      id: productId,
      label: label?.trim() || String(productId),
    },
  });
}

export function checkInRichSearch(opts: { product?: number; checkin?: number; order?: number }): string {
  return formatRichSearch({ filters: opts, entity: 'checkins' });
}

export function itemRichSearch(opts: {
  product?: number;
  checkin?: number;
  sku?: string;
  status?: string;
  order?: number;
  printed?: boolean;
}): string {
  const filters: Record<string, string | number> = {};
  if (opts.product) filters.product = opts.product;
  if (opts.checkin) filters.checkin = opts.checkin;
  if (opts.order) filters.purchase_order = opts.order;
  if (opts.status) filters.status = opts.status;
  if (opts.printed === true) filters.printed = 'true';
  if (opts.printed === false) filters.printed = 'false';
  const text = opts.sku?.trim() || '';
  return formatRichSearch({ text, filters, entity: 'items' });
}

/** Convert legacy item list URL params into a rich search string. */
export function legacyItemParamsToRichSearch(params: URLSearchParams): string | null {
  const filters: Record<string, string> = {};
  const product = params.get('product') || params.get('product_id');
  if (product) filters.product = product;
  const status = params.get('status');
  if (status) filters.status = status;
  const checkIn = params.get('item_check_in');
  if (checkIn) filters.checkin = checkIn;
  const ids = params.get('ids');
  if (ids && !checkIn) filters.ids = ids;
  if (!Object.keys(filters).length) return null;
  return formatRichSearch({ filters, entity: 'items' });
}

/** Allowed vendors on Purchase Orders dashboard list/summary; keep in sync with `apps/inventory/constants.py` `PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES`. */
export const PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES = [
  'Walmart',
  'Target',
  'Costco',
  'Essendant',
  'Wayfair',
  'Home Depot',
  'Amazon',
] as const;

const NAME_SET = new Set<string>(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES);

export function isPurchaseOrderDashboardVendorName(name: string): boolean {
  return NAME_SET.has(name);
}

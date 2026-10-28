/**
 * The one place a scanned tag code turns into a SKU (2026-10-28). The Thrift+ Perks price tag's QR is a link,
 * `HTTPS://ECOTHRIFT.US/I/<SKU>` (all capitals, so the QR stays small), so a phone camera opens the item; every scan
 * box in Dash strips it back to the SKU here. Older tags (a plain SKU) come through as they are.
 *
 * Mirrors `apps/inventory/services/scan_code.py` `sku_from_scan`.
 */

/** Our tag link in any case, with or without `https://` (a keyboard scanner may type `https;//`) or `www.`. */
const TAG_LINK = /^(?:[a-z]+[:;]\/\/)?(?:www\.)?ecothrift\.us\/i\/([A-Za-z0-9-]{3,20})\/?(?:[?#].*)?$/i;

/** The start of the link the tag's QR holds. */
export const TAG_LINK_BASE = 'HTTPS://ECOTHRIFT.US/I/';

/** What the Thrift+ Perks tag's QR holds for a SKU. */
export function tagLink(sku: string): string {
  return `${TAG_LINK_BASE}${sku.trim().toUpperCase()}`;
}

/** The SKU in a scanned tag link (upper case); anything else comes back trimmed and otherwise as it was. */
export function skuFromScan(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  const match = text.match(TAG_LINK);
  return match ? match[1].toUpperCase() : text;
}

/** Whether a scan is our tag link. */
export function isTagLink(raw: string | null | undefined): boolean {
  return TAG_LINK.test((raw ?? '').trim());
}

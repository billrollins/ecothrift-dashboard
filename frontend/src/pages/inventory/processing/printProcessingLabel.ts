import { localPrintService, type LocalPrintRequest } from '../../../services/localPrintService';
import type { Item } from '../../../types/inventory.types';

type LabelInput = Pick<Item, 'sku' | 'price'> &
  Partial<Pick<Item, 'product_title' | 'product_brand' | 'product_number'>>;

function toLabelRequest(item: LabelInput, priceOverride?: string): LocalPrintRequest {
  const price = priceOverride ?? item.price;
  return {
    text: price ? `$${Number.parseFloat(String(price)).toFixed(2)}` : '$0.00',
    qr_data: item.sku,
    product_title: item.product_title || item.sku,
    product_brand: item.product_brand?.trim() || undefined,
    product_model: item.product_number?.trim() || undefined,
    include_text: true,
  };
}

/** After Django persists check-in; mirrors legacy ProcessingPage helper (V-22 toast on failure). */
export async function printProcessingLabel(item: LabelInput, priceOverride?: string): Promise<boolean> {
  try {
    await localPrintService.printLabel(toLabelRequest(item, priceOverride));
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch labels: ONE `/print/labels` call for the whole check-in (the server
 * resolves the printer once and spools every label). Falls back to the legacy
 * staggered per-label loop when the installed print server predates the
 * batch endpoint.
 */
export async function printProcessingLabelsStaggered(
  items: LabelInput[],
  priceOverride?: string,
): Promise<{ succeeded: number; failed: number }> {
  if (!items.length) return { succeeded: 0, failed: 0 };
  try {
    const result = await localPrintService.printLabelBatch(items.map((it) => toLabelRequest(it, priceOverride)));
    return { succeeded: result.printed, failed: result.failed };
  } catch {
    // Older print server exe — per-label fallback below.
  }
  // First label doubles as a health probe — if it fails, don't grind through
  // the rest at 200ms apiece against a dead server.
  const firstOk = await printProcessingLabel(items[0], priceOverride);
  if (!firstOk) return { succeeded: 0, failed: items.length };
  let succeeded = 1;
  let failed = 0;
  const STAGGER_MS = 200;
  await Promise.allSettled(
    items.slice(1).map(
      (item, i) =>
        new Promise<boolean>((resolve) => {
          setTimeout(async () => {
            const ok = await printProcessingLabel(item, priceOverride);
            if (ok) succeeded++;
            else failed++;
            resolve(ok);
          }, i * STAGGER_MS);
        }),
    ),
  );
  return { succeeded, failed };
}

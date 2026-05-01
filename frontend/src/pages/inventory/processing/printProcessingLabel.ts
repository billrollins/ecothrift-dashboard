import { localPrintService } from '../../../services/localPrintService';
import type { Item } from '../../../types/inventory.types';

/** After Django persists check-in; mirrors legacy ProcessingPage helper (V-22 toast on failure). */
export async function printProcessingLabel(
  item: Pick<Item, 'sku' | 'title' | 'price'> & Partial<Pick<Item, 'brand' | 'product_number'>>,
  priceOverride?: string,
): Promise<boolean> {
  try {
    const price = priceOverride ?? item.price;
    await localPrintService.printLabel({
      text: price ? `$${Number.parseFloat(String(price)).toFixed(2)}` : '$0.00',
      qr_data: item.sku,
      product_title: item.title,
      product_brand: item.brand?.trim() || undefined,
      product_model: item.product_number?.trim() || undefined,
      include_text: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** Staggered prints for print-multiple (same pattern as legacy batch labels). */
export async function printProcessingLabelsStaggered(
  items: Array<Pick<Item, 'sku' | 'title' | 'price'> & Partial<Pick<Item, 'brand' | 'product_number'>>>,
  priceOverride?: string,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  const STAGGER_MS = 200;
  await Promise.allSettled(
    items.map(
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

import type { ReentryItem } from '../../../api/reentry.api';
import { printProcessingLabelsAndMarkPrinted } from '../processing/printProcessingLabel';

/**
 * Print the tag for an item that just left the list, through the same tag printing Processing uses: the price tag
 * after Price again, the restoration tag after Send to Restoration (unless this computer prints a price tag for
 * those, its Printing choice). True when it printed.
 */
export async function printReentryTag(item: ReentryItem): Promise<boolean> {
  try {
    const result = await printProcessingLabelsAndMarkPrinted([{
      id: item.id,
      sku: item.sku,
      price: item.price ?? '0.00',
      product_title: item.product_title,
      product_brand: item.product_brand,
      product_number: item.product_number,
      tag_retail: item.tag_retail,
      ...(item.restoration_tag ? { restoration_tag: item.restoration_tag } : {}),
    }]);
    return result.succeeded === 1;
  } catch {
    return false;
  }
}

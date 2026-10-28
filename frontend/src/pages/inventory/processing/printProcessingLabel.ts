import { localPrintService, type LocalPrintRequest } from '../../../services/localPrintService';
import { markItemsLabelsPrinted } from '../../../api/inventory.api';
import type { Item } from '../../../types/inventory.types';
import {
  renderRestorationTagPng,
  tagDpiForStock,
  type RestorationTagFacts,
} from '../../restoration/tag/restorationTag';

type LabelInput = Pick<Item, 'sku' | 'price'> &
  Partial<Pick<Item, 'product_title' | 'product_brand' | 'product_number'>> & {
    /** `printed_items_preview` uses `title` / `brand`; Item DTOs use `product_*`. */
    title?: string;
    brand?: string;
    id?: number;
    /** The retail the tag may show (server decides per `tags.retail_on_tag`); null prints none. */
    tag_retail?: string | null;
    /** Going to Restoration: print the restoration tag, not the price tag (owner, 2026-10-28). */
    restoration_tag?: RestorationTagFacts;
  };

/** "Retail $49.99", or undefined when the tag shows no retail. */
export function tagRetailText(tagRetail: string | null | undefined): string | undefined {
  const value = tagRetail == null || tagRetail === '' ? Number.NaN : Number.parseFloat(String(tagRetail));
  return Number.isFinite(value) && value > 0 ? `Retail $${value.toFixed(2)}` : undefined;
}

export type PrintLabelsResult = {
  succeeded: number;
  failed: number;
  succeededItemIds: number[];
  markFailed: boolean;
};

export function toLabelRequest(item: LabelInput, priceOverride?: string): LocalPrintRequest {
  const price = priceOverride ?? item.price;
  // A new price makes the server's retail decision stale (it checks retail against the price): print none.
  const retailText = priceOverride == null ? tagRetailText(item.tag_retail) : undefined;
  return {
    text: price ? `$${Number.parseFloat(String(price)).toFixed(2)}` : '$0.00',
    qr_data: item.sku,
    product_title: item.product_title || item.title || item.sku,
    product_brand: (item.product_brand || item.brand)?.trim() || undefined,
    product_model: item.product_number?.trim() || undefined,
    include_text: true,
    ...(retailText ? { retail_text: retailText } : {}),
  };
}

function collectItemIds(items: LabelInput[], count: number): number[] {
  return items
    .slice(0, count)
    .map((item) => item.id)
    .filter((id): id is number => id != null);
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

/** The label stock this station prints on; 3x2 when the print server cannot say. */
async function stockPreset(): Promise<string> {
  try {
    return (await localPrintService.getSettings()).label_size_preset ?? '3x2';
  } catch {
    return '3x2';
  }
}

/**
 * Restoration tags (owner, 2026-10-28): drawn here and printed through `/print/image-copies`, one per item, in order.
 * Stops at the first failure, like the price tags' health probe.
 */
export async function printRestorationTags(
  items: Array<Pick<LabelInput, 'sku' | 'id' | 'product_title' | 'title'> & { restoration_tag: RestorationTagFacts }>,
): Promise<{ succeeded: number; failed: number; succeededItemIds: number[] }> {
  const succeededItemIds: number[] = [];
  if (!items.length) return { succeeded: 0, failed: 0, succeededItemIds };
  const dpi = tagDpiForStock(await stockPreset());
  let succeeded = 0;
  for (const item of items) {
    try {
      const image = renderRestorationTagPng({
        ...item.restoration_tag,
        sku: item.sku,
        title: item.product_title || item.title || item.sku,
      });
      await localPrintService.printImageCopies({ image_base64: image, copies: 1, dpi, doc_name: `Restoration ${item.sku}` });
    } catch {
      break;
    }
    succeeded += 1;
    if (item.id != null) succeededItemIds.push(item.id);
  }
  return { succeeded, failed: items.length - succeeded, succeededItemIds };
}

/**
 * Batch labels: ONE `/print/labels` call for the whole check-in (the server
 * resolves the printer once and spools every label). Falls back to the legacy
 * staggered per-label loop when the installed print server predates the
 * batch endpoint. Items going to Restoration get the restoration tag instead.
 */
export async function printProcessingLabelsStaggered(
  items: LabelInput[],
  priceOverride?: string,
): Promise<{ succeeded: number; failed: number; succeededItemIds: number[] }> {
  if (!items.length) return { succeeded: 0, failed: 0, succeededItemIds: [] };
  const resto = items.filter((it): it is LabelInput & { restoration_tag: RestorationTagFacts } => it.restoration_tag != null);
  if (resto.length) {
    const rest = items.filter((it) => it.restoration_tag == null);
    const tags = await printRestorationTags(resto);
    const prices = rest.length ? await printPriceLabels(rest, priceOverride) : { succeeded: 0, failed: 0, succeededItemIds: [] };
    return {
      succeeded: tags.succeeded + prices.succeeded,
      failed: tags.failed + prices.failed,
      succeededItemIds: [...tags.succeededItemIds, ...prices.succeededItemIds],
    };
  }
  return printPriceLabels(items, priceOverride);
}

async function printPriceLabels(
  items: LabelInput[],
  priceOverride?: string,
): Promise<{ succeeded: number; failed: number; succeededItemIds: number[] }> {
  try {
    const result = await localPrintService.printLabelBatch(items.map((it) => toLabelRequest(it, priceOverride)));
    if (result.failed === 0) {
      return {
        succeeded: result.printed,
        failed: 0,
        succeededItemIds: collectItemIds(items, items.length),
      };
    }
    return {
      succeeded: result.printed,
      failed: result.failed,
      succeededItemIds: collectItemIds(items, result.printed),
    };
  } catch {
    // Older print server exe - per-label fallback below.
  }
  // First label doubles as a health probe - if it fails, don't grind through
  // the rest at 200ms apiece against a dead server.
  const succeededItemIds: number[] = [];
  const firstOk = await printProcessingLabel(items[0], priceOverride);
  if (!firstOk) return { succeeded: 0, failed: items.length, succeededItemIds };
  if (items[0].id != null) succeededItemIds.push(items[0].id);
  let succeeded = 1;
  let failed = 0;
  const STAGGER_MS = 200;
  await Promise.allSettled(
    items.slice(1).map(
      (item, i) =>
        new Promise<boolean>((resolve) => {
          setTimeout(async () => {
            const ok = await printProcessingLabel(item, priceOverride);
            if (ok) {
              succeeded++;
              if (item.id != null) succeededItemIds.push(item.id);
            } else {
              failed++;
            }
            resolve(ok);
          }, i * STAGGER_MS);
        }),
    ),
  );
  return { succeeded, failed, succeededItemIds };
}

/** Print labels locally, then persist label_printed_at for successful item IDs. */
export async function printProcessingLabelsAndMarkPrinted(
  items: LabelInput[],
  priceOverride?: string,
): Promise<PrintLabelsResult> {
  const { succeeded, failed, succeededItemIds } = await printProcessingLabelsStaggered(items, priceOverride);
  let markFailed = false;
  if (succeededItemIds.length > 0) {
    try {
      await markItemsLabelsPrinted(succeededItemIds);
    } catch {
      markFailed = true;
    }
  }
  return { succeeded, failed, succeededItemIds, markFailed };
}

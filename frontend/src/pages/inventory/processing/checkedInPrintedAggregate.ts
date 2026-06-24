import type { ProcessingWorkspaceItemDTO } from '../../../types/inventory.types';

type PrintableItem = Pick<ProcessingWorkspaceItemDTO, 'sku' | 'label_printed'>;

export function checkInPrintedCount(items: PrintableItem[]): number {
  return items.filter((item) => item.label_printed).length;
}

export function checkInAllLabelsPrinted(items: PrintableItem[], qty: number): boolean {
  return qty > 0 && checkInPrintedCount(items) >= qty;
}

export function checkInPrintedDisplay(
  items: PrintableItem[],
  qty: number,
): { text: string; allPrinted: boolean; unprintedSkus: string[] } {
  const printedCount = checkInPrintedCount(items);
  const allPrinted = qty > 0 && printedCount >= qty;
  const unprintedSkus = items.filter((item) => !item.label_printed).map((item) => item.sku);
  return {
    text: allPrinted ? '✓' : `${printedCount}/${qty}`,
    allPrinted,
    unprintedSkus,
  };
}

export function checkInPrintActionLabel(items: PrintableItem[], qty: number): 'Print' | 'Reprint' {
  return checkInAllLabelsPrinted(items, qty) ? 'Reprint' : 'Print';
}

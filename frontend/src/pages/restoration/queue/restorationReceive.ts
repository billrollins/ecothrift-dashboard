import type { PrintedItemPreview } from '../../../api/inventory.api';
import type {
  RestorationJobDTO,
  RestorationJobProcessingCheckInPayload,
  RestorationOutputCreateItemPayload,
} from '../../../types/inventory.types';

export type ReceiveNewProductDraft = {
  title: string;
  brand: string;
  category: string;
  model: string;
  upc: string;
};

export type ReceiveProductChoice =
  | { mode: 'keep' }
  | { mode: 'existing'; productId: number }
  | { mode: 'none' }
  | ({ mode: 'new' } & ReceiveNewProductDraft);

export type RestorationReceivePartSubmit = {
  outputId: number;
  payload: RestorationOutputCreateItemPayload;
};

export type RestorationReceiveSubmit = {
  main: RestorationJobProcessingCheckInPayload;
  mainProduct: ReceiveProductChoice;
  mainItemIds: number[];
  parts: RestorationReceivePartSubmit[];
  print: boolean;
};

const DESTINATION_TO_DISPATCH: Record<string, string> = {
  processing: 'on_shelf',
  storage: 'back_storage',
  salvage: 'salvage',
  online_sales: 'online_sales',
};

export function emptyNewProductDraft(): ReceiveNewProductDraft {
  return { title: '', brand: '', category: '', model: '', upc: '' };
}

export function money(value: string | number | null | undefined): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function receivePriceReady(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0;
}

export function receiveIsSalvage(dispatch: string | null | undefined, condition?: string | null): boolean {
  return dispatch === 'salvage' || condition === 'salvage';
}

export function receiveProductReady(choice: ReceiveProductChoice): boolean {
  if (choice.mode === 'keep' || choice.mode === 'none') return true;
  if (choice.mode === 'existing') return Number.isFinite(choice.productId) && choice.productId > 0;
  return choice.title.trim() !== '';
}

export function productChoicePayload(choice: ReceiveProductChoice): Partial<RestorationOutputCreateItemPayload> {
  if (choice.mode === 'keep') return {};
  if (choice.mode === 'none') return { product_mode: 'none' };
  if (choice.mode === 'existing') {
    return { product_mode: 'existing', product_id: choice.productId };
  }
  return {
    product_mode: 'new',
    title: choice.title.trim(),
    brand: choice.brand.trim(),
    category: choice.category.trim(),
    model: choice.model.trim(),
    upc: choice.upc.trim(),
  };
}

/** Parent retail after minting parts[0..index] inclusive. */
export function parentRetailAfterPart(starting: number, partRetails: number[], index: number): number {
  const taken = partRetails.slice(0, index + 1).reduce((sum, n) => sum + n, 0);
  return Math.round((starting - taken) * 100) / 100;
}

export function familyAfterReceive(mainRetail: number, partRetails: number[]): number {
  return Math.round((mainRetail + partRetails.reduce((sum, n) => sum + n, 0)) * 100) / 100;
}

export function splitBalances(starting: number, mainRetail: number, partRetails: number[]): boolean {
  return Math.abs(familyAfterReceive(mainRetail, partRetails) - starting) < 0.005;
}

/** Zero-retail parts are salvage and do not have to drop the parent. */
export function mintSequenceValid(starting: number, partRetails: number[]): boolean {
  if (partRetails.some((n) => n < 0)) return false;
  const taken = partRetails.filter((n) => n > 0);
  if (taken.length === 0) return true;
  return taken.reduce((sum, n) => sum + n, 0) < starting;
}

/** shares[0] is the main item; the rest are additionals. They sum to starting. */
export function evenSplitShares(starting: number, count: number): string[] {
  if (count <= 0) return [];
  const share = Math.round((starting / count) * 100) / 100;
  const values = Array.from({ length: count }, () => share);
  const drift = Math.round((starting - share * count) * 100) / 100;
  values[0] = Math.round((values[0] + drift) * 100) / 100;
  return values.map((n) => n.toFixed(2));
}

export function destinationToDispatch(destination: string | null | undefined): string {
  return DESTINATION_TO_DISPATCH[destination ?? ''] ?? 'on_shelf';
}

/** Retail on the main item before any part is split off it. */
export function receiveStartingRetail(job: RestorationJobDTO): number {
  const parent = job.items.find((item) => !item.parent_item_id) ?? job.items[0];
  return money(parent?.retail ?? job.retail);
}

export function receiveScaleGrades(job: RestorationJobDTO, scales: Record<string, string[]>): string[] {
  const fromScale = scales[job.scale] ?? [];
  return fromScale.length > 0 ? fromScale : Object.keys(job.grade_values ?? {});
}

export function receiveGradePrice(job: RestorationJobDTO, grade: string): number | null {
  const values = job.grade_values ?? {};
  const exact = values[grade];
  if (typeof exact === 'number' && Number.isFinite(exact)) return exact;
  const wanted = grade.trim().toLowerCase();
  if (!wanted) return null;
  for (const [key, value] of Object.entries(values)) {
    if (key.trim().toLowerCase() === wanted && typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

/** Listing retail the item had when it went to restoration. */
export function receiveDefaultRetail(job: RestorationJobDTO): string {
  const start = receiveStartingRetail(job);
  if (start > 0) return start.toFixed(2);
  const listed = String(job.retail ?? '').trim();
  return listed;
}

/** Shelf price for the grade they actually reached. */
export function receiveDefaultPrice(job: RestorationJobDTO): string {
  const achieved = receiveGradePrice(job, job.final_grade ?? '');
  if (achieved != null) return achieved.toFixed(2);
  return job.price ?? '';
}

export function receiveReady(args: {
  mainPrice: string;
  mainProduct: ReceiveProductChoice;
  mainDispatch?: string;
  parts: Array<{ product: ReceiveProductChoice; price: string; retail: string; dispatch?: string }>;
  startingRetail: number;
}): boolean {
  const mainSalvage = receiveIsSalvage(args.mainDispatch);
  if (!receiveProductReady(args.mainProduct)) return false;
  if (!mainSalvage && !receivePriceReady(args.mainPrice)) return false;
  if (mainSalvage && args.mainPrice.trim() && !receivePriceReady(args.mainPrice)) return false;
  const shelfRetails: number[] = [];
  for (const part of args.parts) {
    const salvage = part.product.mode === 'none' || receiveIsSalvage(part.dispatch);
    if (salvage) continue;
    if (!receiveProductReady(part.product) || !receivePriceReady(part.price) || money(part.retail) <= 0) {
      return false;
    }
    shelfRetails.push(money(part.retail));
  }
  return mintSequenceValid(args.startingRetail, shelfRetails);
}

export function buildReceivePartPayloads(
  starting: number,
  parts: Array<{
    outputId: number;
    product: ReceiveProductChoice;
    retail: string;
    price: string;
    condition: string;
    dispatch: string;
    notes: string;
    specifications: Record<string, string>;
  }>,
): RestorationReceivePartSubmit[] {
  const retails = parts.map((part) =>
    part.product.mode === 'none' || receiveIsSalvage(part.dispatch) ? 0 : money(part.retail),
  );
  return parts.map((part, index) => {
    const salvage = part.product.mode === 'none' || receiveIsSalvage(part.dispatch);
    return {
      outputId: part.outputId,
      payload: {
        ...productChoicePayload(salvage ? { mode: 'none' } : part.product),
        retail: salvage ? '0.00' : part.retail,
        price: salvage ? '0.00' : part.price,
        parent_retail: parentRetailAfterPart(starting, retails, index).toFixed(2),
        condition: part.condition,
        dispatch: salvage ? 'salvage' : part.dispatch,
        notes: part.notes,
        specifications: salvage ? {} : part.specifications,
      },
    };
  });
}

export async function runRestorationReceive(args: {
  jobId: number;
  submit: RestorationReceiveSubmit;
  remap: (itemId: number, payload: Record<string, unknown>) => Promise<unknown>;
  mint: (id: number, payload: RestorationOutputCreateItemPayload) => Promise<unknown>;
  checkIn: (
    id: number,
    payload: RestorationJobProcessingCheckInPayload,
  ) => Promise<{ printed_items_preview?: PrintedItemPreview[] }>;
  printLabels?: (preview: PrintedItemPreview[]) => Promise<void>;
}): Promise<void> {
  const remapPayload = productChoicePayload(args.submit.mainProduct);
  if (args.submit.mainProduct.mode !== 'keep') {
    for (const itemId of args.submit.mainItemIds) {
      await args.remap(itemId, remapPayload);
    }
  }
  for (const part of args.submit.parts) {
    await args.mint(part.outputId, part.payload);
  }
  const data = await args.checkIn(args.jobId, args.submit.main);
  if (args.submit.print && args.printLabels) {
    await args.printLabels(data.printed_items_preview ?? []);
  }
}

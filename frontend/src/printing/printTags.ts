/**
 * Printing tags at the label-size setting (2026-10-28). Each tag is drawn in the browser at exactly W x H inches at
 * the printer's dpi and sent to the print server's `/print/image-copies`, which prints pre-sized pictures at their
 * physical size (`fit_to_printable=False`), one call per tag, in order. The last tag printed is kept on this computer
 * so Settings → Printing (and the print-server chip) can reprint it.
 *
 * Price tags take that path only when the store switch `printing.price_tag_in_dash` is on (default off until the new
 * drawing has printed on a real thermal printer); off, they go to the print server's own drawing exactly as before.
 * While it is on, `printing.price_tag_design` picks the drawing: Classic (`tags/priceTag.ts`) or Thrift+ Perks
 * (`tags/perksTag.ts`, owner 2026-10-28), whose strip asks Dash which items are AS IS first.
 */
import { getLabelSizeSetting, getTagMarks, type PriceTagDesign, type PrintingSettings } from '../api/core.api';
import { localPrintService, type LocalPrintRequest } from '../services/localPrintService';
import { effectiveLabelSize, readStationLabelSize, type LabelSize } from './labelSize';
import { renderTagPng, type TagDesign } from './tagCanvas';
import { perksTag, perksPrice, type PerksTagData } from './tags/perksTag';
import { priceTag, type PriceTagData } from './tags/priceTag';
import { testLabel, type TestLabelData } from './tags/testLabel';
import { restorationTag, type RestorationTagInput } from '../pages/restoration/tag/restorationTag';

/** Every tag design by name; a new tag is its own file plus one line here. */
export const TAG_DESIGNS = {
  price: priceTag,
  perks: perksTag,
  restoration: restorationTag,
  test: testLabel,
} as const;

export type TagKind = keyof typeof TAG_DESIGNS;
type DataOf<K extends TagKind> = (typeof TAG_DESIGNS)[K] extends TagDesign<infer T> ? T : never;

export type TagJob =
  | { kind: 'price'; data: PriceTagData; docName?: string }
  | { kind: 'perks'; data: PerksTagData; docName?: string }
  | { kind: 'restoration'; data: RestorationTagInput; docName?: string }
  | { kind: 'test'; data: TestLabelData; docName?: string };

let storeCache: { at: number; settings: PrintingSettings } | null = null;
const STORE_TTL_MS = 60_000;

/** The store's printing settings (cached a minute); null when Dash cannot say. */
async function storeSettings(): Promise<PrintingSettings | null> {
  if (storeCache && Date.now() - storeCache.at < STORE_TTL_MS) return storeCache.settings;
  try {
    const settings = await getLabelSizeSetting();
    storeCache = { at: Date.now(), settings };
    return settings;
  } catch {
    return storeCache?.settings ?? null;
  }
}

/** The store's saved size; null when Dash cannot say. */
export async function storeLabelSize(): Promise<unknown> {
  return (await storeSettings())?.value ?? null;
}

/** Whether price tags use the new drawing; off when Dash cannot say. */
export async function priceTagInDash(): Promise<boolean> {
  return (await storeSettings())?.price_tag_in_dash === true;
}

/** The price tag drawing the store picked; Classic when Dash cannot say. */
export async function priceTagDesign(): Promise<PriceTagDesign> {
  return (await storeSettings())?.price_tag_design === 'perks' ? 'perks' : 'classic';
}

/**
 * Price tags as Thrift+ Perks tags: each item's strip from Dash (rulebook A1, the scanner's rule at the printed price).
 * When Dash cannot say, a tag prints AS IS: the tag never promises a return the register would refuse.
 */
export async function asPerksTags(labels: LocalPrintRequest[]): Promise<PerksTagData[]> {
  let marks: Record<string, { as_is: boolean }> = {};
  try {
    marks = await getTagMarks(labels.map((l) => ({ sku: l.qr_data, price: perksPrice(l.text)?.replace(/[$,]/g, '') })));
  } catch {
    marks = {};
  }
  return labels.map((l) => ({ ...l, as_is: marks[l.qr_data.trim().toUpperCase()]?.as_is ?? true }));
}

/** After a save, so the next print reads the new settings. */
export function forgetStoreLabelSize(settings?: PrintingSettings): void {
  storeCache = settings === undefined ? null : { at: Date.now(), settings };
}

/** The size this computer prints at now: its own override, else the store's, else 1.5 x 1 at 203 dpi. */
export async function currentLabelSize(): Promise<LabelSize> {
  return effectiveLabelSize(await storeLabelSize(), readStationLabelSize());
}

const LAST_KEY = 'last_label_printed';

function remember(job: TagJob): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(job));
  } catch {
    // Storage blocked: reprint just has nothing to offer.
  }
}

export function lastPrintedTag(): TagJob | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const job = raw ? (JSON.parse(raw) as TagJob) : null;
    return job && job.kind in TAG_DESIGNS ? job : null;
  } catch {
    return null;
  }
}

export interface PrintTagsResult {
  printed: number;
  failed: number;
  /** Why the first failure failed, for a toast. */
  error?: string;
}

async function sendOne<K extends TagKind>(kind: K, data: DataOf<K>, size: LabelSize, docName: string): Promise<void> {
  // Restoration tags and the test label are drawn by the print server (1.9.10), never sent as a picture.
  if (kind === 'restoration' || kind === 'test') {
    const res = await localPrintService
      .printTags({
        tags: [{ kind, data: kind === 'restoration' ? (data as unknown as Record<string, unknown>) : {}, doc_name: docName }],
        w_in: size.w_in,
        h_in: size.h_in,
        dpi: size.dpi,
      })
      .catch((err: unknown) => {
        throw new Error(
          `Update the print server to 1.9.10 or later to print this tag (${err instanceof Error ? err.message : err}).`,
        );
      });
    if (res && res.success === false) throw new Error([res.message, res.error].filter(Boolean).join(': '));
    return;
  }
  const design = TAG_DESIGNS[kind] as unknown as TagDesign<DataOf<K>>;
  const image = await renderTagPng(design, data, size);
  const res = await localPrintService.printImageCopies({ image_base64: image, copies: 1, dpi: size.dpi, doc_name: docName });
  if (res && res.success === false) throw new Error([res.message, res.error].filter(Boolean).join(': '));
}

/** Print tags in order at the current size; stops at the first failure (the printer or server is down). */
export async function printTags(jobs: TagJob[], size?: LabelSize): Promise<PrintTagsResult> {
  if (!jobs.length) return { printed: 0, failed: 0 };
  const at = size ?? (await currentLabelSize());
  let printed = 0;
  for (const job of jobs) {
    try {
      await sendOne(job.kind, job.data as never, at, job.docName ?? TAG_DESIGNS[job.kind].name);
    } catch (err) {
      return { printed, failed: jobs.length - printed, error: err instanceof Error ? err.message : String(err) };
    }
    printed += 1;
    if (job.kind !== 'test' && !SAMPLES.has(job.data)) remember(job);
  }
  return { printed, failed: 0 };
}

/**
 * Price tags. Switch off: the print server's own drawing, as before 10-28 (one label `/print/label`, more
 * `/print/labels`; a failed call throws, so callers keep their old fallbacks). Switch on: drawn here; a print server
 * older than 1.4.1 has no `/print/image-copies`, and when the first tag fails that way the batch goes to `/print/labels`.
 */
export async function printPriceTags(labels: LocalPrintRequest[]): Promise<PrintTagsResult> {
  if (!labels.length) return { printed: 0, failed: 0 };
  if (!(await priceTagInDash())) {
    if (labels.length === 1) {
      await localPrintService.printLabel(labels[0]);
      remember({ kind: 'price', data: labels[0] });
      return { printed: 1, failed: 0 };
    }
    const batch = await localPrintService.printLabelBatch(labels);
    if (batch.printed > 0) remember({ kind: 'price', data: labels[batch.printed - 1] });
    return { printed: batch.printed, failed: batch.failed, error: batch.errors?.[0] };
  }
  const jobs: TagJob[] = (await priceTagDesign()) === 'perks'
    ? (await asPerksTags(labels)).map((data) => ({ kind: 'perks' as const, data, docName: `Label-${data.qr_data}` }))
    : labels.map((data) => ({ kind: 'price' as const, data, docName: `Label-${data.qr_data}` }));
  const result = await printTags(jobs);
  if (result.printed > 0 || !result.error?.includes('does not support custom labels')) return result;
  const batch = await localPrintService.printLabelBatch(labels);
  return { printed: batch.printed, failed: batch.failed, error: batch.errors[0] };
}

/** Settings → Printing: the test label (frame and ruler), drawn by the print server (1.9.10). */
export async function printTestLabel(size: LabelSize): Promise<PrintTagsResult> {
  return printTags([{ kind: 'test', data: { size }, docName: 'Test label' }], size);
}

/** Settings → Printing "Test price tag": a sample through the real price-tag path (the print server's own drawing
 * while the new drawing is off). */
export async function printTestPriceTag(): Promise<PrintTagsResult> {
  return printPriceTags([SAMPLE_PRICE_TAG as unknown as LocalPrintRequest]);
}

/** Settings → Printing "Test restoration tag": a sample drawn by the print server (1.9.10). */
export async function printTestRestorationTag(size: LabelSize, data: RestorationTagInput): Promise<PrintTagsResult> {
  return printTags([{ kind: 'restoration', data, docName: 'Test restoration tag' }], size);
}

export const SAMPLE_PRICE_TAG: PriceTagData = {
  text: '$24.99',
  qr_data: 'ITM0000000',
  product_title: 'KitchenAid Artisan 5 qt Stand Mixer, Empire Red',
  product_brand: 'KitchenAid',
  include_text: true,
  retail_text: 'Retail $449.99',
};

export const SAMPLE_PERKS_TAG: PerksTagData = { ...SAMPLE_PRICE_TAG, as_is: false };

const SAMPLES = new Set<unknown>([SAMPLE_PRICE_TAG, SAMPLE_PERKS_TAG]);

/** Reprint the last tag this computer printed, at the current size. */
export async function reprintLastTag(): Promise<PrintTagsResult> {
  const job = lastPrintedTag();
  if (!job) return { printed: 0, failed: 0, error: 'Nothing printed on this computer yet.' };
  if (job.kind === 'price') {
    try {
      return await printPriceTags([job.data]);
    } catch (err) {
      return { printed: 0, failed: 1, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return printTags([job]);
}

/**
 * Printing tags at the label-size setting. Dash sends DATA, never a picture (owner 2026-10-29: "Always update print
 * server, do not do that shortcut of making an image to print"): every tag goes to the print server's `/print/tags` with
 * the label size (width, height, dpi) and the print server draws it (`printserver/services/tag_designs.py`), one call
 * per tag, in order. The last tag printed is kept on this computer so the Printing screen can reprint it.
 *
 * This computer's printing choices (`printPrefs.ts`, Dash Updates #9) pick the label size and the price tag: Old
 * (kind `price`, the side-stripe tag) or Thrift+ Perks (kind `perks`, owner 2026-10-28), whose strip asks Dash which
 * items are AS IS first. The layouts in `tags/` are the reference the print server's drawings were ported from (print
 * server 1.9.12).
 */
import { getTagMarks } from '../api/core.api';
import { localPrintService, type LocalPrintRequest } from '../services/localPrintService';
import type { LabelSize } from './labelSize';
import { prefsLabelSize, readPrintPrefs } from './printPrefs';
import type { TagDesign } from './tagCanvas';
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

/** The size this computer prints at (its Printing choice; 1.5 x 1 at 203 dpi by default). */
export async function currentLabelSize(): Promise<LabelSize> {
  return prefsLabelSize();
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

/** The print server release that draws each tag kind (older ones answer "Unknown tag kind" or 404). */
const DRAWN_BY = { price: '1.9.12', perks: '1.9.12', restoration: '1.9.10', test: '1.9.10' } as const;

/** What `/print/tags` gets for a job: data only, never a picture (owner 2026-10-29). */
function tagData<K extends TagKind>(kind: K, data: DataOf<K>): Record<string, unknown> {
  return kind === 'test' ? {} : (data as unknown as Record<string, unknown>);
}

async function sendOne<K extends TagKind>(kind: K, data: DataOf<K>, size: LabelSize, docName: string): Promise<void> {
  // Every tag is drawn by the print server (restoration and test 1.9.10, price and perks 1.9.12) at the label size.
  const res = await localPrintService
    .printTags({
      tags: [{ kind, data: tagData(kind, data), doc_name: docName }],
      w_in: size.w_in,
      h_in: size.h_in,
      dpi: size.dpi,
    })
    .catch((err: unknown) => {
      throw new Error(
        `Update the print server to ${DRAWN_BY[kind]} or later to print this tag (${err instanceof Error ? err.message : err}).`,
      );
    });
  if (res && res.success === false) {
    const why = [res.message, res.error].filter(Boolean).join(': ');
    throw new Error(
      why.includes('Unknown tag kind') ? `Update the print server to ${DRAWN_BY[kind]} or later to print this tag (${why}).` : why,
    );
  }
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
 * Price tags in this computer's style, drawn by the print server from data (`/print/tags`, 1.9.12) at its label size.
 * A print server too old for it fails the first tag, and the batch goes to its own drawing (`/print/labels`).
 */
export async function printPriceTags(labels: LocalPrintRequest[]): Promise<PrintTagsResult> {
  if (!labels.length) return { printed: 0, failed: 0 };
  const jobs: TagJob[] = readPrintPrefs().priceTag === 'perks'
    ? (await asPerksTags(labels)).map((data) => ({ kind: 'perks' as const, data, docName: `Label-${data.qr_data}` }))
    : labels.map((data) => ({ kind: 'price' as const, data, docName: `Label-${data.qr_data}` }));
  const result = await printTags(jobs);
  if (result.printed > 0 || !result.error?.includes('Update the print server to')) return result;
  const batch = await localPrintService.printLabelBatch(labels);
  return { printed: batch.printed, failed: batch.failed, error: batch.errors[0] };
}

/** Printing "Test label": the frame and ruler, drawn by the print server (1.9.10). */
export async function printTestLabel(size: LabelSize): Promise<PrintTagsResult> {
  return printTags([{ kind: 'test', data: { size }, docName: 'Test label' }], size);
}

/** Printing "Price tag": a sample through the real price-tag path, in this computer's style. */
export async function printTestPriceTag(): Promise<PrintTagsResult> {
  return printPriceTags([SAMPLE_PRICE_TAG as unknown as LocalPrintRequest]);
}

/** Printing "Restoration tag": a sample drawn by the print server (1.9.10). */
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

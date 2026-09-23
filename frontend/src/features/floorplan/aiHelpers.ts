import type { AdjustPlanResult } from '../../api/floorplanAi.api';

/** Turn a data: URI (base64) into a File for the multipart asset upload. */
export function dataUriToFile(dataUri: string, filename: string): File {
  const comma = dataUri.indexOf(',');
  const header = dataUri.slice(0, comma);
  const mime = header.slice(5).split(';')[0] || 'image/svg+xml';
  const binary = atob(dataUri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

export function svgFileName(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'element'}.svg`;
}

/** Number of changes in an adjust proposal, including plan settings. */
export function adjustChangeCount(result: Pick<AdjustPlanResult, 'summary' | 'settings_patch'>): number {
  const objects = Object.values(result.summary.counts).reduce(
    (sum, c) => sum + c.added + c.changed + c.removed,
    0,
  );
  return objects + Object.keys(result.settings_patch ?? {}).length;
}

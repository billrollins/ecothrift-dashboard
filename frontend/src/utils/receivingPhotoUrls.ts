import type { ReceivingAttachmentDTO } from '../types/inventory.types';

function firstUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (c) return c;
  }
  return null;
}

/** Prefer 480px thumbnail; fall back to high-res for not-yet-backfilled rows. */
export function attachmentThumbUrl(
  att: ReceivingAttachmentDTO | undefined | null,
): string | null {
  return firstUrl(att?.thumbnail_file?.url, att?.s3_file?.url);
}

/** Prefer authoritative high-res for the image viewer. */
export function attachmentFullUrl(
  att: ReceivingAttachmentDTO | undefined | null,
): string | null {
  return firstUrl(att?.s3_file?.url, att?.thumbnail_file?.url);
}

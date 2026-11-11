import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getSheetPhoto, type PhotoSheetFields, type PhotoSheetItem } from '../../api/photoSheets.api';
import { PhotoSheetPaper } from './PhotoSheetPaper';

export const PRINT_ROOT_ID = 'photo-sheet-print';

/**
 * The print stylesheet (D22): Letter paper turned the sheet's way, no page margin (the sheet keeps its own 0.4 inch),
 * and only the sheet prints: no menus, no buttons, exactly one page.
 */
export function printCss(orientation: 'portrait' | 'landscape'): string {
  return `
@media screen {
  #${PRINT_ROOT_ID} { position: fixed; left: -40000px; top: 0; pointer-events: none; }
}
@media print {
  @page { size: letter ${orientation}; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} { position: static !important; left: auto !important; }
  #${PRINT_ROOT_ID} .ps-paper { break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  #${PRINT_ROOT_ID} .ps-screen-only { display: none !important; }
}`;
}

const photoKey = (file: number) => ['photo-sheet-photo', file] as const;

/** Each saved photo as an object URL (the files are behind the sign-in, so an img src cannot load them itself). */
export function useSheetPhotoUrls(files: number[]) {
  const client = useQueryClient();
  const unique = useMemo(() => Array.from(new Set(files)), [files]);
  const results = useQueries({
    queries: unique.map((file) => ({
      queryKey: photoKey(file),
      queryFn: async () => URL.createObjectURL(await getSheetPhoto(file)),
      staleTime: Infinity,
      gcTime: 30 * 60_000,
    })),
  });
  const urls = useMemo(() => {
    const map = new Map<number, string>();
    unique.forEach((file, index) => {
      const url = results[index]?.data;
      if (url) map.set(file, url);
    });
    return map;
  }, [unique, results]);
  const photoUrl = useCallback((file: number) => urls.get(file) ?? null, [urls]);
  /** A photo just picked shows at once from the file in hand, before the server answers. */
  const seed = useCallback((file: number, blob: Blob) => {
    client.setQueryData(photoKey(file), URL.createObjectURL(blob));
  }, [client]);
  const allLoaded = unique.every((file) => urls.has(file));
  return { photoUrl, seed, allLoaded };
}

/** The full-size sheet the print window prints. Mounted while a sheet is open, so Ctrl+P prints only the sheet too. */
export function PhotoSheetPrintRoot({ fields, item, photoUrl }: {
  fields: PhotoSheetFields;
  item?: PhotoSheetItem | null;
  photoUrl: (file: number) => string | null;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div id={PRINT_ROOT_ID} aria-hidden="true">
      <style>{printCss(fields.orientation)}</style>
      <PhotoSheetPaper fields={fields} item={item} photoUrl={photoUrl} />
    </div>,
    document.body,
  );
}

/** Wait until the sheet's photos and font are ready, then open the browser's own print window. */
export async function printSheetNow(): Promise<void> {
  const root = document.getElementById(PRINT_ROOT_ID);
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  try {
    await fonts?.ready;
  } catch {
    // Print with what the browser has.
  }
  // Decode every photo, loaded or not: the print copy sits off screen, and Chrome left an off-screen photo out of a
  // printed page in round 2 (loaded, never decoded).
  const images = Array.from(root?.querySelectorAll('img') ?? []);
  await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  window.print();
}

/** Print once when `ready` turns true (Print again from a list, with no editor open). */
export function usePrintWhenReady(ready: boolean, onDone: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    void printSheetNow().finally(onDone);
  }, [ready, onDone]);
}

import { Button, IconButton, Tooltip, type ButtonProps } from '@mui/material';
import PrintRounded from '@mui/icons-material/PrintRounded';
import PhotoLibraryRounded from '@mui/icons-material/PhotoLibraryRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { markPhotoSheetPrinted, startPhotoSheet, type PhotoSheetDTO } from '../../api/photoSheets.api';
import { PhotoSheetDialog, photoSheetsKey } from './PhotoSheetEditor';
import { PhotoSheetPrintRoot, usePrintWhenReady, useSheetPhotoUrls } from './PhotoSheetPrint';

export interface PhotoSheetButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  item?: number | null;
  product?: number | null;
  /** Also offer Print again, one tap, when this item or product already has a saved sheet (asks the server once). */
  quickPrint?: boolean;
  /** A small icon for a dense row (the Processing row's product line). */
  compact?: boolean;
  'data-testid'?: string;
}

/**
 * "Photo sheet" where a processor already is (D26): the Processing row and check-in, the item window, the product
 * window. Opens the sheet of this item or product; with `quickPrint`, a saved sheet prints again in one tap.
 */
export function PhotoSheetButton({ item, product, quickPrint = false, compact = false, 'data-testid': testId = 'photo-sheet-button', ...button }: PhotoSheetButtonProps) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState<PhotoSheetDTO | null>(null);
  const saved = useQuery({
    queryKey: [...photoSheetsKey, 'start', item ?? null, product ?? null],
    queryFn: () => startPhotoSheet({ item, product }),
    enabled: quickPrint && Boolean(item || product),
    staleTime: 30_000,
  });
  const sheet = saved.data?.sheet ?? null;
  if (!item && !product) return null;
  if (compact) {
    return (
      // The row underneath opens on a click; this one only opens the sheet.
      <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} style={{ display: 'inline-flex' }}>
        <Tooltip title="Photo sheet: print photos and the title for the box">
          <IconButton size="small" aria-label="Photo sheet" onClick={() => setOpen(true)} data-testid={testId} sx={{ width: 30, height: 30 }}>
            <PhotoLibraryRounded sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
        {open ? <PhotoSheetDialog open target={{ item, product }} onClose={() => setOpen(false)} /> : null}
      </span>
    );
  }
  return (
    <>
      <Button variant="outlined" startIcon={<PhotoLibraryRounded fontSize="small" />} {...button} onClick={() => setOpen(true)} data-testid={testId}>
        Photo sheet
      </Button>
      {quickPrint && sheet ? (
        <Button
          variant="outlined"
          startIcon={<PrintRounded fontSize="small" />}
          {...button}
          disabled={Boolean(printing)}
          onClick={() => setPrinting(sheet)}
          data-testid={`${testId}-print-again`}
        >
          {printing ? 'Getting it ready' : 'Print sheet again'}
        </Button>
      ) : null}
      {open ? <PhotoSheetDialog open target={{ item, product }} onClose={() => setOpen(false)} /> : null}
      {printing ? <QuickPrint sheet={printing} onDone={() => setPrinting(null)} /> : null}
    </>
  );
}

function QuickPrint({ sheet, onDone }: { sheet: PhotoSheetDTO; onDone: () => void }) {
  const client = useQueryClient();
  const { photoUrl, allLoaded } = useSheetPhotoUrls(useMemo(() => sheet.photos.map((photo) => photo.file), [sheet.photos]));
  const done = useCallback(() => {
    void markPhotoSheetPrinted(sheet.id).catch(() => undefined).finally(() => {
      void client.invalidateQueries({ queryKey: photoSheetsKey });
      onDone();
    });
  }, [client, onDone, sheet.id]);
  usePrintWhenReady(allLoaded, done);
  return <PhotoSheetPrintRoot fields={sheet} item={sheet.item} photoUrl={photoUrl} />;
}

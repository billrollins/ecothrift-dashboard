import { Alert, Box, Button, Card, Skeleton, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import PrintRounded from '@mui/icons-material/PrintRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPhotoSheet, listPhotoSheets, markPhotoSheetPrinted, type PhotoSheetDTO } from '../../../api/photoSheets.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { PhotoSheetDialog, photoSheetsKey, type PhotoSheetTarget } from '../../../components/photoSheets/PhotoSheetEditor';
import { PhotoSheetPrintRoot, usePrintWhenReady, useSheetPhotoUrls } from '../../../components/photoSheets/PhotoSheetPrint';
import { LAYOUT_LABEL, ORIENTATION_LABEL } from '../../../components/photoSheets/sheetLayouts';

/**
 * Processing > Photo sheets (Dash Update #95, Bill 2026-11-11): a full-page sheet of photos and the full title, taped to a
 * brown box so a shopper can see what is inside. Make one for an item (type or scan its number), or with no item at all
 * (type the title) for things not sold in the store. Every saved sheet prints again with one tap.
 */
export default function PhotoSheetsPage() {
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [open, setOpen] = useState<{ target: PhotoSheetTarget | null } | null>(null);
  const [printing, setPrinting] = useState<PhotoSheetDTO | null>(null);
  const [params, setParams] = useSearchParams();
  const sheets = useQuery({ queryKey: [...photoSheetsKey, 'recent', query.trim()], queryFn: () => listPhotoSheets(query.trim()) });

  // A link can open one sheet: ?item=<id>, ?product=<id> or ?sheet=<id>.
  useEffect(() => {
    const item = Number(params.get('item')) || null;
    const product = Number(params.get('product')) || null;
    const sheetId = Number(params.get('sheet')) || null;
    if (item || product) setOpen({ target: { item, product } });
    else if (sheetId) {
      void getPhotoSheet(sheetId).then((sheet) => setOpen({ target: targetOf(sheet) })).catch(() => undefined);
    }
  }, [params]);
  const closeSheet = () => {
    setOpen(null);
    if (params.toString()) setParams({}, { replace: true });
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, width: '100%', minWidth: 0, maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="Photo sheets"
        subtitle="A full page of photos and the title, to tape on a closed box so shoppers can see what is inside."
        dense
        action={(
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen({ target: null })} sx={{ minHeight: 44 }} data-testid="photo-sheets-new">
            New sheet, no item
          </Button>
        )}
      />
      <Card variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography sx={{ fontWeight: 800, mb: 1 }}>For an item</Typography>
        <Stack
          component="form"
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim()) setOpen({ target: { code: code.trim() } });
          }}
        >
          <TextField
            label="Item number or product number"
            placeholder="Scan the tag, or type ITM..."
            value={code}
            onChange={(event) => setCode(event.target.value)}
            size="small"
            sx={{ flex: 1, maxWidth: { sm: 420 } }}
            inputProps={{ 'data-testid': 'photo-sheets-code' }}
          />
          <Button type="submit" variant="outlined" disabled={!code.trim()} sx={{ minHeight: 44 }}>Open its sheet</Button>
        </Stack>
        <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mt: 1 }}>
          Its saved sheet opens ready to print again. A new one starts from the last sheet of the same product, photos and all.
        </Typography>
      </Card>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, flex: 1 }}>Saved sheets</Typography>
        <TextField label="Find a sheet" value={query} onChange={(event) => setQuery(event.target.value)} size="small" sx={{ width: { xs: 180, sm: 280 } }} />
      </Stack>
      {sheets.isError ? <Alert severity="error">The sheets did not load. Try again in a moment.</Alert> : null}
      {sheets.isLoading ? (
        <Stack spacing={1}>{[0, 1, 2].map((n) => <Skeleton key={n} variant="rounded" height={92} />)}</Stack>
      ) : (sheets.data ?? []).length === 0 ? (
        <Typography sx={{ color: 'text.secondary' }} data-testid="photo-sheets-empty">
          {query.trim() ? 'No sheet matches that.' : 'No sheets yet. Open one from an item, or make one with no item.'}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {(sheets.data ?? []).map((sheet) => (
            <SheetRow
              key={sheet.id}
              sheet={sheet}
              onOpen={() => setOpen({ target: targetOf(sheet) })}
              onPrint={() => setPrinting(sheet)}
              printing={printing?.id === sheet.id}
            />
          ))}
        </Stack>
      )}

      {open ? <PhotoSheetDialog open target={open.target} onClose={closeSheet} /> : null}
      {printing ? <PrintAgain sheet={printing} onDone={() => setPrinting(null)} /> : null}
    </Box>
  );
}

/** A saved sheet opens as it is, with its item's price and number. */
function targetOf(sheet: PhotoSheetDTO): PhotoSheetTarget {
  return { sheet };
}

function SheetRow({ sheet, onOpen, onPrint, printing }: { sheet: PhotoSheetDTO; onOpen: () => void; onPrint: () => void; printing: boolean }) {
  const first = sheet.photos[0]?.file;
  const { photoUrl } = useSheetPhotoUrls(useMemo(() => (first ? [first] : []), [first]));
  const url = first ? photoUrl(first) : null;
  const what = sheet.item ? sheet.item.sku : sheet.product ? `Product ${sheet.product.product_number}` : 'No item';
  const printed = sheet.print_count ? `printed ${sheet.print_count === 1 ? 'once' : `${sheet.print_count} times`}` : 'not printed yet';
  return (
    <Card variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.25 }} data-testid="photo-sheets-row">
      <Box sx={{ width: 72, height: 72, flex: '0 0 auto', bgcolor: 'grey.100', borderRadius: 1, overflow: 'hidden' }}>
        {url ? <Box component="img" src={url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 800, lineHeight: 1.25 }} noWrap title={sheet.title}>{sheet.title}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 13.5 }} noWrap>
          {what}, {LAYOUT_LABEL[sheet.layout]}, {ORIENTATION_LABEL[sheet.orientation].toLowerCase()}, {printed}
        </Typography>
      </Box>
      <Button onClick={onOpen} sx={{ minHeight: 44 }}>Open</Button>
      <Button variant="contained" startIcon={<PrintRounded />} onClick={onPrint} disabled={printing} sx={{ minHeight: 44 }}>
        {printing ? 'Getting it ready' : 'Print again'}
      </Button>
    </Card>
  );
}

/** Print a saved sheet as it is, with no editor: one tap (D26). */
function PrintAgain({ sheet, onDone }: { sheet: PhotoSheetDTO; onDone: () => void }) {
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

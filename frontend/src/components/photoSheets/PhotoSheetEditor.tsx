import {
  Alert, Box, Button, ButtonBase, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ContentPasteRounded from '@mui/icons-material/ContentPasteRounded';
import ImageSearchRounded from '@mui/icons-material/ImageSearchRounded';
import PrintRounded from '@mui/icons-material/PrintRounded';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createPhotoSheet, draftSheetWithAi, markPhotoSheetPrinted, startPhotoSheet, updatePhotoSheet, uploadSheetPhoto,
  uploadSheetPhotoLink,
  type PhotoSheetDTO, type PhotoSheetFields, type PhotoSheetItem, type PhotoSheetProduct,
} from '../../api/photoSheets.api';
import { AddPhoto } from '../photos/AddPhoto';
import { isPhotoFile, shrinkPhoto } from '../photos/photoFile';
import { findPicturesUrl, pictureLinkFrom, printQuality } from './sheetPaste';
import type { Rect } from './sheetPlan';
import { ZOOM_MAX, ZOOM_MIN, cropOf, isCropped, setCrop, zoomCrop, type Crop } from './sheetCrop';
import { PhotoSheetPaper, brandLine, titleLines } from './PhotoSheetPaper';
import { PhotoSheetPrintRoot, printSheetNow, useSheetPhotoUrls } from './PhotoSheetPrint';
import {
  addPhotos, emptySheet, markTyped, mergeAiDraft, removePhoto, setFit, sheetBody, swapPhotos, turnPhoto, typedOf,
  withPhotos,
} from './sheetEdits';
import {
  CONTRASTS, CONTRAST_LABEL, FACT_LABEL, FACT_MAX, LABEL_MAX, LAYOUTS, LAYOUT_LABEL, LAYOUT_SLOTS, MAX_PHOTOS,
  ORIENTATIONS, ORIENTATION_LABEL, layoutGrid, paperSize, sheetMoney, SLOT_AREAS, type FactKey, type SheetLayout,
  type SheetOrientation,
} from './sheetLayouts';
import { pickLayout } from './sheetPlan';

export interface PhotoSheetTarget {
  item?: number | null;
  product?: number | null;
  /** An item or product number typed on the Photo sheets page. */
  code?: string;
  /** A saved sheet, opened as it is from the Photo sheets page (with or without an item). */
  sheet?: PhotoSheetDTO;
}

const FACT_HINT: Record<FactKey, string> = {
  size: 'Like 60 x 30 x 29 in, or Queen',
  in_box: 'Like base, 64 oz jar, lid',
  condition: 'Like new. Tested, works.',
  good_to_know: 'Like remote included, or all parts there',
};

export const photoSheetsKey = ['photo-sheets'] as const;

/** Sideways paper is short: the templates that suit it come first. */
const SIDEWAYS_ORDER: SheetLayout[] = ['two', 'big2', 'one', 'big3', 'grid4'];

/** The Photo sheet window: one sheet, opened from an item, a product, or nothing at all (D26). */
export function PhotoSheetDialog({ open, target, onClose }: { open: boolean; target: PhotoSheetTarget | null; onClose: () => void }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  return (
    <Dialog open={open} onClose={onClose} fullScreen PaperProps={{ sx: { bgcolor: 'background.default' } }} data-testid="photo-sheet-dialog">
      {open ? <PhotoSheetEditor target={target} onClose={onClose} phone={phone} /> : null}
    </Dialog>
  );
}

export function PhotoSheetEditor({ target, onClose, phone }: { target: PhotoSheetTarget | null; onClose: () => void; phone: boolean }) {
  const client = useQueryClient();
  const hasTarget = !target?.sheet && Boolean(target?.item || target?.product || target?.code);
  const start = useQuery({
    queryKey: ['photo-sheet-start', target?.item ?? null, target?.product ?? null, target?.code ?? ''],
    queryFn: () => startPhotoSheet(target ?? {}),
    enabled: hasTarget,
    staleTime: 0,
    gcTime: 0,
  });

  const [fields, setFields] = useState<PhotoSheetFields>(() => (target?.sheet ? fieldsOf(target.sheet) : emptySheet()));
  const [sheet, setSheet] = useState<PhotoSheetDTO | null>(target?.sheet ?? null);
  const [item, setItem] = useState<PhotoSheetItem | null>(target?.sheet?.item ?? null);
  const [product, setProduct] = useState<PhotoSheetProduct | null>(target?.sheet?.product ?? null);
  const [ready, setReady] = useState(!hasTarget);
  const [dirty, setDirty] = useState(false);
  const [layoutChosen, setLayoutChosen] = useState(Boolean(target?.sheet));
  const [fromAi, setFromAi] = useState<string[]>([]);
  const [aiRead, setAiRead] = useState<string[] | null>(null);
  // The picture picked on the sheet, to move and zoom in its frame (#108). The tiles' tap-to-swap is `picked`.
  const [cropping, setCropping] = useState<number | null>(null);
  const [fromSheet, setFromSheet] = useState<{ id: number; sku: string } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [adding, setAdding] = useState(0);
  const [error, setError] = useState('');
  const [askClose, setAskClose] = useState(false);
  const [titleFit, setTitleFit] = useState<{ pt: number; lines: number } | null>(null);
  const [linkText, setLinkText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  // Where each photo lands on the paper (from the preview), for the "may print fuzzy" flag.
  const [rects, setRects] = useState<Rect[]>([]);

  // The sheet opens from the item's own saved sheet, else from where a new one starts (D26).
  useEffect(() => {
    const data = start.data;
    if (!data || ready) return;
    setItem(data.item);
    setProduct(data.product);
    if (data.sheet) {
      setSheet(data.sheet);
      setFields(fieldsOf(data.sheet));
      setLayoutChosen(true);
    } else {
      const draft = data.draft;
      const base: PhotoSheetFields = {
        ...emptySheet(), title: draft.title, name: draft.name ?? '', brand: draft.brand, facts: { ...emptySheet().facts, ...draft.facts },
        photos: draft.photos, show_price: false, show_item_number: false,
        contrast: draft.contrast ?? 0, labels: draft.labels ?? {}, typed: draft.typed ?? [],
        ...(draft.layout && draft.orientation ? { layout: draft.layout, orientation: draft.orientation } : pickLayout(draft.photos)),
      };
      setFields(base);
      setLayoutChosen(Boolean(draft.layout));
      setFromSheet(draft.from_sheet);
      setDirty(true);
    }
    setReady(true);
  }, [start.data, ready]);

  const { photoUrl } = useSheetPhotoUrls(useMemo(() => fields.photos.map((photo) => photo.file), [fields.photos]));

  const change = useCallback((next: Partial<PhotoSheetFields>) => {
    setFields((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);
  /** A person typed (or picked) these boxes: their words win over Clean up with AI from now on (#108). */
  const typeIn = useCallback((keys: string[], next: Partial<PhotoSheetFields>) => {
    setFields((current) => markTyped({ ...current, ...next }, ...keys));
    setFromAi((filled) => filled.filter((key) => !keys.includes(key)));
    setDirty(true);
  }, []);
  const crop = useCallback((index: number, next: Crop | null) => {
    setFields((current) => ({ ...current, photos: setCrop(current.photos, index, next) }));
    setDirty(true);
  }, []);
  // A picked picture that is taken off, or no longer prints, is no longer picked.
  useEffect(() => {
    if (cropping !== null && cropping >= Math.min(fields.photos.length, LAYOUT_SLOTS[fields.layout])) setCropping(null);
  }, [cropping, fields.photos.length, fields.layout]);
  useEffect(() => {
    if (cropping === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCropping(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cropping]);
  const changePhotos = useCallback((edit: (photos: PhotoSheetFields['photos']) => PhotoSheetFields['photos']) => {
    setFields((current) => withPhotos(current, edit(current.photos), layoutChosen));
    setDirty(true);
  }, [layoutChosen]);

  const onPhotos = async (files: File[]) => {
    setError('');
    setAdding((n) => n + files.length);
    try {
      const added: { file: number; width: number; height: number; plain?: boolean }[] = [];
      for (const file of files) {
        const blob = await shrinkPhoto(file);
        added.push(await uploadSheetPhoto(blob, file.name || 'photo.jpg'));
      }
      changePhotos((photos) => addPhotos(photos, added));
    } catch {
      setError('A photo did not save. Try it again.');
    } finally {
      setAdding((n) => Math.max(0, n - files.length));
    }
  };

  // A picture link (pasted, or dragged from another tab): a data: picture is read here, a web link by the server.
  const addFromLink = async (link: string) => {
    if (fields.photos.length + adding >= MAX_PHOTOS) {
      setError(`A sheet holds ${MAX_PHOTOS} pictures. Take one off first.`);
      return;
    }
    if (link.startsWith('data:image/')) {
      try {
        const blob = await (await fetch(link)).blob();
        await onPhotos([new File([blob], 'pasted.png', { type: blob.type || 'image/png' })]);
      } catch {
        setError('That picture did not paste. Copy it again and paste.');
      }
      return;
    }
    setError('');
    setAdding((n) => n + 1);
    try {
      const saved = await uploadSheetPhotoLink(link);
      changePhotos((photos) => addPhotos(photos, [saved]));
      setLinkText('');
    } catch (err) {
      setError(errorText(err, 'That picture did not open. Copy the picture itself and paste it.'));
    } finally {
      setAdding((n) => Math.max(0, n - 1));
    }
  };
  const addRef = useRef({ onPhotos, addFromLink });
  addRef.current = { onPhotos, addFromLink };

  // Ctrl+V anywhere in the window: a copied picture, or a copied picture link (D24, D26: paste first).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data) return;
      const files = Array.from(data.files ?? []).filter(isPhotoFile);
      if (files.length) {
        event.preventDefault();
        void addRef.current.onPhotos(files.slice(0, MAX_PHOTOS));
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const link = pictureLinkFrom(data.getData('text/html'), data.getData('text/plain'));
      if (link) {
        event.preventDefault();
        void addRef.current.addFromLink(link);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  // A picture dragged in from another tab or the desktop, anywhere on the window.
  const dropIn = (event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer?.types ?? []);
    if (!types.some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/html')) return;
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []).filter(isPhotoFile);
    if (files.length) {
      void onPhotos(files.slice(0, MAX_PHOTOS));
      return;
    }
    const link = pictureLinkFrom(event.dataTransfer.getData('text/html'), event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain'));
    if (link) void addFromLink(link);
    else setError('That did not bring a picture. Copy the picture and paste it (Ctrl+V).');
  };
  const dragOverIn = (event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer?.types ?? []);
    if (types.some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/html')) {
      event.preventDefault();
      if (!dragOver) setDragOver(true);
    }
  };

  const tapPhoto = (index: number) => {
    if (index >= fields.photos.length) return;
    if (picked === null) setPicked(index);
    else if (picked === index) setPicked(null);
    else {
      changePhotos((photos) => swapPhotos(photos, picked, index));
      setPicked(null);
    }
  };

  const save = useMutation({
    mutationFn: async (): Promise<PhotoSheetDTO> => {
      const body = sheetBody(fields);
      if (sheet) return updatePhotoSheet(sheet.id, body);
      return createPhotoSheet({ ...body, item: item?.id ?? null, product: item ? null : product?.id ?? null });
    },
    onSuccess: (saved) => {
      setSheet(saved);
      setDirty(false);
      setError('');
      void client.invalidateQueries({ queryKey: photoSheetsKey });
    },
    onError: (err: unknown) => setError(errorText(err, 'The sheet did not save. Try again.')),
  });

  const print = async () => {
    setError('');
    let saved = sheet;
    if (dirty || !saved) {
      if (!fields.title.trim()) {
        setError('Type the title first.');
        return;
      }
      try {
        saved = await save.mutateAsync();
      } catch {
        return;
      }
    }
    await printSheetNow();
    try {
      const counted = await markPhotoSheetPrinted(saved.id);
      setSheet(counted);
      void client.invalidateQueries({ queryKey: photoSheetsKey });
    } catch {
      // The print went out; the count is only a note.
    }
  };

  const ai = useMutation({
    // Everything on the sheet goes, pictures too; the server adds what Dash knows (#108).
    mutationFn: () => draftSheetWithAi({ ...sheetBody(fields), item: item?.id ?? null, product: product?.id ?? null }),
    onSuccess: (draft) => {
      // Every box a person typed keeps its words; the AI may clean up all the others.
      const merged = mergeAiDraft(fields, draft);
      setFields(merged.fields);
      setFromAi(merged.filled);
      setAiRead(draft.read ?? []);
      if (merged.filled.length) setDirty(true);
      setError(merged.filled.length ? '' : 'The AI had nothing to change. The words you typed stay as they are.');
    },
    onError: (err: unknown) => setError(errorText(err, 'The AI could not help this time. Type the words, or try again.')),
  });

  const close = () => {
    if (dirty && fields.title.trim()) setAskClose(true);
    else onClose();
  };

  if (hasTarget && !ready) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
        {start.isError ? (
          <Stack spacing={2} alignItems="center">
            <Alert severity="error">{errorText(start.error, 'This sheet did not open.')}</Alert>
            <Button onClick={onClose}>Close</Button>
          </Stack>
        ) : <CircularProgress />}
      </Box>
    );
  }

  const printLabel = sheet && !dirty ? 'Print again' : 'Print';
  const busy = save.isPending || adding > 0;
  const forWhat = item ? `Item ${item.sku}` : product ? `Product ${product.product_number || product.id}` : 'No item: typed by hand';

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1, md: 2 }, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flex: '0 0 auto' }}>
      <IconButton onClick={close} aria-label="Close" sx={{ width: 44, height: 44 }}><CloseRounded /></IconButton>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>Photo sheet</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 13 }} noWrap data-testid="photo-sheet-for">
          {forWhat}{sheet ? `, ${savedWords(sheet, dirty)}` : ', not saved yet'}
        </Typography>
      </Box>
      {!phone ? (
        <Button variant="outlined" onClick={() => save.mutate()} disabled={busy || !dirty || !fields.title.trim()} sx={{ minHeight: 44 }} data-testid="photo-sheet-save">
          {save.isPending ? 'Saving' : 'Save'}
        </Button>
      ) : null}
      <Button variant="contained" startIcon={<PrintRounded />} onClick={() => void print()} disabled={busy} sx={{ minHeight: 44, fontWeight: 800 }} data-testid="photo-sheet-print">
        {printLabel}
      </Button>
    </Box>
  );

  const controls = (
    <Stack spacing={2.5} sx={{ p: { xs: 2, md: 2.5 } }}>
      {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}
      {fromSheet ? (
        <Alert severity="info" data-testid="photo-sheet-from">
          Started from the last sheet of this product{fromSheet.sku ? ` (${fromSheet.sku})` : ''}: its photos, layout and facts. Check them for this one.
        </Alert>
      ) : null}

      <Section title={`1. Pictures (${fields.photos.length} of ${MAX_PHOTOS})`}>
        {!phone ? (
          <Box
            tabIndex={0}
            data-testid="photo-sheet-paste-target"
            sx={{
              border: '2px dashed', borderColor: dragOver ? 'primary.main' : 'divider', borderRadius: 2, p: 2,
              bgcolor: dragOver ? 'action.selected' : 'action.hover', outline: 'none',
              '&:focus-visible': { borderColor: 'primary.main' },
            }}
          >
            <Stack direction="row" spacing={1.25} alignItems="center">
              <ContentPasteRounded color="primary" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800 }}>Paste a picture (Ctrl+V)</Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                  Copy a picture on the web (right click, Copy image), then press Ctrl+V anywhere here. Or drag one in.
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button
                variant="contained"
                startIcon={<ImageSearchRounded />}
                href={findPicturesUrl(fields.brand, titleLines(fields).big || fields.title)}
                target="_blank"
                rel="noopener noreferrer"
                disabled={!fields.title.trim()}
                sx={{ minHeight: 40 }}
                data-testid="photo-sheet-find-pictures"
              >
                Find pictures
              </Button>
              <TextField
                size="small"
                placeholder="Or paste a picture link"
                value={linkText}
                onChange={(event) => setLinkText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && linkText.trim()) {
                    event.preventDefault();
                    void addFromLink(linkText.trim());
                  }
                }}
                sx={{ flex: 1 }}
                inputProps={{ 'data-testid': 'photo-sheet-link-input', 'aria-label': 'Picture link' }}
              />
              <Button onClick={() => void addFromLink(linkText.trim())} disabled={!linkText.trim() || adding > 0} sx={{ minHeight: 40 }}>Add</Button>
            </Stack>
          </Box>
        ) : null}
        <PhotoTiles
          rects={rects}
          fields={fields}
          photoUrl={photoUrl}
          picked={picked}
          onTap={tapPhoto}
          onSwap={(a, b) => changePhotos((photos) => swapPhotos(photos, a, b))}
          onFit={(index, fit) => changePhotos((photos) => setFit(photos, index, fit))}
          onTurn={(index) => changePhotos((photos) => turnPhoto(photos, index))}
          onReset={(index) => crop(index, null)}
          onRemove={(index) => {
            setPicked(null);
            changePhotos((photos) => removePhoto(photos, index));
          }}
        />
        {picked !== null ? (
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'primary.main' }} data-testid="photo-sheet-swap-hint">
            Tap another photo to swap them, or the same one to stop.
          </Typography>
        ) : null}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <AddPhoto
            onPhotos={(files) => void onPhotos(files)}
            multiple
            max={MAX_PHOTOS - fields.photos.length}
            usedWhere="Photo sheet"
            disabled={fields.photos.length >= MAX_PHOTOS || adding > 0}
            sx={{ minHeight: 44 }}
            data-testid="photo-sheet-add-photo"
          />
          {adding ? <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>Adding {adding === 1 ? 'a picture' : `${adding} pictures`}</Typography> : null}
        </Stack>
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>Under the pictures, the sheet says</Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={fields.caption}
            onChange={(_, value) => { if (value) typeIn(['caption'], { caption: value }); }}
            aria-label="What the pictures are"
          >
            <ToggleButton value="product" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 40 }} data-testid="photo-sheet-caption-product">Product picture</ToggleButton>
            <ToggleButton value="item" sx={{ textTransform: 'none', fontWeight: 700, minHeight: 40 }} data-testid="photo-sheet-caption-item">Photo of this item</ToggleButton>
          </ToggleButtonGroup>
          {fromAi.includes('caption') ? <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>From AI: check it.</Typography> : null}
        </Box>
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>Picture contrast</Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={fields.contrast ?? 0}
            onChange={(_, value) => { if (value !== null && value !== undefined) change({ contrast: value }); }}
            aria-label="Picture contrast"
          >
            {CONTRASTS.map((step) => (
              <ToggleButton key={step} value={step} sx={{ textTransform: 'none', fontWeight: 700, minHeight: 40, px: 1.25 }} data-testid={`photo-sheet-contrast-${step}`}>
                {CONTRAST_LABEL[step]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>
            For a printer that prints pictures light: darker middle tones, white stays white. The preview shows it as it prints.
          </Typography>
        </Box>
      </Section>

      <Section title="2. Layout">
        <LayoutPicker
          layout={fields.layout}
          orientation={fields.orientation}
          onPick={(layout, orientation) => {
            setLayoutChosen(true);
            change({ layout, orientation });
          }}
        />
        {fields.photos.length > LAYOUT_SLOTS[fields.layout] ? (
          <Typography sx={{ fontSize: 13.5, color: 'warning.dark' }} data-testid="photo-sheet-left-off">
            This layout holds {LAYOUT_SLOTS[fields.layout]}. The last {fields.photos.length - LAYOUT_SLOTS[fields.layout] === 1 ? 'photo does' : `${fields.photos.length - LAYOUT_SLOTS[fields.layout]} photos do`} not print.
          </Typography>
        ) : null}
      </Section>

      <Section title="3. The words">
        <TextField
          label="Full title"
          value={fields.title}
          onChange={(event) => typeIn(['title'], { title: event.target.value.slice(0, 300) })}
          multiline
          minRows={2}
          fullWidth
          helperText={titleNote(titleFit, fields, fromAi.includes('title'))}
          inputProps={{ 'data-testid': 'photo-sheet-title-input' }}
        />
        {fields.title.trim().length > 40 || fields.name.trim() ? (
          <TextField
            label="Short name (prints big)"
            placeholder="Like L-shaped sleeper sofa"
            value={fields.name}
            onChange={(event) => typeIn(['name'], { name: event.target.value.slice(0, 80) })}
            fullWidth
            size="small"
            helperText={fromAi.includes('name') ? 'From AI: check it.' : fields.name.trim() ? 'The full title prints smaller under it.' : 'A long title reads better with a few plain words on top.'}
            inputProps={{ 'data-testid': 'photo-sheet-name-input' }}
          />
        ) : null}
        <TextField
          label="Brand (small, above the title)"
          value={fields.brand}
          onChange={(event) => typeIn(['brand'], { brand: event.target.value.slice(0, 200) })}
          fullWidth
          size="small"
          helperText={fromAi.includes('brand') ? 'From AI: check it.' : fields.brand.trim() && !brandLine(fields.brand, titleLines(fields).big) ? 'The title starts with it, so it prints once.' : undefined}
        />
        {(['condition', 'size', 'in_box', 'good_to_know'] as FactKey[]).map((key) => {
          const labelKey = `label.${key}`;
          const ai = [fromAi.includes(labelKey) ? 'label' : '', fromAi.includes(key) ? 'words' : ''].filter(Boolean);
          return (
            <Stack key={key} direction="row" spacing={1} alignItems="flex-start">
              <TextField
                label="Label"
                value={fields.labels?.[key] ?? FACT_LABEL[key]}
                onChange={(event) => typeIn([labelKey], { labels: { ...fields.labels, [key]: event.target.value.slice(0, LABEL_MAX) } })}
                onBlur={() => {
                  // An emptied label goes back to the standard one.
                  if (!(fields.labels?.[key] ?? '').trim()) change({ labels: { ...fields.labels, [key]: FACT_LABEL[key] } });
                }}
                size="small"
                sx={{ width: 150, flex: '0 0 auto' }}
                inputProps={{ 'data-testid': `photo-sheet-label-input-${key}`, 'aria-label': `Label for ${FACT_LABEL[key]}` }}
              />
              <TextField
                label={key === 'condition' ? 'Prints bold, under the title' : 'Words'}
                placeholder={FACT_HINT[key]}
                value={fields.facts[key]}
                onChange={(event) => typeIn([key], { facts: { ...fields.facts, [key]: event.target.value.slice(0, FACT_MAX) } })}
                fullWidth
                size="small"
                helperText={ai.length ? `From AI (${ai.join(' and ')}): check it.` : undefined}
                inputProps={{ 'data-testid': `photo-sheet-fact-input-${key}`, 'aria-label': FACT_LABEL[key] }}
              />
            </Stack>
          );
        })}
        <FormControlLabel
          sx={{ mt: -1 }}
          control={<Checkbox checked={fields.not_assembled} onChange={(event) => typeIn(['not_assembled'], { not_assembled: event.target.checked })} data-testid="photo-sheet-not-assembled" />}
          label={`In the box, not assembled (prints bold, with the condition)${fromAi.includes('not_assembled') ? '. From AI: check it.' : ''}`}
        />
        <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: -1 }}>A box left empty does not print, label and all.</Typography>
        <Button
          variant="outlined"
          startIcon={ai.isPending ? <CircularProgress size={16} /> : <AutoAwesomeRounded />}
          onClick={() => ai.mutate()}
          disabled={ai.isPending || adding > 0 || (!fields.title.trim() && !product)}
          sx={{ alignSelf: 'flex-start', minHeight: 44 }}
          data-testid="photo-sheet-ai"
        >
          Clean up with AI
        </Button>
        <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: -1 }}>
          Cleans up every word and label from all Dash knows: the product, the truck's manifest row, the item, its
          history and notes, and the pictures. Words you typed stay. Check every word; you can change any of it.
        </Typography>
        {aiRead ? (
          <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: -1 }} data-testid="photo-sheet-ai-read">
            The AI read {aiRead.length ? joinWords(aiRead) : 'only the words on the sheet'}.
          </Typography>
        ) : null}
      </Section>

      <Section title="4. From the price tag (most sheets leave these off)">
        {item ? (
          <>
            <FormControlLabel
              control={<Checkbox checked={fields.show_price} onChange={(event) => change({ show_price: event.target.checked })} disabled={!item.price} inputProps={{ 'aria-label': 'Price' }} data-testid="photo-sheet-tick-price" />}
              label={item.price ? `Price (${sheetMoney(item.price)})` : 'Price (this item has none yet)'}
            />
            <FormControlLabel
              control={<Checkbox checked={fields.show_item_number} onChange={(event) => change({ show_item_number: event.target.checked })} inputProps={{ 'aria-label': 'Item number' }} data-testid="photo-sheet-tick-item" />}
              label={`Item number ${item.sku}, with its barcode`}
            />
            <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: -1 }}>
              Off unless you want them: the tag already says both, and a price can change.
            </Typography>
          </>
        ) : (
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }} data-testid="photo-sheet-no-ticks">
            Price and item number go on a sheet made from one tagged item.
          </Typography>
        )}
      </Section>
      {phone ? <Box sx={{ height: 72 }} /> : null}
    </Stack>
  );

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      onDragOver={dragOverIn}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOver(false); }}
      onDrop={dropIn}
      data-testid="photo-sheet-editor"
    >
      {header}
      {phone ? (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <Box sx={{ height: '46vh', p: 1.5, bgcolor: 'grey.200' }}>
            <Preview fields={fields} item={item} photoUrl={photoUrl} picked={cropping} onSlot={setCropping} onCrop={crop} onTitleFit={setTitleFit} onPlan={setRects} />
          </Box>
          <CropBar fields={fields} rects={rects} index={cropping} onCrop={crop} onDone={() => setCropping(null)} />
          {controls}
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 460px' }}>
          <Box sx={{ minHeight: 0, p: 3, pb: 1.5, bgcolor: 'grey.200', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <Preview fields={fields} item={item} photoUrl={photoUrl} picked={cropping} onSlot={setCropping} onCrop={crop} onTitleFit={setTitleFit} onPlan={setRects} />
            </Box>
            <CropBar fields={fields} rects={rects} index={cropping} onCrop={crop} onDone={() => setCropping(null)} />
          </Box>
          <Box sx={{ minHeight: 0, overflowY: 'auto', borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>{controls}</Box>
        </Box>
      )}
      <PhotoSheetPrintRoot fields={fields} item={item} photoUrl={photoUrl} />
      <Dialog open={askClose} onClose={() => setAskClose(false)}>
        <DialogTitle sx={{ fontWeight: 800 }}>Save this sheet?</DialogTitle>
        <DialogContent>
          <Typography>It has changes that are not saved. Saved, it prints again with one tap next time.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} sx={{ minHeight: 44 }}>Close without saving</Button>
          <Button
            variant="contained"
            sx={{ minHeight: 44 }}
            onClick={() => save.mutate(undefined, { onSuccess: () => onClose(), onError: () => setAskClose(false) })}
          >
            Save and close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function fieldsOf(sheet: PhotoSheetDTO): PhotoSheetFields {
  return {
    caption: sheet.caption ?? 'product', not_assembled: Boolean(sheet.not_assembled),
    contrast: sheet.contrast ?? 0, labels: sheet.labels ?? {}, typed: Array.isArray(sheet.typed) ? sheet.typed : null,
    title: sheet.title, name: sheet.name ?? '', brand: sheet.brand, facts: { ...emptySheet().facts, ...sheet.facts }, layout: sheet.layout,
    orientation: sheet.orientation, photos: sheet.photos, show_price: sheet.show_price, show_item_number: sheet.show_item_number,
  };
}

/** "a, b and c". */
function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Under the preview: what to do with a picture on the sheet, and the zoom, Reset and Done for the picked one (#108).
 * Screen only; nothing here prints.
 */
function CropBar({ fields, rects, index, onCrop, onDone }: {
  fields: PhotoSheetFields;
  rects: Rect[];
  index: number | null;
  onCrop: (index: number, crop: Crop | null) => void;
  onDone: () => void;
}) {
  const shown = Math.min(fields.photos.length, LAYOUT_SLOTS[fields.layout]);
  if (!shown) return null;
  const photo = index !== null ? fields.photos[index] : undefined;
  const rect = index !== null ? rects[index] : undefined;
  if (index === null || !photo || !rect) {
    return (
      // As tall as the bar, so the preview does not jump when a picture is picked.
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary', textAlign: 'center', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-testid="photo-sheet-crop-hint">
        Click a picture on the sheet to move it in its frame or zoom it.
      </Typography>
    );
  }
  const cover = photo.fit === 'fill' || Boolean(rect.crop);
  const now = cropOf(photo);
  const zoomTo = (zoom: number) => onCrop(index, zoomCrop(photo, now, zoom, rect, cover));
  // The slider moves in even steps however far in it is (a log scale): 0.5x, 1x, 2x and 4x sit evenly apart.
  const toSlider = (zoom: number) => Math.log2(zoom);
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', bgcolor: 'background.paper', borderRadius: 2, px: 1.5, py: 0.5, minHeight: 48, boxSizing: 'border-box', boxShadow: 1 }}
      data-testid="photo-sheet-crop-bar"
    >
      <Typography sx={{ fontSize: 13.5, fontWeight: 800, mr: 0.5 }}>
        {index === 0 ? 'Main picture' : `Picture ${index + 1}`}: drag it to move it
      </Typography>
      <Tooltip title="Zoom out">
        <IconButton size="small" onClick={() => zoomTo(now.zoom / 1.2)} disabled={now.zoom <= ZOOM_MIN + 0.001} aria-label="Zoom out" data-testid="photo-sheet-zoom-out"><RemoveRounded /></IconButton>
      </Tooltip>
      <Slider
        size="small"
        min={toSlider(ZOOM_MIN)}
        max={toSlider(ZOOM_MAX)}
        step={0.01}
        value={toSlider(now.zoom)}
        onChange={(_, value) => zoomTo(2 ** (value as number))}
        aria-label="Zoom"
        sx={{ width: 140 }}
        data-testid="photo-sheet-zoom"
      />
      <Tooltip title="Zoom in">
        <IconButton size="small" onClick={() => zoomTo(now.zoom * 1.2)} disabled={now.zoom >= ZOOM_MAX - 0.001} aria-label="Zoom in" data-testid="photo-sheet-zoom-in"><AddRounded /></IconButton>
      </Tooltip>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', minWidth: 40 }}>{Math.round(now.zoom * 100)}%</Typography>
      <Button size="small" startIcon={<RestartAltRounded />} onClick={() => onCrop(index, null)} disabled={!isCropped(photo)} sx={{ minHeight: 36 }} data-testid="photo-sheet-crop-reset">
        Reset
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button size="small" variant="contained" onClick={onDone} sx={{ minHeight: 36 }} data-testid="photo-sheet-crop-done">Done</Button>
    </Box>
  );
}

function savedWords(sheet: PhotoSheetDTO, dirty: boolean): string {
  if (dirty) return 'changes not saved';
  if (sheet.print_count) return `printed ${sheet.print_count === 1 ? 'once' : `${sheet.print_count} times`}`;
  return 'saved';
}

function titleNote(fit: { pt: number; lines: number } | null, fields: PhotoSheetFields, ai: boolean): string {
  const lead = ai ? 'From AI: check it. ' : '';
  if (!fields.title.trim()) return `${lead}Prints big across the top, never cut.`;
  if (!fit) return `${lead}Prints big across the top, never cut.`;
  const lines = fit.lines <= 1 ? 'one line' : fit.lines === 2 ? 'two lines' : `${fit.lines} lines`;
  const hint = fit.lines >= 3 && !fields.name.trim() ? ' A short name below would print bigger.' : '';
  return `${lead}Prints across the top on ${lines}, never cut.${hint}`;
}

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontWeight: 800, fontSize: 15 }}>{title}</Typography>
      {children}
    </Stack>
  );
}

/** The sheet at its true shape, scaled to the space it has: what you see is what prints (D24). */
function Preview(props: {
  fields: PhotoSheetFields;
  item: PhotoSheetItem | null;
  photoUrl: (file: number) => string | null;
  picked: number | null;
  onSlot: (index: number) => void;
  onCrop: (index: number, crop: Crop) => void;
  onTitleFit: (fit: { pt: number; lines: number }) => void;
  onPlan: (rects: Rect[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const measure = () => setSpace({ width: node.clientWidth, height: node.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const paper = paperSize(props.fields.orientation);
  const paperPx = { width: paper.width * 96, height: paper.height * 96 };
  const scale = space.width && space.height ? Math.min(space.width / paperPx.width, space.height / paperPx.height) : 0.5;
  return (
    <Box ref={box} sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-testid="photo-sheet-preview">
      <Box sx={{ width: paperPx.width * scale, height: paperPx.height * scale, boxShadow: '0 2px 10px rgba(0,0,0,0.25)', bgcolor: '#fff', flex: '0 0 auto', overflow: 'hidden' }}>
        <Box sx={{ width: paperPx.width, height: paperPx.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <PhotoSheetPaper
            fields={props.fields}
            item={props.item}
            photoUrl={props.photoUrl}
            editing
            picked={props.picked}
            onSlot={props.onSlot}
            onCrop={props.onCrop}
            onTitleFit={props.onTitleFit}
            onPlan={props.onPlan}
          />
        </Box>
      </Box>
    </Box>
  );
}

/** A small picture of each template, upright and sideways; a tap picks it (D24). */
function LayoutPicker({ layout, orientation, onPick }: {
  layout: SheetLayout;
  orientation: SheetOrientation;
  onPick: (layout: SheetLayout, orientation: SheetOrientation) => void;
}) {
  return (
    <Stack spacing={1.25}>
      {ORIENTATIONS.map((turn) => (
        <Box key={turn}>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.5 }}>{ORIENTATION_LABEL[turn]}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1 }}>
            {(turn === 'landscape' ? SIDEWAYS_ORDER : LAYOUTS).map((key) => {
              const on = key === layout && turn === orientation;
              return (
                <Tooltip key={key} title={`${LAYOUT_LABEL[key]}, ${ORIENTATION_LABEL[turn].toLowerCase()}`}>
                  <ButtonBase
                    onClick={() => onPick(key, turn)}
                    aria-pressed={on}
                    aria-label={`${LAYOUT_LABEL[key]}, ${ORIENTATION_LABEL[turn].toLowerCase()}`}
                    data-testid={`photo-sheet-layout-${key}-${turn}`}
                    sx={{
                      minHeight: 64, borderRadius: 1.5, border: 2, borderColor: on ? 'primary.main' : 'divider',
                      bgcolor: on ? 'action.selected' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 0.75,
                    }}
                  >
                    <LayoutThumb layout={key} orientation={turn} />
                  </ButtonBase>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      ))}
      <Typography sx={{ fontSize: 13.5, fontWeight: 700 }} data-testid="photo-sheet-layout-name">
        {LAYOUT_LABEL[layout]}, {ORIENTATION_LABEL[orientation].toLowerCase()}
      </Typography>
    </Stack>
  );
}

function LayoutThumb({ layout, orientation }: { layout: SheetLayout; orientation: SheetOrientation }) {
  const grid = layoutGrid(layout, orientation);
  const portrait = orientation === 'portrait';
  const w = portrait ? 34 : 44;
  const h = portrait ? 44 : 34;
  return (
    <Box sx={{ width: w, height: h, border: '1.5px solid', borderColor: 'text.secondary', borderRadius: '2px', p: '3px', display: 'flex', flexDirection: 'column', gap: '2px', bgcolor: '#fff' }}>
      <Box sx={{ height: 4, bgcolor: 'text.primary', borderRadius: '1px', width: '80%' }} />
      <Box sx={{ flex: 1, display: 'grid', gap: '2px', gridTemplateColumns: grid.columns, gridTemplateRows: grid.rows, gridTemplateAreas: grid.areas }}>
        {SLOT_AREAS.slice(0, LAYOUT_SLOTS[layout]).map((area) => (
          <Box key={area} sx={{ gridArea: area, bgcolor: 'grey.500', borderRadius: '1px' }} />
        ))}
      </Box>
      <Box sx={{ height: 2, bgcolor: 'grey.500', width: '60%' }} />
    </Box>
  );
}

/** The photos in sheet order: tap one then another to swap (or drag one onto another), Fit or Fill, turn, remove. */
function PhotoTiles({ rects, fields, photoUrl, picked, onTap, onSwap, onFit, onTurn, onReset, onRemove }: {
  rects: Rect[];
  fields: PhotoSheetFields;
  photoUrl: (file: number) => string | null;
  picked: number | null;
  onTap: (index: number) => void;
  onSwap: (a: number, b: number) => void;
  onFit: (index: number, fit: 'fit' | 'fill') => void;
  onTurn: (index: number) => void;
  onReset: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const dragging = useRef<number | null>(null);
  if (!fields.photos.length) {
    return (
      <Typography sx={{ color: 'text.secondary', fontSize: 14 }} data-testid="photo-sheet-no-photos">
        No pictures yet. Add up to {MAX_PHOTOS}: the first is the big one. Pick pictures of the whole item first, then any that show what comes with it.
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
      {fields.photos.map((photo, index) => {
        const url = photoUrl(photo.file);
        const on = picked === index;
        const off = index >= LAYOUT_SLOTS[fields.layout];
        return (
          <Box
            key={`${photo.file}-${index}`}
            data-testid={`photo-sheet-tile-${index}`}
            draggable
            onDragStart={() => { dragging.current = index; }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              if (dragging.current === null) return;
              event.preventDefault();
              event.stopPropagation();
              onSwap(dragging.current, index);
              dragging.current = null;
            }}
            sx={{ border: 2, borderColor: on ? 'primary.main' : 'divider', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.paper', opacity: off ? 0.55 : 1 }}
          >
            <ButtonBase onClick={() => onTap(index)} aria-pressed={on} aria-label={`Photo ${index + 1}${index === 0 ? ', the big one' : ''}`} sx={{ display: 'block', width: '100%' }}>
              <Box sx={{ position: 'relative', aspectRatio: '4 / 3', bgcolor: 'grey.100', containerType: 'size', overflow: 'hidden' }}>
                {url ? (
                  <Box
                    component="img"
                    src={url}
                    alt=""
                    sx={{
                      position: 'absolute', left: '50%', top: '50%',
                      width: photo.turn % 180 === 90 ? '100cqh' : '100%', height: photo.turn % 180 === 90 ? '100cqw' : '100%',
                      transform: `translate(-50%, -50%) rotate(${photo.turn}deg)`, objectFit: 'contain',
                    }}
                  />
                ) : <CircularProgress size={20} sx={{ position: 'absolute', left: 'calc(50% - 10px)', top: 'calc(50% - 10px)' }} />}
                <Box sx={{ position: 'absolute', left: 6, top: 6, bgcolor: 'rgba(17,24,39,0.85)', color: '#fff', borderRadius: 1, px: 0.75, fontSize: 12.5, fontWeight: 800 }}>
                  {index === 0 ? 'Main' : index + 1}{off ? ', not printed' : ''}
                </Box>
              </Box>
            </ButtonBase>
            {rects[index] && printQuality(photo, rects[index]) === 'fuzzy' ? (
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'warning.dark', px: 1, pt: 0.75 }} data-testid={`photo-sheet-fuzzy-${index}`}>
                This picture is small and may print fuzzy.
              </Typography>
            ) : null}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 0.75 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={photo.fit}
                onChange={(_, value) => { if (value) onFit(index, value); }}
                aria-label="Whole photo or cropped"
              >
                <ToggleButton value="fit" sx={{ px: 1.25, minHeight: 36, fontSize: 13, fontWeight: 700, textTransform: 'none' }} data-testid={`photo-sheet-fit-${index}`}>Fit</ToggleButton>
                <ToggleButton value="fill" sx={{ px: 1.25, minHeight: 36, fontSize: 13, fontWeight: 700, textTransform: 'none' }} data-testid={`photo-sheet-fill-${index}`}>Fill</ToggleButton>
              </ToggleButtonGroup>
              <Box sx={{ flex: 1 }} />
              {isCropped(photo) ? (
                <Tooltip title="Moved or zoomed on the sheet: put it back">
                  <IconButton size="small" onClick={() => onReset(index)} aria-label="Reset the move and zoom" sx={{ width: 36, height: 36 }} data-testid={`photo-sheet-tile-reset-${index}`}>
                    <RestartAltRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              <Tooltip title="Turn">
                <IconButton size="small" onClick={() => onTurn(index)} aria-label="Turn" sx={{ width: 36, height: 36 }}><RotateRightRounded fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Take off the sheet">
                <IconButton size="small" onClick={() => onRemove(index)} aria-label="Take off the sheet" sx={{ width: 36, height: 36 }}><CloseRounded fontSize="small" /></IconButton>
              </Tooltip>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

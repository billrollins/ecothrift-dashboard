import { useRef, useState, type ReactNode } from 'react';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { cleanUpWithAi, getAddItemTaxonomy, type AddItemProduct } from '../../../api/addItem.api';
import { AddPhoto } from '../../../components/photos/AddPhoto';
import { PickedPhotos } from '../../../components/photos/PickedPhotos';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { IconAiAssist } from '../../../icons/ecoIcons';
import { PROCESSING_ITEM_CONDITION_OPTIONS } from '../processing/processingItemFormOptions';
import { processingTokens } from '../processing/processingTokens';
import { ProductPhoto } from './AddItemFindStep';
import {
  applyCleanUp, editBox, flipMark, hasSomethingToGoOn, newProductProblems, productName, specFromForm, subcategoriesFor,
  typedBoxes, viewAll, type AiMarks, type BoxName, type NewProductForm,
} from './addItemModel';

const MAX_PHOTOS = 8;
// Salvage is not something we add for sale.
const CONDITIONS = PROCESSING_ITEM_CONDITION_OPTIONS.filter((o) => o.value !== 'salvage');

export interface FormState {
  form: NewProductForm;
  marks: AiMarks;
}

/** A box the AI filled: a soft green fill and an "AI" mark on its corner. Tap the mark to see what was there. */
function Marked({ mark, onFlip, children }: { mark?: AiMarks[BoxName]; onFlip: () => void; children: ReactNode }) {
  if (!mark) return <Box sx={{ minWidth: 0 }}>{children}</Box>;
  const ai = mark.viewing === 'ai';
  return (
    <Box sx={{ position: 'relative', minWidth: 0, ...(ai ? { '& .MuiOutlinedInput-root': { bgcolor: processingTokens.primarySoft } } : {}) }}>
      {children}
      <Tooltip title={ai ? `Filled by AI. Tap to see what was there${mark.before ? '' : ' (it was empty)'}.` : 'What was there before. Tap for the AI value.'}>
        <Chip
          size="small"
          variant="outlined"
          icon={<SwapHoriz sx={{ fontSize: 14 }} />}
          label={ai ? 'AI' : 'Orig'}
          onClick={onFlip}
          aria-label={ai ? 'Filled by AI: show what was there before' : 'Showing what was there: show the AI value'}
          sx={{
            position: 'absolute', top: -9, right: 8, height: 18, cursor: 'pointer', fontWeight: 700, zIndex: 1,
            bgcolor: ai ? processingTokens.primarySoftStrong : 'background.paper',
            borderColor: ai ? processingTokens.primary : 'divider',
            color: ai ? processingTokens.primaryDark : 'text.secondary',
            '& .MuiChip-label': { px: 0.6, fontSize: '0.68rem' },
            '& .MuiChip-icon': { color: 'inherit', ml: 0.4 },
          }}
        />
      </Tooltip>
    </Box>
  );
}

/**
 * Step 2: not found, so make the product (Dash Updates #96). Dump anything: the big box, photos, and any of the usual
 * boxes. One button, "Clean up with AI", fills the rest; what the person typed in a box always wins. Each AI-filled box
 * carries a mark with a way back. Nothing is needed before the button except something to go on, and the boxes can
 * always be filled by hand.
 */
export function AddItemNewProductStep({
  state,
  onStateChange,
  photos,
  onPhotosChange,
  copiedFrom,
  onBack,
  onNext,
}: {
  state: FormState;
  onStateChange: (next: FormState) => void;
  photos: File[];
  onPhotosChange: (files: File[]) => void;
  copiedFrom: AddItemProduct | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const { form, marks } = state;
  const taxonomy = useQuery({ queryKey: ['add-item-taxonomy'], queryFn: getAddItemTaxonomy, staleTime: Infinity });
  const categories = taxonomy.data ?? [];
  const [nothing, setNothing] = useState(false);
  const [result, setResult] = useState<{ filled: number; problems: string[]; confidence: string; priceFrom: string } | null>(null);
  // The boxes may change while the AI works: its answer goes onto what is on screen then, never over a typed box.
  const latest = useRef(state);
  latest.current = state;
  const ai = useMutation({
    mutationFn: () => cleanUpWithAi(form.anything.trim(), typedBoxes(form, marks), photos),
    onSuccess: (res) => {
      onStateChange(applyCleanUp(latest.current.form, latest.current.marks, res));
      setResult({ filled: res.filled.length, problems: res.problems, confidence: res.confidence, priceFrom: res.price_from });
    },
  });
  const subs = subcategoriesFor(categories, form.category);
  const blockers = categories.length ? newProductProblems(specFromForm(form), categories) : ['Loading the categories…'];
  const marked = Object.keys(marks) as BoxName[];
  const showingAi = marked.some((b) => marks[b]?.viewing === 'ai');
  const showingBefore = marked.some((b) => marks[b]?.viewing === 'before');

  const set = (box: BoxName, value: string) => {
    let next = editBox(form, marks, box, value);
    if (box === 'category' && value !== form.category) next = editBox(next.form, next.marks, 'subcategory', '');
    onStateChange(next);
  };
  const flip = (box: BoxName) => onStateChange(flipMark(form, marks, box));
  const box = (name: BoxName, node: ReactNode) => <Marked mark={marks[name]} onFlip={() => flip(name)}>{node}</Marked>;

  const runCleanUp = () => {
    if (!hasSomethingToGoOn(form, photos)) {
      setNothing(true);
      return;
    }
    setNothing(false);
    ai.mutate();
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, sm: 3 }, py: 2 }}>
        {copiedFrom && (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2, p: 1, borderRadius: 1.5, bgcolor: 'action.hover' }}>
            <ProductPhoto url={copiedFrom.photo_url} size={40} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">Copied from</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{productName(copiedFrom)}</Typography>
            </Box>
          </Stack>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '320px minmax(0, 1fr)' }, gap: { xs: 2, md: 3 } }}>
          <Stack spacing={1.5}>
            <TextField
              label="Anything you know about it"
              placeholder={'Paste a web page, a model number, a sentence, a list. Anything.\nIt is kept with the product.'}
              value={form.anything}
              onChange={(e) => {
                setNothing(false);
                onStateChange({ form: { ...form, anything: e.target.value }, marks });
              }}
              multiline
              minRows={7}
              maxRows={16}
              fullWidth
              autoFocus={!form.anything && !copiedFrom}
              inputProps={{ 'data-testid': 'add-item-anything' }}
            />
            {photos.length > 0 && (
              <PickedPhotos
                photos={photos}
                disabled={ai.isPending}
                onRemove={(i) => onPhotosChange(photos.filter((_, j) => j !== i))}
                onChange={(i, file) => onPhotosChange(photos.map((p, j) => (j === i ? file : p)))}
              />
            )}
            {photos.length < MAX_PHOTOS && (
              <AddPhoto
                fullWidth
                multiple
                max={MAX_PHOTOS - photos.length}
                startIcon={<PhotoCameraOutlined />}
                onPhotos={(files) => {
                  setNothing(false);
                  onPhotosChange([...photos, ...files].slice(0, MAX_PHOTOS));
                }}
                usedWhere="Add item"
                usedOn="save"
                disabled={ai.isPending}
                label={photos.length ? 'Add more photos' : 'Add photos (optional)'}
                sx={{ height: 48, borderStyle: 'dashed' }}
              />
            )}
            <Button
              variant="contained"
              size="large"
              startIcon={ai.isPending ? <CircularProgress size={16} color="inherit" /> : <IconAiAssist />}
              disabled={ai.isPending}
              onClick={runCleanUp}
            >
              {ai.isPending ? 'Cleaning up…' : 'Clean up with AI'}
            </Button>
            {nothing && (
              <Alert severity="info">
                Give the AI something to go on first: type or paste anything you know about it, or add a photo.
              </Alert>
            )}
            {ai.isError && (
              <Alert severity="error">
                {apiErrorDetail(ai.error, 'The AI could not clean this one up right now. Your boxes are as you left them: try again, or fill them in by hand.')}
              </Alert>
            )}
            {ai.isPending && (
              <Typography variant="caption" color="text.secondary">
                This takes a few seconds{photos.length ? ' with photos' : ''}. You can keep typing in the boxes; the AI never changes a box you filled.
              </Typography>
            )}
            {!ai.isPending && result && !ai.isError && (
              <Alert severity={result.confidence === 'low' || result.problems.length ? 'warning' : 'success'} sx={{ py: 0.25 }}>
                {result.filled
                  ? `The AI filled ${result.filled} box${result.filled === 1 ? '' : 'es'} (marked AI${result.confidence ? `, ${result.confidence} confidence` : ''}). What you typed was kept. Check them, then go on.`
                  : 'The AI had nothing to add. What you typed was kept.'}
                {result.problems.length ? ` ${result.problems.join(' ')}` : ''}
              </Alert>
            )}
            {!result && !ai.isPending && (
              <Typography variant="caption" color="text.secondary">
                Fill any boxes you want, or none. The AI fills the rest: title, brand, model, category, condition, tags,
                identifiers, specifications, a price to start from and the retail. A box you filled always wins.
              </Typography>
            )}
          </Stack>

          <Stack spacing={1.75}>
            {marked.length > 0 && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  Boxes marked AI were filled by the AI. Tap a mark to see what was there.
                </Typography>
                <Button size="small" variant={showingBefore && !showingAi ? 'contained' : 'outlined'}
                  onClick={() => onStateChange(viewAll(form, marks, 'before'))}>Original</Button>
                <Button size="small" variant={showingAi && !showingBefore ? 'contained' : 'outlined'}
                  onClick={() => onStateChange(viewAll(form, marks, 'ai'))}>AI values</Button>
              </Stack>
            )}
            {box('title', (
              <TextField label="Title" required value={form.title} onChange={(e) => set('title', e.target.value)}
                fullWidth size="small" inputProps={{ maxLength: 120 }} />
            ))}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              {box('brand', <TextField label="Brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} size="small" fullWidth placeholder="Generic" />)}
              {box('model', <TextField label="Model" value={form.model} onChange={(e) => set('model', e.target.value)} size="small" fullWidth />)}
              {box('category', (
                <TextField select label="Category" required fullWidth
                  value={categories.some((c) => c.name === form.category) ? form.category : ''}
                  onChange={(e) => set('category', e.target.value)} size="small"
                  SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}>
                  {categories.map((c) => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}
                </TextField>
              ))}
              {box('subcategory', (
                <TextField select label="Subcategory" required={subs.length > 0} disabled={!subs.length} fullWidth
                  value={subs.includes(form.subcategory) ? form.subcategory : ''}
                  onChange={(e) => set('subcategory', e.target.value)} size="small">
                  {subs.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </TextField>
              ))}
              {box('short_name', (
                <TextField label="Tag name" value={form.short_name} onChange={(e) => set('short_name', e.target.value)} fullWidth
                  size="small" helperText={`${form.short_name.length}/28 · optional`} inputProps={{ maxLength: 28 }} />
              ))}
              {box('upc', (
                <TextField label="UPC" value={form.upc} onChange={(e) => set('upc', e.target.value)} size="small" fullWidth
                  helperText="Optional" inputProps={{ inputMode: 'numeric' }} />
              ))}
              {box('condition', (
                <TextField select label="Condition" value={form.condition} onChange={(e) => set('condition', e.target.value)}
                  size="small" fullWidth helperText="You can change it at check-in">
                  <MenuItem value=""><em>Not set</em></MenuItem>
                  {CONDITIONS.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </TextField>
              ))}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {box('price', (
                  <TextField label="Price to start" value={form.price} onChange={(e) => set('price', e.target.value)} size="small" fullWidth
                    inputProps={{ inputMode: 'decimal' }}
                    helperText={marks.price?.viewing === 'ai' && result?.priceFrom ? `From ${result.priceFrom}` : 'Optional'} />
                ))}
                {box('retail', (
                  <TextField label="Retail" value={form.retail} onChange={(e) => set('retail', e.target.value)} size="small" fullWidth
                    inputProps={{ inputMode: 'decimal' }} helperText="New, in a store" />
                ))}
              </Box>
            </Box>
            {box('tags', (
              <TextField label="Tags" value={form.tags} onChange={(e) => set('tags', e.target.value)} size="small" fullWidth
                placeholder="coffee, single serve" helperText="Words a shopper might search, with commas between" />
            ))}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              {box('identifiers', (
                <TextField label="Identifiers" value={form.identifiers} onChange={(e) => set('identifiers', e.target.value)}
                  size="small" fullWidth multiline minRows={2} placeholder={'mpn: 5000200237\nasin: B07GV2S1GS'}
                  helperText="One a line: name: value" />
              ))}
              {box('specifications', (
                <TextField label="Specifications" value={form.specifications} onChange={(e) => set('specifications', e.target.value)}
                  size="small" fullWidth multiline minRows={2} placeholder={'Capacity: 6-12 oz\nColor: Black'}
                  helperText="One a line: name: value" />
              ))}
            </Box>
          </Stack>
        </Box>
      </Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: { xs: 2, sm: 3 }, py: 1.25, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Button onClick={onBack} disabled={ai.isPending}>Back</Button>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
          {blockers[0] ?? ''}
        </Typography>
        <Box sx={{ flex: { xs: 1, sm: 0 } }} />
        <Button variant="contained" disabled={blockers.length > 0 || ai.isPending} onClick={onNext}>
          Next: check in
        </Button>
      </Stack>
    </Box>
  );
}

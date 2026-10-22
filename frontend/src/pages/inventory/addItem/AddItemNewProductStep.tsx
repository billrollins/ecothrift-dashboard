import { useEffect, useMemo, useRef, useState } from 'react';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  aiFillProduct, getAddItemTaxonomy, type AddItemProduct, type NewProductSpec,
} from '../../../api/addItem.api';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { IconAiAssist, IconClose } from '../../../icons/ecoIcons';
import { ProductPhoto } from './AddItemFindStep';
import { newProductProblems, productName, specFromDraft, subcategoriesFor } from './addItemModel';

/** The photo picker: the camera on a phone, a file on a desk. */
function PhotoPicker({ photo, onChange, disabled }: { photo: File | null; onChange: (f: File | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return (
    <Box>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {url ? (
        <Box sx={{ position: 'relative', width: '100%', maxWidth: { xs: 220, md: '100%' } }}>
          <Box component="img" src={url} alt="The item" sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 1.5, display: 'block' }} />
          <IconButton
            size="small"
            aria-label="Remove the photo"
            onClick={() => onChange(null)}
            disabled={disabled}
            sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper', '&:hover': { bgcolor: 'background.paper' } }}
          >
            <IconClose fontSize="small" />
          </IconButton>
        </Box>
      ) : (
        <Button
          fullWidth
          variant="outlined"
          startIcon={<PhotoCameraOutlined />}
          onClick={() => input.current?.click()}
          disabled={disabled}
          sx={{ height: { xs: 56, md: 140 }, borderStyle: 'dashed' }}
        >
          Add a photo (optional)
        </Button>
      )}
    </Box>
  );
}

/**
 * Step 2: not found, so make the product. Copy a near match and edit it, let the AI draft it from a rough title and
 * an optional photo, or type it in. Category and subcategory are the taxonomy's exact names.
 */
export function AddItemNewProductStep({
  spec,
  onSpecChange,
  photo,
  onPhotoChange,
  copiedFrom,
  roughTitle,
  onBack,
  onNext,
}: {
  spec: NewProductSpec;
  onSpecChange: (next: NewProductSpec) => void;
  photo: File | null;
  onPhotoChange: (f: File | null) => void;
  copiedFrom: AddItemProduct | null;
  roughTitle: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const taxonomy = useQuery({ queryKey: ['add-item-taxonomy'], queryFn: getAddItemTaxonomy, staleTime: Infinity });
  const categories = taxonomy.data ?? [];
  const [rough, setRough] = useState(roughTitle);
  const [problems, setProblems] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<string>('');
  const ai = useMutation({
    mutationFn: () => aiFillProduct(rough.trim(), photo),
    onSuccess: (data) => {
      onSpecChange({ ...specFromDraft(data.draft, data.model), upc: spec.upc });
      setProblems(data.problems);
      setConfidence(data.draft.confidence);
    },
  });
  const isAi = spec.how === 'ai';
  const drafted = isAi && Boolean(spec.ai);
  const showForm = !isAi || drafted;
  const subs = subcategoriesFor(categories, spec.category);
  const blockers = categories.length ? newProductProblems(spec, categories) : ['Loading the categories…'];
  const set = (patch: Partial<NewProductSpec>) => onSpecChange({ ...spec, ...patch });

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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: isAi ? '240px minmax(0, 1fr)' : 'minmax(0, 1fr)' }, gap: { xs: 2, md: 3 } }}>
          {isAi && (
            <Stack spacing={1.5}>
              <TextField
                label="Rough title"
                placeholder="e.g. keurig mini coffee maker"
                value={rough}
                onChange={(e) => setRough(e.target.value)}
                autoFocus={!rough}
                fullWidth
                size="small"
              />
              <PhotoPicker photo={photo} onChange={onPhotoChange} disabled={ai.isPending} />
              <Button
                variant={drafted ? 'outlined' : 'contained'}
                startIcon={ai.isPending ? <CircularProgress size={16} color="inherit" /> : <IconAiAssist />}
                disabled={ai.isPending || (!rough.trim() && !photo)}
                onClick={() => ai.mutate()}
              >
                {drafted ? 'Draft again' : 'Draft it with AI'}
              </Button>
              {ai.isError && <Alert severity="error">{apiErrorDetail(ai.error, 'The AI could not draft this one.')}</Alert>}
              {!drafted && (
                <Typography variant="caption" color="text.secondary" sx={{ display: { md: 'none' } }}>
                  The AI fills in the title, brand, model, category and a retail estimate. You check them first.
                </Typography>
              )}
            </Stack>
          )}
          {showForm ? (
            <Stack spacing={1.75}>
              {drafted && (
                <Alert severity={confidence === 'low' || problems.length ? 'warning' : 'info'} sx={{ py: 0.25 }}>
                  The AI drafted this{confidence ? ` (${confidence} confidence)` : ''}. Check every field, then go on.
                  {problems.length ? ` ${problems.join(' ')}` : ''}
                </Alert>
              )}
              <TextField label="Title" required value={spec.title} onChange={(e) => set({ title: e.target.value })}
                fullWidth size="small" autoFocus={!isAi} inputProps={{ maxLength: 120 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <TextField label="Brand" value={spec.brand} onChange={(e) => set({ brand: e.target.value })} size="small"
                  placeholder="Generic" />
                <TextField label="Model" value={spec.model} onChange={(e) => set({ model: e.target.value })} size="small" />
                <TextField
                  select
                  label="Category"
                  required
                  value={categories.some((c) => c.name === spec.category) ? spec.category : ''}
                  onChange={(e) => set({ category: e.target.value, subcategory: '' })}
                  size="small"
                  SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
                >
                  {categories.map((c) => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}
                </TextField>
                <TextField
                  select
                  label="Subcategory"
                  required={subs.length > 0}
                  disabled={!subs.length}
                  value={subs.includes(spec.subcategory) ? spec.subcategory : ''}
                  onChange={(e) => set({ subcategory: e.target.value })}
                  size="small"
                >
                  {subs.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </TextField>
                <TextField label="Tag name" value={spec.short_name ?? ''} onChange={(e) => set({ short_name: e.target.value })}
                  size="small" helperText={`${(spec.short_name ?? '').length}/28 · optional`} inputProps={{ maxLength: 28 }} />
                <TextField label="UPC" value={spec.upc ?? ''} onChange={(e) => set({ upc: e.target.value })} size="small"
                  helperText="Optional" inputProps={{ inputMode: 'numeric' }} />
              </Box>
              {spec.retail_estimate && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={`Retail estimate $${Number(spec.retail_estimate).toFixed(2)}`} />
                  <Typography variant="caption" color="text.secondary">
                    {spec.how === 'copy' ? 'from the product you copied' : 'from the AI'}; you check it at check-in.
                  </Typography>
                </Stack>
              )}
            </Stack>
          ) : (
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center', color: 'text.secondary',
              border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 1.5, minHeight: 240, p: 3, textAlign: 'center' }}>
              <Typography variant="body2">
                Type a rough title, add a photo if you have one, and press Draft. The AI fills in the title, brand, model,
                category and a retail estimate. You check them before anything is saved.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: { xs: 2, sm: 3 }, py: 1.25, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Button onClick={onBack}>Back</Button>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
          {showForm && blockers.length ? blockers[0] : ''}
        </Typography>
        <Box sx={{ flex: { xs: 1, sm: 0 } }} />
        <Button variant="contained" disabled={!showForm || blockers.length > 0} onClick={onNext}>
          Next: check in
        </Button>
      </Stack>
    </Box>
  );
}

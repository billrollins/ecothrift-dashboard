import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useSnackbar } from 'notistack';
import { isAxiosError } from 'axios';
import type {
  ElementKindShape,
  FloorPlanAsset,
  FloorPlanElementKind,
  FloorPlanElementKindPayload,
} from '../../types/floorplan.types';
import {
  useCreateFloorPlanElementKind,
  useDeleteFloorPlanElementKind,
  useUpdateFloorPlanElementKind,
} from '../../hooks/useFloorplanElementKinds';
import { formatInches, parseInches } from './geometry';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

interface ElementKindDialogProps {
  open: boolean;
  /** Existing kind to edit, or null to create a new one */
  kind: FloorPlanElementKind | null;
  /** Existing category names, offered as autocomplete options */
  categories: string[];
  /** Image asset library for the default-image picker */
  assets: FloorPlanAsset[];
  /** Uploads a file to the library; resolves to the new asset or null */
  onUploadAsset?: (file: File) => Promise<FloorPlanAsset | null>;
  onClose: () => void;
}

interface FormState {
  label: string;
  category: string;
  wText: string;
  hText: string;
  fillColor: string;
  shape: ElementKindShape;
  radiusText: string;
  resizable: boolean;
  isWall: boolean;
  defaultImage: number | null;
}

function formFromKind(kind: FloorPlanElementKind | null): FormState {
  return {
    label: kind?.label ?? '',
    category: kind?.category ?? '',
    wText: kind ? formatInches(kind.default_w) : '48"',
    hText: kind ? formatInches(kind.default_h) : '48"',
    fillColor: kind?.fill_color ?? '#9e9e9e',
    shape: kind?.shape ?? 'rect',
    radiusText: kind ? formatInches(kind.corner_radius) : '0"',
    resizable: kind?.resizable ?? true,
    isWall: kind?.is_wall ?? false,
    defaultImage: kind?.default_image ?? null,
  };
}

function apiErrorText(err: unknown): string {
  if (isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const data = err.response.data as Record<string, unknown>;
    const first = Object.values(data)[0];
    const msg = Array.isArray(first) ? first[0] : first;
    if (typeof msg === 'string') return msg;
  }
  return 'Save failed. Check the fields and try again.';
}

/** Super Admin create/edit dialog for palette element types. */
export default function ElementKindDialog({ open, kind, categories, assets, onUploadAsset, onClose }: ElementKindDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const createKind = useCreateFloorPlanElementKind();
  const updateKind = useUpdateFloorPlanElementKind();
  const deleteKind = useDeleteFloorPlanElementKind();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(() => formFromKind(kind));
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(formFromKind(kind));
      setError(null);
      setConfirmingDelete(false);
    }
  }, [open, kind]);

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const parsed = useMemo(() => {
    const w = parseInches(form.wText);
    const h = parseInches(form.hText);
    const radius = form.shape === 'circle' ? 0 : parseInches(form.radiusText);
    return { w, h, radius };
  }, [form.wText, form.hText, form.radiusText, form.shape]);

  const validation = useMemo(() => {
    if (!form.label.trim()) return 'Name is required.';
    if (parsed.w == null || parsed.w <= 0) return 'Width must be a positive size, e.g. 48" or 4\'.';
    if (parsed.h == null || parsed.h <= 0) return 'Depth must be a positive size.';
    if (form.shape === 'rect' && (parsed.radius == null || parsed.radius < 0)) {
      return 'Corner radius must be 0 or a positive size.';
    }
    if (!HEX_COLOR_RE.test(form.fillColor)) return 'Pick a fill color.';
    return null;
  }, [form, parsed]);

  const saving = createKind.isPending || updateKind.isPending || deleteKind.isPending;

  const handleSave = async () => {
    if (validation) {
      setError(validation);
      return;
    }
    const payload: FloorPlanElementKindPayload = {
      label: form.label.trim(),
      category: form.category.trim() || 'Misc',
      default_w: parsed.w as number,
      default_h: parsed.h as number,
      fill_color: form.fillColor.toLowerCase(),
      default_image: form.defaultImage,
      shape: form.shape,
      corner_radius: parsed.radius ?? 0,
      resizable: form.resizable,
      is_wall: form.isWall,
    };
    try {
      if (kind) {
        await updateKind.mutateAsync({ id: kind.id, payload });
        enqueueSnackbar(`Updated "${payload.label}"`, { variant: 'success' });
      } else {
        await createKind.mutateAsync(payload);
        enqueueSnackbar(`Added "${payload.label}" to the palette`, { variant: 'success' });
      }
      onClose();
    } catch (err) {
      setError(apiErrorText(err));
    }
  };

  const handleDelete = async () => {
    if (!kind) return;
    try {
      await deleteKind.mutateAsync(kind.id);
      enqueueSnackbar(`Removed "${kind.label}" from the palette`, { variant: 'success' });
      onClose();
    } catch (err) {
      setError(apiErrorText(err));
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || !onUploadAsset) return;
    setUploading(true);
    const asset = await onUploadAsset(file);
    setUploading(false);
    if (asset) set({ defaultImage: asset.id });
  };

  const currentImage = form.defaultImage != null ? assets.find((a) => a.id === form.defaultImage) : undefined;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {kind ? 'Edit element type' : 'New element type'}
        {kind?.is_system && <Chip size="small" label="Built-in" />}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            size="small"
            label="Name"
            value={form.label}
            onChange={(e) => set({ label: e.target.value })}
            autoFocus={!kind}
          />
          <Autocomplete
            freeSolo
            size="small"
            options={categories}
            value={form.category}
            onInputChange={(_, value) => set({ category: value })}
            renderInput={(params) => <TextField {...params} label="Category" placeholder="Fixtures" />}
          />
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              label="Default width"
              value={form.wText}
              onChange={(e) => set({ wText: e.target.value })}
              helperText={'e.g. 48" or 4\''}
            />
            <TextField
              size="small"
              label="Default depth"
              value={form.hText}
              onChange={(e) => set({ hText: e.target.value })}
            />
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">Footprint shape</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              fullWidth
              value={form.shape}
              onChange={(_, value: ElementKindShape | null) => value && set({ shape: value })}
              aria-label="Footprint shape"
            >
              <ToggleButton value="rect">Rectangle</ToggleButton>
              <ToggleButton value="circle">Circle / oval</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {form.shape === 'rect' && (
            <TextField
              size="small"
              label="Corner radius"
              value={form.radiusText}
              onChange={(e) => set({ radiusText: e.target.value })}
              helperText={'0" = sharp corners'}
            />
          )}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="caption" color="text.secondary">Fill color</Typography>
            <input
              type="color"
              value={HEX_COLOR_RE.test(form.fillColor) ? form.fillColor : '#9e9e9e'}
              onChange={(e) => set({ fillColor: e.target.value })}
              aria-label="Fill color"
              style={{ width: 40, height: 28, border: 'none', padding: 0, background: 'none' }}
            />
            <Typography variant="caption" color="text.secondary">Resizable</Typography>
            <Switch
              size="small"
              checked={form.resizable}
              onChange={(e) => set({ resizable: e.target.checked })}
              inputProps={{ 'aria-label': 'Resizable' }}
            />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Switch
              size="small"
              checked={form.isWall}
              onChange={(e) => set({ isWall: e.target.checked })}
              inputProps={{ 'aria-label': 'Wall behavior' }}
            />
            <Box>
              <Typography variant="body2">Wall behavior</Typography>
              <Typography variant="caption" color="text.secondary">
                Thickness survives rotation; resizing changes length only; group scaling never fattens it.
              </Typography>
            </Box>
          </Stack>
          <Stack spacing={0.75}>
            <Typography variant="caption" color="text.secondary">Default image (optional)</Typography>
            {currentImage && (
              <Box
                component="img"
                src={currentImage.data}
                alt={currentImage.name}
                sx={{ width: '100%', maxHeight: 80, objectFit: 'contain', border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: '#fff' }}
              />
            )}
            <Select<number | ''>
              size="small"
              displayEmpty
              value={form.defaultImage ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                set({ defaultImage: v === '' || v == null ? null : Number(v) });
              }}
              renderValue={(v) => (v === '' ? 'None (solid color)' : assets.find((a) => a.id === v)?.name ?? `Asset ${v}`)}
              aria-label="Default image"
            >
              <MenuItem value="">None (solid color)</MenuItem>
              {assets.map((asset) => (
                <MenuItem key={asset.id} value={asset.id}>
                  <Box component="img" src={asset.data} alt="" sx={{ width: 18, height: 18, objectFit: 'contain', mr: 1 }} />
                  {asset.name}
                </MenuItem>
              ))}
            </Select>
            {onUploadAsset && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg"
                  hidden
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                >
                  {uploading ? 'Uploading…' : 'Choose from file…'}
                </Button>
              </>
            )}
          </Stack>
          {kind && !kind.is_system && (
            <Box>
              {confirmingDelete ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="error">
                    Remove from palette? Already-placed elements keep rendering.
                  </Typography>
                  <Button size="small" color="error" onClick={() => void handleDelete()} disabled={saving}>
                    Remove
                  </Button>
                  <Button size="small" onClick={() => setConfirmingDelete(false)}>Keep</Button>
                </Stack>
              ) : (
                <Button size="small" color="error" onClick={() => setConfirmingDelete(true)} sx={{ textTransform: 'none' }}>
                  Remove from palette…
                </Button>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || Boolean(validation)}>
          {saving ? 'Saving…' : kind ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

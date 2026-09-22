import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useSnackbar } from 'notistack';
import { generateKindSvg, type GenerateSvgResult } from '../../api/floorplanAi.api';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useUploadFloorPlanAsset } from '../../hooks/useFloorplanAssets';
import { useCreateFloorPlanElementKind, useUpdateFloorPlanElementKind } from '../../hooks/useFloorplanElementKinds';
import { formatApiError } from '../../pages/admin/labelStudio/labelStudioUtils';
import type { FloorPlanElementKind } from '../../types/floorplan.types';
import AiModelEffortFields, { EMPTY_AI_CHOICE, type AiRunChoice } from './AiModelEffortFields';
import { dataUriToFile, svgFileName } from './aiHelpers';
import { formatInches, parseInches } from './geometry';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const NEW_TARGET = 'new';

interface Brief {
  target: string;
  label: string;
  width: string;
  depth: string;
  category: string;
  fillColor: string;
  notes: string;
}

const EMPTY_BRIEF: Brief = {
  target: NEW_TARGET,
  label: '',
  width: '48"',
  depth: '48"',
  category: 'Fixtures',
  fillColor: '#9e9e9e',
  notes: '',
};

interface Props {
  open: boolean;
  kinds: FloorPlanElementKind[];
  categories: string[];
  onClose: () => void;
}

export default function BuildSvgDialog({ open, kinds, categories, onClose }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const uploadAsset = useUploadFloorPlanAsset();
  const createKind = useCreateFloorPlanElementKind();
  const updateKind = useUpdateFloorPlanElementKind();
  const [brief, setBrief] = useState<Brief>(EMPTY_BRIEF);
  const [choice, setChoice] = useState<AiRunChoice>(EMPTY_AI_CHOICE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateSvgResult | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    if (open) {
      setBrief(EMPTY_BRIEF);
      setChoice(EMPTY_AI_CHOICE);
      setError(null);
      setResult(null);
      setConfirmReplace(false);
    }
  }, [open]);

  const targetKind = useMemo(
    () => (brief.target === NEW_TARGET ? null : kinds.find((k) => String(k.id) === brief.target) ?? null),
    [brief.target, kinds],
  );

  const set = (patch: Partial<Brief>) => {
    setBrief((b) => ({ ...b, ...patch }));
    setResult(null);
  };

  const pickTarget = (target: string) => {
    const kind = target === NEW_TARGET ? null : kinds.find((k) => String(k.id) === target) ?? null;
    if (!kind) {
      set({ ...EMPTY_BRIEF });
      return;
    }
    set({
      target,
      label: kind.label,
      width: formatInches(kind.default_w),
      depth: formatInches(kind.default_h),
      category: kind.category,
      fillColor: kind.fill_color,
      notes: '',
    });
  };

  const handleClose = () => {
    if (!busy) onClose();
  };

  const generate = async () => {
    const width = parseInches(brief.width);
    const depth = parseInches(brief.depth);
    if (!brief.label.trim()) {
      setError('Give the element a name.');
      return;
    }
    if (width == null || depth == null || width < 1 || depth < 1 || width > 12000 || depth > 12000) {
      setError('Width and depth must be between 1 inch and 1000 feet.');
      return;
    }
    if (!HEX_RE.test(brief.fillColor)) {
      setError('Base color must look like #9e9e9e.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await generateKindSvg({
        label: brief.label.trim(),
        width,
        depth,
        category: brief.category.trim() || 'Misc',
        fill_color: brief.fillColor.toLowerCase(),
        notes: brief.notes.trim(),
        model: choice.model,
        effort: choice.effort,
      });
      setResult(data);
    } catch (err) {
      setError(formatApiError(err, 'Could not build the SVG.'));
    } finally {
      setBusy(false);
    }
  };

  const finishApply = async () => {
    if (!result) return;
    setConfirmReplace(false);
    setBusy(true);
    setError(null);
    try {
      const label = brief.label.trim();
      const file = dataUriToFile(result.svg_data_uri, svgFileName(label));
      // No location: the asset is shared, so the kind's image shows at every store.
      const asset = await uploadAsset.mutateAsync({ file, name: label });
      if (targetKind) {
        await updateKind.mutateAsync({ id: targetKind.id, payload: { default_image: asset.id } });
        enqueueSnackbar(`Updated the image for "${targetKind.label}"`, { variant: 'success' });
      } else {
        await createKind.mutateAsync({
          label,
          category: brief.category.trim() || 'Misc',
          default_w: result.width,
          default_h: result.depth,
          fill_color: brief.fillColor.toLowerCase(),
          default_image: asset.id,
          shape: 'rect',
          corner_radius: 0,
          resizable: true,
        });
        enqueueSnackbar(`Added "${label}" to the palette`, { variant: 'success' });
      }
      onClose();
    } catch (err) {
      setError(formatApiError(err, 'Could not save the new image.'));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!result) return;
    if (targetKind?.default_image != null) {
      setConfirmReplace(true);
      return;
    }
    void finishApply();
  };

  const locked = busy || targetKind != null;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon fontSize="small" /> Build me a new SVG
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <TextField select size="small" label="For" value={brief.target} onChange={(e) => pickTarget(e.target.value)} disabled={busy}>
            <MenuItem value={NEW_TARGET}>A new element type</MenuItem>
            {kinds.map((k) => (
              <MenuItem key={k.id} value={String(k.id)}>
                {k.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Name"
            value={brief.label}
            onChange={(e) => set({ label: e.target.value })}
            disabled={locked}
            inputProps={{ maxLength: 128 }}
          />
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Width" value={brief.width} onChange={(e) => set({ width: e.target.value })} disabled={locked} sx={{ flex: 1 }} />
            <TextField size="small" label="Depth" value={brief.depth} onChange={(e) => set({ depth: e.target.value })} disabled={locked} sx={{ flex: 1 }} />
          </Stack>
          <Autocomplete
            freeSolo
            size="small"
            options={categories}
            value={brief.category}
            onInputChange={(_, value) => set({ category: value })}
            disabled={locked}
            renderInput={(params) => <TextField {...params} label="Category" />}
          />
          <TextField size="small" label="Base color" value={brief.fillColor} onChange={(e) => set({ fillColor: e.target.value })} disabled={locked} />
          <TextField
            size="small"
            label="Notes for the AI (optional)"
            value={brief.notes}
            onChange={(e) => set({ notes: e.target.value })}
            disabled={busy}
            multiline
            minRows={2}
            inputProps={{ maxLength: 1000 }}
          />
          <AiModelEffortFields purpose="FLOORPLAN_SVG" open={open} value={choice} onChange={setChoice} disabled={busy} />
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <Box
            sx={{
              minHeight: 240,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {result ? (
              <Box component="img" src={result.svg_data_uri} alt="Generated SVG preview" sx={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                {busy ? 'Working...' : 'The preview shows here.'}
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Box flex={1} />
        {busy && <CircularProgress size={22} sx={{ mr: 1 }} />}
        <Button variant="outlined" onClick={() => void generate()} disabled={busy || !choice.model}>
          {result ? 'Try again' : 'Generate'}
        </Button>
        <Button variant="contained" onClick={apply} disabled={busy || !result}>
          Apply
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={confirmReplace}
        title="Replace the current image?"
        message={`"${targetKind?.label ?? ''}" already has an image. Replace it with this one?`}
        confirmLabel="Replace"
        confirmColor="primary"
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => void finishApply()}
      />
    </Dialog>
  );
}

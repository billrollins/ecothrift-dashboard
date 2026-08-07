/**
 * AI Create for me - propose structure and/or generate a monochrome background.
 * Approval gate: Apply / Use as background only updates local designer state or
 * uploads via the existing background endpoint; never auto-saves the label.
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useSnackbar } from 'notistack';

import {
  generateLabelBackground,
  proposeLabelStructure,
  type LabelDefinition,
} from '../../../api/labels.api';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { formatApiError } from './labelStudioUtils';

type TabKey = 'structure' | 'background';

interface Props {
  open: boolean;
  labelId: number;
  onClose: () => void;
  onApplyDefinition: (definition: LabelDefinition) => void;
  onBackgroundApplied: (file: File) => void;
  hasExistingLayout?: boolean;
  hasExistingBackground?: boolean;
  labelName?: string;
}

function b64ToFile(b64: string, contentType: string, filename: string): File {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const mime = contentType || 'image/png';
  return new File([bytes], filename, { type: mime });
}

export default function AiCreateDialog({
  open,
  labelId,
  onClose,
  onApplyDefinition,
  onBackgroundApplied,
  hasExistingLayout = false,
  hasExistingBackground = false,
  labelName = '',
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState<TabKey>('structure');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [proposed, setProposed] = useState<LabelDefinition | null>(null);
  const [confirmAction, setConfirmAction] = useState<'structure' | 'background' | null>(null);

  const [imageB64, setImageB64] = useState<string | null>(null);
  const [imageType, setImageType] = useState('image/png');

  const previewUrl = useMemo(() => {
    if (!imageB64) return null;
    return `data:${imageType};base64,${imageB64}`;
  }, [imageB64, imageType]);

  const resetResults = () => {
    setProposed(null);
    setImageB64(null);
    setError(null);
  };

  const handleClose = () => {
    if (busy) return;
    resetResults();
    setBrief('');
    setTab('structure');
    onClose();
  };

  const runStructure = async () => {
    setBusy(true);
    setError(null);
    setProposed(null);
    try {
      const { data } = await proposeLabelStructure(labelId, brief.trim());
      setProposed(data.definition);
    } catch (err: unknown) {
      setError(formatApiError(err, 'Could not propose a structure.'));
    } finally {
      setBusy(false);
    }
  };

  const runBackground = async () => {
    setBusy(true);
    setError(null);
    setImageB64(null);
    try {
      const { data } = await generateLabelBackground(labelId, brief.trim());
      setImageB64(data.image_b64);
      setImageType(data.content_type || 'image/png');
    } catch (err: unknown) {
      setError(formatApiError(err, 'Could not generate a background.'));
    } finally {
      setBusy(false);
    }
  };

  const applyStructure = () => {
    if (!proposed) return;
    if (hasExistingLayout) {
      setConfirmAction('structure');
      return;
    }
    finishApplyStructure();
  };

  const finishApplyStructure = () => {
    if (!proposed) return;
    onApplyDefinition(proposed);
    enqueueSnackbar('Structure applied - Save when ready.', { variant: 'success' });
    handleClose();
  };

  const useBackground = () => {
    if (!imageB64) return;
    if (hasExistingBackground) {
      setConfirmAction('background');
      return;
    }
    finishUseBackground();
  };

  const finishUseBackground = () => {
    if (!imageB64) return;
    const file = b64ToFile(imageB64, imageType, 'ai-background.png');
    onBackgroundApplied(file);
    enqueueSnackbar('Background added - Save when ready.', { variant: 'success' });
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon fontSize="small" />
        AI Create for me
      </DialogTitle>
      <DialogContent>
        <Tabs
          value={tab}
          onChange={(_, v: TabKey) => {
            setTab(v);
            setError(null);
          }}
          sx={{ mb: 2 }}
        >
          <Tab value="structure" label="Structure" />
          <Tab value="background" label="Background" />
        </Tabs>

        <TextField
          label="Design brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          placeholder={
            tab === 'structure'
              ? `e.g. ${labelName ? `${labelName}: ` : ''}shelf tag with title and SKU barcode`
              : 'e.g. Simple leaf border, leave center empty for text'
          }
          disabled={busy}
          inputProps={{ maxLength: 2000 }}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {tab === 'structure' && proposed && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">
              {proposed.variables.length} variable
              {proposed.variables.length === 1 ? '' : 's'}
              {proposed.variables.length
                ? ` (${proposed.variables.map((v) => v.name).join(', ')})`
                : ''}
              {' · '}
              {proposed.elements.length} element
              {proposed.elements.length === 1 ? '' : 's'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Review it on the canvas before saving.
            </Typography>
          </Box>
        )}

        {tab === 'background' && previewUrl && (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Box
              component="img"
              src={previewUrl}
              alt="AI background preview"
              sx={{
                maxWidth: '100%',
                maxHeight: 240,
                border: 1,
                borderColor: 'divider',
                filter: 'grayscale(1)',
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Box flex={1} />
        {busy && <CircularProgress size={22} sx={{ mr: 1 }} />}
        {tab === 'structure' && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              disabled={busy || !brief.trim()}
              onClick={runStructure}
            >
              Generate
            </Button>
            <Button
              variant="contained"
              disabled={busy || !proposed}
              onClick={applyStructure}
            >
              Apply to canvas
            </Button>
          </Stack>
        )}
        {tab === 'background' && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              disabled={busy || !brief.trim()}
              onClick={runBackground}
            >
              Generate
            </Button>
            {imageB64 && (
              <Button color="inherit" disabled={busy} onClick={() => setImageB64(null)}>
                Discard
              </Button>
            )}
            <Button
              variant="contained"
              disabled={busy || !imageB64}
              onClick={useBackground}
            >
              Use as background
            </Button>
          </Stack>
        )}
      </DialogActions>
      <ConfirmDialog
        open={confirmAction != null}
        title={confirmAction === 'structure' ? 'Replace current layout?' : 'Replace background?'}
        message={
          confirmAction === 'structure'
            ? 'The AI proposal will replace the variables and elements currently on the canvas. You can leave without saving to discard it.'
            : 'The generated image will replace the current background after you save.'
        }
        confirmLabel="Replace"
        confirmColor="primary"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action === 'structure') finishApplyStructure();
          else finishUseBackground();
        }}
      />
    </Dialog>
  );
}

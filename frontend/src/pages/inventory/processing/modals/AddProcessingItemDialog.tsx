import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { ProcessingGoogleSearchButton } from '../ProcessingGoogleSearchButton';

export interface AddProcessingItemDialogProps {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void | Promise<void>;
}

/** Minimal add-line dialog: title required; brand and model optional for queue tracking. */
export function AddProcessingItemDialog({
  open,
  loading,
  onClose,
  onSubmit,
}: AddProcessingItemDialogProps) {
  const [title, setTitle] = useState('');
  const [model, setModel] = useState('');
  const [brand, setBrand] = useState('');
  const [titleError, setTitleError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setModel('');
    setBrand('');
    setTitleError('');
  }, [open]);

  async function handleOk() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError('Title is required');
      return;
    }
    setTitleError('');
    await onSubmit({
      title: trimmedTitle,
      model: model.trim(),
      brand: brand.trim(),
      quantity: 1,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !loading) {
          e.preventDefault();
          void handleOk();
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 2 }}>
        <Box component="span" sx={{ flex: 1 }}>
          Add unmanifested line
        </Box>
        <ProcessingGoogleSearchButton brand={brand} title={title} model={model} />
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError('');
            }}
            required
            autoFocus
            fullWidth
            error={Boolean(titleError)}
            helperText={titleError || undefined}
            disabled={loading}
          />
          <TextField
            label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            fullWidth
            disabled={loading}
          />
          <TextField
            label="Brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            fullWidth
            disabled={loading}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleOk()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}

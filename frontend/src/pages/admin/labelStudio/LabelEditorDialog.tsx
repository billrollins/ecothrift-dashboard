/**
 * Create/edit dialog for PDF Custom Labels only.
 * Template labels use the full-page designer at `/admin/label-studio/:id`.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import {
  createCustomLabel,
  updateCustomLabel,
  uploadLabelPdf,
  type CustomLabel,
  type CustomLabelKind,
} from '../../../api/labels.api';
import { formatApiError } from './labelStudioUtils';

interface Props {
  open: boolean;
  kind: CustomLabelKind;
  /** null = create */
  label: CustomLabel | null;
  onClose: () => void;
  onSaved: (label: CustomLabel) => void;
}

export default function LabelEditorDialog({ open, kind, label, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfUpload, setPdfUpload] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setPdfUpload(null);
    if (label) {
      setName(label.name);
      setPdfName(label.pdf?.filename ?? null);
    } else {
      setName('');
      setPdfName(null);
    }
  }, [open, label]);

  // Templates must not use this dialog.
  if (kind !== 'pdf' && open) {
    return null;
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let saved: CustomLabel;
      if (label) {
        saved = (await updateCustomLabel(label.id, { name, kind: 'pdf' })).data;
      } else {
        saved = (await createCustomLabel({ name, kind: 'pdf' })).data;
      }
      if (pdfUpload) {
        saved = (await uploadLabelPdf(saved.id, pdfUpload)).data;
      }
      onSaved(saved);
    } catch (exc: unknown) {
      setError(formatApiError(exc, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim().length > 0 && (Boolean(label?.pdf) || Boolean(pdfUpload));

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{label ? 'Edit' : 'New'} PDF label</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
          />
          <Stack direction="row" spacing={2} alignItems="center">
            <Button component="label" startIcon={<UploadFileIcon />} variant="outlined">
              {pdfUpload ? pdfUpload.name : 'Upload PDF'}
              <input
                hidden
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  setPdfUpload(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </Button>
            <Typography variant="body2" color="text.secondary">
              {pdfUpload
                ? 'Will replace the saved PDF on save.'
                : pdfName
                  ? `Current: ${pdfName}`
                  : 'Choose a PDF to create this label.'}
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import { useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { getSignVersionFile } from '../../api/signage.api';
import { ImageViewerDialog } from '../../components/common/ImageViewerDialog';
import { useSignPreview } from '../../hooks/useSignage';
import { IconUpload as UploadIcon } from '../../icons/ecoIcons';
import { downloadBlob } from '../../utils/downloadBlob';
import type { Sign, SignStage, SignVersion } from '../../types/signage.types';

/** A version's PNG preview; tap it to see it larger (when ``onOpen`` is given). */
export function SignThumb({
  signId,
  versionId,
  size,
  height,
  onOpen,
  alt,
}: {
  signId: number;
  versionId: number | null;
  /** Width in px (a number) or any CSS width. */
  size: number | string;
  height?: number | string;
  onOpen?: () => void;
  alt: string;
}) {
  const { url, isLoading } = useSignPreview(signId, versionId);
  return (
    <Box
      component={onOpen ? 'button' : 'div'}
      type={onOpen ? 'button' : undefined}
      onClick={(e: React.MouseEvent) => {
        if (!onOpen) return;
        e.stopPropagation();
        onOpen();
      }}
      aria-label={onOpen ? `See ${alt} larger` : undefined}
      sx={{
        width: size,
        height: height ?? size,
        flexShrink: 0,
        p: 0,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'grey.100',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onOpen ? 'zoom-in' : 'inherit',
      }}
    >
      {url ? (
        <Box component="img" src={url} alt={alt} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      ) : isLoading && versionId ? (
        <CircularProgress size={16} />
      ) : (
        <ImageOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
      )}
    </Box>
  );
}

/**
 * The sign's picture gallery: one version at a time, larger, with its PDF to download; arrows walk the versions.
 * #129: on a production sign it marks the version in use, and a manager can switch to the one shown (``onUse``).
 */
export function VersionViewer({
  sign,
  versions,
  index,
  onIndex,
  onClose,
  onUse,
}: {
  sign: Sign;
  versions: SignVersion[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  onUse?: (version: SignVersion) => void;
}) {
  const version = index != null ? versions[index] : null;
  const { url } = useSignPreview(sign.id, version?.has_preview ? version.id : null);
  const inUse = version != null && version.id === sign.chosen_version;
  const title = version ? `${sign.name}: ${version.label}${inUse ? ' (in use)' : ''}` : '';
  return (
    <ImageViewerDialog
      open={version != null}
      onClose={onClose}
      src={url}
      alt={title}
      title={title}
      extraActions={
        onUse && version && !inUse ? (
          <Button onClick={() => onUse(version)}>Use this version</Button>
        ) : null
      }
      canEdit={false}
      downloadLabel="Download the PDF"
      onDownload={
        version?.has_pdf
          ? async () => {
              const blob = await getSignVersionFile(sign.id, version.id, 'pdf');
              downloadBlob(new Blob([blob], { type: 'application/pdf' }), version.pdf_name || `${version.label}.pdf`);
            }
          : undefined
      }
      hasPrev={index != null && index > 0}
      hasNext={index != null && index < versions.length - 1}
      onPrev={() => index != null && onIndex(index - 1)}
      onNext={() => index != null && onIndex(index + 1)}
      positionLabel={index != null && versions.length > 1 ? `${index + 1} / ${versions.length}` : null}
    />
  );
}

export type SignForm = {
  id: number | null;
  stage: SignStage;
  name: string;
  location: string;
  quantity: number;
  note: string;
};

export const emptyForm = (stage: SignStage): SignForm => ({
  id: null, stage, name: '', location: '', quantity: 1, note: '',
});

export const formOf = (sign: Sign): SignForm => ({
  id: sign.id, stage: sign.stage, name: sign.name, location: sign.location, quantity: sign.quantity, note: sign.note,
});

const clamp = (v: string) => Math.max(0, Math.min(500, Number(v) || 0));

/** New or edit, drafts and production alike: name, where it goes, how many, notes. To hang / Up is on each map spot. */
export function SignEditDialog({
  form,
  onChange,
  onClose,
  onSave,
  saving,
  extra,
}: {
  form: SignForm | null;
  onChange: (form: SignForm) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  extra?: React.ReactNode;
}) {
  const isDraft = form?.stage === 'draft';
  return (
    <Dialog open={Boolean(form)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{form?.id == null ? (isDraft ? 'New draft' : 'New sign') : isDraft ? 'Edit draft' : 'Edit sign'}</DialogTitle>
      <DialogContent>
        {form && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} autoFocus fullWidth inputProps={{ maxLength: 120 }} />
            <TextField
              label="Where it goes"
              value={form.location}
              onChange={(e) => onChange({ ...form, location: e.target.value })}
              fullWidth
              placeholder="Entrance, each register, back hall"
              inputProps={{ maxLength: 255 }}
            />
            <TextField
              label="How many copies"
              type="number"
              value={form.quantity}
              onChange={(e) => onChange({ ...form, quantity: clamp(e.target.value) })}
              inputProps={{ min: 0, max: 500 }}
              sx={{ width: 160 }}
              helperText={isDraft ? undefined : 'Each copy is a spot on the map: To hang, then Up.'}
            />
            <TextField
              label="Notes"
              value={form.note}
              onChange={(e) => onChange({ ...form, note: e.target.value })}
              fullWidth
              multiline
              minRows={2}
              placeholder="Size, paper, who asked for it"
            />
            {extra}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave} disabled={!form?.name.trim() || saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

/** A manager adds a version: its PDF, a PNG preview (drawn from the PDF when left out), and a short label. */
export function AddVersionDialog({
  open,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (v: { pdf: File; png: File | null; label: string }) => void;
  saving: boolean;
}) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [png, setPng] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const close = () => {
    setPdf(null);
    setPng(null);
    setLabel('');
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Add a version</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A: Red frame, Letter" fullWidth inputProps={{ maxLength: 120 }} />
          <Button component="label" variant="outlined" startIcon={<UploadIcon />}>
            {pdf ? pdf.name : 'PDF to print'}
            <input hidden type="file" accept="application/pdf,.pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
          </Button>
          <Button component="label" variant="outlined" startIcon={<UploadIcon />}>
            {png ? png.name : 'PNG preview (optional)'}
            <input hidden type="file" accept="image/png,.png" onChange={(e) => setPng(e.target.files?.[0] ?? null)} />
          </Button>
          <Typography variant="caption" color="text.secondary">With no PNG, the preview is drawn from the PDF&apos;s first page.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!pdf || saving}
          onClick={() => {
            if (!pdf) return;
            onSave({ pdf, png, label });
            close();
          }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

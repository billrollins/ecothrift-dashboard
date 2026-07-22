import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Download from '@mui/icons-material/Download';

export interface ImageViewerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Full-resolution image URL (shown in the dialog). */
  src: string | null;
  alt: string;
  title?: string;
  filename?: string | null;
  /** Optional download of the original (same URL or separate fetch). */
  onDownload?: () => void | Promise<void>;
  downloadLabel?: string;
}

/**
 * Reusable full-screen/contained image lightbox.
 * Prefer passing a high-res `src`; callers may show a thumbnail elsewhere.
 */
export function ImageViewerDialog({
  open,
  onClose,
  src,
  alt,
  title,
  filename,
  onDownload,
  downloadLabel = 'Download original',
}: ImageViewerDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(Boolean(src));
    setError(false);
  }, [open, src]);

  const handleDownload = async () => {
    if (!onDownload) return;
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="lg"
      fullWidth
      aria-labelledby="image-viewer-title"
    >
      <DialogTitle
        id="image-viewer-title"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap fontWeight={700}>
            {title || filename || 'Photo'}
          </Typography>
          {filename && title ? (
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {filename}
            </Typography>
          ) : null}
        </Box>
        <IconButton aria-label="Close" onClick={onClose} edge="end">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: fullScreen ? '60vh' : 360,
          bgcolor: '#0f172a',
          p: 1,
        }}
      >
        {!src ? (
          <Typography color="grey.300">No image available.</Typography>
        ) : error ? (
          <Typography color="error.light">Could not load image.</Typography>
        ) : (
          <Box sx={{ position: 'relative', width: '100%', textAlign: 'center' }}>
            {loading ? (
              <CircularProgress size={36} sx={{ color: 'grey.200', position: 'absolute', inset: 0, m: 'auto' }} />
            ) : null}
            <Box
              component="img"
              src={src}
              alt={alt}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
              sx={{
                maxWidth: '100%',
                maxHeight: fullScreen ? 'calc(100vh - 180px)' : '70vh',
                objectFit: 'contain',
                opacity: loading ? 0 : 1,
                transition: 'opacity 120ms ease',
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        {onDownload ? (
          <Button
            startIcon={<Download />}
            onClick={() => void handleDownload()}
            disabled={downloading || !src}
          >
            {downloading ? 'Downloading…' : downloadLabel}
          </Button>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

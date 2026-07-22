import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Download from '@mui/icons-material/Download';
import { useState } from 'react';

export type CsvViewerRow = {
  row_number?: number;
  raw?: Record<string, string>;
} & Record<string, unknown>;

export interface CsvViewerDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  headers: string[];
  rows: CsvViewerRow[];
  /** Total rows in the full file (may exceed preview length). */
  totalRowCount?: number | null;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onDownload?: () => void | Promise<void>;
  downloadLabel?: string;
  downloading?: boolean;
}

/**
 * Reusable CSV/TSV preview dialog — sticky header table + authenticated full-file download.
 */
export function CsvViewerDialog({
  open,
  onClose,
  title,
  subtitle,
  headers,
  rows,
  totalRowCount,
  loading = false,
  error = null,
  emptyMessage = 'No preview rows available.',
  onDownload,
  downloadLabel = 'Download full CSV',
  downloading: downloadingProp,
}: CsvViewerDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [localDownloading, setLocalDownloading] = useState(false);
  const downloading = downloadingProp ?? localDownloading;

  const previewCount = rows.length;
  const total =
    typeof totalRowCount === 'number' && Number.isFinite(totalRowCount)
      ? totalRowCount
      : previewCount;

  const handleDownload = async () => {
    if (!onDownload) return;
    setLocalDownloading(true);
    try {
      await onDownload();
    } finally {
      setLocalDownloading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="lg"
      fullWidth
      aria-labelledby="csv-viewer-title"
    >
      <DialogTitle
        id="csv-viewer-title"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap fontWeight={700}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        <IconButton aria-label="Close" onClick={onClose} edge="end">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            {loading
              ? 'Loading preview…'
              : error
                ? error
                : previewCount === 0
                  ? emptyMessage
                  : `Showing ${previewCount.toLocaleString()} preview row${
                      previewCount === 1 ? '' : 's'
                    }${total > previewCount ? ` of ${total.toLocaleString()} total` : ''}.`}
          </Typography>
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error || !headers.length || !rows.length ? (
          <Box sx={{ px: 2, py: 4 }}>
            <Typography color="text.secondary">{error || emptyMessage}</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: fullScreen ? 'calc(100vh - 220px)' : 480 }}>
            <Table size="small" stickyHeader sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 56 }}>#</TableCell>
                  {headers.map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, idx) => {
                  const raw =
                    row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw)
                      ? (row.raw as Record<string, string>)
                      : (row as Record<string, string>);
                  const n = typeof row.row_number === 'number' ? row.row_number : idx + 1;
                  return (
                    <TableRow key={`${n}-${idx}`} hover>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                        {n}
                      </TableCell>
                      {headers.map((h) => (
                        <TableCell key={h} sx={{ maxWidth: 280 }}>
                          <Typography
                            component="span"
                            sx={{
                              fontSize: 13,
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={String(raw[h] ?? '')}
                          >
                            {String(raw[h] ?? '')}
                          </Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
        {onDownload ? (
          <Button
            startIcon={<Download />}
            onClick={() => void handleDownload()}
            disabled={downloading || loading}
          >
            {downloading ? 'Downloading…' : downloadLabel}
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

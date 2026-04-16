import CheckCircle from '@mui/icons-material/CheckCircle';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import HourglassEmpty from '@mui/icons-material/HourglassEmpty';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import type { BuyingSweepMarketplaceRow, BuyingSweepResponse } from '../../types/buying.types';

export type BuyingSweepDialogMarketplace = { slug: string; name: string };

export type BuyingSweepProgressDialogProps = {
  open: boolean;
  loading: boolean;
  /** Sorted marketplace names shown while loading (honest: all pending until response). */
  marketplacesPending: BuyingSweepDialogMarketplace[];
  response: BuyingSweepResponse | null;
  errorMessage: string | null;
  onClose: () => void;
};

/**
 * Two-phase sweep summary after POST /api/buying/sweep/ returns.
 * Phase 1 rows are filled from `by_marketplace` (not live streaming — see plan).
 * For real-time per-marketplace progress, a future SSE/WebSocket endpoint would be needed.
 */
export default function BuyingSweepProgressDialog({
  open,
  loading,
  marketplacesPending,
  response,
  errorMessage,
  onClose,
}: BuyingSweepProgressDialogProps) {
  const showSuccess = !loading && !errorMessage && response;
  const valuationDeferred = response?.valuation_deferred === true;
  const mpRows: BuyingSweepMarketplaceRow[] = response?.by_marketplace ?? [];
  const totalSeconds = response?.total_seconds;
  const inserted = response?.inserted ?? 0;
  const updated = response?.updated ?? 0;
  const upserted = response?.upserted ?? 0;
  const ai = response?.ai_estimate;
  const recomputed = response?.lightweight_recomputed;
  const valuationErr = response?.valuation_error;

  return (
    <Dialog
      open={open}
      onClose={(_, _reason) => {
        if (loading) return;
        onClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {loading ? 'Sweeping auctions…' : errorMessage ? 'Sweep failed' : 'Sweep results'}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Fetching listings from B-Stock and updating the database. This may take a minute…
            </Typography>
            <Typography variant="subtitle2" color="text.secondary">
              Marketplaces (in progress)
            </Typography>
            <List dense disablePadding>
              {marketplacesPending.map((m) => (
                <ListItem key={m.slug} disableGutters sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CircularProgress size={18} />
                  </ListItemIcon>
                  <ListItemText primary={m.name} secondary="…" />
                </ListItem>
              ))}
            </List>
          </Stack>
        ) : null}

        {errorMessage ? (
          <Typography color="error" variant="body2">
            {errorMessage}
          </Typography>
        ) : null}

        {showSuccess ? (
          <Stack spacing={2}>
            {totalSeconds != null ? (
              <Typography variant="body2" color="text.secondary">
                Completed in {totalSeconds}s
              </Typography>
            ) : null}

            <Box>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Listings by marketplace
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Summary after the sweep finished (not live per request).
              </Typography>
              <List dense disablePadding>
                {mpRows.map((row) => {
                  const err = row.http_error || (row.db_errors ?? 0) > 0;
                  return (
                    <ListItem key={row.slug} disableGutters sx={{ py: 0.35 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {err ? (
                          <ErrorOutline color="warning" fontSize="small" />
                        ) : (
                          <CheckCircle color="success" fontSize="small" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={row.name}
                        secondary={
                          err
                            ? [row.http_error, row.db_errors ? `${row.db_errors} DB error(s)` : null]
                                .filter(Boolean)
                                .join(' · ') || 'Partial errors'
                            : `${row.listings_found} listing(s) found`
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Processing
              </Typography>
              <List dense disablePadding>
                <ListItem disableGutters sx={{ py: 0.35 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Database upsert"
                    secondary={`${upserted} row(s) (${inserted} new, ${updated} updated)`}
                  />
                </ListItem>

                {valuationDeferred ? (
                  <ListItem disableGutters sx={{ py: 0.35 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <HourglassEmpty color="disabled" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary="AI estimates & valuation"
                      secondary="Skipped for this refresh. Run sweep without defer or use scheduled jobs."
                    />
                  </ListItem>
                ) : (
                  <>
                    <ListItem disableGutters sx={{ py: 0.35 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {valuationErr ? (
                          <ErrorOutline color="warning" fontSize="small" />
                        ) : (
                          <CheckCircle color="success" fontSize="small" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary="AI category estimates"
                        secondary={
                          valuationErr
                            ? `Error: ${valuationErr}`
                            : ai
                              ? `${ai.estimated ?? 0} auction(s) estimated (${ai.considered ?? 0} considered)`
                              : '—'
                        }
                      />
                    </ListItem>
                    <ListItem disableGutters sx={{ py: 0.35 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        {valuationErr ? (
                          <ErrorOutline color="warning" fontSize="small" />
                        ) : (
                          <CheckCircle color="success" fontSize="small" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary="Lightweight recompute (active auctions)"
                        secondary={
                          valuationErr
                            ? '—'
                            : recomputed != null
                              ? `${recomputed} auction(s)`
                              : '—'
                        }
                      />
                    </ListItem>
                  </>
                )}
              </List>
            </Box>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading} variant="contained">
          {loading ? 'Working…' : 'Close'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

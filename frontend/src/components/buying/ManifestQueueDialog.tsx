import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { isAxiosError } from 'axios';
import OpenInNew from '@mui/icons-material/OpenInNew';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
  fetchBuyingManifestPullLog,
  fetchBuyingManifestQueue,
  postBuyingBudgetManifestPull,
} from '../../api/buying.api';

export type ManifestQueueDialogProps = {
  open: boolean;
  onClose: () => void;
};

export default function ManifestQueueDialog({ open, onClose }: ManifestQueueDialogProps) {
  const [tab, setTab] = useState(0);
  const [budgetSeconds, setBudgetSeconds] = useState(60);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const budgetMutation = useMutation({
    mutationFn: (seconds: number) => postBuyingBudgetManifestPull({ seconds }),
    onSuccess: (data) => {
      enqueueSnackbar(
        `Budget run: ${data.iterations} iteration(s), ${data.auctions_processed} auctions, ${data.manifest_rows_saved} rows.`,
        { variant: 'success' }
      );
      void queryClient.invalidateQueries({ queryKey: ['buying', 'manifest_queue'] });
      void queryClient.invalidateQueries({ queryKey: ['buying', 'manifest_pull_log'] });
    },
    onError: (err: unknown) => {
      const msg = isAxiosError(err)
        ? (typeof err.response?.data?.detail === 'string'
            ? err.response.data.detail
            : 'Budget pull failed.')
        : 'Budget pull failed.';
      enqueueSnackbar(msg, { variant: 'error' });
    },
  });

  const queueQuery = useQuery({
    queryKey: ['buying', 'manifest_queue', { page: 1, page_size: 50 }] as const,
    queryFn: () => fetchBuyingManifestQueue({ page: 1, page_size: 50 }),
    enabled: open && tab === 0,
  });

  const logQuery = useQuery({
    queryKey: ['buying', 'manifest_pull_log', { page: 1, page_size: 50 }] as const,
    queryFn: () => fetchBuyingManifestPullLog({ page: 1, page_size: 50 }),
    enabled: open && tab === 1,
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Manifest queue</DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Run budget pull (admin)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Runs the nightly queue through the two-worker API pipeline until the budget
            expires. Long HTTP — ties up one Gunicorn worker until finished; max 900s.
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              type="number"
              size="small"
              label="Seconds"
              value={budgetSeconds}
              onChange={(e) => {
                const n = Number(e.target.value);
                setBudgetSeconds(Number.isFinite(n) ? Math.max(1, Math.min(900, n)) : 60);
              }}
              inputProps={{ min: 1, max: 900, step: 15 }}
              sx={{ width: 120 }}
              disabled={budgetMutation.isPending}
            />
            <Button
              variant="contained"
              size="small"
              onClick={() => budgetMutation.mutate(budgetSeconds)}
              disabled={budgetMutation.isPending}
              startIcon={budgetMutation.isPending ? <CircularProgress size={14} /> : null}
            >
              {budgetMutation.isPending ? 'Running…' : `Run ${budgetSeconds}s`}
            </Button>
            {budgetMutation.data ? (
              <Typography variant="caption" color="text.secondary">
                Last: {budgetMutation.data.iterations} iter,{' '}
                {budgetMutation.data.auctions_processed} auc,{' '}
                {budgetMutation.data.manifest_rows_saved} rows
              </Typography>
            ) : null}
          </Stack>
        </Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Next up" />
          <Tab label="Pull log" />
        </Tabs>

        {tab === 0 ? (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Overnight priority: watchlist and watch priority, then thumbs-up count, then auction
              priority. Skips archived, completed, and lots that already have a manifest pull.
            </Typography>
            {queueQuery.isLoading ? (
              <Typography variant="body2">Loading…</Typography>
            ) : queueQuery.isError ? (
              <Typography color="error" variant="body2">
                Could not load queue.
              </Typography>
            ) : (
              <>
                <Typography variant="caption" color="text.secondary">
                  {queueQuery.data?.count?.toLocaleString() ?? '0'} total in queue (showing first page)
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Auction</TableCell>
                      <TableCell>Marketplace</TableCell>
                      <TableCell>Watched</TableCell>
                      <TableCell>Thumbs</TableCell>
                      <TableCell>Priority</TableCell>
                      <TableCell>Lot</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(queueQuery.data?.results ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link component={RouterLink} to={`/buying/auctions/${row.id}`}>
                            {row.title || `Auction ${row.id}`}
                          </Link>
                          {row.url ? (
                            <Link
                              href={row.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ ml: 0.5, verticalAlign: 'middle' }}
                              aria-label="Open listing"
                            >
                              <OpenInNew sx={{ fontSize: 16 }} />
                            </Link>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.marketplace?.name ?? '—'}</TableCell>
                        <TableCell>
                          {row.watched ? (
                            <Chip size="small" label={row.watchlist_priority ?? 'watching'} />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {row.thumbs_up_count != null ? row.thumbs_up_count : '—'}
                        </TableCell>
                        <TableCell>{row.auction_priority}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {row.lot_id ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Stack>
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Recent manifest downloads: timing, row counts, and SOCKS5 routing.
            </Typography>
            {logQuery.isLoading ? (
              <Typography variant="body2">Loading…</Typography>
            ) : logQuery.isError ? (
              <Typography color="error" variant="body2">
                Could not load pull log.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>When</TableCell>
                    <TableCell>Auction</TableCell>
                    <TableCell align="right">Rows</TableCell>
                    <TableCell align="right">Calls</TableCell>
                    <TableCell align="right">Sec</TableCell>
                    <TableCell>SOCKS5</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(logQuery.data?.results ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {new Date(row.completed_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Link component={RouterLink} to={`/buying/auctions/${row.auction_id}`}>
                          {row.auction_title || `Auction ${row.auction_id}`}
                        </Link>
                        {row.auction_url ? (
                          <Link
                            href={row.auction_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ ml: 0.5, verticalAlign: 'middle' }}
                            aria-label="Open listing"
                          >
                            <OpenInNew sx={{ fontSize: 16 }} />
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell align="right">{row.rows_downloaded}</TableCell>
                      <TableCell align="right">{row.api_calls}</TableCell>
                      <TableCell align="right">{row.duration_seconds.toFixed(2)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.used_socks5 ? 'Yes' : 'No'}
                          color={row.used_socks5 ? 'success' : 'default'}
                          variant={row.used_socks5 ? 'filled' : 'outlined'}
                        />
                        {row.success ? null : (
                          <Typography variant="caption" color="error" display="block">
                            {row.error_message}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

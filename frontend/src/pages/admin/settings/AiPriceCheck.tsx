import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import {
  applyAiPriceCheck,
  getAiPriceCheck,
  type AiPriceCheck as PriceCheck,
  type AiPriceCheckRow,
} from '../../../api/aiSettings.api';
import { formatWhen } from '../../../components/users/userChrome';
import { formatApiError } from '../labelStudio/labelStudioUtils';

export const PRICE_CHECK_KEY = ['ai-settings', 'price-check'] as const;

/** The last price check, polled every 5 seconds while one runs. */
export function useAiPriceCheck() {
  return useQuery({
    queryKey: PRICE_CHECK_KEY,
    queryFn: getAiPriceCheck,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 5000 : false),
  });
}

function money(v: string | null): string {
  return v == null ? 'not set' : `$${Number(v)}`;
}

function pair(input: string | null, output: string | null): string {
  return `${money(input)} in, ${money(output)} out`;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function Source({ url }: { url: string }) {
  if (!url) return null;
  return (
    <Link href={url} target="_blank" rel="noopener noreferrer" underline="hover">
      {host(url)}
    </Link>
  );
}

function waiting(rows: AiPriceCheckRow[]): AiPriceCheckRow[] {
  return rows.filter((r) => r.verdict === 'changed' && !r.saved && !r.stale);
}

/**
 * Settings > AI, above the model list: what the price check is doing or found, and the review of its
 * changes (old, new, source) before anything is saved.
 *
 * `openWhenDone` opens the review as soon as the check that was just started finishes.
 */
export function AiPriceCheck({ openWhenDone = false, onOpened }: { openWhenDone?: boolean; onOpened?: () => void }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const check = useAiPriceCheck();
  const data = check.data;
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const finished = data?.status === 'done' ? data.finished_at : undefined;
  useEffect(() => {
    // The automatic run may have filled in prices: show them in the table.
    if (finished) void queryClient.invalidateQueries({ queryKey: ['ai-settings', 'models'] });
  }, [finished, queryClient]);
  useEffect(() => {
    if (openWhenDone && data?.status && data.status !== 'running') {
      if (data.status === 'done') {
        setSkip(new Set());
        setOpen(true);
      }
      onOpened?.();
    }
  }, [openWhenDone, data?.status, onOpened]);

  if (!data?.status) return null;
  if (data.status === 'running') {
    return (
      <Box sx={{ mb: 1 }}>
        <LinearProgress sx={{ mb: 0.5 }} />
        <Typography variant="caption" color="text.secondary">
          Checking every model&apos;s price on the web. This takes a few minutes; you can leave this page.
        </Typography>
      </Box>
    );
  }
  if (data.status === 'failed') {
    return (
      <Alert severity="error" sx={{ mb: 1 }}>
        The price check did not finish, so no price was changed. {data.error}
      </Alert>
    );
  }

  const rows = data.results;
  if (rows.length === 0) return null;
  const changed = rows.filter((r) => r.verdict === 'changed');
  const unverified = rows.filter((r) => r.verdict === 'not_verified');
  const confirmed = rows.filter((r) => r.verdict === 'confirmed');
  const toReview = waiting(rows);
  const picked = toReview.filter((r) => !skip.has(r.id));
  const who = data.requested_by ? `by ${data.requested_by}` : 'automatically';

  const summary = [
    `${confirmed.length} confirmed`,
    toReview.length ? `${toReview.length} to review` : null,
    changed.length - toReview.length ? `${changed.length - toReview.length} saved` : null,
    unverified.length ? `${unverified.length} could not verify` : null,
  ].filter(Boolean).join(', ');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const next = await applyAiPriceCheck(picked.map((r) => r.id));
      queryClient.setQueryData(PRICE_CHECK_KEY, next);
      void queryClient.invalidateQueries({ queryKey: ['ai-settings', 'models'] });
      const savedNow = next.results.filter((r) => picked.some((p) => p.id === r.id) && r.saved === 'review').length;
      const missed = picked.length - savedNow;
      enqueueSnackbar(
        missed
          ? `Saved ${savedNow}. ${missed} changed after the check and was left alone; run Refresh prices again.`
          : `Saved ${savedNow} price ${savedNow === 1 ? 'change' : 'changes'}.`,
        { variant: missed ? 'warning' : 'success' },
      );
      if (!missed) setOpen(false);
    } catch (err) {
      setError(formatApiError(err, 'Could not save the prices.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" color={toReview.length ? 'warning.main' : 'text.secondary'}>
          Prices checked {formatWhen(data.finished_at)} {who}: {summary}.
        </Typography>
        <Button size="small" onClick={() => { setSkip(new Set()); setError(''); setOpen(true); }}>
          {toReview.length ? 'Review' : 'See the check'}
        </Button>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Price check</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Prices are dollars per 1 million tokens. Nothing changes until you save.
          </Typography>

          <Typography variant="subtitle2">Changes ({changed.length})</Typography>
          {changed.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No price needs to change.</Typography>
          ) : (
            <Table size="small" sx={{ mb: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Model</TableCell>
                  <TableCell>Now</TableCell>
                  <TableCell>Found</TableCell>
                  <TableCell>Source</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {changed.map((r) => {
                  const open_ = !r.saved && !r.stale;
                  return (
                    <TableRow key={r.id}>
                      <TableCell padding="checkbox">
                        {open_ && (
                          <Checkbox
                            size="small"
                            checked={!skip.has(r.id)}
                            onChange={(e) => {
                              const next = new Set(skip);
                              if (e.target.checked) next.delete(r.id); else next.add(r.id);
                              setSkip(next);
                            }}
                            inputProps={{ 'aria-label': `Save the new price for ${r.slug}` }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{r.slug}</Typography>
                        {r.note && <Typography variant="caption" color="text.secondary">{r.note}</Typography>}
                        {r.saved === 'auto' && (
                          <Typography variant="caption" color="success.main" sx={{ display: 'block' }}>
                            Had no price, so this one was filled in.
                          </Typography>
                        )}
                        {r.saved === 'review' && (
                          <Typography variant="caption" color="success.main" sx={{ display: 'block' }}>Saved.</Typography>
                        )}
                        {r.stale && (
                          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                            The price changed after this check. Run Refresh prices again.
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{pair(r.current_input, r.current_output)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{pair(r.found_input, r.found_output)}</TableCell>
                      <TableCell><Source url={r.source_url} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {unverified.length > 0 && (
            <>
              <Typography variant="subtitle2">Could not verify ({unverified.length})</Typography>
              <Typography variant="body2" color="text.secondary">
                No price was found on a page for these, so they stay as they are.
              </Typography>
              <Table size="small" sx={{ mb: 2 }}>
                <TableBody>
                  {unverified.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.slug}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{pair(r.current_input, r.current_output)}</TableCell>
                      <TableCell>{r.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}

          {confirmed.length > 0 && (
            <>
              <Typography variant="subtitle2">Confirmed ({confirmed.length})</Typography>
              <Table size="small" sx={{ mb: 2 }}>
                <TableBody>
                  {confirmed.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{r.slug}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{pair(r.current_input, r.current_output)}</TableCell>
                      <TableCell>
                        {r.note && <Typography variant="caption" color="text.secondary">{r.note}</Typography>}
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}><Source url={r.source_url} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {checkedLine(data, who)}
          </Typography>
          {data.saved && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Last saved {formatWhen(data.saved.at)} by {data.saved.by || 'someone'}: {data.saved.count} price{' '}
              {data.saved.count === 1 ? 'change' : 'changes'}.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => void save()} disabled={saving || picked.length === 0}>
            {saving ? 'Saving...' : `Save ${picked.length} ${picked.length === 1 ? 'change' : 'changes'}`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function checkedLine(data: PriceCheck, who: string): string {
  const parts = [`Checked ${formatWhen(data.finished_at)} ${who}`];
  if (data.checker) parts.push(`with ${data.checker}${data.effort ? ` (${data.effort} effort)` : ''}`);
  const web = [
    data.web_searches ? `${data.web_searches} web ${data.web_searches === 1 ? 'search' : 'searches'}` : null,
    data.web_fetches ? `${data.web_fetches} ${data.web_fetches === 1 ? 'page' : 'pages'} read` : null,
  ].filter(Boolean).join(', ');
  return `${parts.join(' ')}${web ? `: ${web}` : ''}.`;
}

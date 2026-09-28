import { Alert, Box, Button, LinearProgress, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect } from 'react';
import { getAiPriceCheck, saveAiModelPrices, startAiPriceCheck, type AiPriceCheckRow } from '../../../api/aiSettings.api';

function money(v: string | null): string {
  return v == null ? 'unknown' : `$${Number(v)}`;
}

/**
 * "Estimate API costs": a model reads each provider's pricing page for every active model's exact
 * slug. Blank prices are filled in; a price you already set that differs is shown for you to apply.
 */
export function AiPriceCheck() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const check = useQuery({
    queryKey: ['ai-settings', 'price-check'],
    queryFn: getAiPriceCheck,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 5000 : false),
  });
  const start = useMutation({
    mutationFn: startAiPriceCheck,
    onSuccess: (data) => queryClient.setQueryData(['ai-settings', 'price-check'], data),
  });
  const s = check.data;
  const running = s?.status === 'running';
  const filledAt = s?.status === 'done' && s.results.some((r) => r.filled) ? s.finished_at : undefined;
  useEffect(() => {
    if (filledAt) void queryClient.invalidateQueries({ queryKey: ['ai-settings', 'models'] });  // show the filled prices
  }, [filledAt, queryClient]);

  async function apply(r: AiPriceCheckRow) {
    try {
      await saveAiModelPrices(r.id, r.found_input, r.found_output);
      void queryClient.invalidateQueries({ queryKey: ['ai-settings', 'models'] });
      enqueueSnackbar(`${r.slug}: prices updated`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not save the price.', { variant: 'error' });
    }
  }

  const shown = (s?.results ?? []).filter((r) => r.filled || r.differs || r.found_input == null);
  return (
    <Box sx={{ mb: 1.5 }}>
      <Button variant="outlined" size="small" onClick={() => start.mutate()} disabled={running || start.isPending}>
        {running ? 'Checking prices...' : 'Estimate API costs'}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
        {s?.finished_at ? `Last checked ${new Date(s.finished_at).toLocaleString()} by ${s.checker ?? 'the checker'}. ` : ''}
        Reads each provider&apos;s pricing page for the exact model id. Blanks are filled; differences wait for you.
      </Typography>
      {running ? <LinearProgress sx={{ mt: 1 }} /> : null}
      {s?.status === 'failed' ? <Alert severity="error" sx={{ mt: 1 }}>{s.error}</Alert> : null}
      {s?.status === 'done' && !shown.length ? (
        <Alert severity="success" sx={{ mt: 1 }}>Every active model&apos;s price matches its provider&apos;s page.</Alert>
      ) : null}
      {s?.status === 'done' && shown.length ? (
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>Model id</TableCell>
              <TableCell align="right">Found (in / out)</TableCell>
              <TableCell align="right">Yours</TableCell>
              <TableCell>Source</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{r.slug}</TableCell>
                <TableCell align="right">{money(r.found_input)} / {money(r.found_output)}</TableCell>
                <TableCell align="right">{money(r.current_input)} / {money(r.current_output)}</TableCell>
                <TableCell sx={{ maxWidth: 320 }}>
                  {r.source_url ? <Link href={r.source_url} target="_blank" rel="noreferrer">page</Link> : null}
                  {r.note ? <Typography variant="caption" display="block" color="text.secondary">{r.note}</Typography> : null}
                </TableCell>
                <TableCell align="right">
                  {r.filled ? 'Filled in' : r.differs ? <Button size="small" onClick={() => void apply(r)}>Apply</Button> : 'Not found'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </Box>
  );
}

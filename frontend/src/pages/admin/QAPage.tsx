import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Fragment, useState } from 'react';
import { fetchQaHistory, fetchQaLatest, runQaNow, type QaFinding } from '../../api/qa.api';

const SEVERITY_COLOR = { high: 'error', medium: 'warning', low: 'default' } as const;
const SEVERITY_ORDER = ['high', 'medium', 'low'];

function Change({ f }: { f: QaFinding }) {
  if (f.delta == null) return <Typography variant="body2" color="text.secondary">new</Typography>;
  if (f.delta === 0) return <Typography variant="body2" color="text.secondary">steady</Typography>;
  return (
    <Typography variant="body2" color={f.delta > 0 ? 'error.main' : 'success.main'} sx={{ fontWeight: 700 }}>
      {f.delta > 0 ? `+${f.delta}` : f.delta}
    </Typography>
  );
}

function History({ checkId }: { checkId: string }) {
  const q = useQuery({ queryKey: ['qa', 'history', checkId], queryFn: () => fetchQaHistory(checkId) });
  if (!q.data?.length) return null;
  return (
    <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
      Last {q.data.length} runs: {q.data.map((h) => h.count).join(', ')}
    </Typography>
  );
}

/**
 * Data QA (data_platform Phase 3): the nightly standing checks over live data, one per rail in the
 * data-quality register, with the change since the last run and the AI triage. Fixes are staged in
 * Requests for approval. Superuser only.
 */
export default function QAPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const latest = useQuery({
    queryKey: ['qa', 'latest'],
    queryFn: fetchQaLatest,
    refetchInterval: (q) => (q.state.data?.running ? 5000 : false),
  });
  const runNow = useMutation({ mutationFn: runQaNow, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['qa', 'latest'] }) });
  const run = latest.data?.run;
  const findings = [...(run?.findings ?? [])].sort(
    (a, b) => Number(b.count > 0) - Number(a.count > 0) || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  return (
    <Box sx={{ maxWidth: 1100 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Data QA</Typography>
          <Typography variant="body2" color="text.secondary">
            Nightly checks over live data, one per rail in the data-quality register.
            {run?.finished_at ? ` Last run ${format(parseISO(run.finished_at), 'EEE MMM d, h:mm a')}.` : ''}
            {' '}Fixes wait in Requests for your OK.
          </Typography>
        </Box>
        <Button href="/admin/requests">Requests</Button>
        <Button variant="outlined" disabled={latest.data?.running || runNow.isPending} onClick={() => runNow.mutate()}>
          Run now
        </Button>
      </Stack>
      {latest.data?.running ? <LinearProgress sx={{ mb: 1 }} /> : null}
      {latest.isError ? <Alert severity="error">Could not load the QA run.</Alert> : null}
      {!run && latest.isSuccess ? <Alert severity="info">No run yet. Run now, or schedule python manage.py run_qa.</Alert> : null}
      {run?.triage?.headline ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          <strong>{run.triage.headline}</strong>
          {run.triage_model ? <Typography variant="caption" display="block">Triage by {run.triage_model}</Typography> : null}
        </Alert>
      ) : null}
      {run ? (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Check</TableCell>
                <TableCell>What</TableCell>
                <TableCell align="right">Rows</TableCell>
                <TableCell align="right">Change</TableCell>
                <TableCell>Handling today</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {findings.map((f) => {
                const note = run.triage?.notes?.find((n) => n.check_id === f.check_id);
                return (
                  <Fragment key={f.check_id}>
                    <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => setOpen(open === f.check_id ? null : f.check_id)}>
                      <TableCell>
                        <Chip size="small" color={f.count > 0 ? SEVERITY_COLOR[f.severity] : 'default'} label={f.check_id} />
                      </TableCell>
                      <TableCell>
                        {f.title}
                        {f.fix_kind && f.count > 0 ? <Chip size="small" variant="outlined" label="fix in Requests" sx={{ ml: 1 }} /> : null}
                        {f.error ? <Typography variant="caption" color="error" display="block">Check failed: {f.error}</Typography> : null}
                      </TableCell>
                      <TableCell align="right">{f.count.toLocaleString()}</TableCell>
                      <TableCell align="right"><Change f={f} /></TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{f.handling}</Typography></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} sx={{ py: 0, borderBottom: open === f.check_id ? undefined : 'none' }}>
                        <Collapse in={open === f.check_id} unmountOnExit>
                          <Box sx={{ py: 1.5 }}>
                            {note ? <Typography variant="body2" sx={{ mb: 1 }}><strong>{note.verdict}:</strong> {note.note}</Typography> : null}
                            <History checkId={f.check_id} />
                            {f.sample.length ? (
                              <Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>
                                {f.sample.map((row) => JSON.stringify(row)).join('\n')}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">No rows.</Typography>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      ) : null}
    </Box>
  );
}

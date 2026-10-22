import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { getRestorationTracking, type RestorationTrackingRowDTO } from '../../../api/restorationTracking.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { formatCurrency } from '../../../utils/format';
import { restorationOverviewPath } from '../restorationRoutes';
import { ageTone, daysText } from './restorationTrackingDisplay';

const TONE = { default: undefined, warning: 'warning.main', error: 'error.main' } as const;

/** Every item in restoration: its path (tested / assembled / repaired / salvaged), where it goes next, and how long. */
export default function RestorationTrackingPage() {
  const [scope, setScope] = useState<'open' | 'done'>('open');
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'));
  const { data, isLoading, isError } = useQuery({
    queryKey: ['restoration-tracking', scope],
    queryFn: async () => (await getRestorationTracking(scope, 30)).data,
  });

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, overflow: 'auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <PageHeader
        compact
        title="Restoration list"
        subtitle={scope === 'open' ? 'In restoration now, oldest first' : 'Finished in the last 30 days'}
        action={
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(_, v) => v && setScope(v)}>
            <ToggleButton value="open">In progress</ToggleButton>
            <ToggleButton value="done">Finished</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      {isLoading ? (
        <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
      ) : isError || !data ? (
        <Alert severity="error">Could not load the restoration list.</Alert>
      ) : (
        <>
          {scope === 'open' ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
              {Object.entries(data.summary.by_stage).map(([label, n]) => (
                <Chip key={label} label={`${label}: ${n}`} variant={n ? 'filled' : 'outlined'} />
              ))}
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                Median {daysText(data.summary.median_days)} in restoration · {data.summary.over_30_days} over 30 days
              </Typography>
            </Box>
          ) : null}
          {phone ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
              {data.rows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {scope === 'open' ? 'Nothing in restoration.' : 'Nothing finished in the last 30 days.'}
                </Typography>
              ) : (
                data.rows.map((r) => <TrackingCard key={r.job_id} row={r} done={scope === 'done'} />)
              )}
            </Box>
          ) : (
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell>Path</TableCell>
                  <TableCell>Next</TableCell>
                  {scope === 'done' ? <TableCell>Landed</TableCell> : null}
                  <TableCell align="right">In restoration</TableCell>
                  {scope === 'open' ? <TableCell align="right">In this stage</TableCell> : null}
                  <TableCell>Sent</TableCell>
                  {scope === 'done' ? <TableCell align="right">Value added</TableCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} sx={{ color: 'text.secondary' }}>
                      {scope === 'open' ? 'Nothing in restoration.' : 'Nothing finished in the last 30 days.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rows.map((r) => (
                    <TableRow key={r.job_id} hover>
                      <TableCell sx={{ fontFamily: 'monospace' }}>
                        <Link component={RouterLink} to={restorationOverviewPath(r.job_id)}>
                          {r.sku || `Job ${r.job_id}`}
                        </Link>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.title}>
                        {r.title}
                        {r.quantity > 1 ? ` ×${r.quantity}` : ''}
                      </TableCell>
                      <TableCell>{r.stage_label}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {r.path.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          ) : (
                            r.path.map((p) => (
                              <Tooltip key={p.step} title={p.first_at ? `First ${new Date(p.first_at).toLocaleDateString()}` : ''}>
                                <Chip size="small" label={p.step} color={p.step === 'salvaged' ? 'warning' : 'success'} variant="outlined" />
                              </Tooltip>
                            ))
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{r.next || '-'}</TableCell>
                      {scope === 'done' ? <TableCell>{r.landed || 'Not checked in yet'}</TableCell> : null}
                      <TableCell align="right" sx={{ color: TONE[ageTone(r.days_in_restoration)], fontWeight: 700 }}>
                        {daysText(r.days_in_restoration)}
                      </TableCell>
                      {scope === 'open' ? <TableCell align="right">{daysText(r.days_in_stage)}</TableCell> : null}
                      <TableCell>{r.sent_at ? new Date(r.sent_at).toLocaleDateString() : '-'}</TableCell>
                      {scope === 'done' ? <TableCell align="right">{formatCurrency(r.value_added)}</TableCell> : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Paper>
          )}
          {data.truncated ? (
            <Typography variant="caption" color="text.secondary">Showing the first {data.count}.</Typography>
          ) : null}
        </>
      )}
    </Box>
  );
}

function TrackingCard({ row: r, done }: { row: RestorationTrackingRowDTO; done: boolean }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap title={r.title}>
          {r.title}
          {r.quantity > 1 ? ` ×${r.quantity}` : ''}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 800, color: TONE[ageTone(r.days_in_restoration)], whiteSpace: 'nowrap' }}>
          {daysText(r.days_in_restoration)}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" component="div">
        <Link component={RouterLink} to={restorationOverviewPath(r.job_id)} sx={{ fontFamily: 'monospace' }}>
          {r.sku || `Job ${r.job_id}`}
        </Link>
        {` · ${r.stage_label}`}
        {!done && r.days_in_stage != null ? ` ${daysText(r.days_in_stage)}` : ''}
        {r.next ? ` · ${r.next}` : ''}
        {done ? ` · ${r.landed || 'not checked in yet'}` : ''}
      </Typography>
      {r.path.length ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
          {r.path.map((p) => (
            <Chip key={p.step} size="small" label={p.step} color={p.step === 'salvaged' ? 'warning' : 'success'} variant="outlined" />
          ))}
        </Box>
      ) : null}
    </Paper>
  );
}

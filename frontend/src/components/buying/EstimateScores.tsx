import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { fetchEstimateScores } from '../../api/buying.api';
import type { EstimateScores as Scores } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pts = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
const day = (iso: string) => format(parseISO(iso), 'MMM d');

/**
 * "How good is it" under an estimate (Dash #77): the nightly fit's blind test for this seller.
 * Each truck was predicted from a fit that never saw it, then compared with what it sold in its
 * first 90 days. Folded until asked; one fetch when opened.
 */
export default function EstimateScores({ seller, sellerName }: { seller: string; sellerName: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['buying', 'estimateScores', seller],
    queryFn: () => fetchEstimateScores(seller),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Button size="small" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'Hide how good it is' : 'How good is it?'}
      </Button>
      {open ? <Body q={q} sellerName={sellerName} /> : null}
    </Paper>
  );
}

function Body({ q, sellerName }: { q: UseQueryResult<Scores>; sellerName: string }) {
  if (q.isPending) return <Skeleton variant="rectangular" height={160} sx={{ mt: 1 }} />;
  if (q.isError) return <Alert severity="error" sx={{ mt: 1 }}>Could not load the scores. Try again.</Alert>;
  const data = q.data;
  const fit = data.fit;
  if (!fit) return <Alert severity="info" sx={{ mt: 1 }}>No fit yet: it runs every night.</Alert>;
  if (fit.status !== 'ok' || !fit.summary || !fit.scores || !fit.rates) {
    return (
      <Alert severity="info" sx={{ mt: 1 }}>
        Not yet for {sellerName}: {fit.scored_trucks} trucks have 90 days of selling (3 needed); {fit.young_trucks} younger.
      </Alert>
    );
  }
  const sm = fit.summary;
  const own = Object.keys(fit.rates.categories);
  const cats = Object.entries(fit.categories || {}).sort((a, b) => b[1].retail - a[1].retail);
  return (
    <Stack spacing={1.5} sx={{ mt: 1 }}>
      <Typography variant="body2">
        Each {sellerName} truck below was predicted from the other trucks only, then compared with what it sold in its
        first 90 days. Usually off <b>{sm.median_miss.toFixed(1)} points</b> of retail, within 4 points on{' '}
        {sm.within_4} of {sm.trucks}, worst {sm.worst_miss.toFixed(1)}, on average {pts(sm.mean_signed)}
        {sm.thin ? '. Thin: under 5 trucks.' : '.'}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Fit {data.fitted_at ? day(data.fitted_at) : ''}
        {fit.previous
          ? `; the fit of ${day(fit.previous.fitted_at)} was off ${fit.previous.median_miss_then.toFixed(1)} on the same ${fit.previous.trucks} trucks, now ${fit.previous.median_miss_now.toFixed(1)}`
          : ''}
        . {fit.young_trucks} younger trucks join as they pass 90 days.{' '}
        {own.length
          ? `Categories with their own rate: ${own.join(', ').toLowerCase()}; the rest use the whole-truck rate.`
          : 'No category is on 3+ scored trucks yet, so every line uses the whole-truck rate.'}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label="Scored trucks">
          <TableHead>
            <TableRow>
              <TableCell>PO</TableCell>
              <TableCell>First sale</TableCell>
              <TableCell align="right">Retail</TableCell>
              <TableCell align="right">Sold in 90 days</TableCell>
              <TableCell align="right">Blind estimate</TableCell>
              <TableCell align="right">Off by (points)</TableCell>
              <TableCell>Flags</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fit.scores.map((s) => {
              const flags: string[] = [];
              if (s.unlinked_sold > 0) flags.push(`${formatCurrencyWhole(s.unlinked_sold)} sold with no manifest row (not counted)`);
              if (s.zero_retail_rows > 0) flags.push(`${s.zero_retail_rows} rows with $0 retail`);
              return (
                <TableRow key={s.po}>
                  <TableCell>{s.po}</TableCell>
                  <TableCell>{day(s.first_sale)}</TableCell>
                  <TableCell align="right">{formatCurrencyWhole(s.retail)}</TableCell>
                  <TableCell align="right">{pct(s.actual / s.retail)}</TableCell>
                  <TableCell align="right">{pct(s.predicted / s.retail)}</TableCell>
                  <TableCell align="right" sx={{ color: Math.abs(s.miss) > 4 ? 'warning.main' : undefined }}>{pts(s.miss)}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{flags.join('; ') || '-'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      {cats.length ? (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Seller categories">
            <TableHead>
              <TableRow>
                <TableCell>Seller category</TableCell>
                <TableCell align="right">Retail scored</TableCell>
                <TableCell align="right">Sold in 90 days</TableCell>
                <TableCell align="right">Trucks</TableCell>
                <TableCell>Rate used</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cats.slice(0, 15).map(([sc, c]) => (
                <TableRow key={sc}>
                  <TableCell>{sc.toLowerCase()}</TableCell>
                  <TableCell align="right">{formatCurrencyWhole(c.retail)}</TableCell>
                  <TableCell align="right">{c.retail ? pct(c.actual / c.retail) : '-'}</TableCell>
                  <TableCell align="right">{c.trucks}</TableCell>
                  <TableCell>{own.includes(sc) ? 'its own' : 'whole truck'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : null}
      <Typography variant="caption" color="text.secondary">
        {data.forward.length
          ? `Forward test (estimates saved before the truck was bought): ${data.forward
              .map((f) => `PO ${f.po} ${pts(f.miss)}`)
              .join(', ')}.`
          : 'Forward test: none yet. It starts when a lot estimated here is bought and has sold for 90 days.'}
      </Typography>
    </Stack>
  );
}

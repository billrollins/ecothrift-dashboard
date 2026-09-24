import {
  Alert,
  Box,
  Chip,
  Link as MuiLink,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { Link as RouterLink } from 'react-router-dom';
import { useBuyingReportCards } from '../../hooks/useBuyingReportCards';
import type { ReportCardRow, ReportCardsResponse } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';

const STAGE: Record<ReportCardRow['stage'], { label: string; color: 'success' | 'warning' | 'default'; tip: string }> = {
  judged: { label: 'Judged', color: 'success', tip: 'Old enough and sold enough to count in the valuation check.' },
  selling: { label: 'Selling', color: 'warning', tip: 'Items are selling; too early to judge.' },
  not_selling_yet: { label: 'Not selling yet', color: 'default', tip: 'Nothing sold yet: on order, in transit or in processing.' },
};

function vsTone(pct: number | null): string {
  if (pct == null) return 'text.secondary';
  if (pct >= 95) return 'success.main';
  if (pct >= 75) return 'warning.main';
  return 'error.main';
}

function day(iso: string | null): string {
  return iso ? format(parseISO(iso), 'MMM d, yyyy') : '-';
}

/** The valuation check: what finished trucks say, and the multiplier in use. */
function Check({ data }: { data: ReportCardsResponse }) {
  const c = data.calibration;
  const ratio = c.median_ratio != null ? Math.round(c.median_ratio * 100) : null;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 4 }}>
        <Box>
          <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em', display: 'block', lineHeight: 1.4 }}>
            Valuation check
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {ratio != null ? `Actual is ${ratio}% of predicted` : 'No judged trucks yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {c.trucks} of {c.min_trucks} trucks needed · a truck counts once it is {c.min_age_days} days old and {c.min_sold_pct}% sold
          </Typography>
        </Box>
        <Box>
          <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em', display: 'block', lineHeight: 1.4 }}>
            In use
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {c.applied ? `${c.applied}×` : '1.0×'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {c.applied ? 'Revenue estimates are multiplied by this (0.7 to 1.3).' : 'Set nightly once enough trucks back it.'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em', display: 'block', lineHeight: 1.4 }}>
            Last 90 days
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {data.last_90_days.won} won · {data.last_90_days.lost} lost
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function StageChip({ stage }: { stage: ReportCardRow['stage'] }) {
  const s = STAGE[stage];
  return (
    <Tooltip title={s.tip}>
      <Chip size="small" color={s.color} variant={stage === 'judged' ? 'filled' : 'outlined'} label={s.label} />
    </Tooltip>
  );
}

function TruckCell({ row }: { row: ReportCardRow }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <MuiLink component={RouterLink} to={`/buying/auctions/${row.auction_id}`} underline="hover" sx={{ fontWeight: 700 }}>
        {row.marketplace} · {row.title || `Auction ${row.auction_id}`}
      </MuiLink>
      <Typography variant="caption" color="text.secondary" display="block">
        <MuiLink component={RouterLink} to={`/inventory/orders/${row.card.purchase_order_id}`} underline="hover" color="inherit">
          {row.card.order_number}
        </MuiLink>
        {` · won ${day(row.ordered_date)}`}
        {row.hammer_price ? ` for ${formatCurrencyWhole(row.hammer_price)}` : ''}
      </Typography>
    </Box>
  );
}

function VsPredicted({ row }: { row: ReportCardRow }) {
  const pct = row.card.revenue_vs_predicted_pct;
  return (
    <Typography variant="body2" sx={{ fontWeight: 800, color: vsTone(row.stage === 'judged' ? pct : null) }}>
      {pct != null ? `${Math.round(pct)}%` : '-'}
    </Typography>
  );
}

function soldLabel(row: ReportCardRow): string {
  const a = row.card.actual;
  return a.items ? `${a.sold} of ${a.items} (${Math.round(a.sell_through_pct ?? 0)}%)` : 'No items yet';
}

function DeskTable({ rows }: { rows: ReportCardRow[] }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Truck</TableCell>
          <TableCell>Stage</TableCell>
          <TableCell align="right">Predicted</TableCell>
          <TableCell align="right">Sold so far</TableCell>
          <TableCell align="right">vs predicted</TableCell>
          <TableCell align="right">Items sold</TableCell>
          <TableCell align="right">Days to sell</TableCell>
          <TableCell align="right">Profit so far</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.auction_id} hover>
            <TableCell sx={{ maxWidth: 420 }}>
              <TruckCell row={row} />
            </TableCell>
            <TableCell>
              <StageChip stage={row.stage} />
            </TableCell>
            <TableCell align="right">{row.card.predicted.revenue ? formatCurrencyWhole(row.card.predicted.revenue) : '-'}</TableCell>
            <TableCell align="right">{formatCurrencyWhole(row.card.actual.revenue)}</TableCell>
            <TableCell align="right">
              <VsPredicted row={row} />
            </TableCell>
            <TableCell align="right">{soldLabel(row)}</TableCell>
            <TableCell align="right">
              {row.card.actual.avg_days_to_sell != null ? `${row.card.actual.avg_days_to_sell} d` : '-'}
              {row.card.predicted.days_to_sell != null ? (
                <Typography component="span" variant="caption" color="text.secondary">{` (said ${row.card.predicted.days_to_sell})`}</Typography>
              ) : null}
            </TableCell>
            <TableCell align="right">{formatCurrencyWhole(row.card.actual.profit_so_far)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PhoneCards({ rows }: { rows: ReportCardRow[] }) {
  return (
    <Stack spacing={1}>
      {rows.map((row) => (
        <Paper key={row.auction_id} variant="outlined" sx={{ p: 1.25 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
            <TruckCell row={row} />
            <StageChip stage={row.stage} />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
            <Typography variant="body2">
              Predicted <b>{row.card.predicted.revenue ? formatCurrencyWhole(row.card.predicted.revenue) : '-'}</b>
            </Typography>
            <Typography variant="body2">
              Sold <b>{formatCurrencyWhole(row.card.actual.revenue)}</b>
            </Typography>
            <VsPredicted row={row} />
            <Typography variant="body2" color="text.secondary">{soldLabel(row)}</Typography>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

/**
 * Buying → Report cards (Phase 6): every truck we won, what we predicted when we won it, and
 * what it has sold for so far. Judged trucks feed the nightly valuation check.
 */
export default function ReportCardsPage() {
  const theme = useTheme();
  const isDesk = useMediaQuery(theme.breakpoints.up('md'));
  const query = useBuyingReportCards();
  const data = query.data;

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Report cards</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every truck won with &quot;We won it&quot;: what we predicted, and what it has sold for so far.
      </Typography>
      {query.isError ? <Alert severity="error">Could not load the report cards.</Alert> : null}
      {query.isLoading ? <Skeleton variant="rounded" height={120} /> : null}
      {data ? <Check data={data} /> : null}
      {data && data.results.length === 0 ? (
        <Alert severity="info">
          No won trucks yet. On a closed auction, &quot;We won it&quot; creates the PO and starts its report card.
        </Alert>
      ) : null}
      {data && data.results.length > 0 ? (
        <Paper variant="outlined" sx={{ p: { xs: 1, md: 0 }, overflowX: 'auto' }}>
          {isDesk ? <DeskTable rows={data.results} /> : <PhoneCards rows={data.results} />}
        </Paper>
      ) : null}
    </Box>
  );
}

import { Alert, Box, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchLateReturns } from '../../../api/thriftplusReturns.api';
import { formatCurrency } from '../../../utils/format';
import { dayOnly, dayTime } from './returnsText';

/**
 * Late returns (owner 2026-10-20): every return taken after the 3 days. Each is a mark against Retail, on the cashier
 * who rang the original sale, with the reason and who typed the owner PIN. Newest first. Managers and the owner.
 */
export default function LateReturnsTable() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['thriftplus', 'late-returns'], queryFn: fetchLateReturns });
  if (isLoading) return <CircularProgress size={28} aria-label="Loading late returns" />;
  if (isError) return <Alert severity="error">Could not load the late returns.</Alert>;
  if (!data?.length) return <Alert severity="info">No late returns yet.</Alert>;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Each is a mark against Retail on the cashier who rang the sale. Newest first.
      </Typography>
      <Table size="small" data-testid="late-returns-table">
        <TableHead>
          <TableRow>
            <TableCell>Returned</TableCell>
            <TableCell>Ticket</TableCell>
            <TableCell>Days late</TableCell>
            <TableCell>Item</TableCell>
            <TableCell>Member</TableCell>
            <TableCell align="right">Credit</TableCell>
            <TableCell>Mark against</TableCell>
            <TableCell>Reason</TableCell>
            <TableCell>PIN typed by</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayTime(r.created_at)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {r.receipt_number}
                <Typography variant="caption" component="div" color="text.secondary">sold {dayOnly(r.sold_at)}</Typography>
              </TableCell>
              <TableCell>{r.days_late ?? ''}</TableCell>
              <TableCell>
                {r.title}
                <Typography variant="caption" component="div" color="text.secondary">{r.sku}</Typography>
              </TableCell>
              <TableCell>{r.member}</TableCell>
              <TableCell align="right">{formatCurrency(r.credit)}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Retail: {r.cashier || 'unknown'}</TableCell>
              <TableCell>
                {r.reason_label}
                {r.note ? <Typography variant="caption" component="div" color="text.secondary">{r.note}</Typography> : null}
              </TableCell>
              <TableCell>{r.entered_by}{r.by_pin ? '' : ' (owner signed in)'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

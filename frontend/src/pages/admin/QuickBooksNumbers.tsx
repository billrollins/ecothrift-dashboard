/**
 * QuickBooks numbers (owner 2026-10-21): what to type into QuickBooks Online for one pay period. Per person: regular
 * hours, overtime hours (past 40 in a Mon-Sun week, paid at 1.5), rate and gross. Copy puts the table on the
 * clipboard (it pastes into a spreadsheet as columns); CSV downloads it. Close locks the period's time entries until
 * the owner reopens it.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { format, parseISO } from 'date-fns';
import api from '../../api/client';
import {
  closePayPeriod,
  getPayNumbers,
  payNumbersCsvUrl,
  reopenPayPeriod,
  type PayNumbers,
} from '../../api/hr.api';
import type { PayrollPeriod } from '../../types/hr.types';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

const NUM = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function money(v: string): string {
  return usd.format(parseFloat(v) || 0);
}

/** Tab-separated, header first: pastes into a spreadsheet as columns. */
export function numbersAsText(data: PayNumbers): string {
  const head = ['Employee', 'Regular hours', 'Overtime hours', 'Rate', 'Overtime rate', 'Gross'];
  const rows = data.rows.map((r) => [r.name, r.regular_hours, r.overtime_hours, r.rate, r.overtime_rate, r.gross]);
  return [head, ...rows].map((cells) => cells.join('\t')).join('\n');
}

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

export function QuickBooksNumbers({ periods }: { periods: PayrollPeriod[] }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  // The last finished period is the one to enter; the current one is still going.
  const current = periods.findIndex((p) => p.is_current);
  const fallback = periods[current + 1] ?? periods[0];
  const [start, setStart] = useState<string>(fallback?.date_from ?? '');
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    if (!start && fallback) setStart(fallback.date_from);
  }, [fallback, start]);

  const query = useQuery({
    queryKey: ['payNumbers', start],
    queryFn: async () => (await getPayNumbers(start)).data,
    enabled: Boolean(start),
  });
  const data = query.data;

  const lock = useMutation({
    mutationFn: async (close: boolean) => (close ? closePayPeriod(start) : reopenPayPeriod(start)),
    onSuccess: (_res, close) => {
      queryClient.invalidateQueries({ queryKey: ['payNumbers'] });
      enqueueSnackbar(close ? 'Pay period closed' : 'Pay period reopened', { variant: 'success' });
      setConfirmClose(false);
    },
    onError: (err) => {
      enqueueSnackbar(errorText(err, 'Could not change the pay period'), { variant: 'error' });
      setConfirmClose(false);
    },
  });

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(numbersAsText(data));
      enqueueSnackbar('Copied. Paste it into a spreadsheet or keep it beside QuickBooks.', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not copy. Use CSV instead.', { variant: 'error' });
    }
  };

  const download = async () => {
    try {
      const res = await api.get(payNumbersCsvUrl(start), { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pay-${data?.date_from ?? start}-to-${data?.date_to ?? ''}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      enqueueSnackbar('Could not download the CSV', { variant: 'error' });
    }
  };

  const open = data?.rows.reduce((n, r) => n + r.open_shifts, 0) ?? 0;
  const pending = data?.rows.reduce((n, r) => n + r.pending_shifts, 0) ?? 0;

  return (
    <Box sx={{ px: 2, py: 1.5 }} data-testid="quickbooks-numbers">
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }} useFlexGap flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel>Pay period</InputLabel>
          <Select label="Pay period" value={start} onChange={(e) => setStart(String(e.target.value))}>
            {periods.map((p) => (
              <MenuItem key={p.date_from} value={p.date_from}>
                {p.label}{p.is_current ? ' (current)' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" onClick={copy} disabled={!data?.rows.length}>Copy</Button>
        <Button variant="outlined" onClick={download} disabled={!data?.rows.length}>CSV</Button>
        {data?.closed ? (
          <Button color="warning" variant="outlined" onClick={() => lock.mutate(false)} disabled={lock.isPending}>
            Reopen period
          </Button>
        ) : (
          <Button variant="contained" onClick={() => setConfirmClose(true)} disabled={!data || lock.isPending}>
            Close period
          </Button>
        )}
      </Stack>

      {data?.closed ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Closed{data.closed_by ? ` by ${data.closed_by}` : ''}
          {data.closed_at ? ` on ${format(parseISO(data.closed_at), 'MMM d, h:mm a')}` : ''}. Its shifts can&apos;t be
          changed until it is reopened.
        </Alert>
      ) : null}
      {open ? (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {open} shift{open === 1 ? ' is' : 's are'} still clocked in and not counted yet.
        </Alert>
      ) : null}
      {pending ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {pending} shift{pending === 1 ? ' is' : 's are'} not approved yet (counted here).
        </Alert>
      ) : null}

      {query.isError ? <Alert severity="error">Could not load the numbers.</Alert> : null}
      {/* A desk screen (the owner, Time & payroll); on a phone the table scrolls sideways. */}
      <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 620 }}>
        <TableHead>
          <TableRow>
            <TableCell>Employee</TableCell>
            <TableCell align="right">Regular hours</TableCell>
            <TableCell align="right">Overtime hours</TableCell>
            <TableCell align="right">Rate</TableCell>
            <TableCell align="right">Overtime rate</TableCell>
            <TableCell align="right">Gross</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(data?.rows ?? []).map((r) => (
            <TableRow key={r.employee_id}>
              <TableCell>{r.name}</TableCell>
              <TableCell align="right" sx={NUM}>{r.regular_hours}</TableCell>
              <TableCell align="right" sx={{ ...NUM, color: parseFloat(r.overtime_hours) > 0 ? 'warning.main' : undefined }}>
                {r.overtime_hours}
              </TableCell>
              <TableCell align="right" sx={NUM}>{money(r.rate)}</TableCell>
              <TableCell align="right" sx={NUM}>{money(r.overtime_rate)}</TableCell>
              <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>{money(r.gross)}</TableCell>
            </TableRow>
          ))}
          {data && data.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>
                <Typography variant="body2" color="text.secondary">No finished shifts in this period.</Typography>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
        {data && data.rows.length ? (
          <TableFooter>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
              <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>{data.totals.regular_hours}</TableCell>
              <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>{data.totals.overtime_hours}</TableCell>
              <TableCell />
              <TableCell />
              <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>{money(data.totals.gross)}</TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Overtime is hours past 40 in a Mon-Sun week, paid at 1.5 times the rate. Payroll is run in QuickBooks Online.
      </Typography>

      <ConfirmDialog
        open={confirmClose}
        title={`Close ${data?.label ?? 'this pay period'}?`}
        message="Its shifts are locked: nobody can add, change, approve or remove them until you reopen it."
        confirmLabel="Close period"
        onConfirm={() => lock.mutate(true)}
        onCancel={() => setConfirmClose(false)}
        loading={lock.isPending}
      />
    </Box>
  );
}

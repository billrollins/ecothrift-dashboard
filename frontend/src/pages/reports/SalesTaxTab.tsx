/**
 * Sales tax (owner 2026-10-13: "I file"): what the Nebraska sales tax return needs for a month, a quarter or a year,
 * from completed register sales (online holds are paid at the register). Store days, Central time.
 *
 * Top: the numbers for the return (gross, exempt, taxable sales, state and local tax), each with a copy button, and
 * the tax refunded on Thrift+ returns with the net after it (critic review NUM-01; the CPA picks which to file). Then
 * what makes up taxable sales, what isn't a sale, voided sales from the period, payments, and each day. Download
 * gives the same as a CSV. It opens on last month, the one usually being filed.
 */
import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { endOfMonth, endOfQuarter, endOfYear, format, parseISO, startOfMonth, startOfQuarter, startOfYear, subMonths, subQuarters, subYears } from 'date-fns';
import { fetchSalesTax, type SalesTaxReport } from '../../api/reports.api';
import { formatCurrency, formatNumber } from '../../utils/format';

type Span = 'month' | 'quarter' | 'year';

interface Period {
  key: string;
  label: string;
  start: string;
  end: string;
}

const day = (d: Date) => format(d, 'yyyy-MM-dd');

/** The periods to pick from, newest first; the first is the one usually being filed (the last full one). */
export function periods(span: Span, today: Date = new Date()): Period[] {
  const out: Period[] = [];
  const count = span === 'month' ? 24 : span === 'quarter' ? 8 : 4;
  for (let i = 1; i <= count; i++) {
    if (span === 'month') {
      const d = subMonths(today, i);
      out.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy'), start: day(startOfMonth(d)), end: day(endOfMonth(d)) });
    } else if (span === 'quarter') {
      const d = subQuarters(today, i);
      out.push({ key: format(d, 'yyyy-QQQ'), label: `${format(d, 'QQQ yyyy')} (${format(startOfQuarter(d), 'MMM')} to ${format(endOfQuarter(d), 'MMM')})`,
        start: day(startOfQuarter(d)), end: day(endOfQuarter(d)) });
    } else {
      const d = subYears(today, i);
      out.push({ key: format(d, 'yyyy'), label: format(d, 'yyyy'), start: day(startOfYear(d)), end: day(endOfYear(d)) });
    }
  }
  // The period still running, last in the list: to watch it, not to file it.
  const now = span === 'month'
    ? { key: format(today, 'yyyy-MM'), label: `${format(today, 'MMMM yyyy')} (so far)`, start: day(startOfMonth(today)), end: day(today) }
    : span === 'quarter'
      ? { key: format(today, 'yyyy-QQQ'), label: `${format(today, 'QQQ yyyy')} (so far)`, start: day(startOfQuarter(today)), end: day(today) }
      : { key: format(today, 'yyyy'), label: `${format(today, 'yyyy')} (so far)`, start: day(startOfYear(today)), end: day(today) };
  return [...out, now];
}

const pct = (rate: string) => `${(Number.parseFloat(rate) * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
const METHOD: Record<string, string> = { cash: 'Cash', card: 'Card', split: 'Split', payroll: 'Payroll deduction' };

interface DayRow {
  day: string;
  count: number;
  taxable: string;
  tax: string;
  /** Tax given back on Thrift+ returns that day. */
  taxBack: string;
}

/** Each day with sales or Thrift+ returns, oldest first: a return can fall on a day with no sales. */
export function dayRows(r: SalesTaxReport): DayRow[] {
  const byDay = new Map<string, DayRow>();
  for (const d of r.days) byDay.set(d.day, { day: d.day, count: d.count, taxable: d.taxable, tax: d.tax, taxBack: '0.00' });
  for (const d of r.thrift_plus_returns.days) {
    const row = byDay.get(d.day) ?? { day: d.day, count: 0, taxable: '0.00', tax: '0.00', taxBack: '0.00' };
    byDay.set(d.day, { ...row, taxBack: d.tax_back });
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** A copy of the report as a CSV: the return's numbers, the parts, then each day. */
export function salesTaxCsv(r: SalesTaxReport): string {
  const rows: (string | number)[][] = [
    ['Sales tax report', `${r.start} to ${r.end}`],
    [],
    ['Gross sales', r.gross_sales],
    ['Exempt sales', r.exempt_sales],
    ['Net taxable sales', r.taxable_sales],
    ...r.rates.flatMap((x) => [
      [`State tax (${pct(x.state_rate)})`, x.state_tax],
      [`Local tax (${pct(x.local_rate)})`, x.local_tax],
      [`Tax at ${pct(x.rate)}`, x.tax_at_rate],
    ]),
    ['Tax collected on receipts', r.tax_collected],
    ['Rounding (collected less at the rate)', r.rounding],
    [],
    ['Thrift+ returns', r.thrift_plus_returns.count],
    ['Price refunded on Thrift+ returns (before tax)', r.thrift_plus_returns.taxable_back],
    ['Tax refunded on Thrift+ returns', r.thrift_plus_returns.tax_back],
    ['Net taxable sales less returns', r.taxable_sales_less_returns],
    ['Tax collected less tax refunded', r.tax_collected_less_returns],
    [],
    ['Merchandise (after sale prices)', r.parts.merchandise],
    ['Discounts', r.parts.discounts],
    ['Delivery fees', r.parts.delivery_fees],
    ['Assembly', r.parts.assembly],
    ['Card surcharges (not sales, not taxed)', r.card_surcharge],
    ['Voided sales (left out)', `${r.voided.count} sales, ${r.voided.taxable} taxable, ${r.voided.tax} tax`],
    [],
    ['Day', 'Sales', 'Taxable sales', 'Tax collected', 'Tax refunded (Thrift+ returns)'],
    ...dayRows(r).map((d) => [d.day, d.count, d.taxable, d.tax, d.taxBack]),
    ...((r.exempt_organizations ?? []).length
      ? [
          [],
          ['Tax-exempt sales to non-profits'],
          ['Day', 'Receipt', 'Organization', 'Certificate number', 'Amount', 'Marked by'],
          ...(r.exempt_organizations ?? []).map((x) => [
            x.day, x.receipt, x.org, x.number || (x.certificate_photo ? '(photo on file)' : ''), x.amount, x.by,
          ]),
        ]
      : []),
  ];
  return rows.map((row) => row.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
}

function CopyRow({ label, value, strong, note }: { label: string; value: string; strong?: boolean; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <TableRow>
      <TableCell sx={{ fontWeight: strong ? 800 : 500 }}>
        {label}
        {note ? <Typography component="div" sx={{ fontSize: 12, color: 'text.secondary' }}>{note}</Typography> : null}
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 18 : 15, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {formatCurrency(value)}
      </TableCell>
      <TableCell sx={{ width: 44, p: 0.5 }}>
        <Tooltip title={copied ? 'Copied' : 'Copy the number'}>
          <IconButton
            size="small"
            aria-label={`Copy ${label}`}
            onClick={() => {
              void navigator.clipboard?.writeText(value).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }).catch(() => undefined);
            }}
          >
            <ContentCopyRounded sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

export default function SalesTaxTab() {
  const [span, setSpan] = useState<Span>('month');
  const list = useMemo(() => periods(span), [span]);
  const [key, setKey] = useState<string>(list[0].key);
  const period = list.find((p) => p.key === key) ?? list[0];
  const { data, isFetching, error } = useQuery({
    queryKey: ['reports', 'sales-tax', period.start, period.end],
    queryFn: () => fetchSalesTax(period.start, period.end),
  });

  const download = () => {
    if (!data) return;
    const blob = new Blob([salesTaxCsv(data)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-tax-${period.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <ToggleButtonGroup size="small" exclusive value={span} onChange={(_e, v: Span | null) => {
          if (!v) return;
          setSpan(v);
          setKey(periods(v)[0].key);
        }}>
          <ToggleButton value="month" sx={{ textTransform: 'none' }}>Month</ToggleButton>
          <ToggleButton value="quarter" sx={{ textTransform: 'none' }}>Quarter</ToggleButton>
          <ToggleButton value="year" sx={{ textTransform: 'none' }}>Year</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label="Period" value={period.key} onChange={(e) => setKey(e.target.value)} sx={{ minWidth: 240 }}
          inputProps={{ 'data-testid': 'sales-tax-period' }}>
          {list.map((p) => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<DownloadRounded />} onClick={download} disabled={!data} sx={{ textTransform: 'none' }}>
          Download CSV
        </Button>
      </Stack>

      {isFetching ? <LinearProgress sx={{ mb: 1 }} /> : <Box sx={{ height: 4, mb: 1 }} />}
      {error ? <Alert severity="error">Could not load the report.</Alert> : null}

      {data ? (
        <Stack spacing={2}>
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
            {format(parseISO(data.start), 'MMM d, yyyy')} to {format(parseISO(data.end), 'MMM d, yyyy')}: {formatNumber(data.sales)} sales at the
            register (online holds are paid there). Store days, Central time.
          </Typography>

          <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="for-the-return">
            <Typography sx={{ fontWeight: 800, mb: 0.5 }}>For the return</Typography>
            <Table size="small">
              <TableBody>
                <CopyRow label="Gross sales" value={data.gross_sales} />
                <CopyRow label="Exempt sales" value={data.exempt_sales} note={'Lines marked "No tax" at the register (pop), and tax-exempt sales to non-profits (listed below).'} />
                <CopyRow label="Net taxable sales" value={data.taxable_sales} strong />
                {data.rates.map((r) => (
                  <Fragment key={r.rate}>
                    <CopyRow label={`State tax (${pct(r.state_rate)})`} value={r.state_tax} />
                    <CopyRow label={`Local tax (${pct(r.local_rate)})`} value={r.local_tax} />
                    <CopyRow label={`Total tax at ${pct(r.rate)}`} value={r.tax_at_rate} strong />
                  </Fragment>
                ))}
                <CopyRow label="Tax collected on receipts" value={data.tax_collected}
                  note={Number.parseFloat(data.rounding) ? `${formatCurrency(data.rounding)} from rounding each receipt to the cent.` : 'Matches the tax at the rate.'} />
                <CopyRow label="Tax refunded on Thrift+ returns" value={data.thrift_plus_returns.tax_back}
                  note={`${formatNumber(data.thrift_plus_returns.count)} ${data.thrift_plus_returns.count === 1 ? 'return' : 'returns'}, ${formatCurrency(data.thrift_plus_returns.taxable_back)} of price refunded before tax, counted on the return day.`} />
                <CopyRow label="Tax collected less tax refunded" value={data.tax_collected_less_returns} strong
                  note={`Net taxable sales less returns: ${formatCurrency(data.taxable_sales_less_returns)}. ${data.thrift_plus_returns.note}`} />
              </TableBody>
            </Table>
          </Paper>

          {(data.exempt_organizations ?? []).length ? (
            <Paper variant="outlined" sx={{ p: 1.5, overflowX: 'auto' }} data-testid="exempt-organizations">
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Tax-exempt sales to non-profits</Typography>
              <Table size="small">
                <TableBody>
                  {(data.exempt_organizations ?? []).map((x) => (
                    <TableRow key={`${x.receipt}-${x.day}`}>
                      <TableCell>{x.day}</TableCell>
                      <TableCell>{x.receipt}</TableCell>
                      <TableCell>
                        {x.org}
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {x.number ? `#${x.number}` : x.certificate_photo ? 'Certificate photo on file' : ''} · by {x.by || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(x.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          ) : null}

          {data.voided.count ? (
            <Alert severity="warning">
              {formatNumber(data.voided.count)} {data.voided.count === 1 ? 'sale' : 'sales'} from this period {data.voided.count === 1 ? 'was' : 'were'} voided
              ({formatCurrency(data.voided.taxable)} taxable, {formatCurrency(data.voided.tax)} tax) and {data.voided.count === 1 ? 'is' : 'are'} left out.
              If one was voided after you filed, that period&apos;s return changes.
            </Alert>
          ) : null}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>What makes up taxable sales</Typography>
              <Table size="small">
                <TableBody>
                  {[
                    ['Merchandise (after sale prices)', data.parts.merchandise],
                    ['Discounts', data.parts.discounts],
                    ['Delivery fees', data.parts.delivery_fees],
                    ['Assembly', data.parts.assembly],
                    ...(data.parts.other ? [['Other', data.parts.other]] : []),
                  ].map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell>{label}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(value)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Net taxable sales</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(data.taxable_sales)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Not sales</Typography>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>
                      Card surcharges
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>CardX, record only: not revenue, not taxed.</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(data.card_surcharge)}</TableCell>
                  </TableRow>
                  {Number.parseFloat(data.thrift_credit) ? (
                    <TableRow>
                      <TableCell>
                        Thrift+ credit spent
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>A payment: those sales are taxed in full.</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(data.thrift_credit)}</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              <Typography sx={{ fontWeight: 800, mt: 2, mb: 0.5 }}>Paid by</Typography>
              <Table size="small">
                <TableBody>
                  {data.payments.map((p) => (
                    <TableRow key={p.method}>
                      <TableCell>{METHOD[p.method] ?? p.method} ({formatNumber(p.count)})</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Stack>

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Each day</Typography>
            <Box sx={{ overflowX: 'auto', maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Day</TableCell>
                    <TableCell align="right">Sales</TableCell>
                    <TableCell align="right">Taxable sales</TableCell>
                    <TableCell align="right">Tax collected</TableCell>
                    <TableCell align="right">Tax refunded</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dayRows(data).map((d) => (
                    <TableRow key={d.day}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{format(parseISO(d.day), 'EEE MMM d')}</TableCell>
                      <TableCell align="right">{formatNumber(d.count)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(d.taxable)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(d.tax)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(d.taxBack)}</TableCell>
                    </TableRow>
                  ))}
                  {dayRows(data).length === 0 ? (
                    <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>No sales in this period.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </Stack>
      ) : null}
    </Box>
  );
}

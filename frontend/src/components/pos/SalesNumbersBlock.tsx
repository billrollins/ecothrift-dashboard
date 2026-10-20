import { Box, Paper, Typography } from '@mui/material';
import type { CartSummary } from '../../api/pos.api';

function money(value: string | number | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const n = Number.isFinite(num) ? (num as number) : 0;
  const text = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));
  return n < 0 && Math.round(Math.abs(n) * 100) > 0 ? `−${text}` : text;
}

const isZero = (value: string | undefined) => !value || Math.round(parseFloat(value) * 100) === 0;

interface Row {
  label: string;
  value: string;
  bold?: boolean;
  sub?: boolean;
  note?: string;
}

function Column({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Box sx={{ minWidth: 0 }} role="group" aria-label={title}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', mb: 0.25 }}
      >
        {title}
      </Typography>
      {rows.map((row) => (
        <Box
          key={row.label}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 2,
            pl: row.sub ? 2 : 0,
            ...(row.bold ? { borderTop: '1px solid', borderColor: 'divider', mt: 0.25, pt: 0.25 } : {}),
          }}
        >
          <Typography variant="body2" color={row.sub ? 'text.secondary' : 'text.primary'} sx={{ fontWeight: row.bold ? 800 : 400 }}>
            {row.label}
            {row.note ? (
              <Typography component="span" variant="caption" color="text.secondary">
                {' '}
                {row.note}
              </Typography>
            ) : null}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: row.bold ? 800 : 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }}
          >
            {row.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/**
 * The Transactions page totals (owner 10-20): item sales, returns, net item sales, Thrift+ revenue, tax, fees and
 * how it was paid, for the page's filters. Plain words, numbers on the right.
 */
export function SalesNumbersBlock({ summary }: { summary: CartSummary }) {
  const n = summary.sales_numbers;
  if (!n) return null;
  const paid = n.paid_with;

  const sales: Row[] = [
    { label: 'Item sales', value: money(n.item_sales) },
    { label: 'Returns', value: money(n.returns) },
    { label: 'Net item sales', value: money(n.net_item_sales), bold: true },
    { label: 'Thrift+ revenue', value: money(n.thriftplus_revenue) },
  ];

  const taxAndFees: Row[] = [
    { label: 'Tax', value: money(n.tax) },
    { label: 'Fees customers paid', value: money(n.fees_customers_paid) },
    { label: 'Fees we pay', value: money(n.fees_we_pay), note: `(${n.fees_we_pay_percent}% of debit cards)` },
  ];
  if (!isZero(n.card_type_not_set)) {
    taxAndFees.push({ label: 'Card type not set', value: money(n.card_type_not_set), sub: true, note: '(no fee worked out)' });
  }

  const paidWith: Row[] = [
    { label: 'Cash', value: money(paid.cash) },
    { label: 'Card', value: money(paid.card) },
  ];
  if (!isZero(paid.card)) {
    paidWith.push(
      { label: 'Debit', value: money(paid.card_debit), sub: true },
      { label: 'Credit', value: money(paid.card_credit), sub: true },
    );
    if (!isZero(paid.card_type_not_set)) {
      paidWith.push({ label: 'Card type not set', value: money(paid.card_type_not_set), sub: true });
    }
  }
  if (!isZero(paid.payroll)) paidWith.push({ label: 'Payroll deduction', value: money(paid.payroll) });
  paidWith.push(
    { label: 'Thrift+ credit', value: money(paid.thriftplus_credit) },
    { label: 'ThriftBucks from earlier visits', value: money(paid.earlier_thriftbucks) },
  );

  const counts = [
    `${summary.count.toLocaleString('en-US')} sales`,
    ...(summary.thrift_count ? [`${summary.thrift_count.toLocaleString('en-US')} Thrift+`] : []),
    ...(summary.voided_count ? [`${summary.voided_count.toLocaleString('en-US')} voided`] : []),
  ].join(' · ');

  return (
    <Paper
      variant="outlined"
      sx={{ px: 1.5, py: 1, mb: 1 }}
      title="Completed sales only, for the filters above. Returns count on the day they were taken back."
      data-testid="sales-numbers"
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          columnGap: 4,
          rowGap: 1.25,
        }}
      >
        <Column title="Sales" rows={sales} />
        <Column title="Tax and fees" rows={taxAndFees} />
        <Column title="Paid with" rows={paidWith} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {counts}
      </Typography>
    </Paper>
  );
}

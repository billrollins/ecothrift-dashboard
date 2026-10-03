/**
 * Vendor metrics (intake_updates Phase 6): the period choice, number formats and the vendor page cards.
 * Every percent is weighted over the vendor's orders; missing data shows `-`, never 0.
 */
import { Box, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import type { VendorMetrics, VendorPeriod } from '../../../api/inventory.api';
import { formatCurrencyWhole } from '../../../utils/format';
import { recoveryStyle, SummaryCard } from '../orderList/ProfitabilitySummary';

export const PERIODS: { value: VendorPeriod; label: string }[] = [
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

export function parsePeriod(raw: string | null): VendorPeriod {
  return raw === '90d' || raw === 'all' ? raw : '12m';
}

export function num(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

export function pct(v: string | null | undefined): string {
  const n = num(v);
  return n == null ? '-' : `${n}%`;
}

export function money(v: string | null | undefined): string {
  return num(v) == null ? '-' : formatCurrencyWhole(v as string);
}

export function money2(v: string | null | undefined): string {
  const n = num(v);
  return n == null ? '-' : `$${n.toFixed(2)}`;
}

export function days(v: number | null | undefined): string {
  return v == null ? '-' : `${Math.round(v)} d`;
}

export function shortDate(v: string | null | undefined): string {
  if (!v) return '-';
  const d = new Date(`${v.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Landed % of retail: about 20% is the normal buy (owner's rule); far above it is costly. */
export function landedColor(v: string | null | undefined): string {
  const n = num(v);
  if (n == null) return '#64748b';
  if (n <= 23) return '#14532d';
  if (n <= 30) return '#a16207';
  return '#991b1b';
}

export function PeriodChoice({ value, onChange }: { value: VendorPeriod; onChange: (p: VendorPeriod) => void }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_e, next: VendorPeriod | null) => next && onChange(next)}
      aria-label="Period"
    >
      {PERIODS.map((p) => (
        <ToggleButton key={p.value} value={p.value} sx={{ textTransform: 'none', fontWeight: 700, px: 1.5 }}>
          {p.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/** Every metric as a card, in the Orders page card style. */
export function VendorMetricCards({ m, loading }: { m: VendorMetrics | null | undefined; loading?: boolean }) {
  if (!loading && !m) {
    return (
      <Typography color="text.secondary" sx={{ my: 2 }}>
        No orders from this vendor in this period.
      </Typography>
    );
  }
  const x = m ?? ({} as VendorMetrics);
  const cards: { label: string; primary: string; secondary?: string; color?: string; tip: string; style?: ReturnType<typeof recoveryStyle> }[] = [
    { label: 'Orders', primary: x.orders != null ? String(x.orders) : '-', secondary: `last ${shortDate(x.last_ordered)}`,
      tip: 'How many orders, and the last order date.' },
    { label: 'Spent', primary: money(x.spent), color: '#7f1d1d', tip: 'Sum of Total cost.' },
    { label: 'Landed % of retail', primary: pct(x.landed_pct), color: landedColor(x.landed_pct),
      secondary: x.manifest_retail ? `of ${money(x.manifest_retail)} manifest` : 'no manifest',
      tip: 'Total cost ÷ manifest total retail, orders with a manifest only. About 20% is a normal buy.' },
    { label: 'Priced % of retail', primary: pct(x.priced_pct_of_retail), color: '#14532d', secondary: 'starting price',
      tip: 'Priced (starting) ÷ the processor-approved retail of the items checked in.' },
    { label: 'Manifest accuracy', primary: pct(x.manifest_accuracy), secondary: 'approved ÷ manifest',
      tip: 'Processor-approved retail of everything checked in ÷ manifest total. Near 100% means the manifests can be trusted.' },
    { label: 'Received from manifest', primary: pct(x.received_pct), secondary: 'retail processed',
      tip: 'Retail processed from the manifest (disputed items left out) ÷ manifest total.' },
    { label: 'Disputes', primary: x.disputes != null ? String(x.disputes) : '-',
      secondary: `${x.disputes_open ?? 0} open · ${pct(x.disputed_pct)} of manifest`,
      tip: 'Disputes opened (cancelled ones left out), how many are still open, and the disputed share of manifest retail.' },
    { label: 'Recovery expected', primary: pct(x.recovery_expected), style: recoveryStyle(num(x.recovery_expected)),
      secondary: `priced ${money(x.priced_start)}`, tip: 'Priced (starting) ÷ Total cost.' },
    { label: 'Recovery actual', primary: pct(x.recovery_actual), style: recoveryStyle(num(x.recovery_actual)),
      secondary: `sold ${money(x.sold)}`, tip: 'Sold ÷ Total cost.' },
    { label: '% sold', primary: pct(x.sold_pct), color: '#22a35a', secondary: `${x.items_sold ?? 0} of ${x.items_checked_in ?? 0} items`,
      tip: 'Sold ÷ Priced (starting): sell-through in dollars.' },
    { label: 'Kept of starting price', primary: pct(x.kept_of_start), secondary: 'on items that sold',
      tip: 'Net sold ÷ the starting price of the items that sold: how deep the markdowns run.' },
    { label: 'Days to sell', primary: days(x.days_to_sell), secondary: 'median, check-in to sale', tip: 'Median days from check-in to sale, sold items only.' },
    { label: 'Per item', primary: money2(x.avg_start), secondary: `cost ${money2(x.avg_cost)} · sold ${money2(x.avg_sold)}`,
      tip: 'Average starting price per item; under it, average cost per item and average sold price per sold item.' },
    { label: 'Profit so far', primary: money(x.profit), color: (num(x.profit) ?? 0) < 0 ? '#991b1b' : '#14532d',
      tip: 'Sold − Total cost.' },
  ];
  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))', lg: 'repeat(7, minmax(0, 1fr))' },
          gap: 1,
        }}
      >
        {cards.map((c) => (
          <Tooltip key={c.label} title={c.tip} placement="top">
            <Box>
              <SummaryCard
                label={c.label}
                primary={c.primary}
                secondary={c.secondary}
                primaryColor={c.style?.color ?? c.color}
                loading={loading}
              />
            </Box>
          </Tooltip>
        ))}
      </Box>
      {m && (m.orders_old_data > 0 || m.orders_no_manifest > 0) ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
          {[
            m.orders_no_manifest ? `${m.orders_no_manifest} order${m.orders_no_manifest === 1 ? '' : 's'} with no manifest (left out of the manifest percents)` : '',
            m.orders_old_data ? `${m.orders_old_data} from the older data era (no price history: starting price is today's price)` : '',
          ].filter(Boolean).join(' · ')}
        </Typography>
      ) : null}
    </Box>
  );
}

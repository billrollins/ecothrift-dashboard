import { Box, Button, Paper, Skeleton, Typography } from '@mui/material';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import type { ReactNode } from 'react';
import { formatCurrencyWhole, formatNumber } from '../../../utils/format';
import type { PurchaseOrderSummary } from '../../../types/inventory.types';

type MetricStyle = {
  color: string;
  fontWeight: number;
};

const MONEY = {
  cost: '#7f1d1d',
  retail: '#0f172a',
  priced: '#14532d',
  sold: '#22a35a',
  transit: '#1d4ed8',
  items: '#334155',
} as const;

/** Same recovery bands as the orders table (EST REC / ACT REC). */
function recoveryStyle(pct: number | null): MetricStyle {
  if (pct == null) return { color: '#64748b', fontWeight: 600 };
  if (pct < 100) return { color: '#7f1d1d', fontWeight: 700 };
  if (pct < 150) return { color: '#9a3412', fontWeight: 700 };
  if (pct < 200) return { color: '#a16207', fontWeight: 700 };
  if (pct < 250) return { color: '#14532d', fontWeight: 800 };
  return { color: '#16a34a', fontWeight: 900 };
}

/** Same MFT bands as the orders table. */
function coverageStyle(pct: number | null): MetricStyle {
  if (pct == null) return { color: '#64748b', fontWeight: 600 };
  if (pct < 75) return { color: '#991b1b', fontWeight: 600 };
  if (pct < 85) return { color: '#c2410c', fontWeight: 600 };
  if (pct < 90) return { color: '#b45309', fontWeight: 600 };
  if (pct < 95) return { color: '#a16207', fontWeight: 600 };
  if (pct < 100) return { color: '#166534', fontWeight: 700 };
  return { color: '#16a34a', fontWeight: 800 };
}

function parseMoney(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function hasMoney(value: string | null | undefined): boolean {
  const n = parseMoney(value);
  return n != null && n !== 0;
}

function money(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return formatCurrencyWhole(value);
}

function pctRatio(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole === 0) return null;
  return (part / whole) * 100;
}

function MetricTag({ label }: { label: string }) {
  return (
    <Box
      component="span"
      sx={{ ml: 0.35, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.7 }}
    >
      {label}
    </Box>
  );
}

function SummaryCard({
  label,
  primary,
  secondary,
  primaryColor,
  secondaryStyle,
  icon,
  loading,
}: {
  label: string;
  primary: ReactNode;
  secondary?: ReactNode | null;
  primaryColor?: string;
  secondaryStyle?: MetricStyle | null;
  icon?: ReactNode;
  loading?: boolean;
}) {
  const sec = secondaryStyle ?? { color: '#64748b', fontWeight: 600 };
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        px: 1.4,
        borderColor: '#e2e8f0',
        bgcolor: '#fff',
        borderRadius: 2,
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.35,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 18 }}>
        {icon ? (
          <Box sx={{ display: 'inline-flex', color: primaryColor || '#64748b', '& svg': { fontSize: 15 } }}>
            {icon}
          </Box>
        ) : null}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            fontSize: '0.65rem',
            lineHeight: 1.1,
          }}
        >
          {label}
        </Typography>
      </Box>
      {loading ? (
        <Skeleton width="72%" height={30} sx={{ mt: 0.25 }} />
      ) : (
        <>
          <Typography
            noWrap
            sx={{
              fontWeight: 800,
              color: primaryColor || '#0f172a',
              fontVariantNumeric: 'tabular-nums',
              fontSize: { xs: '1.05rem', md: '1.2rem' },
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            {primary}
          </Typography>
          <Typography
            noWrap
            component="div"
            sx={{
              mt: 'auto',
              minHeight: 18,
              fontSize: '0.72rem',
              fontWeight: sec.fontWeight,
              color: sec.color,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.2,
            }}
          >
            {secondary || '\u00a0'}
          </Typography>
        </>
      )}
    </Paper>
  );
}

type Props = {
  summary: PurchaseOrderSummary | undefined;
  loading?: boolean;
  selectedCount: number;
  matchCount: number;
  onClearSelection: () => void;
};

export function ProfitabilitySummary({
  summary,
  loading,
  selectedCount,
  matchCount,
  onClearSelection,
}: Props) {
  const cost = summary?.cost ?? summary?.total_cost;
  const retail = summary?.retail ?? summary?.retail_value;
  const priced = summary?.priced;
  const pricedRetail = summary?.priced_retail;
  const sold = summary?.sold;
  const soldWeek = summary?.sold_last_week;
  const profit = summary?.profit;
  const items = summary?.items_received ?? 0;
  const pallets = summary?.pallet_count ?? 0;
  const trucks = summary?.in_transit_count ?? 0;
  const truckCost = summary?.in_transit_cost;

  const costN = parseMoney(cost);
  const retailN = parseMoney(retail);
  const pricedN = parseMoney(priced);
  const pricedRetailN = parseMoney(pricedRetail);
  const soldN = parseMoney(sold);
  const profitN = parseMoney(profit);

  const estRec = pctRatio(pricedN, costN);
  const prc = pctRatio(pricedN, retailN);
  const mft = pctRatio(pricedRetailN, retailN);
  const actRec = pctRatio(soldN, costN);

  const profitColor =
    profitN == null || profitN === 0 ? '#0f172a' : profitN > 0 ? '#15803d' : '#b91c1c';

  const showLoading = Boolean(loading && !summary);

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {selectedCount > 0
            ? `Selected (${selectedCount})`
            : `${matchCount} matching order${matchCount === 1 ? '' : 's'}`}
        </Typography>
        {selectedCount > 0 ? (
          <Button size="small" onClick={onClearSelection} sx={{ textTransform: 'none' }}>
            Clear selection
          </Button>
        ) : null}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            sm: 'repeat(3, minmax(0, 1fr))',
            md: 'repeat(4, minmax(0, 1fr))',
            lg: 'repeat(7, minmax(0, 1fr))',
          },
          gap: 1.1,
          alignItems: 'stretch',
        }}
      >
        <SummaryCard
          label="Trucks in Transit"
          icon={<LocalShippingOutlined />}
          primary={showLoading ? null : formatNumber(trucks)}
          secondary={
            trucks > 0 && hasMoney(truckCost) ? (
              <>
                {money(truckCost)}
                <MetricTag label="COST" />
              </>
            ) : trucks > 0 ? (
              'Shipped'
            ) : (
              'None shipped'
            )
          }
          primaryColor={MONEY.transit}
          loading={showLoading}
        />
        <SummaryCard
          label="Items"
          icon={<Inventory2Outlined />}
          primary={showLoading ? null : items > 0 ? formatNumber(items) : '—'}
          secondary={
            pallets > 0 ? (
              <>
                {formatNumber(pallets)}
                <MetricTag label="PAL" />
              </>
            ) : null
          }
          primaryColor={MONEY.items}
          loading={showLoading}
        />
        <SummaryCard
          label="Cost"
          primary={money(cost)}
          secondary={
            estRec != null ? (
              <>
                {`${Math.round(estRec)}%`}
                <MetricTag label="EST REC" />
              </>
            ) : null
          }
          primaryColor={MONEY.cost}
          secondaryStyle={recoveryStyle(estRec)}
          loading={showLoading}
        />
        <SummaryCard
          label="Retail"
          primary={money(retail)}
          secondary={
            prc != null ? (
              <>
                {`${Math.round(prc)}%`}
                <MetricTag label="PRC" />
              </>
            ) : null
          }
          primaryColor={MONEY.retail}
          loading={showLoading}
        />
        <SummaryCard
          label="Priced"
          primary={money(priced)}
          secondary={
            mft != null ? (
              <>
                {`${Math.round(mft)}%`}
                <MetricTag label="MFT" />
              </>
            ) : null
          }
          primaryColor={MONEY.priced}
          secondaryStyle={coverageStyle(mft)}
          loading={showLoading}
        />
        <SummaryCard
          label="Sold"
          primary={money(sold)}
          secondary={
            hasMoney(soldWeek) ? (
              <>
                {money(soldWeek)}
                <MetricTag label="7D" />
              </>
            ) : null
          }
          primaryColor={MONEY.sold}
          loading={showLoading}
        />
        <SummaryCard
          label="Profit"
          primary={money(profit)}
          secondary={
            actRec != null ? (
              <>
                {`${Math.round(actRec)}%`}
                <MetricTag label="ACT REC" />
              </>
            ) : null
          }
          primaryColor={profitColor}
          secondaryStyle={recoveryStyle(actRec)}
          loading={showLoading}
        />
      </Box>
    </Box>
  );
}

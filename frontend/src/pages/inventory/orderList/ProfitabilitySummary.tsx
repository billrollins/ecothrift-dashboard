import { Box, Button, Paper, Skeleton, Tooltip, Typography } from '@mui/material';
import { formatCurrencyWhole } from '../../../utils/format';
import type { PurchaseOrderSummary } from '../../../types/inventory.types';

const METRIC_HELP: Record<string, string> = {
  Cost: 'Purchase + shipping + fees (PO total paid).',
  Retail: 'Vendor listing retail estimate for the order.',
  Priced: 'Sum of tag prices for items that ever reached the shelf.',
  Sold: 'Net item sales after discounts (tax/delivery excluded).',
  Profit: 'Sold − Cost (full PO cost).',
};

function money(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return formatCurrencyWhole(value);
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
  const sold = summary?.sold;
  const profit = summary?.profit;
  const profitN = profit != null ? Number.parseFloat(profit) : NaN;
  const profitColor =
    Number.isNaN(profitN) || profitN === 0
      ? '#0f172a'
      : profitN > 0
        ? '#15803d'
        : '#b91c1c';

  const cards = [
    { label: 'Cost', value: money(cost) },
    { label: 'Retail', value: money(retail) },
    { label: 'Priced', value: money(priced) },
    { label: 'Sold', value: money(sold) },
    { label: 'Profit', value: money(profit), color: profitColor },
  ];

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
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: 'repeat(5, 1fr)',
          },
          gap: 1.25,
        }}
      >
        {cards.map((k) => (
          <Paper
            key={k.label}
            variant="outlined"
            sx={{ p: 1.5, borderColor: '#e2e8f0', bgcolor: '#fff', borderRadius: 2 }}
          >
            <Tooltip title={METRIC_HELP[k.label] || ''}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }}
              >
                {k.label}
              </Typography>
            </Tooltip>
            {loading && !summary ? (
              <Skeleton width="70%" height={32} sx={{ mt: 0.5 }} />
            ) : (
              <Typography
                variant="h6"
                sx={{
                  mt: 0.35,
                  fontWeight: 800,
                  color: k.color || '#0f172a',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: { xs: '1.1rem', md: '1.25rem' },
                }}
              >
                {k.value}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

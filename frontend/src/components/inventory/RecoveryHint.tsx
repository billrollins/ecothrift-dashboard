/**
 * "Similar items keep 31% of retail (n=212)" with a suggested price band, next to the price at check-in (inventory
 * review phase 4). Shows nothing while the owner's switch `inventory_recovery_estimate` is off, without a retail, or
 * when nothing like it has sold. Server: `apps/inventory/services/recovery_estimate.py`.
 */
import { useEffect, useState } from 'react';
import { Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getRecoveryEstimate, type RecoveryEstimate } from '../../api/recoveryEstimate.api';
import { formatCurrency } from '../../utils/format';

const SOURCE_LABEL: Record<string, string> = {
  store: 'Whole store',
  category: 'Category',
  subcategory: 'Subcategory',
  neighbours: 'Similar products',
  vendor: 'Vendor',
  price_point: 'Price point',
  condition: 'Condition',
};

const DEBOUNCE_MS = 400;

function useDebounced<T>(value: T): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value]);
  return v;
}

/** The one-line summary, also used by Preprocessing. */
export function recoveryLine(e: Pick<RecoveryEstimate, 'recovery' | 'n'>): string {
  return `Similar items keep ${Math.round(e.recovery * 100)}% of retail (n=${e.n.toLocaleString()})`;
}

export function recoverySourcesText(e: RecoveryEstimate): string {
  return (e.sources ?? [])
    .map((s) => `${SOURCE_LABEL[s.source] ?? s.source}${s.label && s.source !== 'store' ? ` (${s.label})` : ''}: `
      + `${s.rate == null ? '-' : `${Math.round(s.rate * 100)}%`}, n=${s.n.toLocaleString()}`)
    .join(' · ');
}

export function RecoveryHint({ retail, productId, orderId, condition, price, onUsePrice, disabled }: {
  retail: string;
  productId?: number | null;
  orderId?: number | null;
  condition?: string;
  price?: string;
  onUsePrice?: (price: string) => void;
  disabled?: boolean;
}) {
  const inputs = useDebounced({ retail: retail.trim(), product: productId ?? null, order: orderId ?? null, condition: condition ?? '', price: price?.trim() ?? '' });
  const hasRetail = Number.parseFloat(inputs.retail) > 0;
  const { data } = useQuery({
    queryKey: ['recovery-estimate', inputs],
    queryFn: async ({ signal }) => (await getRecoveryEstimate(inputs, signal)).data,
    enabled: hasRetail,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const e = hasRetail ? data?.estimate : null;
  if (!data?.enabled || !e) return null;
  return (
    <Box sx={{ gridColumn: '1 / -1', px: 1.25, py: 0.75, borderRadius: 1, bgcolor: 'action.hover' }} aria-label="Recovery estimate">
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 1 }} alignItems={{ sm: 'center' }}
        justifyContent="space-between">
        <Tooltip title={`Based on ${e.basis}. ${recoverySourcesText(e)}`}>
          <Typography variant="body2" sx={{ minWidth: 0 }}>
            {recoveryLine(e)}
            <Typography component="span" variant="body2" color="text.secondary">
              {' · suggest '}{formatCurrency(e.low)} to {formatCurrency(e.high)}
            </Typography>
          </Typography>
        </Tooltip>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          {e.verdict === 'high' && <Chip size="small" color="warning" variant="outlined" label="Priced high" />}
          {e.verdict === 'low' && <Chip size="small" color="warning" variant="outlined" label="Priced low" />}
          {onUsePrice && (
            <Button size="small" disabled={disabled || price?.trim() === e.mid} onClick={() => onUsePrice(e.mid)}>
              Use {formatCurrency(e.mid)}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

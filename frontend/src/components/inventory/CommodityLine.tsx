/**
 * Commodity line at the check-in price box (Dash Update #180). A commodity (batteries, diapers, laundry, cleaners...)
 * has one steady price: a share of retail for a name brand or a store brand, never marked down.
 *
 * - The product is marked: "Commodity, name brand: $6.50 (65% of retail), holds steady" and Use.
 * - Not decided, but the keyword rules think it is one: the same line says "Looks like" and asks a person to pick
 *   Name brand, Store brand or Not one. A pick is saved on the product and puts its price in the box.
 * - Not one, or no guess: nothing is shown.
 *
 * Room for one line is held from the moment a product is known, so the boxes below never move.
 * Server: `apps/inventory/services/pricing_standards.py`.
 */
import { useEffect, useState } from 'react';
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getProductStandard, markProductStandard, pct, type PriceStandard, type ProductStandard,
} from '../../api/pricingStandards.api';

/** Room held for the line: one row on a wide screen, two on a phone. */
export const COMMODITY_HELD = { xs: 64, sm: 36 } as const;
const HOLD = { gridColumn: '1 / -1', minHeight: COMMODITY_HELD } as const;

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The words of the line: null when nothing is to be said. */
export function commodityWords(s: ProductStandard): { lead: string; price: string | null; asking: boolean } | null {
  const marked = s.standard === 'name_brand' || s.standard === 'store_brand';
  if (!marked && !s.suggested) return null;
  const kind = (marked ? s.standard : s.suggested) === 'store_brand' ? 'store brand' : 'name brand';
  const share = s.share != null ? ` (${pct(s.share)} of retail)` : '';
  if (marked) {
    return {
      lead: s.price ? `Commodity, ${kind}: $${s.price}${share}, holds steady` : `Commodity, ${kind}: holds steady. Enter the retail for its price`,
      price: s.price, asking: false,
    };
  }
  return {
    lead: s.price ? `Looks like a commodity, ${kind}: $${s.price}${share}` : `Looks like a commodity, ${kind}`,
    price: s.price, asking: true,
  };
}

export function CommodityLine({
  productId, retail, price, onUsePrice, disabled = false,
}: {
  productId?: number | null;
  retail: string;
  price: string;
  onUsePrice: (price: string) => void;
  disabled?: boolean;
}) {
  const typedRetail = useDebounced(retail?.trim() ?? '');
  const qc = useQueryClient();
  const key = ['pricing-standard', productId ?? null, typedRetail];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => (await getProductStandard(productId!, typedRetail, signal)).data,
    enabled: productId != null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  });
  const mark = useMutation({
    mutationFn: async (standard: PriceStandard) => (await markProductStandard(productId!, standard, typedRetail)).data,
    onSuccess: (next) => {
      qc.setQueryData(key, next);
      void qc.invalidateQueries({ queryKey: ['pricing-standard', productId ?? null] });
      // A pick of name or store brand puts its price in the box; Change and Not one leave the price alone.
      if (next.price && (next.standard === 'name_brand' || next.standard === 'store_brand')) onUsePrice(next.price);
    },
  });
  if (productId == null) return null;
  const words = data && data.product_id === productId ? commodityWords(data) : null;
  if (!words) return <Box sx={HOLD} aria-hidden data-testid="commodity-empty" />;
  const same = words.price != null && Number.parseFloat(price) === Number.parseFloat(words.price);
  return (
    <Box sx={HOLD} data-testid="commodity-line">
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', minHeight: 32 }}>
        <Typography variant="body2" sx={{ fontWeight: 650 }}>{words.lead}</Typography>
        {words.asking ? (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={null}
            disabled={disabled || mark.isPending}
            onChange={(_, v: PriceStandard | null) => { if (v != null) mark.mutate(v); }}
            aria-label="Is it a commodity?"
          >
            <ToggleButton value="name_brand" sx={{ py: 0.25, textTransform: 'none' }}>Name brand</ToggleButton>
            <ToggleButton value="store_brand" sx={{ py: 0.25, textTransform: 'none' }}>Store brand</ToggleButton>
            <ToggleButton value="no" sx={{ py: 0.25, textTransform: 'none' }}>Not one</ToggleButton>
          </ToggleButtonGroup>
        ) : words.price ? (
          <Button size="small" variant="outlined" disabled={disabled || same} onClick={() => onUsePrice(words.price!)} sx={{ py: 0.25 }}>
            {same ? 'In use' : `Use ${words.price}`}
          </Button>
        ) : null}
        {!words.asking ? (
          <Button size="small" variant="text" disabled={disabled || mark.isPending} onClick={() => mark.mutate('')} sx={{ py: 0.25, minWidth: 0 }}>
            Change
          </Button>
        ) : null}
      </Stack>
    </Box>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useBuyingCategoryNeed } from '../../hooks/useBuyingCategoryNeed';
import { useBuyingValuationInputsMutation } from '../../hooks/useBuyingValuationInputsMutation';
import type { BuyingAuctionDetail } from '../../types/buying.types';
import { computeMaxBid } from '../../utils/auctionMaxBid';
import { formatCurrency, formatCurrencyWhole } from '../../utils/format';
import ProfitabilityPill from './ProfitabilityPill';
import NeedPill from './NeedPill';

function parseDec(s: string | null | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : null;
}

type Props = {
  detail: BuyingAuctionDetail;
  isAdmin: boolean;
};

export default function AuctionValuationCard({ detail, isAdmin }: Props) {
  const { data: needData } = useBuyingCategoryNeed();
  const valuationMutation = useBuyingValuationInputsMutation();

  const sellRateByCat = useMemo(() => {
    const m = new Map<string, number>();
    needData?.categories.forEach((c) => {
      const r = parseDec(c.sell_through_rate);
      if (r != null) m.set(c.category, r);
    });
    return m;
  }, [needData]);

  const needGapByCat = useMemo(() => {
    const m = new Map<string, number>();
    needData?.categories.forEach((c) => {
      const g = parseDec(c.need_gap);
      if (g != null) m.set(c.category, g);
    });
    return m;
  }, [needData]);

  const mix =
    detail.valuation_source === 'manifest'
      ? detail.manifest_category_distribution
      : detail.ai_category_estimates;

  const retailBase = parseDec(detail.total_retail_value) ?? 0;

  /** Shares = value / sum(values) so counts or percentages both normalize correctly. */
  const breakdownRows = useMemo(() => {
    if (!mix || typeof mix !== 'object') return [];
    const entries = Object.entries(mix as Record<string, number>);
    const parsed: { category: string; n: number }[] = [];
    for (const [category, raw] of entries) {
      const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(n) || n <= 0) continue;
      parsed.push({ category, n });
    }
    const total = parsed.reduce((s, x) => s + x.n, 0);
    if (total <= 0) return [];
    return parsed.map(({ category, n }) => {
      const fraction = n / total;
      const pctDisplay = fraction * 100;
      const rate = sellRateByCat.get(category) ?? 0;
      const attributed = retailBase * fraction;
      const estRev = attributed * rate;
      return { category, pctDisplay, attributed, rate, estRev };
    });
  }, [mix, retailBase, sellRateByCat]);

  const maxBid = computeMaxBid(detail);
  const effRev = parseDec(detail.effective_revenue_after_shrink);
  const totalCost = parseDec(detail.estimated_total_cost);
  const estProfit =
    effRev != null && totalCost != null ? effRev - totalCost : null;

  const [local, setLocal] = useState({
    fees: detail.fees_override ?? '',
    ship: detail.shipping_override ?? '',
    shrink: detail.shrinkage_override ?? '',
    profitT: detail.profit_target_override ?? '',
    revenue: detail.revenue_override ?? '',
    priority: detail.priority != null ? String(detail.priority) : '',
  });

  useEffect(() => {
    setLocal({
      fees: detail.fees_override ?? '',
      ship: detail.shipping_override ?? '',
      shrink: detail.shrinkage_override ?? '',
      profitT: detail.profit_target_override ?? '',
      revenue: detail.revenue_override ?? '',
      priority: detail.priority != null ? String(detail.priority) : '',
    });
  }, [
    detail.id,
    detail.fees_override,
    detail.shipping_override,
    detail.shrinkage_override,
    detail.profit_target_override,
    detail.revenue_override,
    detail.priority,
  ]);

  const flushOverrides = () => {
    if (!isAdmin) return;
    const pr = local.priority.trim();
    const priorityNum =
      pr === '' ? null : Number.parseInt(pr, 10);
    const priorityBody =
      priorityNum != null && Number.isFinite(priorityNum)
        ? Math.min(99, Math.max(1, priorityNum))
        : null;
    valuationMutation.mutate({
      auctionId: detail.id,
      body: {
        fees_override: local.fees.trim() || null,
        shipping_override: local.ship.trim() || null,
        shrinkage_override: local.shrink.trim() || null,
        profit_target_override: local.profitT.trim() || null,
        revenue_override: local.revenue.trim() || null,
        ...(priorityBody != null ? { priority: priorityBody } : {}),
      },
    });
  };

  const sourceLabel =
    detail.valuation_source === 'manifest'
      ? `Based on manifest (${detail.manifest_row_count} items)`
      : detail.valuation_source === 'ai'
        ? 'Based on AI title estimate'
        : 'No category mix yet';

  return (
    <Card variant="outlined" sx={{ p: 1.25, mt: 1.5 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Valuation
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        {sourceLabel}
      </Typography>

      {breakdownRows.length > 0 ? (
        <Table size="small" sx={{ mb: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>Category</TableCell>
              <TableCell align="right">%</TableCell>
              <TableCell align="right">Retail $</TableCell>
              <TableCell align="right">Sell-thru</TableCell>
              <TableCell align="right">Est. rev.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {breakdownRows.map((r) => (
              <TableRow key={r.category}>
                <TableCell>{r.category}</TableCell>
                <TableCell align="right">{r.pctDisplay.toFixed(1)}%</TableCell>
                <TableCell align="right">{formatCurrencyWhole(String(r.attributed))}</TableCell>
                <TableCell align="right">{(r.rate * 100).toFixed(1)}%</TableCell>
                <TableCell align="right">{formatCurrencyWhole(String(r.estRev))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Stack spacing={0.5} sx={{ mb: 1 }}>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2">Estimated revenue (pre-shrink)</Typography>
          <Typography variant="body2" fontWeight={600}>
            {formatCurrency(detail.estimated_revenue)}
          </Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2">Effective revenue (after shrink)</Typography>
          <Typography variant="body2" fontWeight={600}>
            {formatCurrency(detail.effective_revenue_after_shrink)}
          </Typography>
        </Stack>
      </Stack>

      <Divider sx={{ my: 1 }} />
      <Typography variant="overline" color="text.secondary">
        Costs
      </Typography>
      <Stack spacing={1} sx={{ mt: 0.5, mb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2">Current price</Typography>
          <Typography variant="body2">{formatCurrency(detail.current_price)}</Typography>
        </Stack>
        {isAdmin ? (
          <>
            <TextField
              label="Fees override ($)"
              size="small"
              value={local.fees}
              placeholder="(rate × price)"
              onChange={(e) => setLocal((s) => ({ ...s, fees: e.target.value }))}
              onBlur={flushOverrides}
            />
            <TextField
              label="Shipping override ($)"
              size="small"
              value={local.ship}
              onChange={(e) => setLocal((s) => ({ ...s, ship: e.target.value }))}
              onBlur={flushOverrides}
            />
            <TextField
              label="Revenue override ($)"
              size="small"
              value={local.revenue}
              onChange={(e) => setLocal((s) => ({ ...s, revenue: e.target.value }))}
              onBlur={flushOverrides}
            />
            <TextField
              label="Shrinkage override"
              size="small"
              value={local.shrink}
              onChange={(e) => setLocal((s) => ({ ...s, shrink: e.target.value }))}
              onBlur={flushOverrides}
            />
            <TextField
              label="Profit target (ratio)"
              size="small"
              value={local.profitT}
              placeholder="2.0"
              onChange={(e) => setLocal((s) => ({ ...s, profitT: e.target.value }))}
              onBlur={flushOverrides}
            />
            <TextField
              label="Priority (1–99)"
              size="small"
              type="number"
              inputProps={{ min: 1, max: 99 }}
              value={local.priority}
              placeholder={detail.priority != null ? String(detail.priority) : '—'}
              onChange={(e) => setLocal((s) => ({ ...s, priority: e.target.value }))}
              onBlur={flushOverrides}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
          </>
        ) : (
          <>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">Fees (resolved)</Typography>
              <Typography variant="body2">{formatCurrency(detail.estimated_fees)}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">Shipping (resolved)</Typography>
              <Typography variant="body2">{formatCurrency(detail.estimated_shipping)}</Typography>
            </Stack>
          </>
        )}
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" fontWeight={600}>
            Total cost
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {formatCurrency(detail.estimated_total_cost)}
          </Typography>
        </Stack>
      </Stack>

      <Divider sx={{ my: 1 }} />
      <Stack spacing={1} sx={{ mb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body1" fontWeight={700}>
            Est. profit
          </Typography>
          <Typography
            variant="body1"
            fontWeight={700}
            color={estProfit != null && estProfit >= 0 ? 'success.main' : 'error.main'}
          >
            {estProfit != null ? formatCurrencyWhole(String(estProfit)) : '—'}
          </Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2">Profitability</Typography>
          <ProfitabilityPill ratio={detail.profitability_ratio} />
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2">Need score</Typography>
          <NeedPill score={detail.need_score} />
        </Stack>
        <Typography variant="body2">
          Profitable if bid stays under{' '}
          <Box component="span" fontWeight={700}>
            {maxBid != null ? formatCurrencyWhole(String(maxBid)) : '—'}
          </Box>
        </Typography>
      </Stack>

      <Divider sx={{ my: 1 }} />
      <Typography variant="overline" color="text.secondary">
        Need alignment
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {breakdownRows.slice(0, 6).map((r) => {
          const g = needGapByCat.get(r.category);
          const label =
            g == null ? '—' : g > 2 ? 'Needed' : g < -2 ? 'Overstocked' : 'Neutral';
          return (
            <Stack key={r.category} direction="row" justifyContent="space-between">
              <Typography variant="caption" noWrap sx={{ maxWidth: '60%' }}>
                {r.category}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
            </Stack>
          );
        })}
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" fontWeight={600}>
            Overall need score
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {detail.need_score ?? '—'}
          </Typography>
        </Stack>
      </Stack>

      {valuationMutation.isPending ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Saving…
        </Typography>
      ) : null}
    </Card>
  );
}

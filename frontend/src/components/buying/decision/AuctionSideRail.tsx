import { Alert, Box, InputAdornment, Link as MuiLink, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { patchBuyingAuctionBuyer } from '../../../api/buying.api';
import type { AuctionDecision, BuyingAuctionDetail } from '../../../types/buying.types';
import { formatCurrencyWhole } from '../../../utils/format';

function Line({ label, value, strong, accent }: { label: ReactNode; value: ReactNode; strong?: boolean; accent?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.35 }}>
      <Typography variant="body2" color={accent ? 'primary.main' : strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong || accent ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" color={accent ? 'primary.main' : 'text.primary'} sx={{ fontWeight: strong || accent ? 800 : 500, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Stack>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
        {aside ? <Typography variant="caption" color="text.secondary">{aside}</Typography> : null}
      </Stack>
      {children}
    </Paper>
  );
}

function Stat({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: 'action.hover' }}>
      <Typography variant="h6" sx={{ fontWeight: 800, color: accent ? 'primary.main' : 'text.primary', lineHeight: 1.2 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

function Notes({ detail }: { detail: BuyingAuctionDetail }) {
  const [text, setText] = useState(detail.buyer_notes ?? '');
  const [state, setState] = useState<'' | 'saving' | 'saved'>('');
  const timer = useRef<number | null>(null);
  const save = useMutation({
    mutationFn: (value: string) => patchBuyingAuctionBuyer(detail.id, { buyer_notes: value }),
    onSuccess: () => setState('saved'),
  });
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return (
    <Section title="Notes" aside={state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}>
      <TextField
        multiline
        minRows={4}
        fullWidth
        placeholder="What should future-you know about this lot?"
        value={text}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          setState('saving');
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => save.mutate(value), 800);
        }}
      />
    </Section>
  );
}

function money(value: string | null | undefined): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : 0;
}

/** Landed cost and profit at a bid, by the same rules as the server (fee and a freight rate grow with it). */
export function landedAt(landed: AuctionDecision['landed'], bid: number): { total: number; profit: number; roi: number | null } {
  const fee = landed.fee_rate != null ? bid * money(landed.fee_rate) : money(landed.fee);
  const freight = landed.ship_rate != null ? bid * money(landed.ship_rate) : money(landed.freight);
  const total = bid + fee + freight + money(landed.labor) + money(landed.disposal);
  const profit = money(landed.recovery) - total;
  return { total, profit, roi: total > 0 ? profit / total : null };
}

/** "What if I win at $X?": for the last minutes, when the bid moves past the plan. */
function WhatIf({ landed }: { landed: AuctionDecision['landed'] }) {
  const [bid, setBid] = useState('');
  const value = Number.parseFloat(bid);
  const at = Number.isFinite(value) && value > 0 ? landedAt(landed, value) : null;
  return (
    <Box sx={{ mt: 1.25, pt: 1.25, borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>What if I win at</Typography>
        <TextField
          size="small"
          value={bid}
          onChange={(e) => setBid(e.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          placeholder="bid"
          slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> }, htmlInput: { 'aria-label': 'What if I win at' } }}
          sx={{ width: 120 }}
        />
      </Stack>
      {at ? (
        <Typography variant="body2" sx={{ mt: 0.75 }} color={at.profit >= 0 ? 'text.primary' : 'error.main'}>
          Landed {formatCurrencyWhole(String(at.total))} · profit <b>{formatCurrencyWhole(String(at.profit))}</b>
          {at.roi != null ? ` (${Math.round(at.roi * 100)}%)` : ''}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * The right rail: the landed cost at the current bid, what similar lots closed for, the
 * seller's scorecard from our own won trucks, and notes for next time.
 */
export default function AuctionSideRail({ detail, decision }: { detail: BuyingAuctionDetail; decision: AuctionDecision }) {
  const { landed, similar, seller } = decision;
  const feePct = landed.fee_rate ? `${Math.round(Number.parseFloat(landed.fee_rate) * 100)}%` : '';
  const hasHandling = Number.parseFloat(landed.labor ?? '0') > 0 || Number.parseFloat(landed.disposal ?? '0') > 0;
  return (
    <Stack spacing={1.5}>
      <Section title="Landed cost at current bid">
        <Line label="Bid" value={formatCurrencyWhole(landed.bid)} />
        <Line label={`B-Stock fee${feePct ? `, ${feePct}` : ''}`} value={formatCurrencyWhole(landed.fee)} />
        <Line label={`Freight${detail.origin_city ? `, ${detail.origin_city} to us` : ''}`} value={formatCurrencyWhole(landed.freight)} />
        {hasHandling ? (
          <>
            <Line
              label={`Labor, ${landed.labor_units ?? decision.units} items${landed.labor_units_basis === 'estimate' ? ' (estimated from pallets)' : ''}`}
              value={formatCurrencyWhole(landed.labor)}
            />
            <Line
              label={`Disposal${landed.disposal_pallets_basis === 'estimate' ? `, ~${landed.disposal_pallets} pallets (estimated)` : ''}`}
              value={formatCurrencyWhole(landed.disposal)}
            />
          </>
        ) : null}
        <Box sx={{ borderTop: 1, borderColor: 'divider', my: 0.75 }} />
        <Line label="Total landed" value={formatCurrencyWhole(landed.total)} strong />
        <Line label="Expected recovery" value={formatCurrencyWhole(landed.recovery)} />
        <Line label="Expected profit" value={formatCurrencyWhole(landed.profit)} accent />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {landed.recovery_pct_of_retail != null ? `Recovery is ${landed.recovery_pct_of_retail}% of retail` : 'Recovery'}
          {landed.value_basis_pct != null ? `, ${landed.value_basis_pct}% of it priced from our own sales of these products` : ', from category rates'}
          {hasHandling ? '.' : '. Labor and disposal are not counted (Assumptions: labor per item, disposal per pallet).'}
          {landed.seller_factor
            ? ` It includes this seller's factor: its ${landed.seller_factor_trucks ?? ''} finished trucks made ${Math.round(Number.parseFloat(landed.seller_factor) * 100)}% of what we predicted.`
            : ''}
        </Typography>
        {landed.filled_categories?.length ? (
          <Alert severity="info" icon={false} sx={{ mt: 1, py: 0 }}>
            Filled in: {landed.filled_categories.join(', ')} {landed.filled_categories.length === 1 ? 'has' : 'have'} no sales of
            our own yet, so {landed.filled_categories.length === 1 ? 'it is' : 'they are'} valued at the store-wide rate
            {landed.store_rate ? ` (${Math.round(Number.parseFloat(landed.store_rate) * 100)}% of retail)` : ''}.
          </Alert>
        ) : null}
        <WhatIf landed={landed} />
      </Section>

      <Section title={`Similar lots, closed last ${similar.days} days`}>
        {similar.lots.length === 0 ? (
          <Typography variant="body2" color="text.secondary">None from this seller in the same category.</Typography>
        ) : (
          similar.lots.map((lot) => (
            <Line
              key={lot.id}
              label={
                <MuiLink component={RouterLink} to={`/buying/auctions/${lot.id}`} underline="hover" color="inherit">
                  {[lot.category, lot.origin_city, lot.pallets ? `${lot.pallets} plt` : ''].filter(Boolean).join(' · ') || lot.title}
                </MuiLink>
              }
              value={formatCurrencyWhole(lot.close)}
            />
          ))
        )}
        {similar.likely_low && similar.likely_high ? (
          <Alert severity="warning" icon={false} sx={{ mt: 1 }}>
            <b>Likely close: {formatCurrencyWhole(similar.likely_low)} to {formatCurrencyWhole(similar.likely_high)}.</b>
            {decision.bids.max_bid
              ? Number.parseFloat(decision.bids.max_bid) >= Number.parseFloat(similar.likely_low)
                ? ' Your max sits inside or above that range.'
                : ' Your max is under that range.'
              : ''}
          </Alert>
        ) : null}
      </Section>

      <Section title="Seller scorecard" aside={seller.name}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Stat value={seller.won_90_days} label="Lots won, 90 days" />
          <Stat value={seller.lost_90_days} label="Lots lost, 90 days" />
          <Stat
            value={seller.actual_vs_predicted_pct != null ? `${seller.actual_vs_predicted_pct > 0 ? '+' : ''}${seller.actual_vs_predicted_pct}%` : '-'}
            label="Actual vs predicted"
            accent={seller.actual_vs_predicted_pct != null}
          />
          <Stat value={seller.trucks_judged} label="Trucks judged" />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {seller.trucks_judged
            ? 'From our won trucks from this seller that have sold at least half their items.'
            : 'Fills in as won trucks from this seller sell (report cards).'}
        </Typography>
      </Section>

      <Notes detail={detail} />
    </Stack>
  );
}

import CheckRounded from '@mui/icons-material/CheckRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { AuctionDecision } from '../../../types/buying.types';
import { formatCurrencyWhole } from '../../../utils/format';
import { HAZARD_SHORT } from '../manifestHazards';

const NEED_COLOR: Record<string, string> = { High: 'primary.main', Med: 'warning.dark', Low: 'text.secondary' };

function Kpi({ label, value, color, children }: { label: string; value: ReactNode; color?: string; children?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
      <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em', lineHeight: 1.2, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 800, color: color ?? 'text.primary', lineHeight: 1.1 }}>
        {value}
      </Typography>
      {children}
    </Paper>
  );
}

function num(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Weeks of supply now vs after this lot, against the target, on one bar. */
function CoverBar({ now, after, target }: { now: number; after: number | null; target: number }) {
  const scale = Math.max(target * 1.5, after ?? 0, now, 1);
  const pct = (v: number) => `${Math.min((v / scale) * 100, 100)}%`;
  return (
    <Box sx={{ mt: 0.5 }}>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 99, bgcolor: 'action.hover' }}>
        {after != null ? (
          <Box sx={{ position: 'absolute', inset: 0, width: pct(after), borderRadius: 99, bgcolor: 'primary.light', opacity: 0.6 }} />
        ) : null}
        <Box sx={{ position: 'absolute', inset: 0, width: pct(now), borderRadius: 99, bgcolor: 'text.primary' }} />
        <Box sx={{ position: 'absolute', top: -4, bottom: -4, left: pct(target), width: 2, bgcolor: 'text.primary' }} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Now {now} wk{after != null ? ` · after this lot ${after} wk` : ''} · target {target} wk
      </Typography>
    </Box>
  );
}

/**
 * The four numbers that decide an auction: how badly we need it, what can go wrong, what
 * it makes, and how long the cash is out.
 */
export default function AuctionKpiCards({ decision }: { decision: AuctionDecision }) {
  const { need, hazards, profit, time_to_sell: time } = decision;
  const now = num(need.cover_weeks ?? null);
  const after = num(need.cover_after_weeks ?? null);
  const target = num(need.target_weeks ?? null);
  const low = num(profit.low);
  const high = num(profit.high);
  const current = num(profit.at_current);
  const atMax = num(profit.at_max);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
      <Kpi label="Need" value={need.level ?? 'Unknown'} color={need.level ? NEED_COLOR[need.level] : undefined}>
        <Typography variant="body2" color="text.secondary">
          {need.category
            ? `${need.category} (${need.share_pct}% of this lot)${now != null ? `: ${now} weeks of supply` : ''}${target != null ? ` against a ${target}-week target` : ''}.`
            : 'No category mix yet.'}
        </Typography>
        {now != null && target != null ? <CoverBar now={now} after={after} target={target} /> : null}
        {need.note ? <Typography variant="body2">{need.note}</Typography> : null}
      </Kpi>

      <Kpi
        label="Hazards"
        value={hazards.known ? `${hazards.count} flag${hazards.count === 1 ? '' : 's'}` : 'No manifest'}
        color={hazards.count ? 'warning.dark' : hazards.known ? 'success.main' : 'text.secondary'}
      >
        {hazards.named.slice(0, 3).map((h) => (
          <Stack key={h.code} direction="row" spacing={0.75} alignItems="flex-start">
            <WarningAmberRounded fontSize="small" color="warning" sx={{ mt: '2px' }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{HAZARD_SHORT[h.code] ?? h.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {h.lines} line{h.lines === 1 ? '' : 's'} · {h.retail_pct}% of retail
              </Typography>
            </Box>
          </Stack>
        ))}
        {hazards.clean.map((line) => (
          <Stack key={line} direction="row" spacing={0.75} alignItems="center">
            <CheckRounded fontSize="small" color="success" />
            <Typography variant="body2" color="text.secondary">{line}</Typography>
          </Stack>
        ))}
        {!hazards.known ? (
          <Typography variant="body2" color="text.secondary">Hazards show once the manifest lines are in.</Typography>
        ) : null}
      </Kpi>

      <Kpi label="Profit" value={current != null ? formatCurrencyWhole(current) : '-'} color={current != null && current < 0 ? 'error.main' : undefined}>
        <Typography variant="body2" color="text.secondary">
          Expected at the current bid{profit.roi_pct != null ? ` · ROI ${profit.roi_pct}%` : ''}
        </Typography>
        {low != null && high != null ? (
          <Box>
            <Box sx={{ position: 'relative', height: 8, borderRadius: 99, bgcolor: 'action.hover', mt: 0.5 }}>
              <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: '10%', right: '10%', borderRadius: 99, bgcolor: 'primary.light', opacity: 0.5 }} />
              {current != null && high > low ? (
                <Box sx={{ position: 'absolute', top: -3, width: 14, height: 14, borderRadius: '50%', bgcolor: 'primary.main', left: `calc(${10 + ((current - low) / (high - low)) * 80}% - 7px)` }} />
              ) : null}
            </Box>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">{formatCurrencyWhole(low)}</Typography>
              <Typography variant="caption" color="text.secondary">{formatCurrencyWhole(high)}</Typography>
            </Stack>
          </Box>
        ) : null}
        <Stack spacing={0.25}>
          {atMax != null ? (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">At your max</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrencyWhole(atMax)}</Typography>
            </Stack>
          ) : null}
          {profit.per_pallet ? (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Per pallet</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrencyWhole(profit.per_pallet)}</Typography>
            </Stack>
          ) : null}
          {profit.break_even_bid ? (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Break-even bid</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrencyWhole(profit.break_even_bid)}</Typography>
            </Stack>
          ) : null}
        </Stack>
      </Kpi>

      <Kpi label="Time to sell" value={time.days != null ? `~${time.days} days` : 'Unknown'}>
        <Typography variant="body2" color="text.secondary">
          {time.days != null
            ? 'Until the cash is back: our own sales for matched products, else the category median.'
            : 'Shows once the manifest lines are in, or the category mix has sales.'}
        </Typography>
        {time.sell_through_30_pct != null ? (
          <Typography variant="body2">
            About <b>{time.sell_through_30_pct}%</b> of items like these sell within 30 days of hitting the shelf.
          </Typography>
        ) : null}
      </Kpi>
    </Box>
  );
}

import { Alert, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fetchThriftOverview } from '../../api/thriftplus.api';
import { formatCurrency } from '../../utils/format';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 150, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>{children}</Stack>
    </Stack>
  );
}

/**
 * Thrift+ in Dash (thrift_plus_rewards Phase 4): members, member vs guest sales, the rewards given,
 * what the store owes members, returns, and the scanner's scans-to-adds. Last 30 days.
 */
export default function OverviewTab() {
  const q = useQuery({ queryKey: ['thriftplus', 'overview'], queryFn: fetchThriftOverview });
  if (q.isLoading) return <LinearProgress />;
  if (q.isError || !q.data) return <Alert severity="error">Could not load the Thrift+ numbers.</Alert>;
  const o = q.data;
  const signups = o.members.signups.reduce((sum, d) => sum + d.n, 0);
  return (
    <Stack spacing={2.5}>
      <Row title="Members">
        <Tile label="Active memberships" value={o.members.active.toLocaleString()} hint={`${o.members.people} people, ${o.members.verified_18} verified 18+`} />
        <Tile label={`Sign-ups, last ${o.days} days`} value={signups.toLocaleString()} />
        <Tile label="Cards" value={`${o.members.cards_active} in use`} hint={`${o.members.cards_blank} blank left`} />
      </Row>
      <Row title={`Sales, last ${o.days} days`}>
        <Tile label="Member sales" value={o.sales.member_sales.toLocaleString()} hint={formatCurrency(o.sales.member_revenue)} />
        <Tile label="Guest sales" value={o.sales.guest_sales.toLocaleString()} hint={formatCurrency(o.sales.guest_revenue)} />
      </Row>
      <Row title={`Rewards, last ${o.days} days`}>
        <Tile label="Off the price (instant)" value={formatCurrency(o.rewards.instant)} />
        <Tile label="Went to the cover" value={formatCurrency(o.rewards.to_cover)} hint="The card paying for itself" />
        <Tile label="Banked" value={formatCurrency(o.rewards.banked)} />
        <Tile label="Credit from returns" value={formatCurrency(o.rewards.credit_from_returns)} />
      </Row>
      <Row title="Owed to members now">
        <Tile label="Banked rewards" value={formatCurrency(o.owed.banked)} />
        <Tile label="Store credit" value={formatCurrency(o.owed.credit)} />
        <Tile label="Returns waiting for staff" value={o.returns.waiting.toLocaleString()} hint={`${o.returns.count} returns in ${o.days} days`} />
      </Row>
      <Row title="Scanner app">
        <Tile label="Scans" value={o.scanner.scans.toLocaleString()} hint={`${o.scanner.items_scanned} items`} />
        <Tile label="Scans to adds" value={o.scanner.add_rate != null ? `${Math.round(o.scanner.add_rate * 100)}%` : '-'} hint={`${o.scanner.adds} adds, ${o.scanner.passes} passes`} />
        <Tile label="Price feedback" value={o.scanner.price_feedback.toLocaleString()} hint="Items with a price-feel answer" />
      </Row>
    </Stack>
  );
}

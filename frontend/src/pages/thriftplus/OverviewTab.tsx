import { Alert, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fetchThriftOverview } from '../../api/thriftplus.api';
import { TbAmount } from '../../components/thriftplus/ThriftBucks';
import { formatCurrency } from '../../utils/format';

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
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
 * Thrift+ in Dash (thrift_plus_rewards Phase 4; the 10-12 policy): members, member vs guest sales, ThriftBucks
 * (redeemed instantly in dollars, kept, used, expired as Thrift+ income), Thrift+ credit, what the store owes
 * members, returns, and the scanner's scans-to-adds. Last 30 days.
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
      </Row>
      <Row title={`Sales, last ${o.days} days`}>
        <Tile label="Member sales" value={o.sales.member_sales.toLocaleString()} hint={formatCurrency(o.sales.member_revenue)} />
        <Tile label="Guest sales" value={o.sales.guest_sales.toLocaleString()} hint={formatCurrency(o.sales.guest_revenue)} />
      </Row>
      <Row title={`ThriftBucks, last ${o.days} days`}>
        <Tile label="Redeemed instantly" value={formatCurrency(o.rewards.instant)} hint="Dollars off today's price" />
        <Tile label="ThriftBucks collected and kept" value={<TbAmount value={o.rewards.banked} bare />} />
        <Tile label="ThriftBucks used" value={o.rewards.used != null ? <TbAmount value={o.rewards.used} bare /> : '-'} />
        <Tile
          label="ThriftBucks expired"
          value={o.rewards.expired != null ? <TbAmount value={o.rewards.expired} bare /> : '-'}
          hint="Thrift+ income"
        />
        <Tile label="Thrift+ credit from 3-day returns" value={formatCurrency(o.rewards.credit_from_returns)} />
      </Row>
      <Row title="Owed to members now">
        <Tile label="ThriftBucks (not expired)" value={<TbAmount value={o.owed.banked} bare />} />
        <Tile label="Thrift+ credit" value={formatCurrency(o.owed.credit)} />
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

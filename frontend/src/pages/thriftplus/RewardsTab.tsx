import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { fetchItemReward, fetchRewardPreview } from '../../api/thriftplus.api';
import type { ItemRewardDetail, RewardRow, RewardStatus } from '../../types/thriftplus.types';
import { formatCurrency } from '../../utils/format';

const STATUS_LABEL: Record<RewardStatus, string> = {
  waiting: 'Days 1 to 7',
  climbing: 'Climbing',
  paused: 'Held: family on pace',
  capped: 'At the floor',
  no_room: 'No tag price',
  excluded: 'Consignment',
  closed: 'Off the floor',
};

const REASON_LABEL: Record<string, string> = {
  start: 'Started',
  days_1_to_7: 'Days 1 to 7',
  one_unit: 'Climbing on its own',
  behind_pace: 'Family behind pace',
  family_on_pace: 'Family selling on pace',
  scans_lag: 'Scanned, not added',
  reached_floor: 'Reached the floor',
  no_room: 'No tag price',
  consignment: 'Consignment',
  retag: 'Retagged',
  exit_list: 'Day 90: exit list',
  back_on_floor: 'Back on the floor',
  closed: 'Left the floor',
};

const reasonLabel = (r: string) => REASON_LABEL[r] ?? r.replace(/_/g, ' ');

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 150, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
    </Paper>
  );
}

function RowsTable({ rows, empty }: { rows: RewardRow[]; empty: string }) {
  if (!rows.length) return <Typography variant="body2" color="text.secondary">{empty}</Typography>;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell>
            <TableCell>Item</TableCell>
            <TableCell align="right">Day</TableCell>
            <TableCell align="right">Tag</TableCell>
            <TableCell align="right">Reward</TableCell>
            <TableCell align="right">Member pays</TableCell>
            <TableCell>Why</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.item_id}>
              <TableCell sx={{ fontFamily: 'monospace' }}>{r.sku}</TableCell>
              <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</TableCell>
              <TableCell align="right">{r.day}</TableCell>
              <TableCell align="right">{formatCurrency(r.price)}</TableCell>
              <TableCell align="right">{formatCurrency(r.reward)}</TableCell>
              <TableCell align="right">{formatCurrency(r.member_price)}</TableCell>
              <TableCell>{reasonLabel(r.reason)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function ItemLookup() {
  const [sku, setSku] = useState('');
  const lookup = useMutation({ mutationFn: (s: string) => fetchItemReward(s) });
  const d: ItemRewardDetail | undefined = lookup.data;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>One item</Typography>
      <Stack
        direction="row"
        spacing={1}
        component="form"
        onSubmit={(e) => { e.preventDefault(); if (sku.trim()) lookup.mutate(sku.trim()); }}
      >
        <TextField size="small" label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <Button type="submit" variant="outlined" disabled={!sku.trim() || lookup.isPending}>Look up</Button>
      </Stack>
      {lookup.isError ? <Alert severity="warning" sx={{ mt: 1 }}>No item with that SKU.</Alert> : null}
      {d ? (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>{d.sku} · {d.title}</Typography>
          <Typography variant="body2">
            Tag {formatCurrency(d.price)} · reward now {formatCurrency(d.reward_now)} · a member pays {formatCurrency(d.member_price_now)}
          </Typography>
          {d.state ? (
            <Typography variant="body2" color="text.secondary">
              Day {d.state.day} (on the floor {format(parseISO(d.state.floor_date), 'MMM d')}) · {STATUS_LABEL[d.state.status]} ·
              floor {formatCurrency(d.state.floor_price)} · grown {d.state.grow_days} days
              {d.state.exit_on ? ` · exit list since ${format(parseISO(d.state.exit_on), 'MMM d')}` : ''}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">No reward state yet: the nightly run has not seen it.</Typography>
          )}
          {d.events.length ? (
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              {d.events.map((e, i) => (
                <Typography key={`${e.on}-${i}`} variant="caption">
                  {format(parseISO(e.on), 'MMM d')} · day {e.day} · {reasonLabel(e.reason)} · {formatCurrency(e.reward)}
                </Typography>
              ))}
            </Stack>
          ) : null}
        </Box>
      ) : null}
    </Paper>
  );
}

/**
 * The reward engine's dry run (thrift_plus_rewards Phase 2): what members would pay tomorrow if
 * the switch were on, the exit list, and one item's log. Read-only: the nightly job writes.
 */
export default function RewardsTab() {
  const preview = useQuery({ queryKey: ['thriftplus', 'rewards', 'preview'], queryFn: () => fetchRewardPreview() });
  const p = preview.data;
  if (preview.isLoading) return <LinearProgress />;
  if (preview.isError || !p) return <Alert severity="error">Could not compute the rewards.</Alert>;
  const share = Math.round(Number(p.rules.floor_share) * 100);
  const run = p.last_run;
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          What members would pay {format(parseISO(p.day), 'EEEE, MMM d')}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Chip size="small" color={p.switch_on ? 'success' : 'default'} label={p.switch_on ? 'Switch on: members see these' : 'Dark: the switch is off'} />
          <Chip
            size="small"
            variant="outlined"
            color={run?.error ? 'error' : 'default'}
            label={run
              ? `Last nightly run: ${format(parseISO(run.day), 'MMM d')}${run.error ? ' (failed)' : `, ${run.counts.computed ?? 0} items`}`
              : 'No nightly run yet'}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Days 1 to {p.rules.wait_days}: nothing. From day {p.rules.wait_days + 1} the reward grows by the tag ÷ {p.rules.horizon} a day,
          until a member would pay {share}% of the tag. It never goes down, and never passes the tag.
          Day 1 is {p.rules.start ? `no earlier than ${format(parseISO(p.rules.start), 'MMM d')}` : "each item's own floor date"}.
        </Typography>
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>
        <Stat label="Items on the floor" value={p.totals.units.toLocaleString()} />
        <Stat label="With a reward" value={p.totals.with_reward.toLocaleString()} />
        <Stat label="Rewards total" value={formatCurrency(p.totals.reward_total)} hint={`of ${formatCurrency(p.totals.tag_total)} in tags`} />
        <Stat label="Average off (rewarded)" value={p.totals.pct_off_rewarded ? `${p.totals.pct_off_rewarded}%` : '-'} />
        <Stat label="Exit list (day 90+)" value={p.exit_list.count.toLocaleString()} hint={`${formatCurrency(p.exit_list.tag_total)} in tags`} />
        <Stat label="Families paced" value={`${p.families.on_pace} of ${p.families.paced} on pace`} hint={`${p.families.linked} across products`} />
      </Stack>

      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
        {(Object.keys(STATUS_LABEL) as RewardStatus[]).filter((s) => p.by_status[s]).map((s) => (
          <Chip key={s} size="small" variant="outlined" label={`${STATUS_LABEL[s]}: ${p.by_status[s]?.toLocaleString()}`} />
        ))}
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>By tag price</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tag</TableCell>
              <TableCell align="right">Items</TableCell>
              <TableCell align="right">With a reward</TableCell>
              <TableCell align="right">Rewards</TableCell>
              <TableCell align="right">Average off</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {p.bands.map((b) => (
              <TableRow key={b.band}>
                <TableCell>{b.band}</TableCell>
                <TableCell align="right">{b.units.toLocaleString()}</TableCell>
                <TableCell align="right">{b.with_reward.toLocaleString()}</TableCell>
                <TableCell align="right">{formatCurrency(b.reward_total)}</TableCell>
                <TableCell align="right">{b.pct_off_rewarded ? `${b.pct_off_rewarded}%` : '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <ItemLookup />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Biggest rewards</Typography>
        <RowsTable rows={p.top} empty="No item has a reward yet." />
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Exit list</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Day 90 or older: bundle, dollar bin, donate or scrap. Oldest first{p.exit_list.count > p.exit_list.rows.length ? `, the first ${p.exit_list.rows.length}` : ''}.
        </Typography>
        <RowsTable rows={p.exit_list.rows} empty="Nothing has reached day 90." />
      </Paper>
    </Stack>
  );
}
